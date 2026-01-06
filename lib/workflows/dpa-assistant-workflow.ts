/**
 * DPA Assistant Workflow
 * 
 * Replaces DPA Mom subagent with deterministic workflow:
 * 1. Classify Intent → Fast model determines intent
 * 2. Branch by Intent → Execute specific step
 * 3. Format Response → Combine into final response
 * 
 * Intents:
 * - gitlab_create: Create GitLab issues
 * - gitlab_list: List/view GitLab issues/MRs
 * - chat_search: Search Feishu chat history
 * - doc_read: Read Feishu documents
 * - general_chat: Conversational AI (preserves agent behavior)
 * 
 * MODELS: Uses OpenRouter free models ONLY:
 * - nvidia/nemotron-3-nano-30b-a3b:free (primary)
 * - kwaipilot/kat-coder-pro:free (alternative)
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { generateText } from "ai";
import { openrouter } from "../shared/config";
import { FREE_MODELS } from "../shared/model-fallback";
import { 
  createGitLabCliTool, 
  createFeishuChatHistoryTool, 
  createFeishuDocsTool 
} from "../tools";
import { readAndSummarizeDocs, getAuthPromptIfNeeded } from "../tools/feishu-docs-user-tool";
import { feishuIdToEmpAccount } from "../auth/feishu-account-mapping";
import { Agent } from "@mastra/core/agent";
import { createFeishuTask } from "../services/feishu-task-service";
import { getFeishuOpenId } from "../services/user-mapping-service";

// Free model instances - ONLY these models are used
const freeModel = openrouter(FREE_MODELS[0]); // nvidia/nemotron-3-nano-30b-a3b:free

// Intent types
const IntentEnum = z.enum([
  "gitlab_create",
  "gitlab_list", 
  "chat_search",
  "doc_read",
  "general_chat"
]);

type Intent = z.infer<typeof IntentEnum>;

// Tool instances (created once, reused across steps)
const gitlabTool = createGitLabCliTool(true);
const chatHistoryTool = createFeishuChatHistoryTool(true);
const docsTool = createFeishuDocsTool(true);

/**
 * Step 1: Classify Intent
 * Uses fast model to determine user intent
 */
const classifyIntentStep = createStep({
  id: "classify-intent",
  description: "Classify user query into intent category",
  inputSchema: z.object({
    query: z.string().describe("User's original query"),
    chatId: z.string().optional().describe("Feishu chat ID"),
    userId: z.string().optional().describe("User ID"),
  }),
  outputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { query, chatId, userId } = inputData;
    
    console.log(`[DPA Workflow] Classifying intent for: "${query.substring(0, 50)}..."`);
    
    // EARLY RETURN: Route confirmation callbacks directly without LLM classification
    // These prefixes are used by the human-in-the-loop confirmation flow
    const CONFIRM_PREFIX = "__gitlab_confirm__:";
    const CANCEL_PREFIX = "__gitlab_cancel__";
    
    if (query.startsWith(CONFIRM_PREFIX) || query.startsWith(CANCEL_PREFIX)) {
      console.log(`[DPA Workflow] Detected confirmation callback, routing to gitlab_create`);
      return {
        intent: "gitlab_create" as Intent,
        params: undefined,
        query,
        chatId,
        userId,
      };
    }
    
    const classificationPrompt = `You are an intent classifier. Classify the user query into ONE of these intents:

- gitlab_create: User wants to CREATE a new GitLab issue (e.g., "create issue", "new bug", "报个bug", "创建issue")
- gitlab_list: User wants to LIST or VIEW GitLab issues/MRs (e.g., "show issues", "list MRs", "查看issue", "我的MR")
- chat_search: User wants to SEARCH Feishu chat history (e.g., "find messages about X", "what did Y say", "查找聊天记录")
- doc_read: User wants to READ a Feishu document (e.g., "read doc X", "查看文档", contains Feishu doc URL)
- general_chat: General conversation, questions, help requests, or anything that doesn't fit above

Query: "${query}"

Respond with ONLY the intent name (one of: gitlab_create, gitlab_list, chat_search, doc_read, general_chat).
Do not include any other text.`;

    let intent: Intent = "general_chat";
    
    try {
      const { text } = await generateText({
        model: freeModel, // nvidia/nemotron-3-nano-30b-a3b:free
        prompt: classificationPrompt,
        temperature: 0,
      });
      
      // Parse intent from response
      const intentRaw = text.trim().toLowerCase().replace(/[^a-z_]/g, "");
      
      if (intentRaw === "gitlab_create") intent = "gitlab_create";
      else if (intentRaw === "gitlab_list") intent = "gitlab_list";
      else if (intentRaw === "chat_search") intent = "chat_search";
      else if (intentRaw === "doc_read") intent = "doc_read";
      
      console.log(`[DPA Workflow] Classified intent: ${intent}`);
    } catch (error: any) {
      // If LLM fails, fallback to general_chat which will be handled by manager
      console.error(`[DPA Workflow] Intent classification failed: ${error.message}. Returning to manager.`);
      intent = "general_chat";
    }
    
    // EARLY RETURN: general_chat should NOT go through workflow
    // Return special signal so manager handles it with agent instead
    if (intent === "general_chat") {
      console.log(`[DPA Workflow] general_chat detected, returning to manager for agent handling`);
      return {
        intent,
        params: { __skipWorkflow: "true" },
        query,
        chatId,
        userId,
      };
    }
    
    // Extract params based on intent
    const params: Record<string, string> = {};
    
    // Extract doc URL if doc_read
    const docUrlMatch = query.match(/https?:\/\/[^\s]+feishu[^\s]+docs[^\s]+/i);
    if (docUrlMatch) {
      params.docUrl = docUrlMatch[0];
    }
    
    return {
      intent,
      params: Object.keys(params).length > 0 ? params : undefined,
      query,
      chatId,
      userId,
    };
  }
});

/**
 * Step: Execute GitLab Create
 */
const executeGitLabCreateStep = createStep({
  id: "execute-gitlab-create",
  description: "Create GitLab issue",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
    // Confirmation flow data
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(), // JSON-encoded issue data for confirm button
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab create`);
    
    // Check if this is a confirmation callback (from button click)
    const CONFIRM_PREFIX = "__gitlab_confirm__:";
    const CANCEL_PREFIX = "__gitlab_cancel__";
    
    if (query.startsWith(CONFIRM_PREFIX)) {
      // User confirmed - execute the issue creation
      console.log(`[DPA Workflow] Confirmation received, creating issue...`);
      try {
        const issueData = JSON.parse(query.slice(CONFIRM_PREFIX.length));
        const { title, description, project, assignee, dueDate, glabCommand } = issueData;
        
        const result = await gitlabTool.execute({ command: glabCommand });
        
        if (result.success) {
          let successMsg = `✅ **Issue Created!**\n\n**Title**: ${title}\n**Project**: ${project}`;
          if (assignee) {
            successMsg += `\n**Assigned to**: @${assignee}`;
          }
          successMsg += `\n\n${result.output || "Issue created successfully."}`;
          
          // Extract issue IID and URL from glab output
          // glab outputs: "Creating issue in ... \n #123 Title \n https://git.nevint.com/..."
          const issueIidMatch = result.output?.match(/#(\d+)/);
          const issueUrlMatch = result.output?.match(/(https?:\/\/[^\s]+)/);
          const issueIid = issueIidMatch ? parseInt(issueIidMatch[1], 10) : null;
          const issueUrl = issueUrlMatch ? issueUrlMatch[1] : null;
          
          // Create corresponding Feishu task for the assignee
          if (assignee && issueIid) {
            try {
              const assigneeOpenId = await getFeishuOpenId(assignee);
              if (assigneeOpenId) {
                const taskResult = await createFeishuTask({
                  summary: `[GitLab] ${title}`,
                  description: description || undefined,
                  dueDate: dueDate || undefined,
                  assigneeOpenIds: [assigneeOpenId],
                  gitlabProject: project,
                  gitlabIssueIid: issueIid,
                  gitlabIssueUrl: issueUrl || undefined,
                });
                
                if (taskResult.success) {
                  successMsg += `\n\n📋 **Feishu Task Created** for @${assignee}`;
                  if (taskResult.taskUrl) {
                    successMsg += `\n[View Task](${taskResult.taskUrl})`;
                  }
                  console.log(`[DPA Workflow] Feishu task created: ${taskResult.taskGuid}`);
                } else {
                  console.warn(`[DPA Workflow] Failed to create Feishu task: ${taskResult.error}`);
                }
              } else {
                console.warn(`[DPA Workflow] No Feishu open_id found for GitLab user: ${assignee}`);
              }
            } catch (taskError: any) {
              console.error(`[DPA Workflow] Error creating Feishu task: ${taskError.message}`);
            }
          }
          
          return {
            result: successMsg,
            intent: "gitlab_create" as const,
          };
        } else {
          return {
            result: `❌ Failed to create issue\n\nError: ${result.error}`,
            intent: "gitlab_create" as const,
          };
        }
      } catch (error: any) {
        return {
          result: `❌ Error: ${error.message}`,
          intent: "gitlab_create" as const,
        };
      }
    }
    
    if (query.startsWith(CANCEL_PREFIX)) {
      return {
        result: `🚫 Issue creation cancelled.`,
        intent: "gitlab_create" as const,
      };
    }
    
    // Use LLM to parse the issue creation request
    try {
      const { userId } = inputData;
      
      // Extract Feishu doc URLs from query
      const docUrlRegex = /https?:\/\/[^\s]*feishu\.cn\/(?:docs|docx|wiki|sheets|bitable)\/[^\s]+/gi;
      const docUrls = query.match(docUrlRegex) || [];
      
      // Read and summarize linked docs if present
      let docSummaries = "";
      if (docUrls.length > 0 && userId) {
        console.log(`[DPA Workflow] Found ${docUrls.length} doc links, fetching summaries...`);
        
        const summaries = await readAndSummarizeDocs(docUrls, userId, 400);
        const successfulSummaries = summaries.filter(s => s.success);
        
        if (successfulSummaries.length > 0) {
          docSummaries = "\n\n---\n**📄 相关文档摘要**\n\n" + 
            successfulSummaries.map(s => 
              `### ${s.title}\n${s.summary}\n[查看文档](${s.url})`
            ).join("\n\n");
          console.log(`[DPA Workflow] Added ${successfulSummaries.length} doc summaries`);
        }
        
        // Check if auth is needed for failed docs
        const failedDocs = summaries.filter(s => !s.success);
        if (failedDocs.length > 0) {
          const authPrompt = await getAuthPromptIfNeeded(userId);
          if (authPrompt) {
            docSummaries += `\n\n⚠️ 部分文档无法读取。${authPrompt}`;
          }
        }
      }
      
      // Calculate dates for due date parsing
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      
      // Calculate common relative dates
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      // End of this week (Friday)
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
      const thisFriday = new Date(today);
      thisFriday.setDate(today.getDate() + daysUntilFriday);
      const thisFridayStr = thisFriday.toISOString().split('T')[0];
      
      // Next Wednesday
      const daysUntilNextWednesday = (3 - dayOfWeek + 7) % 7 || 7;
      const nextWednesday = new Date(today);
      nextWednesday.setDate(today.getDate() + daysUntilNextWednesday);
      const nextWedStr = nextWednesday.toISOString().split('T')[0];
    
      const parsePrompt = `Parse this GitLab issue creation request and extract:
- title: Issue title (required). Clean up any @mentions or formatting.
- description: Issue description (expand on the title with context)
- project: GitLab project path. Look for explicit mentions like "in dpa/xxx", "项目 xxx". 
  Common DPA projects: dpa/dpa-mom/da/task (default for DA tasks), dpa/dagster (data pipelines), dpa/analytics (analysis/reports), dpa/dbt (data models), dpa/feishu-assistant (bot/automation).
  If not specified, default to "dpa/dpa-mom/da/task".
- priority: Priority level 1-4 (1=critical, 2=high, 3=medium, 4=low). Look for "priority X", "P1", "urgent", "critical", etc.
- due_date: Due date in YYYY-MM-DD format. Today is ${todayStr}. Parse these:
  * "today" = ${todayStr}
  * "tomorrow" = ${tomorrowStr}
  * "this week", "end of week", "eow" = ${thisFridayStr} (Friday)
  * "next wednesday", "wed" = ${nextWedStr}
  * Explicit dates like "Jan 10", "1/10", "2025-01-10"
- labels: Extract tags/labels from the request. Look for:
  * Explicit: "tag:", "label:", "#tag"
  * Topics: product names (ONVO, ES8, ET7), teams, features
  * Categories: bug, feature, task, analysis, data-quality
  * Domains: CAC, LTV, funnel, conversion, retention

Request: "${query}"

Respond in this exact format:
TITLE: <title>
DESCRIPTION: <description>
PROJECT: <project>
PRIORITY: <1-4 or "none">
DUE_DATE: <YYYY-MM-DD or "none">
LABELS: <comma-separated labels or "none">`;

    const { text } = await generateText({
      model: freeModel, // nvidia/nemotron-3-nano-30b-a3b:free
      prompt: parsePrompt,
      temperature: 0,
    });
    
    // Parse response
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
    const projectMatch = text.match(/PROJECT:\s*(.+)/i);
    const priorityMatch = text.match(/PRIORITY:\s*(.+)/i);
    const dueDateMatch = text.match(/DUE_DATE:\s*(.+)/i);
    const labelsMatch = text.match(/LABELS:\s*(.+)/i);
    
    const title = titleMatch?.[1]?.trim() || "New Issue";
    // Append doc summaries to description if available
    const baseDescription = descMatch?.[1]?.trim() || query;
    const description = docSummaries ? baseDescription + docSummaries : baseDescription;
    const project = projectMatch?.[1]?.trim() || "dpa/dpa-mom/da/task";
    
    // Parse priority (1-4)
    const priorityRaw = priorityMatch?.[1]?.trim();
    const priority = priorityRaw && /^[1-4]$/.test(priorityRaw) ? priorityRaw : undefined;
    
    // Parse due date (YYYY-MM-DD format)
    const dueDateRaw = dueDateMatch?.[1]?.trim();
    const dueDate = dueDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : undefined;
    
    // Parse labels
    const labelsRaw = labelsMatch?.[1]?.trim();
    const labels = labelsRaw && labelsRaw.toLowerCase() !== "none" ? labelsRaw : undefined;
    
    // Build labels array (include priority as label)
    const allLabels: string[] = [];
    if (priority) {
      allLabels.push(`priority::${priority}`);
    }
    if (labels) {
      allLabels.push(...labels.split(',').map(l => l.trim()).filter(Boolean));
    }
    
    // Map Feishu user to GitLab username for attribution
    const gitlabUsername = userId ? feishuIdToEmpAccount(userId) : null;
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    // Append requester attribution to description
    const requesterInfo = gitlabUsername 
      ? `\n\n---\n📋 *Created via Feishu Bot*\n**Requester**: @${gitlabUsername}\n**Created at**: ${createdAt}`
      : `\n\n---\n📋 *Created via Feishu Bot*\n**Created at**: ${createdAt}`;
    const enrichedDescription = description + requesterInfo;
    
    // Build glab command with assignee (if we can map the user)
    let glabCommand = `issue create -R ${project} -t "${title}" -d "${enrichedDescription}"`;
    if (gitlabUsername) {
      glabCommand += ` -a "${gitlabUsername}"`; // Auto-assign to requester
    }
    if (allLabels.length > 0) {
      glabCommand += ` -l "${allLabels.join(',')}"`;
    }
    if (dueDate) {
      glabCommand += ` --due-date ${dueDate}`;
    }
    
    // Build concise preview - only essential info
    let preview = `📋 **Issue Preview**\n\n**Title**: ${title}\n**Project**: ${project}`;
    if (gitlabUsername) {
      preview += `\n**Assignee**: @${gitlabUsername}`;
    }
    if (dueDate) {
      preview += ` | **DDL**: ${dueDate}`;
    }
    
    // Encode issue data for confirmation button
    const confirmationData = JSON.stringify({
      title,
      description: enrichedDescription, // Include attribution in stored description
      project,
      priority,
      dueDate,
      labels: allLabels,
      assignee: gitlabUsername,
      glabCommand,
    });
    
      return {
        result: preview,
        intent: "gitlab_create" as const,
        needsConfirmation: true,
        confirmationData,
      };
    } catch (error: any) {
      // LLM parsing failed - return user-friendly error
      console.error(`[DPA Workflow] GitLab create parsing failed: ${error.message}`);
      return {
        result: `❌ Failed to parse issue request: ${error.message}\n\nPlease try again with a clearer request like:\n"create issue: [title], priority 2, ddl next wednesday"`,
        intent: "gitlab_create" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab List
 */
const executeGitLabListStep = createStep({
  id: "execute-gitlab-list",
  description: "List/view GitLab issues or MRs",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab list`);
    
    // Determine if listing issues or MRs
    const isMR = /\b(mr|merge\s*request|合并请求)\b/i.test(query);
    const isMyItems = /\b(my|我的|mine)\b/i.test(query);
    
    let glabCommand: string;
    
    if (isMR) {
      glabCommand = isMyItems 
        ? "mr list --group dpa --assignee=@me --state opened"
        : "mr list --group dpa --state opened";
    } else {
      glabCommand = isMyItems
        ? "issue list --group dpa --assignee=@me --state opened"
        : "issue list --group dpa --state opened";
    }
    
    try {
      const result = await gitlabTool.execute({ command: glabCommand });
      
      if (result.success) {
        const itemType = isMR ? "Merge Requests" : "Issues";
        const scope = isMyItems ? "My " : "";
        return {
          result: `## ${scope}${itemType}\n\n\`\`\`\n${result.output}\n\`\`\``,
          intent: "gitlab_list" as const,
        };
      } else {
        return {
          result: `❌ Failed to list: ${result.error}`,
          intent: "gitlab_list" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ GitLab Error: ${error.message}`,
        intent: "gitlab_list" as const,
      };
    }
  }
});

/**
 * Step: Execute Chat Search
 */
const executeChatSearchStep = createStep({
  id: "execute-chat-search",
  description: "Search Feishu chat history",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, chatId } = inputData;
    
    console.log(`[DPA Workflow] Executing chat search in chat: ${chatId}`);
    
    if (!chatId) {
      return {
        result: "❌ 无法搜索聊天记录：未提供聊天ID\n\nPlease specify which chat to search.",
        intent: "chat_search" as const,
      };
    }
    
    try {
      const result = await chatHistoryTool.execute({ 
        chatId, 
        limit: 50 
      });
      
      if (result.success && result.messages) {
        // Filter messages based on query keywords
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const filtered = result.messages.filter((msg: any) => {
          const content = (msg.content || "").toLowerCase();
          return keywords.some(kw => content.includes(kw));
        });
        
        if (filtered.length > 0) {
          const summary = filtered.slice(0, 10).map((msg: any) => 
            `- **${msg.sender?.name || 'User'}**: ${(msg.content || "").substring(0, 100)}...`
          ).join("\n");
          
          return {
            result: `## 搜索结果 (${filtered.length} 条消息)\n\n${summary}`,
            intent: "chat_search" as const,
          };
        } else {
          return {
            result: `未找到相关消息。已搜索 ${result.messageCount} 条消息。`,
            intent: "chat_search" as const,
          };
        }
      } else {
        return {
          result: `❌ 搜索失败: ${result.error || "未知错误"}`,
          intent: "chat_search" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ 搜索错误: ${error.message}`,
        intent: "chat_search" as const,
      };
    }
  }
});

/**
 * Step: Execute Doc Read
 */
const executeDocReadStep = createStep({
  id: "execute-doc-read",
  description: "Read Feishu document",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, params } = inputData;
    
    console.log(`[DPA Workflow] Executing doc read`);
    
    // Extract doc URL from params or query
    const docUrl = params?.docUrl || query.match(/https?:\/\/[^\s]+/)?.[0];
    
    if (!docUrl) {
      return {
        result: "❌ 未找到文档链接\n\n请提供飞书文档链接。",
        intent: "doc_read" as const,
      };
    }
    
    try {
      const result = await docsTool.execute({ 
        docToken: docUrl,
        docType: "doc",
        action: "read"
      });
      
      if (result.success) {
        const content = result.content || "文档内容为空";
        const title = result.title || "Untitled";
        
        // Truncate if too long
        const displayContent = content.length > 2000 
          ? content.substring(0, 2000) + "...\n\n(内容已截断)"
          : content;
        
        return {
          result: `## 📄 ${title}\n\n${displayContent}`,
          intent: "doc_read" as const,
        };
      } else {
        return {
          result: `❌ 读取文档失败: ${result.error}`,
          intent: "doc_read" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ 文档错误: ${error.message}`,
        intent: "doc_read" as const,
      };
    }
  }
});

/**
 * Step: Execute General Chat
 * Uses a lightweight agent for conversational responses
 */
const executeGeneralChatStep = createStep({
  id: "execute-general-chat",
  description: "Handle general conversation with DPA Mom agent",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    userId: z.string().optional(),
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    
    console.log(`[DPA Workflow] Executing general chat`);
    
    try {
      // Create inline agent for conversational response
      // Uses free model: nvidia/nemotron-3-nano-30b-a3b:free
      const dpaMomAgent = new Agent({
        name: "dpa_mom_chat",
        instructions: `You are dpa_mom, the loving chief-of-staff for the DPA (Data Product & Analytics) team.

你是dpa_mom，DPA团队的贴心首席幕僚。

IDENTITY:
- Warm, caring, professional
- Support team members with questions and challenges
- Current date: ${new Date().toISOString().split("T")[0]}

GUIDELINES:
- Respond in the same language as the user (usually Chinese)
- Be helpful, concise, and friendly
- Format responses in Markdown
- Do not tag users (@)`,
        model: freeModel, // nvidia/nemotron-3-nano-30b-a3b:free (OpenRouter free tier)
      });
      
      const result = await dpaMomAgent.generate(query);
      console.log(`[DPA Workflow] General chat completed, length=${result.text?.length || 0}`);
      return {
        result: result.text || "Hi! How can I help you today?",
        intent: "general_chat" as Intent,
      };
    } catch (error: any) {
      console.error(`[DPA Workflow] General chat error:`, error?.message || error);
      return {
        result: `抱歉，我遇到了一些问题：${error?.message || "Unknown error"}`,
        intent: "general_chat" as Intent,
      };
    }
  }
});

/**
 * Step: Format Response
 * Combines results into final response
 */
const formatResponseStep = createStep({
  id: "format-response",
  description: "Format final response",
  inputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    skipWorkflow: z.boolean().optional(),
  }),
  outputSchema: z.object({
    response: z.string(),
    intent: z.string(),
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
    skipWorkflow: z.boolean().optional(),
  }),
  execute: async ({ inputData }) => {
    const { result, intent, needsConfirmation, confirmationData, skipWorkflow } = inputData;
    
    // Pass through skip signal
    if (skipWorkflow) {
      console.log(`[DPA Workflow] Passing through skip signal to manager`);
      return {
        response: "__SKIP_WORKFLOW__",
        intent: "general_chat",
        skipWorkflow: true,
      };
    }
    
    console.log(`[DPA Workflow] Formatting response for intent: ${intent}, needsConfirmation: ${needsConfirmation}`);
    
    // Response is already formatted by execution steps
    return {
      response: result,
      intent,
      needsConfirmation,
      confirmationData,
    };
  }
});

/**
 * DPA Assistant Workflow
 * 
 * Orchestrates: Classify → Branch → Execute → Format
 */
export const dpaAssistantWorkflow = createWorkflow({
  id: "dpa-assistant",
  description: "DPA team assistant with intent-based routing",
  inputSchema: z.object({
    query: z.string().describe("User's query"),
    chatId: z.string().optional().describe("Feishu chat ID"),
    userId: z.string().optional().describe("User ID"),
  }),
  outputSchema: z.object({
    response: z.string().describe("Formatted response"),
    intent: z.string().describe("Classified intent"),
    needsConfirmation: z.boolean().optional().describe("Whether confirmation buttons should be shown"),
    confirmationData: z.string().optional().describe("JSON data for confirmation button"),
  }),
})
  .then(classifyIntentStep)
  .branch([
    [
      async ({ inputData }) => inputData?.intent === "gitlab_create",
      executeGitLabCreateStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "gitlab_list",
      executeGitLabListStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "chat_search",
      executeChatSearchStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "doc_read",
      executeDocReadStep
    ],
    // NOTE: general_chat is NOT handled by workflow - falls back to agent
  ])
  // After branch, outputs are keyed by step ID - normalize them
  .map(async ({ inputData, getStepResult }) => {
    // Check if workflow should be skipped (general_chat intent)
    const classifyResult = getStepResult("classify-intent") as any;
    if (classifyResult?.params?.__skipWorkflow === "true") {
      console.log(`[DPA Workflow] Skip signal detected, returning to manager`);
      return {
        result: "__SKIP_WORKFLOW__",
        intent: "general_chat" as Intent,
        skipWorkflow: true,
      };
    }
    
    // Get result from whichever branch executed
    const gitlabCreate = getStepResult("execute-gitlab-create");
    const gitlabList = getStepResult("execute-gitlab-list");
    const chatSearch = getStepResult("execute-chat-search");
    const docRead = getStepResult("execute-doc-read");
    
    // Return the result from whichever branch executed
    const branchResult = gitlabCreate || gitlabList || chatSearch || docRead;
    
    if (branchResult) {
      return {
        result: branchResult.result || "No response",
        intent: branchResult.intent || "general_chat",
        needsConfirmation: (branchResult as any).needsConfirmation,
        confirmationData: (branchResult as any).confirmationData,
      };
    }
    
    // No branch executed - this shouldn't happen if routing is correct
    console.warn(`[DPA Workflow] No branch executed, returning skip signal`);
    return {
      result: "__SKIP_WORKFLOW__",
      intent: "general_chat" as Intent,
      skipWorkflow: true,
    };
  })
  .then(formatResponseStep)
  .commit();

/**
 * Workflow result with optional confirmation data
 */
export interface DpaWorkflowResult {
  response: string;
  intent: string;
  needsConfirmation?: boolean;
  confirmationData?: string;
}

/**
 * Convenience function to run the workflow
 */
export async function runDpaAssistantWorkflow(
  query: string,
  chatId?: string,
  userId?: string
): Promise<DpaWorkflowResult> {
  const run = await dpaAssistantWorkflow.createRun();
  const result = await run.start({
    inputData: {
      query,
      chatId,
      userId,
    },
  });
  
  // Extract response from workflow result
  const output = result as any;
  return {
    response: output?.response || "No response generated",
    intent: output?.intent || "unknown",
    needsConfirmation: output?.needsConfirmation,
    confirmationData: output?.confirmationData,
  };
}

