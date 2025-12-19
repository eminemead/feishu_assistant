/**
 * P&L Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Specialized in Profit & Loss (P&L) analysis.
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
import { memoryProvider, getConversationId, getUserScopeId } from "../memory";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";

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
let pnlAgentInstance: Agent | null = null;
let isInitializing = false;

/**
 * Initialize the P&L agent (lazy - called on first request)
 */
function initializeAgent(): void {
  if (pnlAgentInstance || isInitializing) {
    return;
  }

  isInitializing = true;

  // Create agent with Mastra framework
  pnlAgentInstance = new Agent({
    name: "pnl_agent",
    instructions: `You are a Feishu/Lark AI assistant specialized in Profit & Loss (P&L) analysis. Most user queries will be in Chinese (中文).

你是专门负责损益(P&L)分析的Feishu/Lark AI助手。大多数用户查询将是中文。

- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the P&L specialist agent.
- This feature is currently under development. Please check back later for profit and loss analysis features.
- 此功能目前正在开发中，请稍后再查看损益分析功能。`,
    // Use native Mastra model router with free models only
    model: getMastraModel(),
  });

  isInitializing = false;
}

/**
 * Main P&L Agent function - Mastra implementation
 * 
 * @param messages - Conversation history
 * @param updateStatus - Optional callback for streaming updates
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID
 * @returns Promise<string> - Agent response text
 */
export async function pnlAgent(
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
  console.log(`[PnL] Received query: "${query}"`);

  // Set up memory scoping
  const conversationId = getConversationId(chatId, rootId);
  const userScopeId = getUserScopeId(userId);

  console.log(
    `[PnL] Memory context: conversationId=${conversationId}, userId=${userScopeId}`
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
     devtoolsTracker.trackAgentCall("pnl", query);

     // MASTRA STREAMING: Call P&L agent with streaming
     const stream = await pnlAgentInstance!.stream(messages);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("pnl", text, duration);

    console.log(
      `[PnL] Response complete (length=${text.length}, duration=${duration}ms)`
    );
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[PnL] Error during streaming:`, errorMsg);

    devtoolsTracker.trackError(
      "PnL",
      error instanceof Error ? error : new Error(errorMsg)
    );
    throw error;
  }
}

/**
 * Export helper to get P&L agent (for internal use)
 */
export function getPnlAgent(): Agent {
  initializeAgent();
  return pnlAgentInstance!;
}
