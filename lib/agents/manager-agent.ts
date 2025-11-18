import { Agent } from "@ai-sdk-tools/agents";
import { CoreMessage } from "ai";
import { okrReviewerAgent } from "./okr-reviewer-agent";
import { alignmentAgent } from "./alignment-agent";
import { pnlAgent } from "./pnl-agent";
import { dpaPmAgent } from "./dpa-pm-agent";
import { devtoolsTracker } from "../devtools-integration";
import { memoryProvider, getConversationId, getUserScopeId } from "../memory";
import { getPrimaryModel, getFallbackModel, isRateLimitError } from "../shared/model-fallback";
import { createSearchWebTool } from "../tools";
import { healthMonitor } from "../health-monitor";

// Create web search tool for fallback (with caching and devtools tracking)
const searchWebTool = createSearchWebTool(true, true);

// Track which model tier is currently in use for this session
let currentModelTier: "primary" | "fallback" = "primary";

// Create agent instances for both tiers
let managerAgentPrimary: Agent;
let managerAgentFallback: Agent;

/**
 * Initialize agents for both model tiers
 */
function initializeAgents() {
  managerAgentPrimary = new Agent({
    name: "Manager",
    model: getPrimaryModel(),
    instructions: getManagerInstructions(),
    handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent],
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
    handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent],
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

// Initialize agents on module load
initializeAgents();

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
  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[Manager] Received query: "${query}"`);
  
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
         executionContext.feishuUserId = userId;
       }
       
       console.log(`[Manager] Memory context: conversationId=${conversationId}, userId=${userScopeId}, feishuUserId=${userId || 'N/A'}`);
     }
     
     // Use Agent.stream() with execution context
     // Note: The type definition shows messages, but internally it needs executionContext
     // Select agent based on current model tier
     const selectedAgent = currentModelTier === "fallback" ? managerAgentFallback : managerAgentPrimary;
     let result;
     try {
       result = (selectedAgent.stream as any)({
         messages,
         executionContext,
       });
       console.log(`[Manager] Stream created, starting to read textStream...`);
     } catch (streamError) {
       console.error(`[Manager] Error creating stream:`, streamError);
       
       // Check if it's a rate limit error
        if (isRateLimitError(streamError)) {
         console.warn(`⚠️ [Manager] Rate limit detected (429). Switching to fallback model.`);
         if (currentModelTier === "primary") {
           currentModelTier = "fallback";
           const error = streamError instanceof Error ? streamError : new Error(String(streamError));
           devtoolsTracker.trackError("Manager", error, {
             query,
             errorType: "RATE_LIMIT",
             action: "Switched to fallback model",
           });
           // Retry with fallback model
           console.log(`[Manager] Retrying with fallback model...`);
           return managerAgent(messages, updateStatus, chatId, rootId, userId);
         }
       }
       throw streamError;
     }

    // Process both textStream and fullStream in parallel
     // fullStream contains events like agent-handoff
     const processStreams = async () => {
       // Process fullStream to catch handoff events
       const fullStreamPromise = (async () => {
         try {
           for await (const part of result.fullStream) {
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
        const BATCH_DELAY_MS = 100; // Wait 100ms between updates
        const MIN_CHARS_PER_UPDATE = 10; // Update at least every 10 chars
        const MAX_DELAY_MS = 500; // Force update every 500ms even if small
        
        const flushUpdate = async () => {
          if (pendingUpdate) {
            clearTimeout(pendingUpdate);
            pendingUpdate = null;
          }
          if (updateStatus && accumulatedText.length > 0) {
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
            console.warn(`⚠️ [Manager] Rate limit detected during streaming (429). Current model tier: ${currentModelTier}`);
            if (currentModelTier === "primary") {
              console.warn(`⚠️ [Manager] Switching to fallback model and retrying...`);
              currentModelTier = "fallback";
              const error = streamIterationError instanceof Error ? streamIterationError : new Error(String(streamIterationError));
              devtoolsTracker.trackError("Manager", error, {
                query,
                errorType: "RATE_LIMIT",
                action: "Switched to fallback model during streaming",
              });
              // Retry with fallback model
              return managerAgent(messages, updateStatus, chatId, rootId, userId);
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
     try {
       finalResult = await result;
       const resultText = typeof finalResult?.text === 'string' ? finalResult.text : '';
       console.log(`[Manager] Final result received:`, {
         text: resultText?.substring(0, 100) || 'N/A',
         textLength: resultText?.length || 0,
         accumulatedLength: accumulatedText.length,
       });
     } catch (finalError) {
       console.error(`[Manager] Error awaiting final result:`, finalError);
       finalResult = { text: "" };
     }
     
     const finalResultText = typeof finalResult?.text === 'string' ? finalResult.text : '';
     const finalText = accumulatedText || finalResultText || "";
      const duration = Date.now() - startTime;
      
      if (!routedAgent) {
        console.log(`[Manager] Query handled directly (no handoff): "${query}"`);
      }
      
      // Track response and health metrics
      devtoolsTracker.trackResponse("Manager", finalText, duration, {
        routedAgent,
        queryLength: query.length,
      });
      
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
