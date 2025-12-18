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
import { getConversationId, getUserScopeId } from "../memory";
import {
  initializeAgentMemoryContext,
  loadConversationHistory,
  saveMessageToMemory,
} from "./memory-integration";
import {
  getAutoRouterModel,
  isRateLimitError,
  isModelRateLimited,
  markModelRateLimited,
  clearModelRateLimit,
  getConsecutiveFailures,
  sleep,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
} from "../shared/model-fallback";
import { getInternalModel, hasInternalModel, getInternalModelInfo } from "../shared/internal-model";
import { createSearchWebTool } from "../tools";
import { healthMonitor } from "../health-monitor";

// Create web search tool for fallback
const searchWebTool = createSearchWebTool(true, true);

// Track model tier for rate limit handling
let currentModelTier: "primary" | "fallback" = "primary";

// Lazy-initialized agent
let managerAgentInstance: Agent | null = null;
let isInitializing = false;
let mastraMemoryInstance: any = null;

/**
 * Initialize the manager agent (lazy - called on first request)
 * 
 * Mastra simplifies model fallback by accepting an array of models
 * with built-in retry logic, so we don't need dual agent instances.
 * 
 * NOTE: Memory must be created AFTER first request (to get user context)
 * so we initialize a basic agent here, then configure memory per-request
 */
function initializeAgent() {
  if (isInitializing) return;
  if (managerAgentInstance) return;

  isInitializing = true;

  // OpenRouter auto router with restricted free models
  // Use the auto router that injects FREE_MODELS whitelist to prevent paid model selection
  const models: any[] = [getAutoRouterModel(true)]; // Primary: auto router with tool-calling free models only
  
  // Add internal model as fallback if configured
  if (hasInternalModel()) {
    const internalModel = getInternalModel();
    if (internalModel) {
      console.log(`✅ [Manager] Internal fallback model configured: ${getInternalModelInfo()}`);
      models.push(internalModel);
    }
  }
  
  managerAgentInstance = new Agent({
    name: "Manager",
    instructions: getManagerInstructions(),
    
    // Model selection strategy:
    // 1. Primary: openrouter/auto with FREE_MODELS whitelist (prevents paid models)
    // 2. Fallback: internal hosted model if configured
    // Mastra will retry models in order if one fails (rate limit, error, etc.)
    model: models.length === 1 ? models[0] : models,

    // Tools (identical to AI SDK Tools)
    tools: {
      searchWeb: searchWebTool,
    },
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
        
        // Ensure thread exists before saving messages
        if (mastraMemory && memoryThread && memoryResource) {
          try {
            const existingThread = await mastraMemory.getThreadById({ threadId: memoryThread });
            if (!existingThread) {
              // Thread doesn't exist - create it
              await mastraMemory.saveThread({
                thread: {
                  id: memoryThread,
                  resourceId: memoryResource,
                  title: `Feishu Chat ${chatId}`,
                  metadata: { chatId, rootId },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
              console.log(`[Manager] Created memory thread: ${memoryThread}`);
            }
          } catch (error) {
            console.warn(`[Manager] Failed to ensure thread exists:`, error);
          }
        }
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

  // NOTE: Legacy memory system (@ai-sdk-tools/memory) is deprecated
  // Using Mastra Memory instead which is more robust
  // Legacy memory context is skipped to avoid conflicts
  let memoryContext: any = null;

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
      const result = await okrAgent.stream(messages, executionContext);

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Send delta update immediately (Mastra handles deltas correctly)
        if (updateStatus) {
          updateStatus(accumulatedText);
        }
      }
      
      // Ensure final update is sent
      if (updateStatus && accumulatedText) {
        updateStatus(accumulatedText);
      }

      // Track response
      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("okr_reviewer", accumulatedText, duration, {
        manualRoute: true,
      });
      healthMonitor.trackAgentCall("okr_reviewer", duration, true);

      // Save routed response to memory
      if (mastraMemory && memoryThread && memoryResource) {
        try {
          const timestamp = new Date();
          const userMessageId = `msg-${memoryThread}-okr-user-${timestamp.getTime()}`;
          const assistantMessageId = `msg-${memoryThread}-okr-assistant-${timestamp.getTime()}`;
          
          const routedMessages = [
            {
              id: userMessageId,
              threadId: memoryThread,
              resourceId: memoryResource,
              role: "user" as const,
              content: { content: query },
              createdAt: timestamp,
            },
            {
              id: assistantMessageId,
              threadId: memoryThread,
              resourceId: memoryResource,
              role: "assistant" as const,
              content: { content: accumulatedText },
              createdAt: timestamp,
            },
          ];
          
          await mastraMemory.saveMessages({
            messages: routedMessages,
            format: 'v2',
          });
          
          console.log(`[OKR] Saved response to memory`);
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

      const result = await alignmentAgent.stream(messages, executionContext);

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Send delta update immediately
        if (updateStatus) {
          updateStatus(accumulatedText);
        }
      }
      
      // Ensure final update is sent
      if (updateStatus && accumulatedText) {
        updateStatus(accumulatedText);
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("alignment_agent", accumulatedText, duration,
        { manualRoute: true }
      );
      healthMonitor.trackAgentCall("alignment_agent", duration, true);

      // Save routed response to memory
      if (mastraMemory && memoryThread && memoryResource) {
        try {
          const timestamp = new Date();
          const userMessageId = `msg-${memoryThread}-alignment-user-${timestamp.getTime()}`;
          const assistantMessageId = `msg-${memoryThread}-alignment-assistant-${timestamp.getTime()}`;
          
          const routedMessages = [
            {
              id: userMessageId,
              threadId: memoryThread,
              resourceId: memoryResource,
              role: "user" as const,
              content: { content: query },
              createdAt: timestamp,
            },
            {
              id: assistantMessageId,
              threadId: memoryThread,
              resourceId: memoryResource,
              role: "assistant" as const,
              content: { content: accumulatedText },
              createdAt: timestamp,
            },
          ];
          
          await mastraMemory.saveMessages({
            messages: routedMessages,
            format: 'v2',
          });
          
          console.log(`[Alignment] Saved response to memory`);
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

      const result = await pnlAgent.stream(messages, executionContext);

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Send delta update immediately
        if (updateStatus) {
          updateStatus(accumulatedText);
        }
      }
      
      // Ensure final update is sent
      if (updateStatus && accumulatedText) {
        updateStatus(accumulatedText);
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("pnl_agent", accumulatedText, duration, {
       manualRoute: true,
      });
      healthMonitor.trackAgentCall("pnl_agent", duration, true);

      // Save routed response to memory
      if (mastraMemory && memoryThread && memoryResource) {
       try {
         const timestamp = new Date();
         const userMessageId = `msg-${memoryThread}-pnl-user-${timestamp.getTime()}`;
         const assistantMessageId = `msg-${memoryThread}-pnl-assistant-${timestamp.getTime()}`;
         
         const routedMessages = [
           {
             id: userMessageId,
             threadId: memoryThread,
             resourceId: memoryResource,
             role: "user" as const,
             content: { content: query },
             createdAt: timestamp,
           },
           {
             id: assistantMessageId,
             threadId: memoryThread,
             resourceId: memoryResource,
             role: "assistant" as const,
             content: { content: accumulatedText },
             createdAt: timestamp,
           },
         ];
         
         await mastraMemory.saveMessages({
           messages: routedMessages,
           format: 'v2',
         });
         
         console.log(`[P&L] Saved response to memory`);
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

      const result = await dpaPmAgent.stream(messages, executionContext);

      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Send delta update immediately
        if (updateStatus) {
          updateStatus(accumulatedText);
        }
      }
      
      // Ensure final update is sent
      if (updateStatus && accumulatedText) {
        updateStatus(accumulatedText);
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("dpa_pm", accumulatedText, duration, {
       manualRoute: true,
      });
      healthMonitor.trackAgentCall("dpa_pm", duration, true);

      // Save routed response to memory
      if (mastraMemory && memoryThread && memoryResource) {
       try {
         const timestamp = new Date();
         const userMessageId = `msg-${memoryThread}-dpa-user-${timestamp.getTime()}`;
         const assistantMessageId = `msg-${memoryThread}-dpa-assistant-${timestamp.getTime()}`;
         
         const routedMessages = [
           {
             id: userMessageId,
             threadId: memoryThread,
             resourceId: memoryResource,
             role: "user" as const,
             content: { content: query },
             createdAt: timestamp,
           },
           {
             id: assistantMessageId,
             threadId: memoryThread,
             resourceId: memoryResource,
             role: "assistant" as const,
             content: { content: accumulatedText },
             createdAt: timestamp,
           },
         ];
         
         await mastraMemory.saveMessages({
           messages: routedMessages,
           format: 'v2',
         });
         
         console.log(`[DPA PM] Saved response to memory`);
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
    // Load conversation history from Mastra Memory before calling agent
    let messagesWithHistory = [...messages];
    
    if (mastraMemory && memoryResource && memoryThread) {
      try {
        console.log(`[Manager] Loading conversation history from Mastra Memory...`);
        const { messages: historyMessages } = await mastraMemory.query({
          threadId: memoryThread,
          resourceId: memoryResource,
        });
        
        if (historyMessages && historyMessages.length > 0) {
          console.log(`[Manager] ✅ Loaded ${historyMessages.length} messages from Mastra Memory`);
          // Prepend history to messages for context awareness
          messagesWithHistory = [...historyMessages, ...messages];
        }
      } catch (error) {
        console.warn(`[Manager] Failed to load memory context:`, error);
        // Continue without memory - fallback to current messages only
      }
    }
    
    // MASTRA STREAMING: Call manager agent with streaming
    const executionContext: any = {
      _memoryAddition: "",
    };
    
    // Only pass memory context if memory is actually configured
    // Mastra requires memory to be set on the agent if threadId/resourceId are passed
    if (memoryThread && memoryResource && mastraMemory) {
      executionContext.threadId = memoryThread;
      executionContext.resourceId = memoryResource;
      executionContext.memory = mastraMemory; // Pass memory instance
      console.log(`[Manager] Executing agent with memory context`);
      console.log(`   Resource: ${memoryResource}, Thread: ${memoryThread}`);
    } else {
      console.log(`[Manager] Executing agent without memory (memory not configured)`);
    }
    
    const stream = await managerAgentInstance!.stream(messagesWithHistory, executionContext);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      // Use batched updates to avoid rate limits, but ensure every delta is processed
      await updateCardBatched(text);
    }
    
    // Ensure final update is sent (flush any pending batched update)
    if (updateStatus && text) {
      await updateCardBatched(text);
    }
    
    // Save both user message and response to Mastra Memory for future conversations
    if (mastraMemory && memoryThread && memoryResource) {
      try {
        console.log(`[Manager] Saving conversation to Mastra Memory...`);
        
        // Mastra Memory requires explicit message storage via saveMessages()
        // We save both the user query and assistant response for semantic recall
        const timestamp = new Date();
        const userMessageId = `msg-${memoryThread}-user-${timestamp.getTime()}`;
        const assistantMessageId = `msg-${memoryThread}-assistant-${timestamp.getTime()}`;
        
        const messagesToSave = [
          {
            id: userMessageId,
            threadId: memoryThread,
            resourceId: memoryResource,
            role: "user" as const,
            content: { content: query },
            createdAt: timestamp,
          },
          {
            id: assistantMessageId,
            threadId: memoryThread,
            resourceId: memoryResource,
            role: "assistant" as const,
            content: { content: text },
            createdAt: timestamp,
          },
        ];
        
        const savedMessages = await mastraMemory.saveMessages({
          messages: messagesToSave,
          format: 'v2', // Use v2 format for structured message storage
        });
        
        console.log(`   ✅ Saved ${savedMessages.length} messages to Mastra Memory`);
        console.log(`   Thread: ${memoryThread}, Resource: ${memoryResource}`);
      } catch (error) {
        console.warn(`[Manager] Failed to save to memory:`, error);
        // Continue - memory persistence failure shouldn't break the response
      }
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("manager", text, duration);
    healthMonitor.trackAgentCall("manager", duration, true);

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
