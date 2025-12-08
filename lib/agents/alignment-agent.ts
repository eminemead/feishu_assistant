/**
 * Alignment Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Specialized in alignment tracking and analysis.
 * 
 * KEY CHANGES FROM AI SDK TOOLS:
 * 1. Uses Mastra's Agent instead of @ai-sdk-tools/agents
 * 2. Native model fallback array instead of dual agents
 * 3. Same streaming API (textStream)
 * 4. Custom execution context via options
 */

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import { getPrimaryModel, getFallbackModel } from "../shared/model-fallback";
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
let alignmentAgentInstance: Agent | null = null;
let isInitializing = false;

/**
 * Initialize the alignment agent (lazy - called on first request)
 */
function initializeAgent(): void {
  if (alignmentAgentInstance || isInitializing) {
    return;
  }

  isInitializing = true;

  // Create agent with Mastra framework
  alignmentAgentInstance = new Agent({
    name: "alignment_agent",
    instructions: `You are a Feishu/Lark AI assistant specialized in alignment tracking. Most user queries will be in Chinese (中文).

你是专门负责对齐跟踪的Feishu/Lark AI助手。大多数用户查询将是中文。

- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the Alignment specialist agent.
- This feature is currently under development. Please check back later for alignment tracking features.
- 此功能目前正在开发中，请稍后再查看对齐跟踪功能。`,
    model: [
      {
        model: getPrimaryModel(),
        maxRetries: 3,
      },
      {
        model: getFallbackModel(),
        maxRetries: 3,
      },
    ],
  });

  isInitializing = false;
}

/**
 * Main Alignment Agent function - Mastra implementation
 * 
 * @param messages - Conversation history
 * @param updateStatus - Optional callback for streaming updates
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID
 * @returns Promise<string> - Agent response text
 */
export async function alignmentAgent(
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
  console.log(`[Alignment] Received query: "${query}"`);

  // Set up memory scoping
  const conversationId = getConversationId(chatId, rootId);
  const userScopeId = getUserScopeId(userId);

  console.log(
    `[Alignment] Memory context: conversationId=${conversationId}, userId=${userScopeId}`
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
     devtoolsTracker.trackAgentCall("alignment", query);

     // MASTRA STREAMING: Call alignment agent with streaming
     const stream = await alignmentAgentInstance!.stream(messages);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("alignment", text, duration);

    console.log(
      `[Alignment] Response complete (length=${text.length}, duration=${duration}ms)`
    );
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Alignment] Error during streaming:`, errorMsg);

    devtoolsTracker.trackError(
      "Alignment",
      error instanceof Error ? error : new Error(errorMsg)
    );
    throw error;
  }
}

/**
 * Export helper to get alignment agent (for internal use)
 */
export function getAlignmentAgent(): Agent {
  initializeAgent();
  return alignmentAgentInstance!;
}
