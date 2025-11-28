/**
 * Manager Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Routes user queries to specialist agents (OKR, Alignment, P&L, DPA-PM).
 * Falls back to web search if no specialist matches.
 * 
 * KEY CHANGES FROM AI SDK TOOLS:
 * 1. Uses Mastra's Agent instead of @ai-sdk-tools/agents
 * 2. Native model fallback array instead of dual agents
 * 3. Simplified streaming API (textStream identical)
 * 4. Custom execution context via options (threadId, resourceId)
 */

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import { getOkrReviewerAgent } from "./okr-reviewer-agent";
import { getAlignmentAgent } from "./alignment-agent";
import { getPnlAgent } from "./pnl-agent";
import { getDpaPmAgent } from "./dpa-pm-agent";
import { devtoolsTracker } from "../devtools-integration";
import { getMemoryThread, getMemoryResource, createMastraMemory } from "../memory-mastra";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";
import {
  initializeAgentMemoryContext,
  loadConversationHistory,
  saveMessageToMemory,
} from "./memory-integration";
import {
  getPrimaryModel,
  getFallbackModel,
  isRateLimitError,
  isModelRateLimited,
  markModelRateLimited,
  clearModelRateLimit,
  getConsecutiveFailures,
  sleep,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
} from "../shared/model-fallback";
import { createSearchWebTool } from "../tools";
import { healthMonitor } from "../health-monitor";

// Create web search tool for fallback
const searchWebTool = createSearchWebTool(true, true);

// Track model tier for rate limit handling
let currentModelTier: "primary" | "fallback" = "primary";

// Lazy-initialized agent
let managerAgentInstance: Agent | null = null;
let isInitializing = false;

/**
 * Initialize the manager agent (lazy - called on first request)
 * 
 * Mastra simplifies model fallback by accepting an array of models
 * with built-in retry logic, so we don't need dual agent instances.
 * 
 * Memory is configured per-request with user and thread context
 * via the callAgent function (see below).
 */
function initializeAgent() {
  if (isInitializing) return;
  if (managerAgentInstance) return;

  isInitializing = true;

  // MASTRA MODEL ARRAY: Automatic failover instead of dual agents
  // Mastra handles retries and fallback automatically
  managerAgentInstance = new Agent({
    name: "Manager",
    instructions: getManagerInstructions(),
    
    // Mastra's model fallback array - replaces dual agent pattern
    model: [
      {
        model: getPrimaryModel(),
        maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
      },
      {
        model: getFallbackModel(),
        maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
      },
    ],

    // Tools (identical to AI SDK Tools)
    tools: {
      searchWeb: searchWebTool,
    },

    // Memory configuration moved to callAgent for per-request setup
    // Each call gets a Mastra Memory instance with 3-layer architecture
  });

  isInitializing = false;
}

/**
 * Get manager instructions (extracted to avoid duplication)
 */
function getManagerInstructions(): string {
  return `You are a Feishu/Lark AI assistant that routes queries to specialist agents. Most user queries will be in Chinese (中文).

路由规则（按以下顺序应用）：
1. OKR Reviewer: 路由关于OKR、目标、关键结果、经理评审、指标覆盖率(has_metric percentage)、覆盖率(覆盖率)的查询
2. Alignment Agent: 路由关于对齐(alignment)、对齐、目标对齐的查询
3. P&L Agent: 路由关于损益(profit & loss)、P&L、损益、利润、亏损、EBIT的查询
4. DPA PM Agent: 路由关于DPA、数据团队(data team)、AE、DA的查询
5. Fallback: 如果没有匹配的专家，使用网络搜索(searchWeb工具)或提供有用的指导

ROUTING RULES (apply in this order):
1. OKR Reviewer: Route queries about OKR, objectives, key results, manager reviews, has_metric percentage, or 覆盖率
2. Alignment Agent: Route queries about alignment, 对齐, or 目标对齐
3. P&L Agent: Route queries about profit & loss, P&L, 损益, 利润, 亏损, or EBIT
4. DPA PM Agent: Route queries about DPA, data team, AE, or DA
5. Fallback: If no specialist matches, use web search (searchWeb tool) or provide helpful guidance

GENERAL GUIDELINES:
- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- Always route to the most appropriate specialist agent when their domain is mentioned.
- Use web search for general queries that don't match any specialist.
- Most queries will be in Chinese - understand Chinese query semantics for better routing.

AVAILABLE SPECIALISTS:
- OKR Reviewer (okr_reviewer): For OKR metrics, manager reviews, has_metric percentage analysis / 用于OKR指标、经理评审、指标覆盖率分析
- Alignment Agent (alignment_agent): For alignment tracking (under development) / 用于对齐跟踪（开发中）
- P&L Agent (pnl_agent): For profit & loss analysis (under development) / 用于损益分析（开发中）
- DPA PM Agent (dpa_pm): For product management tasks (under development) / 用于产品管理任务（开发中）`;
}

/**
 * Helper function to extract query text from messages
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "[non-text message]";
}

/**
 * Manager agent function that handles user queries
 * 
 * MASTRA MIGRATION NOTES:
 * - Uses Mastra's Agent.stream() instead of custom stream handling
 * - Memory scoping via custom context (threadId, resourceId)
 * - Manual routing detection (same as before)
 * - Streaming with batch updates for Feishu cards
 */
export async function managerAgent(
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
  console.log(`[Manager] Received query: "${query}"`);

  // Initialize Mastra Memory for this agent call
  let mastraMemory = null;
  let memoryThread: string | undefined;
  let memoryResource: string | undefined;

  try {
    if (userId) {
      mastraMemory = await createMastraMemory(userId);
      memoryResource = getMemoryResource(userId);
      if (chatId && rootId) {
        memoryThread = getMemoryThread(chatId, rootId);
      }
      
      if (mastraMemory) {
        console.log(`✅ [Manager] Mastra Memory initialized with 3-layer architecture`);
        console.log(`   Resource (user): ${memoryResource}, Thread: ${memoryThread || 'not set'}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ [Manager] Mastra Memory initialization failed:`, error);
    // Continue without memory - fallback to non-persistent context
  }

  // Legacy memory context (keep for backward compatibility)
  let memoryContext: any = null;
  try {
    memoryContext = await initializeAgentMemoryContext(chatId, rootId, userId);
    const historyMessages = await loadConversationHistory(memoryContext, 5);
    if (historyMessages.length > 0) {
      console.log(`[Manager] Loaded ${historyMessages.length} previous messages for context`);
      // Prepend ALL history to current messages for full context awareness
      // History includes Q1, A1, Q2, A2, etc. - we want to keep all of it
      const enrichedMessages = [...historyMessages, ...messages];
      messages = enrichedMessages;
    }
    // Save user message to memory for future reference
    await saveMessageToMemory(memoryContext, query, "user");
  } catch (error) {
    console.warn(`[Manager] Legacy memory context initialization failed, continuing without legacy memory:`, error);
  }

  // Manual routing: Check if query matches specialist agent patterns
  const lowerQuery = query.toLowerCase();
  const shouldRouteToOkr = /okr|objective|key result|manager review|has_metric|覆盖率|指标覆盖率|经理评审|目标|关键结果|okr指标|指标|okr分析|分析|图表|可视化|visualization|chart|analysis/.test(
    lowerQuery
  );
  const shouldRouteToAlignment = /alignment|对齐|目标对齐/.test(lowerQuery);
  const shouldRouteToPnl = /pnl|profit|loss|损益|利润|亏损|EBIT/.test(
    lowerQuery
  );
  const shouldRouteToDpaPm = /dpa|data team|AE|DA/.test(lowerQuery);

  // If a specialist matches, route directly to them instead of manager
  if (shouldRouteToOkr) {
    console.log(
      `[Manager] Manual routing detected: OKR Reviewer matches query`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      manualRoute: "okr_reviewer",
    });
    try {
      const okrAgent = getOkrReviewerAgent();

      // Create execution context with Feishu scoping
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = getConversationId(chatId!, rootId!);
        const userScopeId = userId
          ? getUserScopeId(userId)
          : getUserScopeId(chatId!);
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
        console.log(
          `[OKR] Memory context: conversationId=${conversationId}, userId=${userScopeId}`
        );
      }

      // MASTRA PATTERN: Stream with optional context
      const result = await okrAgent.stream({ messages, executionContext });

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Stream updates in batches
        if (updateStatus && accumulatedText.length % 50 === 0) {
          updateStatus(accumulatedText);
        }
      }

      // Track response
      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("okr_reviewer", accumulatedText, duration, {
        manualRoute: true,
      });
      healthMonitor.trackAgentCall("okr_reviewer", duration, true);

      // Save routed response to memory
      if (memoryContext) {
        try {
          await saveMessageToMemory(memoryContext, accumulatedText, "assistant");
        } catch (error) {
          console.warn("[OKR Routing] Failed to save response to memory:", error);
        }
      }

      console.log(`[OKR] Response complete (length=${accumulatedText.length})`);
      return accumulatedText;
    } catch (error) {
      console.error(`[Manager] Error routing to OKR Reviewer:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError(
        "okr_reviewer",
        error instanceof Error ? error : new Error(errorMsg),
        { manualRoute: true }
      );
      // Fall through to manager if specialist fails
    }
  }

  // Similar routing for other specialists...
  if (shouldRouteToAlignment) {
    console.log(
      `[Manager] Manual routing detected: Alignment Agent matches query`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      manualRoute: "alignment_agent",
    });
    try {
      const alignmentAgent = getAlignmentAgent();
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = getConversationId(chatId!, rootId!);
        const userScopeId = userId
          ? getUserScopeId(userId)
          : getUserScopeId(chatId!);
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
      }

      const result = await alignmentAgent.stream({
        messages,
        executionContext,
      });

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        if (updateStatus && accumulatedText.length % 50 === 0) {
          updateStatus(accumulatedText);
        }
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("alignment_agent", accumulatedText, duration,
        { manualRoute: true }
      );
      healthMonitor.trackAgentCall("alignment_agent", duration, true);

      // Save routed response to memory
      if (memoryContext) {
        try {
          await saveMessageToMemory(memoryContext, accumulatedText, "assistant");
        } catch (error) {
          console.warn("[Alignment Routing] Failed to save response to memory:", error);
        }
      }

      console.log(
        `[Alignment] Response complete (length=${accumulatedText.length})`
      );
      return accumulatedText;
    } catch (error) {
      console.error(`[Manager] Error routing to Alignment Agent:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError(
        "alignment_agent",
        error instanceof Error ? error : new Error(errorMsg),
        { manualRoute: true }
      );
    }
  }

  // P&L Agent routing
  if (shouldRouteToPnl) {
    console.log(`[Manager] Manual routing detected: P&L Agent matches query`);
    devtoolsTracker.trackAgentCall("Manager", query, {
      manualRoute: "pnl_agent",
    });
    try {
      const pnlAgent = getPnlAgent();
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = getConversationId(chatId!, rootId!);
        const userScopeId = userId
          ? getUserScopeId(userId)
          : getUserScopeId(chatId!);
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
      }

      const result = await pnlAgent.stream({ messages, executionContext });

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        if (updateStatus && accumulatedText.length % 50 === 0) {
          updateStatus(accumulatedText);
        }
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("pnl_agent", accumulatedText, duration, {
        manualRoute: true,
      });
      healthMonitor.trackAgentCall("pnl_agent", duration, true);

      // Save routed response to memory
      if (memoryContext) {
        try {
          await saveMessageToMemory(memoryContext, accumulatedText, "assistant");
        } catch (error) {
          console.warn("[PnL Routing] Failed to save response to memory:", error);
        }
      }

      console.log(`[P&L] Response complete (length=${accumulatedText.length})`);
      return accumulatedText;
    } catch (error) {
      console.error(`[Manager] Error routing to P&L Agent:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError(
        "pnl_agent",
        error instanceof Error ? error : new Error(errorMsg),
        { manualRoute: true }
      );
    }
  }

  // DPA PM Agent routing
  if (shouldRouteToDpaPm) {
    console.log(
      `[Manager] Manual routing detected: DPA PM Agent matches query`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      manualRoute: "dpa_pm",
    });
    try {
      const dpaPmAgent = getDpaPmAgent();
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = getConversationId(chatId!, rootId!);
        const userScopeId = userId
          ? getUserScopeId(userId)
          : getUserScopeId(chatId!);
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
      }

      const result = await dpaPmAgent.stream({
        messages,
        executionContext,
      });

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        if (updateStatus && accumulatedText.length % 50 === 0) {
          updateStatus(accumulatedText);
        }
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("dpa_pm", accumulatedText, duration, {
        manualRoute: true,
      });
      healthMonitor.trackAgentCall("dpa_pm", duration, true);

      // Save routed response to memory
      if (memoryContext) {
        try {
          await saveMessageToMemory(memoryContext, accumulatedText, "assistant");
        } catch (error) {
          console.warn("[DPA PM Routing] Failed to save response to memory:", error);
        }
      }

      console.log(`[DPA PM] Response complete (length=${accumulatedText.length})`);
      return accumulatedText;
    } catch (error) {
      console.error(`[Manager] Error routing to DPA PM Agent:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError(
        "dpa_pm",
        error instanceof Error ? error : new Error(errorMsg),
        { manualRoute: true }
      );
    }
  }

  // No specialist matched - use manager agent for web search or general guidance
  console.log(
    `[Manager] No specialist match, using manager agent for query: "${query}"`
  );

  const accumulatedText: string[] = [];
  const updateCardBatched = (() => {
    const BATCH_DELAY_MS = 150;
    const MIN_CHARS_PER_UPDATE = 50;
    const MAX_DELAY_MS = 1000;

    let lastUpdateTime = Date.now();
    let lastUpdateLength = 0;
    let pendingUpdate: NodeJS.Timeout | null = null;

    return async (text: string) => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      const charsSinceLastUpdate = text.length - lastUpdateLength;

      const shouldUpdateImmediately =
        text.length === 0 ||
        charsSinceLastUpdate >= MIN_CHARS_PER_UPDATE ||
        timeSinceLastUpdate >= MAX_DELAY_MS;

      if (shouldUpdateImmediately) {
        if (pendingUpdate) {
          clearTimeout(pendingUpdate);
          pendingUpdate = null;
        }
        if (updateStatus) {
          updateStatus(text);
        }
        lastUpdateTime = Date.now();
        lastUpdateLength = text.length;
      } else {
        if (pendingUpdate) {
          clearTimeout(pendingUpdate);
        }
        pendingUpdate = setTimeout(() => {
          if (updateStatus) {
            updateStatus(text);
          }
          lastUpdateTime = Date.now();
          lastUpdateLength = text.length;
          pendingUpdate = null;
        }, BATCH_DELAY_MS);
      }
    };
  })();

  try {
    // MASTRA STREAMING: Call manager agent with streaming and memory context
    const streamOptions: any = {};
    
    // Add Mastra Memory if available
    if (mastraMemory && memoryResource) {
      streamOptions.memory = {
        resource: memoryResource,
        thread: memoryThread,
      };
      console.log(`[Manager] Passing Mastra Memory to agent for context retention`);
    }
    
    const stream = await managerAgentInstance!.stream(messages, streamOptions);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("manager", text, duration);
    healthMonitor.trackAgentCall("manager", duration, true);

    // Save response to memory for context in future conversations
    if (memoryContext) {
      try {
        await saveMessageToMemory(memoryContext, text, "assistant");
      } catch (error) {
        console.warn("[Manager] Failed to save response to memory:", error);
      }
    }

    console.log(
      `[Manager] Response complete (length=${text.length}, duration=${duration}ms)`
    );
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Manager] Error during streaming:`, errorMsg);

    // Check if it's a rate limit error
    if (isRateLimitError(error)) {
      console.warn(
        `⚠️ [Manager] Rate limit detected during streaming. ` +
          `Current model: ${currentModelTier}, ` +
          `Consecutive failures: ${getConsecutiveFailures(currentModelTier)}`
      );

      markModelRateLimited(currentModelTier);

      if (currentModelTier === "primary") {
        console.warn(`⚠️ [Manager] Switching to fallback model...`);
        currentModelTier = "fallback";
        devtoolsTracker.trackError("Manager", error instanceof Error ? error : new Error(errorMsg), {
          errorType: "RATE_LIMIT",
          action: "Switched to fallback model",
        });
        // Mastra handles fallback automatically - no need to retry manually
        // But we could track the switch for observability
      }
    }

    devtoolsTracker.trackError(
      "Manager",
      error instanceof Error ? error : new Error(errorMsg)
    );
    throw error;
  }
}

/**
 * Export helper to get manager agent (for internal use)
 */
export function getManagerAgent(): Agent {
  initializeAgent();
  return managerAgentInstance!;
}
