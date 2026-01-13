/**
 * DPA Mom Agent - Unified Single Agent Architecture
 * 
 * The caring chief-of-staff for the DPA (Data Product & Analytics) team.
 * Single agent with all tools; uses execute_workflow for deterministic flows.
 * 
 * KEY DESIGN:
 * - Single agent with all tools attached
 * - execute_workflow tool for deterministic multi-step flows
 * - Native Mastra memory for conversation persistence
 * - Streaming with batched updates for Feishu cards
 */

import { CoreMessage } from "ai";
import { devtoolsTracker } from "../devtools-integration";
import {
  getMemoryThreadId,
  getMemoryResourceId,
  ensureWorkingMemoryInitialized,
} from "../memory-factory";
import { healthMonitor } from "../health-monitor";
import { getLinkedIssue, IssueThreadMapping } from "../services/issue-thread-mapping-service";
import type { Agent } from "@mastra/core/agent";
import { __internalGetDpaMomMemory } from "./dpa-mom-agent-factory";
import { runWithRequestContext } from "../runtime-context";

let cachedAgent: Agent | null = null;

/**
 * Get system prompt for unified agent
 */
// NOTE: system prompt + tool wiring lives in dpa-mom-agent-factory.ts

/**
 * Helper: extract query text from messages
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "[non-text message]";
}

/**
 * Linked issue info for thread-to-issue mapping
 */
export interface LinkedIssueResult {
  chatId: string;
  rootId: string;
  project: string;
  issueIid: number;
  issueUrl: string;
  createdBy: string;
}

/**
 * Agent result - can include confirmation data and reasoning
 */
export interface DpaMomResult {
  text: string;
  needsConfirmation?: boolean;
  confirmationData?: string;
  reasoning?: string;
  linkedIssue?: LinkedIssueResult;
}

/**
 * DPA Mom Agent
 * 
 * Single entry point for all queries. Agent handles tool selection itself.
 * 
 * @param messages - Conversation history
 * @param updateStatus - Callback for streaming updates to Feishu card
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID for auth/RLS
 */
export async function dpaMomAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
  memoryRootId?: string,
): Promise<DpaMomResult> {
  // Dynamic import to avoid hard module cycles:
  // dpa-mom-agent -> observability-config -> workflows -> (potentially) dpa-mom-agent
  const { getMastraAsync } = await import("../observability-config");
  const mastra = await getMastraAsync();
  const agent = (mastra.getAgent?.("dpa_mom") ?? (mastra as any).agents?.dpa_mom) as
    | Agent
    | undefined;
  if (!agent) {
    throw new Error(`DPA Mom agent not registered in Mastra (id=dpa_mom)`);
  }
  cachedAgent = agent;

  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[FeishuAssistant] Query: "${query}"`);

  // Build memory config
  const memoryResource = userId ? getMemoryResourceId(userId) : undefined;
  // In Feishu, many non-thread interactions have rootId === messageId (unique per message),
  // which fragments memory into "one thread per trigger". Allow callers to provide a stable
  // memoryRootId (e.g. "main") for non-thread chats.
  const effectiveRootId = memoryRootId || rootId;
  const memoryThread = chatId && effectiveRootId ? getMemoryThreadId(chatId, effectiveRootId) : undefined;
  
  const memoryConfig = memoryResource && memoryThread ? {
    resource: memoryResource,
    thread: {
      id: memoryThread,
      metadata: { chatId, rootId, userId, memoryRootId: memoryRootId || undefined },
      title: `Feishu Chat ${chatId}`,
    },
  } : undefined;

  if (memoryConfig) {
    console.log(`✅ [DpaMom] Memory: resource=${memoryResource}, thread=${memoryThread}`);
  }

  // Auto-populate working memory on first interaction (fetches from Feishu API)
  const memory = __internalGetDpaMomMemory();
  if (userId && memoryThread && memory) {
    await ensureWorkingMemoryInitialized(userId, memory, memoryThread);
  }

  // Check for linked GitLab issue
  let linkedIssue: IssueThreadMapping | null = null;
  if (chatId && rootId) {
    linkedIssue = await getLinkedIssue(chatId, rootId);
    if (linkedIssue) {
      console.log(`[DpaMom] ✅ Thread linked to GitLab #${linkedIssue.issueIid}`);
    }
  }

  // Batched card updates
  const batchedUpdater = createBatchedUpdater(updateStatus);

  try {
    devtoolsTracker.trackAgentCall("dpa_mom", query, { chatId, rootId });

    // Provide execution context (chat/thread IDs) to the model so it can call tools like
    // feishu_chat_history without guessing identifiers.
    const contextualMessages: CoreMessage[] = (chatId || rootId || userId)
      ? [
          {
            role: "system",
            content:
              `Context (internal): chatId=${chatId || "unknown"}, rootId=${rootId || "unknown"}, ` +
              `memoryRootId=${(memoryRootId || rootId) || "unknown"}, userId=${userId || "unknown"}. ` +
              `If you need recent group chat context, call feishu_chat_history with chatId=${chatId || "unknown"} and an appropriate limit. ` +
              `For filesystem exploration, use bash/readFile/writeFile. /semantic-layer is mounted, and /state + /workspace persist per thread automatically.`,
          },
          ...messages,
        ]
      : messages;

    // Stream response (wrap in request context so bash tools can persist per-thread)
    const stream = await runWithRequestContext(
      { userId, chatId, rootId, memoryRootId },
      async () =>
        await agent.stream(contextualMessages, {
          memory: memoryConfig,
        }),
    );

    // Process stream with thinking tag stripping
    let rawText = "";
    let displayText = "";
    let reasoning = "";

    for await (const chunk of stream.fullStream) {
      if (chunk.type === "text-delta") {
        const textDelta = (chunk as any).payload?.text || (chunk as any).textDelta || "";
        rawText += textDelta;

        // Strip <think>...</think> blocks in real-time
        const thinkPattern = /<think>([\s\S]*?)<\/think>/gi;
        let match;
        while ((match = thinkPattern.exec(rawText)) !== null) {
          const thinkContent = match[1].trim();
          if (thinkContent && !reasoning.includes(thinkContent)) {
            reasoning += (reasoning ? "\n\n" : "") + thinkContent;
          }
        }

        // Remove complete think blocks from display
        displayText = rawText.replace(thinkPattern, "").trim();

        // Check if in incomplete think block
        const openCount = (rawText.match(/<think>/gi) || []).length;
        const closeCount = (rawText.match(/<\/think>/gi) || []).length;
        const inThinkBlock = openCount > closeCount;

        if (inThinkBlock) {
          await batchedUpdater.update("🧠 *Thinking...*");
        } else if (displayText.length > 0) {
          await batchedUpdater.update(displayText);
        }
      } else if (chunk.type === "reasoning-delta") {
        const reasoningText = (chunk as any).payload?.text || (chunk as any).textDelta || "";
        if (reasoningText) {
          reasoning += reasoningText;
        }
      }
    }

    // Final text
    const finalText = displayText || rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    // CRITICAL: Cancel any pending batched updates before final update
    // This prevents race condition where pending timeout fires after finalization
    batchedUpdater.flush();

    // Final update
    if (updateStatus && finalText.length > 0) {
      updateStatus(finalText);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("dpa_mom", finalText, duration);
    healthMonitor.trackAgentCall("dpa_mom", duration, true);

    console.log(`[DpaMom] Complete (length=${finalText.length}, reasoning=${reasoning.length}, duration=${duration}ms)`);

    // Return structured result
    const result: DpaMomResult = { text: finalText };
    if (reasoning.length > 0) result.reasoning = reasoning;
    if (linkedIssue) result.linkedIssue = linkedIssue;

    return result;
  } catch (error) {
    // Cancel any pending updates on error
    batchedUpdater.flush();
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DpaMom] Error:`, errorMsg);
    
    devtoolsTracker.trackError("dpa_mom", error instanceof Error ? error : new Error(errorMsg));
    healthMonitor.trackAgentCall("dpa_mom", Date.now() - startTime, false);
    throw error;
  }
}

/**
 * Batched updater result with flush capability
 */
interface BatchedUpdater {
  update: (text: string) => Promise<void>;
  flush: () => void; // Cancel pending updates to prevent race with finalization
}

/**
 * Create batched updater for Feishu card updates
 */
function createBatchedUpdater(updateStatus?: (status: string) => void): BatchedUpdater {
  const BATCH_DELAY_MS = 150;
  const MIN_CHARS_PER_UPDATE = 50;
  const MAX_DELAY_MS = 1000;

  let lastUpdateTime = Date.now();
  let lastUpdateLength = 0;
  let pendingUpdate: NodeJS.Timeout | null = null;

  const flush = () => {
    if (pendingUpdate) {
      clearTimeout(pendingUpdate);
      pendingUpdate = null;
    }
  };

  const update = async (text: string) => {
    if (!updateStatus) return;

    const timeSinceLastUpdate = Date.now() - lastUpdateTime;
    const charsSinceLastUpdate = text.length - lastUpdateLength;

    const shouldUpdateImmediately =
      text.length === 0 ||
      charsSinceLastUpdate >= MIN_CHARS_PER_UPDATE ||
      timeSinceLastUpdate >= MAX_DELAY_MS;

    if (shouldUpdateImmediately) {
      flush();
      updateStatus(text);
      lastUpdateTime = Date.now();
      lastUpdateLength = text.length;
    } else {
      flush();
      pendingUpdate = setTimeout(() => {
        updateStatus(text);
        lastUpdateTime = Date.now();
        lastUpdateLength = text.length;
        pendingUpdate = null;
      }, BATCH_DELAY_MS);
    }
  };

  return { update, flush };
}

/**
 * Get the agent instance (async - ensures proper initialization)
 */
export async function getDpaMomAgentAsync(): Promise<Agent> {
  const { getMastraAsync } = await import("../observability-config");
  const mastra = await getMastraAsync();
  const agent = (mastra.getAgent?.("dpa_mom") ?? (mastra as any).agents?.dpa_mom) as
    | Agent
    | undefined;
  if (!agent) {
    throw new Error(`DPA Mom agent not registered in Mastra (id=dpa_mom)`);
  }
  cachedAgent = agent;
  return agent;
}

/**
 * Get the agent instance if already initialized (sync, may return null)
 * Use getDpaMomAgentAsync for guaranteed initialization
 */
export function getDpaMomAgent(): Agent | null {
  return cachedAgent;
}
