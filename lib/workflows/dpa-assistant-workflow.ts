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
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { generateText } from "ai";
import { getMastraModel } from "../shared/model-router";
import { 
  createGitLabCliTool, 
  createFeishuChatHistoryTool, 
  createFeishuDocsTool 
} from "../tools";
import { Agent } from "@mastra/core/agent";

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
    
    const classificationPrompt = `You are an intent classifier. Classify the user query into ONE of these intents:

- gitlab_create: User wants to CREATE a new GitLab issue (e.g., "create issue", "new bug", "报个bug", "创建issue")
- gitlab_list: User wants to LIST or VIEW GitLab issues/MRs (e.g., "show issues", "list MRs", "查看issue", "我的MR")
- chat_search: User wants to SEARCH Feishu chat history (e.g., "find messages about X", "what did Y say", "查找聊天记录")
- doc_read: User wants to READ a Feishu document (e.g., "read doc X", "查看文档", contains Feishu doc URL)
- general_chat: General conversation, questions, help requests, or anything that doesn't fit above

Query: "${query}"

Respond with ONLY the intent name (one of: gitlab_create, gitlab_list, chat_search, doc_read, general_chat).
Do not include any other text.`;

    const { text } = await generateText({
      model: getMastraModel(false), // Fast model, no tools needed
      prompt: classificationPrompt,
      temperature: 0,
    });
    
    // Parse intent from response
    const intentRaw = text.trim().toLowerCase().replace(/[^a-z_]/g, "");
    let intent: Intent = "general_chat";
    
    if (intentRaw === "gitlab_create") intent = "gitlab_create";
    else if (intentRaw === "gitlab_list") intent = "gitlab_list";
    else if (intentRaw === "chat_search") intent = "chat_search";
    else if (intentRaw === "doc_read") intent = "doc_read";
    
    console.log(`[DPA Workflow] Classified intent: ${intent}`);
    
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
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab create`);
    
    // Use LLM to parse the issue creation request
    const parsePrompt = `Parse this GitLab issue creation request and extract:
- title: Issue title
- description: Issue description
- project: Project name (default: dpa/dagster if not specified)
- labels: Comma-separated labels (optional)

Request: "${query}"

Respond in this exact format:
TITLE: <title>
DESCRIPTION: <description>
PROJECT: <project>
LABELS: <labels or "none">`;

    const { text } = await generateText({
      model: getMastraModel(false),
      prompt: parsePrompt,
      temperature: 0,
    });
    
    // Parse response
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
    const projectMatch = text.match(/PROJECT:\s*(.+)/i);
    const labelsMatch = text.match(/LABELS:\s*(.+)/i);
    
    const title = titleMatch?.[1]?.trim() || "New Issue";
    const description = descMatch?.[1]?.trim() || query;
    const project = projectMatch?.[1]?.trim() || "dpa/dagster";
    const labels = labelsMatch?.[1]?.trim().toLowerCase() !== "none" ? labelsMatch?.[1]?.trim() : undefined;
    
    // Build glab command
    let glabCommand = `issue create -R ${project} -t "${title}" -d "${description}"`;
    if (labels) {
      glabCommand += ` -l ${labels}`;
    }
    
    try {
      const result = await gitlabTool.execute({ command: glabCommand });
      
      if (result.success) {
        return {
          result: `✅ GitLab Issue Created\n\n**Title**: ${title}\n**Project**: ${project}\n\n${result.output || "Issue created successfully."}`,
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
        result: `❌ GitLab Error: ${error.message}`,
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
    
    // Create inline agent for conversational response
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
      model: getMastraModel(true), // Smart model for quality responses
    });
    
    try {
      const result = await dpaMomAgent.generate(query);
      return {
        result: result.text,
        intent: "general_chat" as const,
      };
    } catch (error: any) {
      return {
        result: `抱歉，我遇到了一些问题：${error.message}`,
        intent: "general_chat" as const,
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
  }),
  outputSchema: z.object({
    response: z.string(),
    intent: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { result, intent } = inputData;
    
    console.log(`[DPA Workflow] Formatting response for intent: ${intent}`);
    
    // Response is already formatted by execution steps
    return {
      response: result,
      intent,
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
    [
      async ({ inputData }) => inputData?.intent === "general_chat",
      executeGeneralChatStep
    ],
  ])
  .then(formatResponseStep)
  .commit();

/**
 * Convenience function to run the workflow
 */
export async function runDpaAssistantWorkflow(
  query: string,
  chatId?: string,
  userId?: string
): Promise<{ response: string; intent: string }> {
  const result = await dpaAssistantWorkflow.run({
    query,
    chatId,
    userId,
  });
  
  // Extract response from workflow result
  const output = result.results as any;
  return {
    response: output?.response || "No response generated",
    intent: output?.intent || "unknown",
  };
}

