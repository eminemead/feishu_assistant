import { Agent } from "@ai-sdk-tools/agents";
import { CoreMessage } from "ai";
import { getOkrReviewerAgent } from "./okr-reviewer-agent";
import { getAlignmentAgent } from "./alignment-agent";
import { getPnlAgent } from "./pnl-agent";
import { getDpaPmAgent } from "./dpa-pm-agent";
import { devtoolsTracker } from "../devtools-integration";
import { memoryProvider, getConversationId, getUserScopeId } from "../memory";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";
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

// Create web search tool for fallback (with caching and devtools tracking)
const searchWebTool = createSearchWebTool(true, true);

// Track which model tier is currently in use for this session
let currentModelTier: "primary" | "fallback" = "primary";

// Create agent instances for both tiers (lazy initialized)
let managerAgentPrimary: Agent | null = null;
let managerAgentFallback: Agent | null = null;
let isInitializing = false;

/**
 * Wrapper to handle rate limit retries with exponential backoff
 * Automatically switches to fallback model if primary is rate limited
 */
async function executeWithRateLimitRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  onRateLimitSwitch?: () => void
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= DEFAULT_RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Check if current model is in cooldown
      if (isModelRateLimited(currentModelTier)) {
        const tier = currentModelTier;
        console.warn(
          `⚠️ [Retry] ${tier} model is in cooldown. ` +
          `Switching to ${tier === "primary" ? "fallback" : "primary"} model.`
        );
        
        // Switch to fallback if primary is rate limited
        if (currentModelTier === "primary") {
          currentModelTier = "fallback";
          onRateLimitSwitch?.();
        }
        
        // Force a delay before retrying with different model
        await sleep(1000);
        continue;
      }
      
      // Attempt the operation
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a rate limit error
      if (isRateLimitError(error)) {
        console.warn(
          `⚠️ [Retry] Rate limit error on attempt ${attempt}/${DEFAULT_RETRY_CONFIG.maxRetries}`
        );
        
        markModelRateLimited(currentModelTier);
        
        // If primary is rate limited, switch to fallback
        if (currentModelTier === "primary") {
          console.warn(`⚠️ [Retry] Primary model rate limited. Switching to fallback model.`);
          currentModelTier = "fallback";
          onRateLimitSwitch?.();
        } else {
          // Fallback is also rate limited, we're in trouble
          // But continue retrying with backoff in case it recovers
          console.error(
            `❌ [Retry] Both models are rate limited! ` +
            `Primary failures: ${getConsecutiveFailures("primary")}, ` +
            `Fallback failures: ${getConsecutiveFailures("fallback")}`
          );
        }
        
        // Only retry if we haven't exceeded max attempts
        if (attempt < DEFAULT_RETRY_CONFIG.maxRetries) {
          const delayMs = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
          console.log(`[Retry] Waiting ${delayMs}ms before retry ${attempt + 1}...`);
          await sleep(delayMs);
          continue;
        }
      } else {
        // Non-rate-limit error, don't retry
        throw error;
      }
    }
  }
  
  // All retries exhausted
  if (lastError) {
    console.error(`❌ [Retry] ${operationName} failed after ${DEFAULT_RETRY_CONFIG.maxRetries} retries`);
    throw lastError;
  }
  
  throw new Error(`${operationName} failed: unknown error`);
}

/**
 * Clear rate limit state on successful request completion
 * Resets failure counters when we get a successful response
 */
function clearRateLimitOnSuccess(): void {
  const primaryFailures = getConsecutiveFailures("primary");
  const fallbackFailures = getConsecutiveFailures("fallback");
  
  if (primaryFailures > 0 || fallbackFailures > 0) {
    console.log(
      `✅ [RateLimit] Request successful! ` +
      `Clearing rate limit state. ` +
      `(Primary failures: ${primaryFailures}, Fallback failures: ${fallbackFailures})`
    );
    clearModelRateLimit("primary");
    clearModelRateLimit("fallback");
  }
}

/**
 * Initialize agents for both model tiers (lazy - called on first request)
 */
function initializeAgents() {
  // Prevent race conditions
  if (isInitializing) return;
  if (managerAgentPrimary && managerAgentFallback) return;
  
  isInitializing = true;
  
  managerAgentPrimary = new Agent({
    name: "Manager",
    model: getPrimaryModel(),
    instructions: getManagerInstructions(),
    handoffs: [getOkrReviewerAgent(), getAlignmentAgent(), getPnlAgent(), getDpaPmAgent()],
    tools: {
      searchWeb: searchWebTool,
    },
    memory: {
      provider: memoryProvider,
      workingMemory: {
        enabled: true,
        scope: 'user',
      },
      history: {
        enabled: true,
        limit: 10,
      },
      chats: {
        enabled: true,
        generateTitle: true,
      },
    },
  });
  
  managerAgentFallback = new Agent({
    name: "Manager",
    model: getFallbackModel(),
    instructions: getManagerInstructions(),
    handoffs: [getOkrReviewerAgent(), getAlignmentAgent(), getPnlAgent(), getDpaPmAgent()],
    tools: {
      searchWeb: searchWebTool,
    },
    memory: {
      provider: memoryProvider,
      workingMemory: {
        enabled: true,
        scope: 'user',
      },
      history: {
        enabled: true,
        limit: 10,
      },
      chats: {
        enabled: true,
        generateTitle: true,
      },
    },
  });
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
 * Routing logic for manager agent:
 * 
 * The @ai-sdk-tools/agents library handles routing automatically using:
 * 1. Keyword matching: Each specialist agent defines `matchOn` patterns
 * 2. Semantic understanding: LLM analyzes query meaning and routes to best agent
 * 3. Fallback: If no match, manager uses its own tools (searchWeb) or provides guidance
 * 
 * Routing priority (checked in order):
 * 1. OKR Reviewer: okr, objective, key result, manager review, has_metric, 覆盖率,
 * 2. Alignment Agent: alignment, 对齐, 目标对齐
 * 3. P&L Agent: pnl, profit, loss, 损益, 利润, 亏损, EBIT
 * 4. DPA PM Agent: dpa, data team, AE, DA
 * 5. Fallback: web search or guidance
 */

/**
 * Helper function to extract query text from messages for logging
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "[non-text message]";
}

/**
 * Manager agent function that handles user queries.
 * Uses the @ai-sdk-tools/agents Agent class for orchestration.
 * 
 * Routing happens automatically via:
 * - Keyword matching (matchOn patterns in specialist agents)
 * - LLM semantic analysis
 * - Fallback to manager's tools (searchWeb)
 * 
 * @param messages - Conversation messages
 * @param updateStatus - Optional callback for streaming status updates
 * @param chatId - Feishu chat ID for memory scoping (optional)
 * @param rootId - Feishu root message ID for conversation context (optional)
 * @param userId - Feishu user ID (open_id/user_id) for authentication and RLS (optional)
 */
export async function managerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<string> {
  // Lazy initialize agents on first request (not at module load)
  initializeAgents();
  
  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[Manager] Received query: "${query}"`);
  
  // Manual routing: Check if query matches specialist agent patterns
  const lowerQuery = query.toLowerCase();
  const shouldRouteToOkr = /okr|objective|key result|manager review|has_metric|覆盖率|指标覆盖率|经理评审|目标|关键结果|okr指标|指标|okr分析|分析|图表|可视化|visualization|chart|analysis/.test(lowerQuery);
  const shouldRouteToAlignment = /alignment|对齐|目标对齐/.test(lowerQuery);
  const shouldRouteToPnl = /pnl|profit|loss|损益|利润|亏损|EBIT/.test(lowerQuery);
  const shouldRouteToDpaPm = /dpa|data team|AE|DA/.test(lowerQuery);
  
  // If a specialist matches, route directly to them instead of manager
  if (shouldRouteToOkr) {
    console.log(`[Manager] Manual routing detected: OKR Reviewer matches query`);
    devtoolsTracker.trackAgentCall("Manager", query, { manualRoute: "okr_reviewer" });
    try {
      const okrAgent = getOkrReviewerAgent();
      
      // Create execution context with memory support (same as manager)
      const executionContext: any = {
        _memoryAddition: "",
      };
      
      if (chatId && rootId) {
        const conversationId = getConversationId(chatId!, rootId!);
        const userScopeId = userId ? getUserScopeId(userId) : getUserScopeId(chatId!);
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
        console.log(`[OKR] Memory context: conversationId=${conversationId}, userId=${userScopeId}`);
      }
      
      const result = await okrAgent.stream({ messages, executionContext });
      
      let accumulatedText = "";
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        // Stream updates in batches
        if (updateStatus && accumulatedText.length % 50 === 0) {
          updateStatus(accumulatedText);
        }
      }
      
      // Final update
      if (updateStatus) {
        updateStatus(accumulatedText);
      }
      
      // Track response
      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("okr_reviewer", accumulatedText, duration, { manualRoute: true });
      healthMonitor.trackAgentCall("okr_reviewer", duration, true);
      
      console.log(`[OKR] Response complete (length=${accumulatedText.length})`);
      return accumulatedText;
    } catch (error) {
      console.error(`[Manager] Error routing to OKR Reviewer:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError("okr_reviewer", error instanceof Error ? error : new Error(errorMsg), { manualRoute: true });
      // Fall through to manager if specialist fails
    }
  }
  
  // Track agent call
  devtoolsTracker.trackAgentCall("Manager", query);
  
  try {
    // Track routing decisions
     let routedAgent: string = "";
    let accumulatedText = "";
    
    // Use Agent.stream() with proper execution context
     console.log(`[Manager] Starting stream for query: "${query}" with ${currentModelTier} model`);
     
     // Create execution context with memory support
     // The Agent library uses executionContext for memory scoping
     const executionContext: any = {
       _memoryAddition: "",
     };
     
     // Add memory context if chatId and rootId are provided
    const supabaseUserId = userId ? getSupabaseUserId(userId) : undefined;

    if (chatId && rootId) {
       // TypeScript narrowing: chatId and rootId are guaranteed to be strings here
       const conversationId = getConversationId(chatId!, rootId!);
       // Use actual userId if provided, otherwise fallback to chatId-based scope
       const userScopeId = userId ? getUserScopeId(userId) : getUserScopeId(chatId!);
       
       // Set conversation ID for history and chat management
       executionContext.chatId = conversationId;
       // Set user scope for working memory (use actual userId for RLS)
       executionContext.userId = userScopeId;
       
       // Store actual Feishu userId for Supabase RLS
      if (userId) {
        executionContext.feishuUserId = supabaseUserId || userId;
        executionContext.feishuExternalId = userId;
       }
       
      console.log(`[Manager] Memory context: conversationId=${conversationId}, userId=${userScopeId}, feishuUserId=${(supabaseUserId || userId) || 'N/A'}, externalFeishuId=${userId || 'N/A'}`);
     }
     
     // Use Agent.stream() with execution context
     // Note: The type definition shows messages, but internally it needs executionContext
     // Select agent based on current model tier
     const selectedAgent = currentModelTier === "fallback" ? managerAgentFallback : managerAgentPrimary;
     
     if (!selectedAgent) {
       throw new Error("Agent initialization failed");
     }
     
     let result;
     try {
       result = await executeWithRateLimitRetry(
         () =>
           Promise.resolve(
             (selectedAgent.stream as any)({
               messages,
               executionContext,
             })
           ),
         "Stream creation",
         () => {
           // Called when switching models due to rate limit
           devtoolsTracker.trackError("Manager", new Error("Rate limit - switching to fallback"), {
             query,
             errorType: "RATE_LIMIT",
             action: "Auto-switched to fallback model",
           });
         }
       );
       console.log(`[Manager] Stream created, starting to read textStream...`);
     } catch (streamError) {
       console.error(`[Manager] Error creating stream:`, streamError);
       
       // Track error and continue
       const error = streamError instanceof Error ? streamError : new Error(String(streamError));
       devtoolsTracker.trackError("Manager", error, {
         query,
         errorType: "STREAM_CREATION_FAILED",
         phase: "stream_creation",
       });
       
       throw streamError;
     }

    // Process both textStream and fullStream in parallel
     // fullStream contains events like agent-handoff
     const processStreams = async () => {
       // Process fullStream to catch handoff events
       const fullStreamPromise = (async () => {
          try {
            let partCount = 0;
            for await (const part of result.fullStream) {
              partCount++;
              // Debug: log first few parts to understand structure
              if (partCount <= 5) {
                console.log(`[Manager] fullStream part ${partCount}:`, JSON.stringify(part, null, 2).substring(0, 200));
              }
              
              // Check for agent-handoff events in the stream
              if (part && typeof part === 'object') {
                const event = part as any;
                // Look for handoff indicators in the stream parts
                if (event.type === 'agent-handoff' || event.type === 'handoff' || 
                    (event.agent && event.agent !== 'Manager')) {
                  routedAgent = event.to || event.agent || event.agentName;
                  updateStatus?.(`Routing to ${routedAgent}...`);
                  console.log(`[Manager] Routing decision detected: "${query}" → ${routedAgent}`);
                  
                  // Track agent handoff
                  devtoolsTracker.trackAgentHandoff("Manager", routedAgent, `Query: ${query.substring(0, 50)}...`);
                }
              }
            }
            console.log(`[Manager] fullStream completed with ${partCount} parts`);
          } catch (e) {
            // Log errors in fullStream processing but don't fail
            if (e instanceof Error && !e.message.includes('break')) {
              console.warn(`[Manager] FullStream processing warning:`, e.message);
            } else {
              console.log(`[Manager] FullStream processing completed`);
            }
          }
        })();

      // Process textStream with batched updates for better performance
      const textStreamPromise = (async () => {
        let chunkCount = 0;
        let lastUpdateTime = Date.now();
        let lastUpdateLength = 0;
        let pendingUpdate: NodeJS.Timeout | null = null;
        
        // Batching configuration
        // These settings reduce the number of Feishu API calls while maintaining responsive streaming
        const BATCH_DELAY_MS = 150; // Wait 150ms between updates to batch small chunks
        const MIN_CHARS_PER_UPDATE = 50; // Only update after accumulating 50+ new chars (reduces API calls from 200+ to ~20)
        const MAX_DELAY_MS = 1000; // Force update every 1s even if small (prevents stalling for slow responses)
        
        const flushUpdate = async () => {
          if (pendingUpdate) {
            clearTimeout(pendingUpdate);
            pendingUpdate = null;
          }
          // IMPORTANT: Only send new text since last update (delta), not accumulated text
          // This prevents repeating text when the card is updated multiple times
          if (updateStatus && accumulatedText.length > lastUpdateLength) {
            await updateStatus(accumulatedText);
            lastUpdateTime = Date.now();
            lastUpdateLength = accumulatedText.length;
          }
        };
        
        try {
          for await (const textDelta of result.textStream) {
            chunkCount++;
            accumulatedText += textDelta;
            const timeSinceLastUpdate = Date.now() - lastUpdateTime;
            const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
            
            // Update immediately if:
            // 1. This is the first chunk (show something immediately)
            // 2. We've accumulated enough characters (MIN_CHARS_PER_UPDATE)
            // 3. Too much time has passed (MAX_DELAY_MS)
            const shouldUpdateImmediately = 
              chunkCount === 1 || 
              charsSinceLastUpdate >= MIN_CHARS_PER_UPDATE ||
              timeSinceLastUpdate >= MAX_DELAY_MS;
            
            if (shouldUpdateImmediately) {
              await flushUpdate();
            } else {
              // Schedule a batched update
              if (pendingUpdate) {
                clearTimeout(pendingUpdate);
              }
              pendingUpdate = setTimeout(flushUpdate, BATCH_DELAY_MS);
            }
          }
        } catch (streamIterationError) {
          const errorMsg = streamIterationError instanceof Error ? streamIterationError.message : String(streamIterationError);
          console.error(`[Manager] Error during stream iteration:`, errorMsg);
          
          // Check if it's a rate limit error
          if (isRateLimitError(streamIterationError)) {
            console.warn(
              `⚠️ [Manager] Rate limit detected during streaming. ` +
              `Current model: ${currentModelTier}, ` +
              `Consecutive failures: ${getConsecutiveFailures(currentModelTier)}`
            );
            
            markModelRateLimited(currentModelTier);
            
            if (currentModelTier === "primary") {
              console.warn(`⚠️ [Manager] Switching to fallback model...`);
              currentModelTier = "fallback";
              const error = streamIterationError instanceof Error ? streamIterationError : new Error(String(streamIterationError));
              devtoolsTracker.trackError("Manager", error, {
                query,
                errorType: "RATE_LIMIT",
                action: "Switched to fallback model during streaming",
              });
              // Retry with fallback model
              return managerAgent(messages, updateStatus, chatId, rootId, userId);
            } else {
              // Fallback also hit rate limit - we've exhausted options
              console.error(
                `❌ [Manager] Both models rate limited! ` +
                `Primary: ${getConsecutiveFailures("primary")} failures, ` +
                `Fallback: ${getConsecutiveFailures("fallback")} failures`
              );
              const error = streamIterationError instanceof Error ? streamIterationError : new Error(String(streamIterationError));
              devtoolsTracker.trackError("Manager", error, {
                query,
                errorType: "RATE_LIMIT_EXHAUSTED",
                primaryFailures: getConsecutiveFailures("primary"),
                fallbackFailures: getConsecutiveFailures("fallback"),
                action: "All retry options exhausted",
              });
            }
          } else {
            // Log unexpected errors with context
            devtoolsTracker.trackError("Manager", 
              streamIterationError instanceof Error ? streamIterationError : new Error(String(streamIterationError)),
              { phase: "stream_iteration", query }
            );
          }
          // Continue with accumulated text even if stream fails (for non-rate-limit errors)
        }
        
        // Flush any pending update
        await flushUpdate();
        
        console.log(`[Manager] Finished reading textStream. Total chunks: ${chunkCount}, Final text length: ${accumulatedText.length}`);
      })();

      // Wait for both streams to complete
      await Promise.all([fullStreamPromise, textStreamPromise]);
    };

    await processStreams();

    // Wait for the final result
     let finalResult;
     let tokenUsage: any = undefined;
     try {
       finalResult = await result;
       const resultText = typeof finalResult?.text === 'string' ? finalResult.text : '';
       
       // Capture token usage from result
       if (finalResult && typeof finalResult === 'object' && 'usage' in finalResult) {
         tokenUsage = finalResult.usage;
       }
       
       console.log(`[Manager] Final result received:`, {
         text: resultText?.substring(0, 100) || 'N/A',
         textLength: resultText?.length || 0,
         accumulatedLength: accumulatedText.length,
         usage: tokenUsage ? {
           input: tokenUsage.promptTokens,
           output: tokenUsage.completionTokens,
           total: tokenUsage.totalTokens,
         } : 'N/A',
       });
     } catch (finalError) {
       console.error(`[Manager] Error awaiting final result:`, finalError);
       finalResult = { text: "" };
     }
     
     const finalResultText = typeof finalResult?.text === 'string' ? finalResult.text : '';
     const finalText = accumulatedText || finalResultText || "";
      const duration = Date.now() - startTime;
      
      // Clear rate limit state on successful completion
      clearRateLimitOnSuccess();
      
      if (!routedAgent) {
        console.log(`[Manager] Query handled directly (no handoff): "${query}"`);
      }
      
      // Track response with token usage and health metrics
      devtoolsTracker.trackResponse(
        "Manager",
        finalText,
        duration,
        {
          routedAgent,
          queryLength: query.length,
          model: currentModelTier === 'fallback' ? 'gemini-2.5-flash' : 'kat-coder-pro',
        },
        tokenUsage
      );
      
      // Track in health monitor
      healthMonitor.trackAgentCall("Manager", duration, true);
      
      console.log(`[Manager] Returning final text (length=${finalText.length})`);
      return finalText;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    // Determine error type for better diagnostics
    const isRateLimit = isRateLimitError(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('econnrefused');
    const isAuthError = errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('403');
    
    let errorType: 'RATE_LIMIT' | 'TIMEOUT' | 'AUTH_ERROR' | 'OTHER' = "OTHER";
    if (isRateLimit) errorType = "RATE_LIMIT";
    else if (isTimeout) errorType = "TIMEOUT";
    else if (isAuthError) errorType = "AUTH_ERROR";
    
    // Track error in health monitor
    healthMonitor.trackAgentCall("Manager", duration, false);
    healthMonitor.trackError(errorType, errorMsg);
    
    // Track error with detailed context
    devtoolsTracker.trackError(
      "Manager",
      error instanceof Error ? error : new Error(errorMsg),
      { 
        query, 
        duration, 
        errorType,
        currentModelTier,
        suggestion: isRateLimit ? "Consider switching to fallback model" : "Check server logs for details"
      }
    );
    
    console.error(`[Manager] Error processing query (${errorType}):`, {
      query: query.substring(0, 100),
      duration,
      error: errorMsg,
      model: currentModelTier
    });
    
    return "eh...错了错了, 完犊子！";
  }
}
