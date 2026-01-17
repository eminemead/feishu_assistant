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
 * MODELS: Uses model-router for correct routing:
 * - NVIDIA API (default when NVIDIA_API_TOKEN set)
 * - OpenRouter free models (fallback)
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { generateText } from "ai";
import { getMastraModelSingle } from "../shared/model-router";
import { feishuCardOutputGuidelines } from "../shared/feishu-output-guidelines";
// Import directly from specific tool files to avoid circular dependency
// (tools/index.ts → execute-workflow-tool.ts → workflows/index.ts → this file)
import { createGitLabCliTool } from "../tools/gitlab-cli-tool";
import { createFeishuChatHistoryTool } from "../tools/feishu-chat-history-tool";
import { createFeishuDocsTool } from "../tools/feishu-docs-tool";
import { readAndSummarizeDocs, getAuthPromptIfNeeded } from "../tools/feishu-docs-user-tool";
import { getChatMemberMapping } from "../tools/feishu-chat-history-tool";
import { runDocumentReadWorkflow } from "./document-read-workflow";
import { feishuIdToEmpAccount } from "../auth/feishu-account-mapping";
import { Agent } from "@mastra/core/agent";
import { createFeishuTask } from "../services/feishu-task-service";
import { getFeishuOpenId } from "../services/user-mapping-service";
import { storeIssueThreadMapping } from "../services/issue-thread-mapping-service";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Free model instance - uses NVIDIA (default) or OpenRouter free models
const freeModel = getMastraModelSingle(false); // Uses model-router for correct routing

// Intent types
const IntentEnum = z.enum([
  "gitlab_create",
  "gitlab_list", 
  "gitlab_close",  // Close issue with deliverable
  "gitlab_assign",  // Self-assign to linked issue
  "gitlab_thread_update",
  "gitlab_relink",  // Link current thread to existing issue
  "gitlab_summarize",  // Summarize issue with comments
  "chat_search",
  "doc_read",
  "feedback_summarize",  // Summarize user feedback for issue creation
  "feedback_update",  // Append feedback summary to existing issue
  "code_review",  // Review commits/code changes for bugs and feedback
  "general_chat"
]);

// Asset types for deliverables (used as GitLab labels)
const AssetTypeEnum = z.enum(["dashboard", "report", "table"]);

type Intent = z.infer<typeof IntentEnum>;

// Tool instances (created once, reused across steps)
const gitlabTool = createGitLabCliTool(true);
const chatHistoryTool = createFeishuChatHistoryTool(true);
const docsTool = createFeishuDocsTool(true);

/**
 * Resolve @mention or _user_N format to Feishu user ID
 * - "@_user_1" → Return as-is for Feishu API matching
 * - "ou_xxx" → Use directly (open_id format)
 * - "张三" → Return as-is (name matching handled downstream)
 */
function resolveFeishuUserId(mention: string): string | null {
  if (!mention) return null;
  
  // Strip @ prefix if present
  const cleaned = mention.replace(/^@/, '');
  
  // Already an open_id format
  if (cleaned.startsWith('ou_')) {
    return cleaned;
  }
  
  // Feishu mention placeholder format (_user_1, etc.) or name
  // Return as-is - chat history filter will handle matching
  return cleaned;
}

/**
 * Step 1: Classify Intent
 * Uses fast model to determine user intent
 */
const linkedIssueSchema = z.object({
  chatId: z.string(),
  rootId: z.string(),
  project: z.string(),
  issueIid: z.number(),
  issueUrl: z.string(),
  createdBy: z.string(),
}).optional();

// Input/Output schemas for classify intent step
const classifyIntentInputSchema = z.object({
  query: z.string(),
  chatId: z.string().optional(),
  rootId: z.string().optional(),
  userId: z.string().optional(),
  linkedIssue: linkedIssueSchema,
});

const classifyIntentOutputSchema = z.object({
  intent: IntentEnum,
  params: z.record(z.string()).optional(),
  query: z.string(),
  chatId: z.string().optional(),
  rootId: z.string().optional(),
  userId: z.string().optional(),
  linkedIssue: linkedIssueSchema,
});

// Command-style triggers (slash commands) - explicit intent, no LLM needed
// Exported for testing
export const SLASH_COMMANDS: Record<string, Intent> = {
  // GitLab ops
  '/创建': 'gitlab_create',
  '/新': 'gitlab_create',
  '/create': 'gitlab_create',
  '/new': 'gitlab_create',
  '/查看': 'gitlab_list',
  '/列表': 'gitlab_list',
  '/list': 'gitlab_list',
  '/总结': 'gitlab_summarize',
  '/summarize': 'gitlab_summarize',
  '/关闭': 'gitlab_close',
  '/close': 'gitlab_close',
  '/关联': 'gitlab_relink',
  '/绑定': 'gitlab_relink',
  '/link': 'gitlab_relink',
  // Feishu ops
  '/搜索': 'chat_search',
  '/search': 'chat_search',
  '/文档': 'doc_read',
  '/doc': 'doc_read',
  // Feedback collection
  '/总结反馈': 'feedback_summarize',
  '/summarize-feedback': 'feedback_summarize',
  '/collect': 'feedback_summarize',
  // Feedback update (append to existing issue)
  '/update': 'feedback_update',
  '/更新': 'feedback_update',
  '/追加': 'feedback_update',
  // Code review
  '/code-review': 'code_review',
  '/codereview': 'code_review',
  '/审查': 'code_review',
  '/代码审查': 'code_review',
  '/cr': 'code_review',
};

// Help command shows available commands
export const HELP_COMMANDS = ['/帮助', '/help', '/?'];

/**
 * Parse slash command from query (exported for testing)
 * Returns null if not a slash command or unknown command
 */
export function parseSlashCommand(query: string): {
  intent: Intent | 'help' | null;
  params?: Record<string, string>;
  remainingQuery: string;
} | null {
  const slashMatch = query.match(/^\/([^\s]+)/);
  if (!slashMatch) return null;
  
  const slashCmd = `/${slashMatch[1].toLowerCase()}`;
  const remainingQuery = query.slice(slashMatch[0].length).trim();
  
  // Help command
  if (HELP_COMMANDS.includes(slashCmd)) {
    return { intent: 'help', remainingQuery };
  }
  
  // Known command
  const mappedIntent = SLASH_COMMANDS[slashCmd];
  if (mappedIntent) {
    // For commands that need issue number, extract it
    if (['gitlab_summarize', 'gitlab_close', 'gitlab_relink'].includes(mappedIntent)) {
      const issueMatch = remainingQuery.match(/#?(\d+)/);
      if (issueMatch) {
        return {
          intent: mappedIntent,
          params: { issueIid: issueMatch[1] },
          remainingQuery,
        };
      }
    }
    return { intent: mappedIntent, remainingQuery };
  }
  
  // Unknown slash command
  return { intent: null, remainingQuery };
}

const classifyIntentStep = createStep({
  id: "classify-intent",
  // @ts-ignore - Mastra beta.20 has overload resolution issues with tsgo
  inputSchema: classifyIntentInputSchema,
  outputSchema: classifyIntentOutputSchema,
  execute: async ({ inputData }: { inputData: z.infer<typeof classifyIntentInputSchema> }) => {
    const { query, chatId, rootId, userId, linkedIssue } = inputData;
    
    console.log(`[DPA Workflow] ============================================`);
    console.log(`[DPA Workflow] ClassifyIntent Step`);
    console.log(`[DPA Workflow] InputData: chatId="${chatId}", rootId="${rootId}", userId="${userId}"`);
    console.log(`[DPA Workflow] Query preview: "${query.substring(0, 80)}..."`);
    console.log(`[DPA Workflow] ============================================`);
    
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
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // SLASH COMMAND: Check for explicit /command syntax (highest priority after confirmations)
    const slashMatch = query.match(/^\/([^\s]+)/);
    if (slashMatch) {
      const slashCmd = `/${slashMatch[1].toLowerCase()}`;
      
      // Help command - return special response
      if (HELP_COMMANDS.includes(slashCmd)) {
        console.log(`[DPA Workflow] Help command detected`);
        return {
          intent: "general_chat" as Intent,
          params: { __helpCommand: "true" },
          query,
          chatId,
          rootId,
          userId,
          linkedIssue,
        };
      }
      
      // Check if it's a known command
      const mappedIntent = SLASH_COMMANDS[slashCmd];
      if (mappedIntent) {
        console.log(`[DPA Workflow] Slash command "${slashCmd}" → ${mappedIntent}`);
        
        // Extract remaining text (strip slash command prefix)
        const remainingQuery = query.slice(slashMatch[0].length).trim();
        
        // For commands that need issue number, extract it
        if (['gitlab_summarize', 'gitlab_close', 'gitlab_relink'].includes(mappedIntent)) {
          const issueMatch = remainingQuery.match(/#?(\d+)/);
          if (issueMatch) {
            return {
              intent: mappedIntent,
              params: { issueIid: issueMatch[1] },
              query: remainingQuery,
              chatId,
              rootId,
              userId,
              linkedIssue,
            };
          }
        }
        
        // For feedback_summarize, extract target users @mentions (supports multiple)
        if (mappedIntent === 'feedback_summarize') {
          console.log(`[DPA Workflow] feedback_summarize: remainingQuery="${remainingQuery}"`);
          const userMentionMatches = remainingQuery.match(/@([^\s]+)/g);
          console.log(`[DPA Workflow] feedback_summarize: userMentionMatches=${JSON.stringify(userMentionMatches)}`);
          if (userMentionMatches && userMentionMatches.length > 0) {
            const targetUsers = userMentionMatches.map(m => m.replace(/^@/, ''));
            console.log(`[DPA Workflow] feedback_summarize: targetUsers=${targetUsers.join(',')}, chatId=${chatId}`);
            return {
              intent: mappedIntent,
              params: { targetUsers: targetUsers.join(',') },
              query: remainingQuery,
              chatId,
              rootId,
              userId,
              linkedIssue,
            };
          }
          // No user mentioned - still route to step, which will show error
          return {
            intent: mappedIntent,
            params: undefined,
            query: remainingQuery,
            chatId,
            rootId,
            userId,
            linkedIssue,
          };
        }
        
        // For feedback_update, extract issue number AND target users
        // Format: /update #123 @user1 @user2
        if (mappedIntent === 'feedback_update') {
          console.log(`[DPA Workflow] feedback_update: remainingQuery="${remainingQuery}"`);
          
          // Extract issue number
          const issueMatch = remainingQuery.match(/#(\d+)/);
          const issueIid = issueMatch?.[1];
          
          // Extract user mentions
          const userMentionMatches = remainingQuery.match(/@([^\s]+)/g);
          const targetUsers = userMentionMatches?.map(m => m.replace(/^@/, '')).join(',') || '';
          
          console.log(`[DPA Workflow] feedback_update: issueIid=${issueIid}, targetUsers=${targetUsers}`);
          
          if (!issueIid) {
            // No issue number - return with error hint
            return {
              intent: mappedIntent,
              params: { error: 'missing_issue' },
              query: remainingQuery,
              chatId,
              rootId,
              userId,
              linkedIssue,
            };
          }
          
          if (!targetUsers) {
            // No users mentioned - return with error hint
            return {
              intent: mappedIntent,
              params: { issueIid, error: 'missing_users' },
              query: remainingQuery,
              chatId,
              rootId,
              userId,
              linkedIssue,
            };
          }
          
          return {
            intent: mappedIntent,
            params: { issueIid, targetUsers },
            query: remainingQuery,
            chatId,
            rootId,
            userId,
            linkedIssue,
          };
        }
        
        // For code_review, extract optional commit SHA or range
        // Format: /review [commit-sha] or /review [sha1..sha2] or /review (defaults to HEAD~1..HEAD)
        if (mappedIntent === 'code_review') {
          console.log(`[DPA Workflow] code_review: remainingQuery="${remainingQuery}"`);
          
          // Extract commit SHA/range from remaining query
          // Match patterns: abc123, abc123..def456, HEAD~1, HEAD~1..HEAD, etc.
          const commitMatch = remainingQuery.match(/([a-f0-9]{6,40}(?:\.\.[a-f0-9]{6,40})?|HEAD(?:~\d+)?(?:\.\.HEAD(?:~\d+)?)?)/i);
          const commitRef = commitMatch?.[1] || null;
          
          console.log(`[DPA Workflow] code_review: extracted commitRef="${commitRef}"`);
          
          return {
            intent: mappedIntent,
            params: commitRef ? { commitRef } : undefined,
            query: remainingQuery,
            chatId,
            rootId,
            userId,
            linkedIssue,
          };
        }
        
        return {
          intent: mappedIntent,
          params: undefined,
          query: remainingQuery || query, // Use remaining text or original if empty
          chatId,
          rootId,
          userId,
          linkedIssue,
        };
      }
      
      // Unknown slash command - treat as general chat with hint
      console.log(`[DPA Workflow] Unknown slash command "${slashCmd}", falling through to LLM`);
    }
    
    // Check for thread update keywords when linked issue exists
    const threadUpdateKeywords = /补充|更新|还有|另外|also|additionally|update|add to issue|追加/i;
    if (linkedIssue && threadUpdateKeywords.test(query)) {
      console.log(`[DPA Workflow] Linked issue exists and update keywords detected, routing to gitlab_thread_update`);
      return {
        intent: "gitlab_thread_update" as Intent,
        params: undefined,
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Check for self-assign keywords when linked issue exists
    // User wants to assign the linked issue to themselves
    const assignKeywords = /assign\s*(?:to\s*)?me|我来(?:做|负责|执行|吧)?|我已经|安排给我|分配给我|指派给我|我负责|我接|让我来/i;
    if (linkedIssue && assignKeywords.test(query)) {
      console.log(`[DPA Workflow] Linked issue exists and assign keywords detected, routing to gitlab_assign`);
      return {
        intent: "gitlab_assign" as Intent,
        params: undefined,
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Check for relink keywords: "link to #123", "跟踪issue 123", "关联issue"
    // This allows users to link a NEW thread to an EXISTING issue
    const relinkKeywords = /(?:link\s*(?:to|this\s*to)?|跟踪|关联|绑定|track)\s*(?:#|issue\s*#?)?(\d+)/i;
    const relinkMatch = query.match(relinkKeywords);
    if (relinkMatch) {
      const issueIid = parseInt(relinkMatch[1], 10);
      console.log(`[DPA Workflow] Relink keywords detected, routing to gitlab_relink for issue #${issueIid}`);
      return {
        intent: "gitlab_relink" as Intent,
        params: { issueIid: String(issueIid) },
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Check for summarize keywords: "summarize #12", "status #12", "issue status 12"
    const summarizeKeywords = /(?:summarize|summary|status|状态|总结|进展)\s*(?:of\s*)?(?:#|issue\s*#?)?(\d+)/i;
    const summarizeMatch = query.match(summarizeKeywords);
    if (summarizeMatch) {
      const issueIid = parseInt(summarizeMatch[1], 10);
      console.log(`[DPA Workflow] Summarize keywords detected, routing to gitlab_summarize for issue #${issueIid}`);
      return {
        intent: "gitlab_summarize" as Intent,
        params: { issueIid: String(issueIid) },
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Check for feedback summarization: "总结 @xxx @yyy 的反馈", "summarize @user1 @user2's feedback"
    const feedbackKeywords = /(?:总结|summarize|收集|collect).*(?:反馈|feedback|意见|建议|问题)/i;
    const mentionMatches = query.match(/@([^\s]+)/g);
    if (feedbackKeywords.test(query) && mentionMatches && mentionMatches.length > 0) {
      // Extract all @mentions (strip @ prefix)
      const targetUsers = mentionMatches.map(m => m.replace(/^@/, ''));
      console.log(`[DPA Workflow] Feedback summarize keywords detected, target users: ${targetUsers.join(', ')}`);
      return {
        intent: "feedback_summarize" as Intent,
        params: { targetUsers: targetUsers.join(',') },  // Comma-separated list
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Check for close keywords: "close #12", "完成 issue 12", "close issue 123 delivered dashboard"
    const closeKeywords = /(?:close|完成|关闭|done|finish|结束)\s*(?:#|issue\s*#?)?(\d+)/i;
    const closeMatch = query.match(closeKeywords);
    if (closeMatch) {
      const issueIid = parseInt(closeMatch[1], 10);
      console.log(`[DPA Workflow] Close keywords detected, routing to gitlab_close for issue #${issueIid}`);
      return {
        intent: "gitlab_close" as Intent,
        params: { issueIid: String(issueIid) },
        query,
        chatId,
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    const classificationPrompt = `You are an intent classifier. Classify the user query into ONE of these intents:

- gitlab_create: User wants to CREATE a new GitLab issue (e.g., "create issue", "new bug", "报个bug", "创建issue")
- gitlab_list: User wants to LIST or VIEW GitLab issues/MRs (e.g., "show issues", "list MRs", "查看issue", "我的MR")
- gitlab_close: User wants to CLOSE an issue (e.g., "close #12", "完成 issue 123", "done with #45", "关闭issue")
- chat_search: User wants to SEARCH Feishu chat history (e.g., "find messages about X", "what did Y say", "查找聊天记录")
- doc_read: User wants to READ a Feishu document (e.g., "read doc X", "查看文档", contains Feishu doc URL)
- general_chat: General conversation, questions, help requests, or anything that doesn't fit above

Query: "${query}"

Respond with ONLY the intent name (one of: gitlab_create, gitlab_list, gitlab_close, chat_search, doc_read, general_chat).
Do not include any other text.`;

    let intent: Intent = "general_chat";
    
    try {
      const { text } = await generateText({
        model: freeModel, // Uses model-router
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
        rootId,
        userId,
        linkedIssue,
      };
    }
    
    // Extract params based on intent
    const params: Record<string, string> = {};
    
    // Extract doc URL if doc_read (support all Feishu doc types)
    const docUrlMatch = query.match(/https?:\/\/[^\s]*feishu\.cn\/(?:docs|docx|wiki|sheets|bitable)\/[^\s]+/i);
    if (docUrlMatch) {
      params.docUrl = docUrlMatch[0];
    }
    
    return {
      intent,
      params: Object.keys(params).length > 0 ? params : undefined,
      query,
      chatId,
      rootId,
      userId,
      linkedIssue,
    };
  }
});

/**
 * Step: Execute GitLab Create
 */
const executeGitLabCreateStep = createStep({
  id: "execute-gitlab-create",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
    // Confirmation flow data
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(), // JSON-encoded issue data for confirm button
  }),
  execute: async ({ inputData }) => {
    const { query, chatId, rootId, userId } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab create`);
    
    // Check if this is a confirmation callback (from button click)
    const CONFIRM_PREFIX = "__gitlab_confirm__:";
    const CANCEL_PREFIX = "__gitlab_cancel__";
    
    if (query.startsWith(CONFIRM_PREFIX)) {
      // User confirmed - execute the issue creation
      console.log(`[DPA Workflow] ============================================`);
      console.log(`[DPA Workflow] Confirmation received, creating issue...`);
      console.log(`[DPA Workflow] Query length: ${query.length}`);
      console.log(`[DPA Workflow] InputData chatId: ${chatId}, rootId: ${rootId}`);
      try {
        const rawData = query.slice(CONFIRM_PREFIX.length);
        console.log(`[DPA Workflow] Parsing confirmationData (${rawData.length} chars)...`);
        const issueData = JSON.parse(rawData);
        console.log(`[DPA Workflow] Parsed issueData keys: ${Object.keys(issueData).join(', ')}`);
        const { title, description, project, assignee, dueDate, glabCommand, chatId: storedChatId, rootId: storedRootId, createdBy } = issueData;
        console.log(`[DPA Workflow] Extracted: storedChatId="${storedChatId}", storedRootId="${storedRootId}"`);
        console.log(`[DPA Workflow] ============================================`);
        
        const result = await (gitlabTool.execute as any)({ command: glabCommand }) as { success: boolean; output?: string; error?: string };
        
        if (result.success) {
          let successMsg = `✅ **Issue Created**\n\n`;
          successMsg += `**${title}**\n`;
          successMsg += `\n📁 \`${project}\``;
          if (assignee) {
            successMsg += `  ·  👤 @${assignee}`;
          }
          successMsg += `\n\n${result.output || "Issue created successfully."}`;
          
          // Extract issue IID and URL from glab output
          // glab outputs: "Creating issue in ... \n #123 Title \n https://git.nevint.com/..."
          // Fallback: extract IID from URL if #123 format not found
          const issueIidMatch = result.output?.match(/#(\d+)/);
          const issueUrlMatch = result.output?.match(/(https?:\/\/[^\s]+)/);
          const issueUrl = issueUrlMatch ? issueUrlMatch[1] : null;
          
          // Try to get IID from #123 format first, then from URL as fallback
          let issueIid: number | null = issueIidMatch ? parseInt(issueIidMatch[1], 10) : null;
          if (!issueIid && issueUrl) {
            // Extract from URL: .../issues/123 or .../merge_requests/123
            const urlIidMatch = issueUrl.match(/\/(?:issues|merge_requests)\/(\d+)/);
            if (urlIidMatch) {
              issueIid = parseInt(urlIidMatch[1], 10);
              console.log(`[DPA Workflow] Extracted issueIid from URL: ${issueIid}`);
            }
          }
          
          // Store thread-issue mapping for auto-syncing replies
          // Use actual rootId (thread root message ID) for accurate lookup on subsequent replies
          const mappingRootId = storedRootId || storedChatId;
          console.log(`[DPA Workflow] Mapping data: chatId=${storedChatId}, rootId=${storedRootId}, mappingRootId=${mappingRootId}, issueIid=${issueIid}, issueUrl=${issueUrl}`);
          
          if (storedChatId && mappingRootId && issueIid && issueUrl) {
            try {
              const mappingResult = await storeIssueThreadMapping({
                chatId: storedChatId,
                rootId: mappingRootId,
                project,
                issueIid,
                issueUrl,
                createdBy: createdBy || 'unknown',
              });
              if (mappingResult.success) {
                console.log(`[DPA Workflow] ✅ Stored thread-issue mapping: chat=${storedChatId}, root=${mappingRootId} → #${issueIid}`);
              } else {
                console.error(`[DPA Workflow] ❌ Failed to store mapping: ${mappingResult.error}`);
              }
            } catch (mappingError: any) {
              console.error(`[DPA Workflow] ❌ Exception storing thread mapping: ${mappingError.message}`);
            }
          } else {
            console.warn(`[DPA Workflow] ⚠️ Skipping mapping storage - missing data: chatId=${!!storedChatId}, rootId=${!!mappingRootId}, issueIid=${!!issueIid}, issueUrl=${!!issueUrl}`);
          }
          
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
                  successMsg += `\n\n📋 Feishu Task → @${assignee}`;
                  if (taskResult.taskUrl) {
                    successMsg += `  ·  [View](${taskResult.taskUrl})`;
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
            result: `❌ **Failed to Create Issue**\n\n${result.error}`,
            intent: "gitlab_create" as const,
          };
        }
      } catch (error: any) {
        return {
          result: `❌ **Error**\n\n${error.message}`,
          intent: "gitlab_create" as const,
        };
      }
    }
    
    if (query.startsWith(CANCEL_PREFIX)) {
      return {
        result: `🚫 Cancelled`,
        intent: "gitlab_create" as const,
      };
    }
    
    // Use LLM to parse the issue creation request
    try {
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
  **IMPORTANT**: Title MUST be in Mandarin Chinese (中文). Keep technical jargons, project names, tool names, and URLs in English.
- description: Issue description (expand on the title with context).
  **IMPORTANT**: Description MUST be in Mandarin Chinese (中文). Keep technical jargons, code snippets, project names, tool names, API names, and URLs in English.
- project: GitLab project path. Look for explicit mentions like "in dpa/xxx", "项目 xxx". 
  Common DPA projects: dpa/dpa-mom/task (default), dpa/dagster (data pipelines), dpa/analytics (analysis/reports), dpa/dbt (data models), dpa/feishu-assistant (bot/automation).
  If not specified, default to "dpa/dpa-mom/task".
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
- assignee: GitLab username to assign the issue to. Look for:
  * "assign to xxx", "assignee: xxx", "for xxx", "@xxx"
  * Chinese: "指派给 xxx", "负责人: xxx", "分配给 xxx"
  * Extract the username only (e.g., "xiaofei.yin"), NOT the @mention syntax
  * If not specified, return "none" (will default to requester)

Request: "${query}"

Respond in this exact format:
TITLE: <title in Chinese, keep technical terms in English>
DESCRIPTION: <description in Chinese, keep technical terms/URLs in English>
PROJECT: <project>
PRIORITY: <1-4 or "none">
DUE_DATE: <YYYY-MM-DD or "none">
LABELS: <comma-separated labels or "none">
ASSIGNEE: <username or "none">`;

    const { text } = await generateText({
      model: freeModel, // Uses model-router
      prompt: parsePrompt,
      temperature: 0,
    });
    
    // Parse response
    console.log(`[DPA Workflow] LLM parse response:\n${text}`);
    const titleMatch = text.match(/TITLE:\s*(.+)/i);
    const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
    const projectMatch = text.match(/PROJECT:\s*(.+)/i);
    const priorityMatch = text.match(/PRIORITY:\s*(.+)/i);
    const dueDateMatch = text.match(/DUE_DATE:\s*(.+)/i);
    const labelsMatch = text.match(/LABELS:\s*(.+)/i);
    const assigneeMatch = text.match(/ASSIGNEE:\s*(.+)/i);
    
    const title = titleMatch?.[1]?.trim() || "New Issue";
    // Append doc summaries to description if available
    const baseDescription = descMatch?.[1]?.trim() || query;
    const description = docSummaries ? baseDescription + docSummaries : baseDescription;
    const project = projectMatch?.[1]?.trim() || "dpa/dpa-mom/task";
    
    // Parse priority (1-4)
    const priorityRaw = priorityMatch?.[1]?.trim();
    const priority = priorityRaw && /^[1-4]$/.test(priorityRaw) ? priorityRaw : undefined;
    
    // Parse due date (YYYY-MM-DD format)
    const dueDateRaw = dueDateMatch?.[1]?.trim();
    const dueDate = dueDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : undefined;
    
    // Parse labels
    const labelsRaw = labelsMatch?.[1]?.trim();
    const labels = labelsRaw && labelsRaw.toLowerCase() !== "none" ? labelsRaw : undefined;
    
    // Parse explicit assignee (if manager assigning to someone else)
    const assigneeRaw = assigneeMatch?.[1]?.trim();
    const explicitAssignee = assigneeRaw && assigneeRaw.toLowerCase() !== "none" ? assigneeRaw : undefined;
    console.log(`[DPA Workflow] Assignee extraction: raw="${assigneeRaw}", explicit="${explicitAssignee}"`);
    
    // Build labels array (include priority as label)
    const allLabels: string[] = [];
    if (priority) {
      allLabels.push(`priority::${priority}`);
    }
    if (labels) {
      allLabels.push(...labels.split(',').map(l => l.trim()).filter(Boolean));
    }
    
    // Map Feishu user to GitLab username for attribution (requester)
    const requesterUsername = userId ? feishuIdToEmpAccount(userId) : null;
    // Map explicit assignee (might be Feishu user_id like "_user_1") to GitLab username
    const mappedAssignee = explicitAssignee ? feishuIdToEmpAccount(explicitAssignee) : null;
    // Use mapped assignee if provided, otherwise default to requester
    const gitlabUsername = mappedAssignee || requesterUsername;
    console.log(`[DPA Workflow] Assignee decision: explicit="${explicitAssignee}", mapped="${mappedAssignee}", requester="${requesterUsername}", final="${gitlabUsername}"`);
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    // Append requester attribution to description (always show who requested, even if assigned to someone else)
    // Use Mandarin for labels, keep @mentions and timestamps as-is
    const requesterInfo = requesterUsername 
      ? `\n\n---\n📋 *通过飞书机器人创建*\n**发起人**: @${requesterUsername}\n**创建时间**: ${createdAt}`
      : `\n\n---\n📋 *通过飞书机器人创建*\n**创建时间**: ${createdAt}`;
    const enrichedDescription = description + requesterInfo;
    
    // Build glab command with assignee (explicit or requester)
    let glabCommand = `issue create -R ${project} -t "${title}" -d "${enrichedDescription}"`;
    if (gitlabUsername) {
      glabCommand += ` -a "${gitlabUsername}"`;
    }
    if (allLabels.length > 0) {
      glabCommand += ` -l "${allLabels.join(',')}"`;
    }
    if (dueDate) {
      glabCommand += ` --due-date ${dueDate}`;
    }
    
    // Build preview with title + body + metadata
    let preview = `📋 **Confirm Issue Creation**\n\n`;
    preview += `**${title}**\n`;
    // Show description (truncate if too long for preview)
    const descPreview = description.length > 500 
      ? description.substring(0, 500) + "..."
      : description;
    preview += `\n${descPreview}\n\n`;
    preview += `📁 \`${project}\``;
    if (gitlabUsername) {
      const assignmentNote = explicitAssignee && requesterUsername && explicitAssignee !== requesterUsername
        ? ` (by @${requesterUsername})`
        : '';
      preview += `  ·  👤 @${gitlabUsername}${assignmentNote}`;
    }
    if (dueDate) {
      preview += `  ·  📅 ${dueDate}`;
    }
    
    // Encode issue data for confirmation button
    console.log(`[DPA Workflow] ============================================`);
    console.log(`[DPA Workflow] Building confirmationData...`);
    console.log(`[DPA Workflow] chatId="${chatId}", rootId="${rootId}"`);
    console.log(`[DPA Workflow] chatId type: ${typeof chatId}, rootId type: ${typeof rootId}`);
    console.log(`[DPA Workflow] ============================================`);
    const confirmationData = JSON.stringify({
      title,
      description: enrichedDescription, // Include attribution in stored description
      project,
      priority,
      dueDate,
      labels: allLabels,
      assignee: gitlabUsername,
      glabCommand,
      // Include thread context for post-creation mapping
      chatId,
      rootId,  // Thread root message ID for accurate mapping
      createdBy: userId,
    });
    
      console.log(`[DPA Workflow] ConfirmationData JSON length: ${confirmationData.length}`);
      // Log first part of the data for debugging (avoid logging full description)
      const debugData = JSON.parse(confirmationData);
      console.log(`[DPA Workflow] ConfirmationData preview: title="${debugData.title}", chatId="${debugData.chatId}", rootId="${debugData.rootId}"`);
      
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
        result: `❌ **Parse Failed**\n\n${error.message}\n\n💡 Try: \`create issue: [title], priority 2, ddl next wednesday\``,
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
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, linkedIssue } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab list`);
    
    // Determine if listing issues or MRs
    const isMR = /\b(mr|merge\s*request|合并请求)\b/i.test(query);
    const isMyItems = /\b(my|我的|mine)\b/i.test(query);
    const isClosed = /\b(closed|已关闭|完成)\b/i.test(query);
    
    let glabCommand: string;
    
    // glab uses -c/--closed for closed items, no flag = open items
    // Use JSON output to get URLs
    // Filter to dpa/dpa-mom/task project only
    if (isMR) {
      glabCommand = isMyItems 
        ? `mr list -R dpa/dpa-mom/task --assignee=@me${isClosed ? ' --closed' : ''} -O json`
        : `mr list -R dpa/dpa-mom/task${isClosed ? ' --closed' : ''} -O json`;
    } else {
      glabCommand = isMyItems
        ? `issue list -R dpa/dpa-mom/task --assignee=@me${isClosed ? ' -c' : ''} -O json`
        : `issue list -R dpa/dpa-mom/task${isClosed ? ' -c' : ''} -O json`;
    }
    
    try {
      const result = await (gitlabTool.execute as any)({ command: glabCommand }) as { success: boolean; output?: string; error?: string };
      
      if (result.success) {
        const itemType = isMR ? "Merge Requests" : "Issues";
        const scope = isMyItems ? "My " : "";
        const stateLabel = isClosed ? " (Closed)" : "";
        
        // Parse JSON output
        interface GitLabItem {
          iid: number;
          title: string;
          web_url: string;
          labels?: string[];
          created_at: string;
          references?: { full: string };
        }
        
        let items: GitLabItem[] = [];
        try {
          items = JSON.parse(result.output || "[]");
        } catch (e) {
          console.error("[DPA Workflow] Failed to parse glab JSON output:", e);
        }
        
        // Build clean markdown list
        let response = `📋 **${scope}${itemType}${stateLabel}**\n\n`;
        
        if (items.length === 0) {
          response += `No ${itemType.toLowerCase()} found.`;
        } else {
          for (const item of items) {
            const labelsStr = item.labels?.length ? `  \`${item.labels.join(', ')}\`` : '';
            response += `• [#${item.iid}](${item.web_url}) ${item.title}${labelsStr}\n`;
          }
        }
        
        // Add linkage status and hint (only for issues, not MRs)
        if (!isMR) {
          if (linkedIssue) {
            response += `\n🔗 *Thread linked to #${linkedIssue.issueIid}*`;
          } else if (items.length > 0) {
            response += `\n💡 Say \`link to #123\` to track an issue`;
          }
        }
        
        return {
          result: response,
          intent: "gitlab_list" as const,
        };
      } else {
        return {
          result: `❌ **List Failed**\n\n${result.error}`,
          intent: "gitlab_list" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **GitLab Error**\n\n${error.message}`,
        intent: "gitlab_list" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab Thread Update
 * Adds a note/comment to linked GitLab issue
 */
const executeGitLabThreadUpdateStep = createStep({
  id: "execute-gitlab-thread-update",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, userId, linkedIssue } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab thread update`);
    
    if (!linkedIssue) {
      return {
        result: `❌ **No Linked Issue**\n\n💡 Link this thread first: \`link to #123\``,
        intent: "gitlab_thread_update" as const,
      };
    }
    
    try {
      // Format the comment with user attribution (Mandarin headers)
      const userMention = userId ? `@${userId}` : "飞书用户";
      const comment = `**[飞书消息同步 - 来自 ${userMention}]**\n\n${query}`;
      
      // Escape quotes for shell command
      const escapedComment = comment.replace(/"/g, '\\"');
      const glabCommand = `issue note ${linkedIssue.issueIid} -m "${escapedComment}" -R ${linkedIssue.project}`;
      
      const result = await (gitlabTool.execute as any)({ command: glabCommand }) as { success: boolean; output?: string; error?: string };
      
      if (result.success) {
        return {
          result: `✅ **Note Added** → [#${linkedIssue.issueIid}](${linkedIssue.issueUrl})\n\n> ${query.substring(0, 100)}${query.length > 100 ? '...' : ''}`,
          intent: "gitlab_thread_update" as const,
        };
      } else {
        return {
          result: `❌ **Failed to Add Note**\n\nIssue #${linkedIssue.issueIid}\n\n${result.error}`,
          intent: "gitlab_thread_update" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **GitLab Error**\n\n${error.message}`,
        intent: "gitlab_thread_update" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab Relink
 * Links current thread to an existing GitLab issue (re-engagement UX)
 */
const executeGitLabRelinkStep = createStep({
  id: "execute-gitlab-relink",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { params, chatId, rootId, userId, linkedIssue } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab relink`);
    
    // Check if already linked
    if (linkedIssue) {
      return {
        result: `⚠️ **Already Linked** → [#${linkedIssue.issueIid}](${linkedIssue.issueUrl})\n\n💡 To link to a different issue, start a new thread.`,
        intent: "gitlab_relink" as const,
      };
    }
    
    // Get issue IID from params
    const issueIid = params?.issueIid ? parseInt(params.issueIid, 10) : null;
    if (!issueIid) {
      return {
        result: `❌ **Missing Issue Number**\n\n💡 Example: \`link to #123\` or \`跟踪issue 456\``,
        intent: "gitlab_relink" as const,
      };
    }
    
    if (!chatId || !rootId) {
      return {
        result: `❌ **Cannot Link**\n\nMissing thread context`,
        intent: "gitlab_relink" as const,
      };
    }
    
    try {
      // Verify issue exists and get its details (use JSON for reliable parsing)
      const glabCommand = `issue view ${issueIid} -R dpa/dpa-mom/task -F json`;
      const result = await (gitlabTool.execute as any)({ command: glabCommand }) as { success: boolean; output?: string; error?: string };
      
      if (!result.success) {
        return {
          result: `❌ **Issue Not Found**\n\nIssue #${issueIid} not found in \`dpa/dpa-mom/task\`\n\n${result.error}`,
          intent: "gitlab_relink" as const,
        };
      }
      
      // Parse JSON to get URL
      let issueUrl = `https://git.nevint.com/dpa/dpa-mom/task/-/issues/${issueIid}`;
      const project = "dpa/dpa-mom/task";
      
      try {
        const issueData = JSON.parse(result.output || "{}");
        if (issueData.web_url) {
          issueUrl = issueData.web_url;
        }
      } catch (e) {
        console.warn("[DPA Workflow] Failed to parse issue JSON, using default URL");
      }
      
      // Store the mapping
      const mappingResult = await storeIssueThreadMapping({
        chatId,
        rootId,
        project,
        issueIid,
        issueUrl,
        createdBy: userId || 'unknown',
      });
      
      if (mappingResult.success) {
        return {
          result: `✅ **Thread Linked** → [#${issueIid}](${issueUrl})\n\n💡 Future replies will auto-sync to GitLab as comments.`,
          intent: "gitlab_relink" as const,
        };
      } else {
        return {
          result: `❌ **Link Failed**\n\n${mappingResult.error}`,
          intent: "gitlab_relink" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **GitLab Error**\n\n${error.message}`,
        intent: "gitlab_relink" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab Summarize
 * Fetches issue + comments and generates LLM summary
 */
const executeGitLabSummarizeStep = createStep({
  id: "execute-gitlab-summarize",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { params } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab summarize`);
    
    const issueIid = params?.issueIid ? parseInt(params.issueIid, 10) : null;
    if (!issueIid) {
      return {
        result: `❌ **Missing Issue Number**\n\n💡 Example: \`summarize #12\` or \`总结 #123\``,
        intent: "gitlab_summarize" as const,
      };
    }
    
    try {
      // Fetch issue with comments
      const glabCommand = `issue view ${issueIid} -R dpa/dpa-mom/task -c`;
      const result = await (gitlabTool.execute as any)({ command: glabCommand }) as { success: boolean; output?: string; error?: string };
      
      if (!result.success) {
        return {
          result: `❌ **Issue Not Found**\n\nIssue #${issueIid} not found\n\n${result.error}`,
          intent: "gitlab_summarize" as const,
        };
      }
      
      const issueContent = result.output || "";
      
      // Default to Mandarin, only English if explicitly requested
      const query = inputData.query || "";
      const wantsEnglish = /\b(in english|english|eng)\b/i.test(query);
      const language = wantsEnglish ? "English" : "Mandarin Chinese (中文)";
      
      // Use LLM to summarize
      const summarizePrompt = `Summarize this GitLab issue concisely. Include:
1. What the issue is about (1-2 sentences)
2. Current status and key updates from comments
3. Any action items or blockers mentioned

Issue content:
${issueContent}

${feishuCardOutputGuidelines({ language })}
`;

      const { text: summary } = await generateText({
        model: freeModel,
        prompt: summarizePrompt,
        temperature: 0.3,
      });
      
      // Build response
      const issueUrl = `https://git.nevint.com/dpa/dpa-mom/task/-/issues/${issueIid}`;
      
      return {
        result: `📋 **Issue #${issueIid} Summary**\n\n${summary}\n\n🔗 [View Full Issue](${issueUrl})`,
        intent: "gitlab_summarize" as const,
      };
    } catch (error: any) {
      return {
        result: `❌ **Summary Failed**\n\n${error.message}`,
        intent: "gitlab_summarize" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab Close
 * Closes an issue with deliverable information and asset label
 */
const executeGitLabCloseStep = createStep({
  id: "execute-gitlab-close",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { params, query, userId } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab close`);
    
    const issueIid = params?.issueIid ? parseInt(params.issueIid, 10) : null;
    if (!issueIid) {
      return {
        result: `❌ **Missing Issue Number**\n\n💡 Example: \`close #12 delivered dashboard at superset.nevint.com/dash/123\``,
        intent: "gitlab_close" as const,
      };
    }
    
    try {
      // Parse asset type from query
      const dashboardMatch = /dashboard|仪表盘|看板/i.test(query);
      const reportMatch = /report|报表|报告/i.test(query);
      const tableMatch = /table|表|数据表/i.test(query);
      
      let assetType: string | null = null;
      if (dashboardMatch) assetType = "dashboard";
      else if (reportMatch) assetType = "report";
      else if (tableMatch) assetType = "table";
      
      // Extract deliverable URL - REQUIRED for closing
      const urlMatch = query.match(/(https?:\/\/[^\s]+)/i);
      const extractedUrl = urlMatch?.[1] || null;
      
      // Validate: URL is required to close an issue
      if (!extractedUrl) {
        return {
          result: `❌ **Deliverable URL Required**\n\nTo close an issue, you must provide the deliverable URL.\n\n💡 Example:\n• \`close #${issueIid} delivered dashboard at https://superset.nevint.com/dashboard/123\`\n• \`完成 #${issueIid} report https://confluence.nevint.com/pages/456\``,
          intent: "gitlab_close" as const,
        };
      }
      
      // Map Feishu user to GitLab username for attribution
      const gitlabUsername = userId ? feishuIdToEmpAccount(userId) : null;
      const closedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      
      // Build deliverable comment (Mandarin labels, keep URLs and @mentions as-is)
      let commentParts: string[] = [];
      commentParts.push(`**[通过飞书机器人关闭]**`);
      commentParts.push(``);
      if (assetType) {
        // Map asset type to Chinese
        const assetTypeZh: Record<string, string> = {
          dashboard: "仪表盘 (dashboard)",
          report: "报表 (report)",
          table: "数据表 (table)",
        };
        commentParts.push(`**交付物类型**: ${assetTypeZh[assetType] || assetType}`);
      }
      if (extractedUrl) {
        commentParts.push(`**交付物链接**: ${extractedUrl}`);
      }
      if (gitlabUsername) {
        commentParts.push(`**关闭人**: @${gitlabUsername}`);
      }
      commentParts.push(`**关闭时间**: ${closedAt}`);
      
      const comment = commentParts.join('\n');
      const escapedComment = comment.replace(/"/g, '\\"');
      
      // Step 1: Add asset label if detected
      if (assetType) {
        const labelCommand = `issue update ${issueIid} -R dpa/dpa-mom/task -l "${assetType}"`;
        console.log(`[DPA Workflow] Adding label: ${labelCommand}`);
        const labelResult = await (gitlabTool.execute as any)({ command: labelCommand }) as { success: boolean; output?: string; error?: string };
        if (!labelResult.success) {
          console.warn(`[DPA Workflow] Failed to add label: ${labelResult.error}`);
        }
      }
      
      // Step 2: Add deliverable comment
      const noteCommand = `issue note ${issueIid} -m "${escapedComment}" -R dpa/dpa-mom/task`;
      console.log(`[DPA Workflow] Adding note: ${noteCommand}`);
      const noteResult = await (gitlabTool.execute as any)({ command: noteCommand }) as { success: boolean; output?: string; error?: string };
      if (!noteResult.success) {
        console.warn(`[DPA Workflow] Failed to add note: ${noteResult.error}`);
      }
      
      // Step 3: Close the issue
      const closeCommand = `issue close ${issueIid} -R dpa/dpa-mom/task`;
      console.log(`[DPA Workflow] Closing issue: ${closeCommand}`);
      const closeResult = await (gitlabTool.execute as any)({ command: closeCommand }) as { success: boolean; output?: string; error?: string };
      
      if (closeResult.success) {
        const issueUrl = `https://git.nevint.com/dpa/dpa-mom/task/-/issues/${issueIid}`;
        
        let successMsg = `✅ **Issue #${issueIid} Closed**\n\n`;
        if (assetType) {
          successMsg += `🏷️ Asset: \`${assetType}\`\n`;
        }
        if (extractedUrl) {
          successMsg += `📦 Deliverable: ${extractedUrl}\n`;
        }
        successMsg += `\n🔗 [View Issue](${issueUrl})`;
        
        return {
          result: successMsg,
          intent: "gitlab_close" as const,
        };
      } else {
        return {
          result: `❌ **Failed to Close Issue**\n\nIssue #${issueIid}\n\n${closeResult.error}`,
          intent: "gitlab_close" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **GitLab Error**\n\n${error.message}`,
        intent: "gitlab_close" as const,
      };
    }
  }
});

/**
 * Step: Execute Feedback Summarize
 * Summarizes specific users' feedback from chat history for issue creation
 * Supports multiple users (comma-separated in params.targetUsers)
 */
const executeFeedbackSummarizeStep = createStep({
  id: "execute-feedback-summarize",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { params, chatId, userId, rootId } = inputData;
    const targetUsersRaw = params?.targetUsers;
    
    console.log(`[DPA Workflow] executeFeedbackSummarize: inputData keys=${Object.keys(inputData).join(',')}`);
    console.log(`[DPA Workflow] executeFeedbackSummarize: chatId=${chatId}, userId=${userId}, params=${JSON.stringify(params)}`);
    console.log(`[DPA Workflow] executeFeedbackSummarize: targetUsersRaw=${targetUsersRaw}`);
    
    // 1. Validate inputs
    if (!chatId) {
      return { 
        result: "❌ 无法获取聊天ID", 
        intent: "feedback_summarize" as const 
      };
    }
    
    if (!targetUsersRaw) {
      return { 
        result: "❌ 请指定要总结反馈的用户\n\n💡 示例:\n- `/总结反馈 @张三`\n- `/总结反馈 @张三 @李四 @王五`",
        intent: "feedback_summarize" as const 
      };
    }
    
    // 2. Parse target users (comma-separated)
    const targetUsers = targetUsersRaw.split(',').map(u => u.trim()).filter(Boolean);
    console.log(`[DPA Workflow] Executing feedback summarize for ${targetUsers.length} user(s): ${targetUsers.join(', ')}`);
    
    try {
      // 3. Fetch recent messages ONCE, then fan-out filter per user
      const allUserMessages: { user: string; messages: any[] }[] = [];
      const noMessagesUsers: string[] = [];
      
      // Calculate 4-hour time window (session-based)
      const fourHoursAgo = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
      const now = Math.floor(Date.now() / 1000);
      const fourHoursAgoMs = fourHoursAgo * 1000;
      const nowMs = now * 1000;
      
      // Helper: timeout wrapper for API calls
      const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
        ]);
      
      // Get user_id → open_id mapping for this chat (cached)
      const memberMapping = await getChatMemberMapping(chatId);
      console.log(`[DPA Workflow] Got ${memberMapping.size} user_id→open_id mappings`);

      // Fetch chat history once (limit=50). Filtering by time/user is done client-side.
      let baseHistoryResult: { success: boolean; messages?: any[]; error?: string };
      try {
        baseHistoryResult = await withTimeout(
          (chatHistoryTool.execute as any)({
            chatId,
            limit: 50, // Max allowed by Feishu API
          }),
          15000 // 15s timeout
        );
      } catch (timeoutError: any) {
        console.error(`[DPA Workflow] Timeout/error fetching chat history: ${timeoutError.message}`);
        return {
          result: `❌ **无法读取群聊历史消息**\n\n获取群聊历史消息时超时。\n\n**可能原因:**\n1. 机器人缺少 \`im:message\` 权限\n2. 群聊未开启\"允许读取历史消息\"\n3. 飞书API暂时不可用\n\n**解决方案:**\n请联系管理员检查机器人权限设置。`,
          intent: "feedback_summarize" as const,
        };
      }

      console.log(
        `[DPA Workflow] Base chat history: success=${baseHistoryResult.success}, totalMessages=${baseHistoryResult.messages?.length || 0}, error=${baseHistoryResult.error || "none"}`
      );

      if (!baseHistoryResult.success || !baseHistoryResult.messages) {
        return {
          result: `❌ **无法读取群聊历史消息**\n\n${baseHistoryResult.error || "未知错误"}`,
          intent: "feedback_summarize" as const,
        };
      }

      const baseMessages = baseHistoryResult.messages;
      if (baseMessages.length) {
        const sampleSenders = baseMessages.slice(0, 5).map((m: any) => m.sender?.id);
        console.log(`[DPA Workflow] Sample sender IDs: ${JSON.stringify(sampleSenders)}`);
      }

      const getCreateTimeMs = (msg: any): number => {
        const raw = parseInt(msg?.createTime || '0', 10);
        if (!raw || Number.isNaN(raw)) return 0;
        return raw > 1e12 ? raw : raw * 1000;
      };

      const normalizeMessageText = (text: string): string => {
        // keep prompt small: one-line, trimmed, capped
        return String(text || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 220);
      };

      const MAX_MESSAGES_PER_USER = 8;
      
      for (const targetUser of targetUsers) {
        const targetUserId = resolveFeishuUserId(targetUser);
        
        // Resolve user_id to open_id if needed
        const targetOpenId = targetUserId?.startsWith("ou_") 
          ? targetUserId 
          : memberMapping.get(targetUserId || "") || null;
        
        console.log(`[DPA Workflow] Fetching messages for user: "${targetUser}" → userId: "${targetUserId}" → openId: "${targetOpenId}"`);
        console.log(`[DPA Workflow] Time range: ${fourHoursAgo} to ${now} (${new Date(fourHoursAgo * 1000).toISOString()} to ${new Date(now * 1000).toISOString()})`);

        // Filter base messages by sender (match user_id OR open_id) and time range
        const filteredMessages = baseMessages.filter((msg: any) => {
          const senderId = msg.sender?.id;
          const senderMatches = senderId === targetUserId || senderId === targetOpenId;
          const createTimeMs = getCreateTimeMs(msg);
          const inTimeRange = createTimeMs >= fourHoursAgoMs && createTimeMs <= nowMs;
          return senderMatches && inTimeRange;
        });

        // Keep only most recent messages for prompt size control
        const filteredSorted = filteredMessages
          .slice()
          .sort((a: any, b: any) => getCreateTimeMs(a) - getCreateTimeMs(b));
        const trimmed = filteredSorted.slice(-MAX_MESSAGES_PER_USER).map((m: any) => ({
          ...m,
          content: normalizeMessageText(m.content),
        })).filter((m: any) => Boolean(m.content));

        console.log(`[DPA Workflow] Filtered to ${filteredMessages.length} msgs, using ${trimmed.length} (max ${MAX_MESSAGES_PER_USER}) for @${targetUser}`);

        if (trimmed.length > 0) {
          allUserMessages.push({ user: targetUser, messages: trimmed });
          console.log(`[DPA Workflow] Using ${trimmed.length} messages from ${targetUser}`);
        } else {
          noMessagesUsers.push(targetUser);
          console.log(`[DPA Workflow] No messages found for ${targetUser}`);
        }
      }
      
      // Check if we found any messages
      if (allUserMessages.length === 0) {
        const userList = targetUsers.map(u => `@${u}`).join(', ');
        return {
          result: `❌ 未找到 ${userList} 最近4小时内的消息\n\n可能原因:\n- 用户ID不匹配\n- 这些用户在过去4小时内无消息`,
          intent: "feedback_summarize" as const
        };
      }
      
      // 4. Build combined message list for LLM
      const totalMessageCount = allUserMessages.reduce((sum, u) => sum + u.messages.length, 0);
      const userListDisplay = allUserMessages.map(u => `@${u.user}`).join(', ');
      
      // Format messages grouped by user
      const messagesForPrompt = allUserMessages.map(({ user, messages }) => 
        `### 来自 @${user} 的消息 (${messages.length} 条):\n${messages.map((m: any) => `- ${m.content}`).join('\n')}`
      ).join('\n\n');
      
      // 5. Use LLM to categorize and summarize feedback
      // NOTE: Avoid big markdown headers (##) in Feishu cards; use bold section titles + dividers.
      const feedbackPrompt = `分析以下来自多位用户的消息，并按类别提取反馈:

${messagesForPrompt}

${feishuCardOutputGuidelines({ language: "Mandarin Chinese (中文)" })}

请按以下格式整理反馈（使用中文；务必简洁；每个分类最多 5 条；每条都要标注来源用户；分类之间要有分隔线）:

**🐛 问题反馈 (Bug Reports)**
- **@用户**: ...
- **@用户**: ...

---

**💡 功能建议 (Feature Requests)**
- **@用户**: ...

---

**❓ 疑问 (Questions)**
- **@用户**: ...

---

**📝 其他 (Other)**
- **@用户**: ...

如果某分类没有内容，写"无"。
最后新增一行：
**一句话总结**: ...`;

      const { text: summary } = await generateText({
        model: freeModel,
        prompt: feedbackPrompt,
        temperature: 0,
      });
      
      // 6. Build confirmation preview for issue creation
      const userNames = allUserMessages.map(u => u.user).join(', ');
      const issueTitle = targetUsers.length === 1 
        ? `[用户反馈] ${userNames} 的反馈总结`
        : `[用户反馈] ${targetUsers.length}人反馈总结 (${userNames})`;
      
      const issueBody = `${summary}\n\n---\n📊 分析了 ${totalMessageCount} 条消息 (来自 ${allUserMessages.length} 位用户，最近4小时)\n📅 生成时间: ${new Date().toISOString().split('T')[0]}`;
      
      // Build labels for each user
      const userLabels = allUserMessages.map(u => `from:${u.user}`).join(',');
      const allLabels = `user-feedback,${userLabels}`;
      
      // 7. Return summary with confirmation option
      const generatedDate = new Date().toISOString().split('T')[0];
      let preview =
        `**反馈总结**\n` +
        `<font color="grey">范围: ${userListDisplay} ｜ 最近4小时 ｜ 消息: ${totalMessageCount} 条 ｜ 生成: ${generatedDate}</font>\n\n` +
        `---\n\n` +
        `${summary}`;
      
      // Note if some users had no messages
      if (noMessagesUsers.length > 0) {
        preview += `\n\n⚠️ 未找到以下用户的消息: ${noMessagesUsers.map(u => `@${u}`).join(', ')}`;
      }
      
      preview += `\n\n---\n💡 回复 "创建issue" 将此反馈记录到GitLab`;
      
      const confirmationData = JSON.stringify({
        title: issueTitle,
        description: issueBody,
        project: "dpa/dpa-mom/task",
        labels: ["user-feedback", ...allUserMessages.map(u => `from:${u.user}`)],
        glabCommand: `issue create -R dpa/dpa-mom/task -t "${issueTitle}" -d "${issueBody.replace(/"/g, '\\"')}" -l "${allLabels}"`,
        chatId,
        rootId,
        createdBy: userId,
      });
      
      return {
        result: preview,
        intent: "feedback_summarize" as const,
        needsConfirmation: true,
        confirmationData,
      };
    } catch (error: any) {
      console.error(`[DPA Workflow] Feedback summarize error:`, error);
      return {
        result: `❌ **总结失败**\n\n${error.message}`,
        intent: "feedback_summarize" as const,
      };
    }
  }
});

/**
 * Step: Execute Feedback Update
 * Collects feedback from specified users and appends to an existing GitLab issue
 * Format: /update #123 @user1 @user2
 */
const executeFeedbackUpdateStep = createStep({
  id: "execute-feedback-update",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
    needsConfirmation: z.boolean().optional(),
    confirmationData: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const { params, chatId, rootId, userId } = inputData;
    
    console.log(`[DPA Workflow] executeFeedbackUpdate: params=${JSON.stringify(params)}`);
    
    // Check for parsing errors
    if (params?.error === 'missing_issue') {
      return {
        result: `❌ **缺少Issue编号**\n\n请使用格式: \`/update #123 @用户名\`\n\n例如: \`/update #42 @yi.huang3 @grace.yu3\``,
        intent: "feedback_update" as const,
      };
    }
    
    if (params?.error === 'missing_users') {
      return {
        result: `❌ **缺少用户名**\n\n请使用格式: \`/update #${params.issueIid} @用户名\`\n\n例如: \`/update #${params.issueIid} @yi.huang3\``,
        intent: "feedback_update" as const,
      };
    }
    
    const issueIid = params?.issueIid;
    const targetUsersRaw = params?.targetUsers;
    
    if (!issueIid || !targetUsersRaw || !chatId) {
      return {
        result: `❌ **参数不完整**\n\n请使用格式: \`/update #123 @用户名\``,
        intent: "feedback_update" as const,
      };
    }
    
    const targetUsers = targetUsersRaw.split(',').filter(Boolean);
    console.log(`[DPA Workflow] Updating issue #${issueIid} with feedback from: ${targetUsers.join(', ')}`);
    
    try {
      // 1. Fetch existing issue to verify it exists
      const issueResult = await (gitlabTool.execute as any)({
        operation: "view",
        issueIid,
      }) as { success: boolean; data?: any; error?: string };
      
      if (!issueResult.success || !issueResult.data) {
        return {
          result: `❌ **Issue #${issueIid} 不存在或无法访问**\n\n${issueResult.error || '请检查Issue编号是否正确'}`,
          intent: "feedback_update" as const,
        };
      }
      
      const existingIssue = issueResult.data;
      console.log(`[DPA Workflow] Found issue: "${existingIssue.title}"`);
      
      // 2. Collect feedback (reuse logic from feedback_summarize)
      const fourHoursAgo = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
      const now = Math.floor(Date.now() / 1000);
      const allUserMessages: { user: string; messages: any[] }[] = [];
      
      // Get user mapping
      const memberMapping = await getChatMemberMapping(chatId);
      
      for (const targetUser of targetUsers) {
        const targetUserId = resolveFeishuUserId(targetUser);
        const targetOpenId = targetUserId?.startsWith("ou_") 
          ? targetUserId 
          : memberMapping.get(targetUserId || "") || null;
        
        const historyResult = await (chatHistoryTool.execute as any)({
          chatId,
          limit: 50,
        }) as { success: boolean; messages?: any[]; error?: string };
        
        if (historyResult.success && historyResult.messages) {
          const fourHoursAgoMs = fourHoursAgo * 1000;
          const nowMs = now * 1000;
          
          const filteredMessages = historyResult.messages.filter((msg: any) => {
            const senderId = msg.sender?.id;
            const senderMatches = senderId === targetUserId || senderId === targetOpenId;
            const createTime = parseInt(msg.createTime || '0', 10);
            const createTimeMs = createTime > 1e12 ? createTime : createTime * 1000;
            const inTimeRange = createTimeMs >= fourHoursAgoMs && createTimeMs <= nowMs;
            return senderMatches && inTimeRange;
          });
          
          if (filteredMessages.length > 0) {
            allUserMessages.push({ user: targetUser, messages: filteredMessages });
          }
        }
      }
      
      if (allUserMessages.length === 0) {
        return {
          result: `❌ **未找到反馈消息**\n\n在过去4小时内未找到 ${targetUsers.map(u => `@${u}`).join(', ')} 的消息`,
          intent: "feedback_update" as const,
        };
      }
      
      // 3. Generate summary using LLM
      const totalMessageCount = allUserMessages.reduce((sum, u) => sum + u.messages.length, 0);
      const messagesForPrompt = allUserMessages.map(({ user, messages }) => 
        `### 来自 @${user} 的消息 (${messages.length} 条):\n${messages.map((m: any) => `- ${m.content}`).join('\n')}`
      ).join('\n\n');
      
      const feedbackPrompt = `分析以下用户消息，生成简洁的反馈更新:

${messagesForPrompt}

${feishuCardOutputGuidelines({ language: "Mandarin Chinese (中文)" })}

请用以下格式生成更新内容（简洁、专业，用于追加到现有Issue；避免大标题；要点之间留清晰层次）:

**反馈更新 (${new Date().toISOString().split('T')[0]})**
- ...
- ...

如果消息主要是闲聊，写"无实质性反馈"。`;

      const { text: summary } = await generateText({
        model: freeModel,
        prompt: feedbackPrompt,
        temperature: 0.3,
      });
      
      // 4. Build the update
      const updateSection = `\n\n---\n${summary}\n\n> 📊 来自 ${allUserMessages.map(u => `@${u.user}`).join(', ')} 的 ${totalMessageCount} 条消息`;
      
      const preview = `📝 **准备更新 Issue #${issueIid}**\n\n**现有标题:** ${existingIssue.title}\n\n**将追加内容:**\n${summary}\n\n---\n💡 确认后将追加到 Issue #${issueIid} 的描述中`;
      
      const confirmationData = JSON.stringify({
        action: 'update_issue',
        issueIid,
        appendContent: updateSection,
        project: "dpa/dpa-mom/task",
        chatId,
        rootId,
        updatedBy: userId,
      });
      
      return {
        result: preview,
        intent: "feedback_update" as const,
        needsConfirmation: true,
        confirmationData,
      };
    } catch (error: any) {
      console.error(`[DPA Workflow] Feedback update error:`, error);
      return {
        result: `❌ **更新失败**\n\n${error.message}`,
        intent: "feedback_update" as const,
      };
    }
  }
});

/**
 * Step: Execute GitLab Assign
 * Self-assign user to a linked GitLab issue
 */
const executeGitLabAssignStep = createStep({
  id: "execute-gitlab-assign",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { userId, linkedIssue } = inputData;
    
    console.log(`[DPA Workflow] Executing GitLab assign`);
    
    if (!linkedIssue) {
      return {
        result: `❌ **No Linked Issue**\n\nThis thread is not linked to a GitLab issue.\n\n💡 First link a thread: \`link to #123\``,
        intent: "gitlab_assign" as const,
      };
    }
    
    if (!userId) {
      return {
        result: `❌ **Unknown User**\n\nCouldn't identify your user ID for assignment.`,
        intent: "gitlab_assign" as const,
      };
    }
    
    try {
      // Map Feishu user to GitLab username
      const gitlabUsername = feishuIdToEmpAccount(userId);
      
      if (!gitlabUsername) {
        return {
          result: `❌ **User Not Mapped**\n\nCouldn't map Feishu user \`${userId}\` to GitLab username.\n\n💡 Contact admin to add user mapping.`,
          intent: "gitlab_assign" as const,
        };
      }
      
      console.log(`[DPA Workflow] Assigning issue #${linkedIssue.issueIid} to ${gitlabUsername}`);
      
      // Update issue assignee
      const assignCommand = `issue update ${linkedIssue.issueIid} -a "${gitlabUsername}" -R ${linkedIssue.project}`;
      const assignResult = await (gitlabTool.execute as any)({ command: assignCommand }) as { success: boolean; output?: string; error?: string };
      
      if (!assignResult.success) {
        return {
          result: `❌ **Assignment Failed**\n\nIssue #${linkedIssue.issueIid}\n\n${assignResult.error}`,
          intent: "gitlab_assign" as const,
        };
      }
      
      // Add comment noting the assignment (Mandarin text)
      const assignedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const comment = `**[通过飞书机器人自我指派]**\\n\\n@${gitlabUsername} 认领了此任务。\\n**时间**: ${assignedAt}`;
      const noteCommand = `issue note ${linkedIssue.issueIid} -m "${comment}" -R ${linkedIssue.project}`;
      await (gitlabTool.execute as any)({ command: noteCommand });
      
      return {
        result: `✅ **Assigned to @${gitlabUsername}** → [#${linkedIssue.issueIid}](${linkedIssue.issueUrl})\n\n💡 You can now update progress by replying in this thread.`,
        intent: "gitlab_assign" as const,
      };
    } catch (error: any) {
      return {
        result: `❌ **GitLab Error**\n\n${error.message}`,
        intent: "gitlab_assign" as const,
      };
    }
  }
});

/**
 * Step: Execute Code Review
 * Reviews git commits for bugs and provides feedback
 * Supports: /review (latest commit), /review abc123 (specific commit), /review abc..def (range)
 */
const executeCodeReviewStep = createStep({
  id: "execute-code-review",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { params, query } = inputData;
    
    console.log(`[DPA Workflow] Executing code review`);
    
    // Default to reviewing the latest commit (HEAD~1..HEAD)
    let commitRef = params?.commitRef || "HEAD~1..HEAD";
    let isRange = commitRef.includes("..");
    
    // If a single commit SHA is provided, review that commit specifically
    if (!isRange && /^[a-f0-9]{6,40}$/i.test(commitRef)) {
      // Single commit - show changes from parent
      commitRef = `${commitRef}~1..${commitRef}`;
      isRange = true;
    }
    
    try {
      // Get git diff
      const diffCommand = isRange 
        ? `git diff ${commitRef} --stat && echo "---DIFF---" && git diff ${commitRef}`
        : `git show ${commitRef} --stat && echo "---DIFF---" && git show ${commitRef} --format=format:"%H%n%s%n%b" --`;
      
      console.log(`[DPA Workflow] Running: ${diffCommand}`);
      
      const { stdout: diffOutput, stderr: diffError } = await execAsync(diffCommand, {
        cwd: process.cwd(),
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer for large diffs
        timeout: 30000,
      });
      
      if (diffError && !diffOutput) {
        return {
          result: `❌ **Git Error**\n\n${diffError}`,
          intent: "code_review" as const,
        };
      }
      
      // Get commit info for context
      const logCommand = isRange
        ? `git log ${commitRef} --oneline`
        : `git log -1 ${commitRef} --format="%H|%s|%an|%ar"`;
      
      const { stdout: logOutput } = await execAsync(logCommand, {
        cwd: process.cwd(),
        timeout: 5000,
      });
      
      // Parse diff output
      const diffParts = diffOutput.split("---DIFF---");
      const statOutput = diffParts[0]?.trim() || "";
      const fullDiff = diffParts[1]?.trim() || diffOutput;
      
      // Truncate very large diffs for LLM context
      const MAX_DIFF_LENGTH = 15000;
      const truncatedDiff = fullDiff.length > MAX_DIFF_LENGTH 
        ? fullDiff.substring(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated for review)"
        : fullDiff;
      
      // If diff is empty, inform user
      if (!truncatedDiff || truncatedDiff.trim() === "") {
        return {
          result: `📋 **No Changes Found**\n\n\`${commitRef}\` contains no diff to review.\n\n💡 Try: \`/code-review HEAD~5..HEAD\` to review last 5 commits`,
          intent: "code_review" as const,
        };
      }
      
      // Build review prompt
      const reviewPrompt = `You are an expert code reviewer. Review the following git diff and provide thorough feedback.

**Commit(s) being reviewed:**
${logOutput}

**File Statistics:**
${statOutput}

**Diff:**
\`\`\`diff
${truncatedDiff}
\`\`\`

**Your task:**
1. **🐛 Potential Bugs**: Identify any bugs, logic errors, or edge cases that might cause issues
2. **⚠️ Security Concerns**: Flag any security vulnerabilities (SQL injection, XSS, auth issues, secrets, etc.)
3. **🔧 Code Quality**: Note any code smells, anti-patterns, or maintainability concerns
4. **💡 Suggestions**: Provide specific, actionable improvements with code examples when helpful
5. **✅ What's Good**: Briefly acknowledge well-written parts

**Format your response in Markdown with clear sections. Be concise but thorough. Focus on what matters most.**

If the code looks solid, say so briefly and mention any minor suggestions.
If there are critical issues, prioritize them at the top.

Respond in the same language as code comments (default to English for code review).`;

      const { text: review } = await generateText({
        model: freeModel,
        prompt: reviewPrompt,
        temperature: 0.3,
      });
      
      // Build response with context
      const commitCount = isRange ? logOutput.split("\n").filter(Boolean).length : 1;
      const filesChanged = (statOutput.match(/(\d+) files? changed/)?.[1]) || "?";
      
      let response = `🔍 **Code Review**\n\n`;
      response += `<font color="grey">📊 ${commitCount} commit(s) | ${filesChanged} file(s) changed | ref: \`${commitRef}\`</font>\n\n`;
      response += `---\n\n`;
      response += review;
      response += `\n\n---\n💡 Review another: \`/code-review <sha>\` or \`/code-review HEAD~5..HEAD\``;
      
      return {
        result: response,
        intent: "code_review" as const,
      };
    } catch (error: any) {
      // Handle common git errors with helpful messages
      if (error.message?.includes("not a git repository")) {
        return {
          result: `❌ **Not a Git Repository**\n\nThis command must be run from within a git repository.`,
          intent: "code_review" as const,
        };
      }
      if (error.message?.includes("unknown revision")) {
        return {
          result: `❌ **Invalid Commit Reference**\n\n\`${commitRef}\` not found.\n\n💡 Examples:\n- \`/code-review\` — review latest commit\n- \`/code-review abc123\` — review specific commit\n- \`/code-review HEAD~3..HEAD\` — review last 3 commits`,
          intent: "code_review" as const,
        };
      }
      return {
        result: `❌ **Code Review Error**\n\n${error.message}`,
        intent: "code_review" as const,
      };
    }
  }
});

/**
 * Step: Execute Chat Search
 */
const executeChatSearchStep = createStep({
  id: "execute-chat-search",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
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
        result: "❌ **Cannot Search**\n\n无法搜索聊天记录：未提供聊天ID",
        intent: "chat_search" as const,
      };
    }
    
    try {
      const result = await (chatHistoryTool.execute as any)({ 
        chatId, 
        limit: 50 
      }) as { success: boolean; messages?: any[]; messageCount?: number; error?: string };
      
      if (result.success && result.messages) {
        // Filter messages based on query keywords
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const filtered = result.messages.filter((msg: any) => {
          const content = (msg.content || "").toLowerCase();
          return keywords.some(kw => content.includes(kw));
        });
        
        if (filtered.length > 0) {
          const summary = filtered.slice(0, 10).map((msg: any) => 
            `• **${msg.sender?.name || 'User'}**: ${(msg.content || "").substring(0, 100)}...`
          ).join("\n");
          
          return {
            result: `🔍 **搜索结果** (${filtered.length} 条消息)\n\n${summary}`,
            intent: "chat_search" as const,
          };
        } else {
          return {
            result: `🔍 未找到相关消息 (已搜索 ${result.messageCount} 条)`,
            intent: "chat_search" as const,
          };
        }
      } else {
        return {
          result: `❌ **搜索失败**\n\n${result.error || "未知错误"}`,
          intent: "chat_search" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **搜索错误**\n\n${error.message}`,
        intent: "chat_search" as const,
      };
    }
  }
});

/**
 * Step: Execute Doc Read
 * Uses document-read-workflow for fetch + persist + optional RAG embedding
 */
const executeDocReadStep = createStep({
  id: "execute-doc-read",
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, params, userId, chatId } = inputData;
    
    console.log(`[DPA Workflow] Executing doc read for user: ${userId}`);
    
    // Extract doc URL from params or query (support all Feishu doc URL formats)
    const docUrlRegex = /https?:\/\/[^\s]*feishu\.cn\/(?:docs|docx|wiki|sheets|bitable)\/[^\s]+/i;
    const docUrl = params?.docUrl || query.match(docUrlRegex)?.[0];
    
    if (!docUrl) {
      return {
        result: "❌ **未找到文档链接**\n\n请提供飞书文档链接（支持 docs/docx/wiki/sheets/bitable）",
        intent: "doc_read" as const,
      };
    }
    
    try {
      // Use document-read-workflow for structured fetch + persist + embed
      const result = await runDocumentReadWorkflow({
        docUrl,
        userId: userId || "",
        chatId,
        persistToSupabase: true,  // Always persist read docs
        embedForRag: false,       // Skip RAG embedding for now (can enable later)
      });
      
      if (result.success) {
        const content = result.content || "文档内容为空";
        const title = result.title || "Untitled";
        
        // Truncate if too long
        const displayContent = content.length > 2000 
          ? content.substring(0, 2000) + "...\n\n*(内容已截断)*"
          : content;
        
        // Add persistence status
        const persistStatus = result.persisted ? "  💾" : "";
        
        return {
          result: `📄 **${title}**${persistStatus}\n\n${displayContent}`,
          intent: "doc_read" as const,
        };
      } else {
        // Include auth prompt if needed
        let errorMsg = `❌ **读取文档失败**\n\n${result.error}`;
        if (result.needsAuth && result.authUrl) {
          errorMsg += `\n\n👉 [点击授权后重试](${result.authUrl})`;
        }
        return {
          result: errorMsg,
          intent: "doc_read" as const,
        };
      }
    } catch (error: any) {
      return {
        result: `❌ **文档错误**\n\n${error.message}`,
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
  inputSchema: z.object({
    intent: IntentEnum,
    params: z.record(z.string()).optional(),
    query: z.string(),
    chatId: z.string().optional(),
    rootId: z.string().optional(),
    userId: z.string().optional(),
    linkedIssue: linkedIssueSchema,
  }),
  outputSchema: z.object({
    result: z.string(),
    intent: IntentEnum,
  }),
  execute: async ({ inputData }) => {
    const { query, params } = inputData;
    
    // Handle help command
    if (params?.__helpCommand === "true") {
      const helpText = `**📋 可用命令 / Available Commands**

**GitLab操作**
- \`/创建\` 或 \`/新\` — 创建Issue
- \`/查看\` 或 \`/列表\` — 查看Issue/MR列表
- \`/总结 #123\` — 总结Issue进展
- \`/关闭 #123 [交付物链接]\` — 关闭Issue
- \`/关联 #123\` — 关联当前话题到Issue

**飞书操作**
- \`/搜索 关键词\` — 搜索聊天记录
- \`/文档 [链接]\` — 读取飞书文档

**代码审查**
- \`/code-review\` — 审查最近一次提交
- \`/code-review abc123\` — 审查指定commit
- \`/code-review HEAD~5..HEAD\` — 审查最近5次提交

**其他**
- \`/帮助\` — 显示此帮助

---

💡 不带 \`/\` 前缀的消息将由AI自动理解意图`;

      return {
        result: helpText,
        intent: "general_chat" as const,
      };
    }
    
    console.log(`[DPA Workflow] Executing general chat`);
    
    try {
      // Create inline agent for conversational response
      // Uses model-router (NVIDIA or OpenRouter free)
      const dpaMomAgent = new Agent({
        id: "dpa-mom-chat",
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
        model: freeModel, // Uses model-router
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
    rootId: z.string().optional().describe("Root message ID for thread identification"),
    userId: z.string().optional().describe("User ID"),
    linkedIssue: linkedIssueSchema.describe("Linked GitLab issue if thread has one"),
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
      async ({ inputData }) => inputData?.intent === "gitlab_close",
      executeGitLabCloseStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "gitlab_assign",
      executeGitLabAssignStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "gitlab_thread_update",
      executeGitLabThreadUpdateStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "gitlab_relink",
      executeGitLabRelinkStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "gitlab_summarize",
      executeGitLabSummarizeStep
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
      async ({ inputData }) => inputData?.intent === "feedback_summarize",
      executeFeedbackSummarizeStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "feedback_update",
      executeFeedbackUpdateStep
    ],
    [
      async ({ inputData }) => inputData?.intent === "code_review",
      executeCodeReviewStep
    ],
    // Help command: general_chat with __helpCommand param → executeGeneralChatStep
    [
      async ({ inputData }) => inputData?.intent === "general_chat" && inputData?.params?.__helpCommand === "true",
      executeGeneralChatStep
    ],
    // NOTE: general_chat without __helpCommand is NOT handled by workflow - falls back to agent
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
    const gitlabClose = getStepResult("execute-gitlab-close");
    const gitlabAssign = getStepResult("execute-gitlab-assign");
    const gitlabThreadUpdate = getStepResult("execute-gitlab-thread-update");
    const gitlabRelink = getStepResult("execute-gitlab-relink");
    const gitlabSummarize = getStepResult("execute-gitlab-summarize");
    const chatSearch = getStepResult("execute-chat-search");
    const docRead = getStepResult("execute-doc-read");
    const feedbackSummarize = getStepResult("execute-feedback-summarize");
    const feedbackUpdate = getStepResult("execute-feedback-update");
    const codeReview = getStepResult("execute-code-review");
    const generalChat = getStepResult("execute-general-chat");
    
    // Return the result from whichever branch executed
    const branchResult = gitlabCreate || gitlabList || gitlabClose || gitlabAssign || gitlabThreadUpdate || gitlabRelink || gitlabSummarize || chatSearch || docRead || feedbackSummarize || feedbackUpdate || codeReview || generalChat;
    
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

