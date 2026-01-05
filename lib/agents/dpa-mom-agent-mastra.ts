/**
 * DPA Mom Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Specialized in DPA team support as chief-of-staff/executive assistant to Ian.
 * 
 * IDENTITY & SCOPE:
 * - DPA = Data Product & Analytics team
 * - Ian is the dad, dpa_mom takes care of every team member with love and care
 * - Role: Chief-of-staff or executive assistant to Ian
 * - Scope: Comprehensive support for team operations, coordination, and care
 * 
 * KEY CHANGES FROM AI SDK TOOLS:
 * 1. Uses Mastra's Agent instead of @ai-sdk-tools/agents
 * 2. Native model fallback array instead of dual agents
 * 3. Same streaming API (textStream)
 * 4. Custom execution context via options
 */

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import { getMastraModel } from "../shared/model-router";
import { devtoolsTracker } from "../devtools-integration";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";
import { getMemoryThreadId, getMemoryResourceId } from "../memory-factory";
import { 
  createGitLabCliTool, 
  createFeishuChatHistoryTool, 
  createFeishuDocsTool 
} from "../tools";

/**
 * Get query text from messages
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "user" && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "";
}

// Lazy-initialized agent
let dpaMomAgentInstance: Agent | null = null;
let isInitializing = false;

/**
 * Initialize the DPA Mom agent (lazy - called on first request)
 */
function initializeAgent(): void {
  if (dpaMomAgentInstance || isInitializing) {
    return;
  }

  isInitializing = true;

  // Create tool instances for dpa_mom
  const gitlabCliTool = createGitLabCliTool(true);
  const feishuChatHistoryTool = createFeishuChatHistoryTool(true);
  const feishuDocsTool = createFeishuDocsTool(true);

  // Create agent with Mastra framework
  dpaMomAgentInstance = new Agent({
    id: "dpa_mom",
    name: "dpa_mom",
    instructions: `You are dpa_mom, the loving and caring chief-of-staff and executive assistant to Ian (the dad) for the DPA (Data Product & Analytics) team. Most user queries will be in Chinese (中文).

你是dpa_mom，是Ian（爸爸）的贴心首席幕僚和执行助理，负责照顾DPA（数据产品与分析）团队的每一位成员。大多数用户查询将是中文。

IDENTITY & ROLE:
- You are dpa_mom, reflecting love and care for the team
- Ian is the dad, and you take care of every team member better than the dad
- Your role is like a chief-of-staff or executive assistant to Ian
- Your scope is comprehensive: team operations, coordination, support, and care

CORE RESPONSIBILITIES:
- Executive assistance: Help Ian with strategic planning, coordination, and decision support
- Team care: Support every DPA team member with their needs, questions, and challenges
- Operations: Coordinate team activities, track progress, manage information flow
- Communication: Facilitate clear and effective communication within the team
- Problem-solving: Proactively identify and address team needs

AVAILABLE TOOLS:
- gitlab_cli: Access GitLab repository and issue management via glab CLI (issues, MRs, CI/CD, etc.)
- feishu_chat_history: Access Feishu group chat histories and message threads
- feishu_docs: Read and access Feishu documents (Docs, Sheets, Bitable)

Use these tools proactively to help the team:
- Check GitLab issues and merge requests when asked about project status
- Retrieve chat history to understand context and previous discussions
- Read Feishu documents to answer questions about team documentation

GUIDELINES:
- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- Be warm, caring, and professional - embody the "mom" role with love and attention to detail
- Think comprehensively about team needs and Ian's priorities
- Always consider the well-being and success of every team member
- Use tools proactively to gather information before responding`,
    model: getMastraModel(true), // requireTools=true (has tools)
    // Add tools to agent
    tools: {
      gitlab_cli: gitlabCliTool,
      feishu_chat_history: feishuChatHistoryTool,
      feishu_docs: feishuDocsTool,
    },
  });

  isInitializing = false;
}

/**
 * Main DPA Mom Agent function - Mastra implementation
 * 
 * @param messages - Conversation history
 * @param updateStatus - Optional callback for streaming updates
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID
 * @returns Promise<string> - Agent response text
 */
export async function dpaMomAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<string> {
  // Lazy initialize agent
  initializeAgent();

  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[DPA Mom] Received query: "${query}"`);

  // Set up memory scoping
  const memoryThread = chatId && rootId ? getMemoryThreadId(chatId, rootId) : undefined;
  const memoryResource = userId ? getMemoryResourceId(userId) : undefined;

  console.log(
    `[DPA Mom] Memory context: memoryThread=${memoryThread}, memoryResource=${memoryResource}`
  );

  // Batch updates to avoid spamming Feishu
  const BATCH_DELAY_MS = 1000; // Batch every 1 second for better performance
  const MIN_CHARS_PER_UPDATE = 50; // Minimum characters to trigger update

  const accumulatedText: string[] = [];
  let pendingTimeout: NodeJS.Timeout | null = null;
  let lastUpdateLength = 0;

  const updateCardBatched = async (text: string): Promise<void> => {
    if (!updateStatus) {
      return;
    }

    // Clear pending update
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }

    const newChars = text.length - lastUpdateLength;

    // If we have enough new text, update immediately
    if (newChars >= MIN_CHARS_PER_UPDATE) {
      updateStatus(text);
      lastUpdateLength = text.length;
    } else {
      // Otherwise, batch the update
      pendingTimeout = setTimeout(() => {
        if (updateStatus) {
          updateStatus(text);
        }
        lastUpdateLength = text.length;
        pendingTimeout = null;
      }, BATCH_DELAY_MS);
    }
  };

  try {
     // Track agent call for devtools monitoring
     devtoolsTracker.trackAgentCall("dpa_mom", query);

     // MASTRA STREAMING: Call DPA Mom agent with streaming
     const stream = await dpaMomAgentInstance!.stream(messages);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("dpa_mom", text, duration);

    console.log(
      `[DPA Mom] Response complete (length=${text.length}, duration=${duration}ms)`
    );
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DPA Mom] Error during streaming:`, errorMsg);

    devtoolsTracker.trackError(
      "DPA Mom",
      error instanceof Error ? error : new Error(errorMsg)
    );
    throw error;
  }
}

/**
 * Export helper to get DPA Mom agent (for internal use)
 */
export function getDpaMomAgentMastra(): Agent {
  initializeAgent();
  return dpaMomAgentInstance!;
}
