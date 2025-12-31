/**
 * Manager Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Routes user queries to specialist agents (OKR, Alignment, P&L, DPA-PM).
 * Falls back to general guidance if no specialist matches (web search disabled - migrating to Brave Search API).
 * 
 * KEY CHANGES FROM AI SDK TOOLS:
 * 1. Uses Mastra's Agent instead of @ai-sdk-tools/agents
 * 2. Native model fallback array instead of dual agents
 * 3. Simplified streaming API (textStream identical)
 * 4. Custom execution context via options (threadId, resourceId)
 */

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import { devtoolsTracker } from "../devtools-integration";
import { getMemoryThread, getMemoryResource, createMastraMemory } from "../memory-mastra";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";
import {
  isRateLimitError,
  isModelRateLimited,
  markModelRateLimited,
  clearModelRateLimit,
  getConsecutiveFailures,
  sleep,
  calculateBackoffDelay,
  DEFAULT_RETRY_CONFIG,
} from "../shared/model-fallback";
import { getMastraModelSingle } from "../shared/model-router";
import { hasInternalModel, getInternalModel, getInternalModelInfo } from "../shared/internal-model";
// import { createSearchWebTool } from "../tools";
import { healthMonitor } from "../health-monitor";
import { routeQuery, shouldUseWorkflow, getRoutingSummary } from "../routing/skill-based-router";
import { getSkillRegistry } from "../skills/skill-registry";
import { injectSkillsIntoInstructions, injectSkillsIntoMessages } from "../skills/skill-injector";
import { executeSkillWorkflow } from "../workflows";
import { initializeMemoryContext, loadMemoryHistory, saveMessagesToMemory, getWorkingMemory, updateWorkingMemory, buildSystemMessageWithMemory } from "../memory-middleware";
import { extractAndSaveWorkingMemory } from "../working-memory-extractor";
import * as path from "path";

// Web search tool temporarily disabled - will be replaced with Brave Search API
// const searchWebTool = createSearchWebTool(true, true);

// Track model tier for rate limit handling
let currentModelTier: "primary" | "fallback" = "primary";

// Lazy-initialized agent
let managerAgentInstance: Agent | null = null;
let isInitializing: boolean = false;
let mastraMemoryInstance: any = null;
let skillRegistryInitialized: boolean = false;

/**
 * Initialize skill registry (lazy - called on first request)
 */
async function initializeSkillRegistry(): Promise<void> {
  if (skillRegistryInitialized) return;
  
  try {
    const skillsDir = path.join(process.cwd(), "skills");
    const registry = getSkillRegistry();
    await registry.initialize(skillsDir);
    skillRegistryInitialized = true;
    console.log(`[Manager] Skill registry initialized`);
  } catch (error) {
    console.warn(`[Manager] Failed to initialize skill registry:`, error);
    // Continue without skills - agent can work without them
  }
}

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

  // Use single explicit free model (Mastra Agent expects single model, not array)
  // getMastraModelSingle returns a single model object
  const model = getMastraModelSingle(true); // requireTools=true for future tool support
  
  // Log internal model availability
  if (hasInternalModel()) {
    console.log(`✅ [Manager] Internal fallback model available: ${getInternalModelInfo()}`);
  }
  
  managerAgentInstance = new Agent({
    name: "Manager",
    instructions: getManagerInstructions(),
    
    // Single model - Mastra Agent doesn't support model arrays
    // Primary: nvidia/nemotron-3-nano-30b-a3b:free
    model: model,

    // Tools - web search temporarily disabled (will be replaced with Brave Search API)
    tools: {
      // searchWeb: searchWebTool, // Disabled - migrating to Brave Search API
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
4. DPA Mom Agent: 路由关于DPA、数据团队(data team)、AE、DA、dpa_mom、mom、ma的查询
5. Fallback: 如果没有匹配的专家，提供有用的指导或说明无法处理该查询

ROUTING RULES (apply in this order):
1. OKR Reviewer: Route queries about OKR, objectives, key results, manager reviews, has_metric percentage, or 覆盖率
2. Alignment Agent: Route queries about alignment, 对齐, or 目标对齐
3. P&L Agent: Route queries about profit & loss, P&L, 损益, 利润, 亏损, or EBIT
4. DPA Mom Agent: Route queries about DPA, data team, AE, DA, dpa_mom, mom, or ma
5. Fallback: If no specialist matches, provide helpful guidance or explain that the query cannot be handled

GENERAL GUIDELINES:
- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- Always route to the most appropriate specialist agent when their domain is mentioned.
- Web search is currently disabled (migrating to Brave Search API). For general queries that don't match any specialist, provide helpful guidance or explain limitations.
- Most queries will be in Chinese - understand Chinese query semantics for better routing.

AVAILABLE SPECIALISTS:
- OKR Reviewer (okr_reviewer): For OKR metrics, manager reviews, has_metric percentage analysis / 用于OKR指标、经理评审、指标覆盖率分析
- Alignment Agent (alignment_agent): For alignment tracking (under development) / 用于对齐跟踪（开发中）
- P&L Agent (pnl_agent): For profit & loss analysis (under development) / 用于损益分析（开发中）
- DPA Mom Agent (dpa_mom): Chief-of-staff and executive assistant to Ian for the DPA team / Ian的首席幕僚和执行助理，负责照顾DPA团队`;
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
  // Lazy initialize agent and skill registry
  initializeAgent();
  await initializeSkillRegistry();

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

  // Legacy memory system removed - using Mastra Memory only

  // Initialize memory context for working memory access
  let memoryContext = null;
  if (userId && chatId && rootId) {
    memoryContext = await initializeMemoryContext(userId, chatId, rootId);
  }

  // Load working memory (Layer 1) - user facts and preferences
  let workingMemory = null;
  if (memoryContext) {
    workingMemory = await getWorkingMemory(memoryContext);
    if (workingMemory) {
      console.log(`[Manager] Loaded working memory:`, workingMemory);
    }
  }

  // Use skill-based routing for declarative classification
  const routingDecision = await routeQuery(query);

  console.log(
    `[Manager] Skill-based routing: ${getRoutingSummary(routingDecision)}`
  );

  // Route based on skill-based routing decision
  // Priority: workflow > subagent > skill > general
  
  // 1. Workflow routing (deterministic multi-step execution)
  if (shouldUseWorkflow(routingDecision)) {
    console.log(
      `[Manager] Workflow routing: ${routingDecision.workflowId} (confidence: ${routingDecision.confidence.toFixed(2)})`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      workflowRoute: routingDecision.workflowId,
      confidence: routingDecision.confidence,
    });

    try {
      const result = await executeSkillWorkflow(routingDecision.workflowId!, {
        query,
        userId,
        chatId,
        messageId: rootId,
        rootId,
        onUpdate: updateStatus,
      });

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse(
        routingDecision.workflowId!,
        result.response,
        duration,
        { workflowRoute: true, success: result.success }
      );
      healthMonitor.trackAgentCall(routingDecision.workflowId!, duration, result.success);

      // Save workflow response to memory
      if (mastraMemory && memoryThread && memoryResource) {
        try {
          const timestamp = new Date();
          const userMessageId = `msg-${memoryThread}-wf-user-${timestamp.getTime()}`;
          const assistantMessageId = `msg-${memoryThread}-wf-assistant-${timestamp.getTime()}`;
          
          await mastraMemory.saveMessages({
            messages: [
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
                content: { content: result.response },
                createdAt: timestamp,
              },
            ],
            format: 'v2',
          });
          console.log(`[Workflow] Saved response to memory`);
        } catch (error) {
          console.warn("[Workflow] Failed to save response to memory:", error);
        }
      }

      console.log(`[Workflow] ${routingDecision.workflowId} complete (length=${result.response.length}, durationMs=${result.durationMs})`);
      return result.response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Manager] Workflow ${routingDecision.workflowId} failed:`, errorMsg);
      healthMonitor.trackError(
        "workflow_execution",
        error instanceof Error ? error : new Error(errorMsg),
        { workflowRoute: true, workflowId: routingDecision.workflowId }
      );
      // Fall through to subagent/manager if workflow fails
    }
  }

  // 2. Subagent routing (non-deterministic agent delegation)
  if (routingDecision.type === "subagent") {
    // Route to subagent (DPA Mom priority 1, OKR priority 4)
    if (routingDecision.category === "dpa_mom") {
      // DPA Mom routing (highest priority)
      console.log(
        `[Manager] Skill-based routing: DPA Mom Agent (confidence: ${routingDecision.confidence.toFixed(2)})`
      );
      devtoolsTracker.trackAgentCall("Manager", query, {
        skillRoute: "dpa_mom",
        confidence: routingDecision.confidence,
      });
      try {
        // Lazy import to avoid circular dependency with observability-config
        const { mastra } = await import("../observability-config");
        const dpaMomAgent = mastra.getAgent("dpaMom");
        const executionContext: any = {
          _memoryAddition: "",
        };

        if (chatId && rootId) {
          const conversationId = `feishu:${chatId}:${rootId}`;
          const userScopeId = userId
            ? `user:${userId}`
            : `user:${chatId}`;
          executionContext.chatId = conversationId;
          executionContext.userId = userScopeId;
          if (userId) {
            executionContext.feishuUserId = userId;
          }
        }

        // Add working memory context to execution context
        if (workingMemory) {
          executionContext.workingMemory = workingMemory;
          console.log(`[Manager] Added working memory to execution context:`, workingMemory);
        }

        const result = await dpaMomAgent.stream({
          messages,
          executionContext,
        });

        let accumulatedText = "";
        let lastUpdateLength = 0;
        let lastUpdateTime = Date.now();
        for await (const textDelta of result.textStream) {
          accumulatedText += textDelta;
          const timeSinceLastUpdate = Date.now() - lastUpdateTime;
          const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
          const shouldUpdate = updateStatus && (
            accumulatedText.length % 50 === 0 ||
            timeSinceLastUpdate >= 200 ||
            charsSinceLastUpdate >= 30
          );
          if (shouldUpdate) {
            updateStatus(accumulatedText);
            lastUpdateLength = accumulatedText.length;
            lastUpdateTime = Date.now();
          }
        }
        if (updateStatus && accumulatedText.length > lastUpdateLength) {
          updateStatus(accumulatedText);
        }

        const duration = Date.now() - startTime;
        devtoolsTracker.trackResponse("dpa_mom", accumulatedText, duration, {
          skillRoute: true,
        });
        healthMonitor.trackAgentCall("dpa_mom", duration, true);

        if (mastraMemory && memoryThread && memoryResource) {
          try {
            const timestamp = new Date();
            const userMessageId = `msg-${memoryThread}-dpa-user-${timestamp.getTime()}`;
            const assistantMessageId = `msg-${memoryThread}-dpa-assistant-${timestamp.getTime()}`;
            
            await mastraMemory.saveMessages({
              messages: [
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
              ],
              format: 'v2',
            });
            
            console.log(`[DPA Mom] Saved response to memory`);
          } catch (error) {
            console.warn("[DPA Mom Routing] Failed to save response to memory:", error);
          }
        }

        console.log(`[DPA Mom] Response complete (length=${accumulatedText.length})`);
        return accumulatedText;
      } catch (error) {
        console.error(`[Manager] Error routing to DPA Mom Agent:`, error);
        const errorMsg = error instanceof Error ? error.message : String(error);
        devtoolsTracker.trackError(
          "dpa_mom",
          error instanceof Error ? error : new Error(errorMsg),
          { skillRoute: true }
        );
        // Fall through to manager if specialist fails
      }
    } else if (routingDecision.category === "okr") {
    // OKR routing (lowest priority subagent)
    console.log(
      `[Manager] Skill-based routing: OKR Reviewer (confidence: ${routingDecision.confidence.toFixed(2)})`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      skillRoute: "okr_reviewer",
      confidence: routingDecision.confidence,
    });
    try {
      // Lazy import to avoid circular dependency with observability-config
      const { mastra } = await import("../observability-config");
      const okrAgent = mastra.getAgent("okrReviewer");

      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = `feishu:${chatId}:${rootId}`;
        const userScopeId = userId
          ? `user:${userId}`
          : `user:${chatId}`;
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
        console.log(
          `[OKR] Memory context: conversationId=${conversationId}, userId=${userScopeId}`
        );
      }

      const result = await okrAgent.stream({ messages, executionContext });

      let accumulatedText = "";
      let lastUpdateLength = 0;
      let lastUpdateTime = Date.now();
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
        const shouldUpdate = updateStatus && (
          accumulatedText.length % 50 === 0 ||
          timeSinceLastUpdate >= 200 ||
          charsSinceLastUpdate >= 30
        );
        if (shouldUpdate) {
          updateStatus(accumulatedText);
          lastUpdateLength = accumulatedText.length;
          lastUpdateTime = Date.now();
        }
      }
      if (updateStatus && accumulatedText.length > lastUpdateLength) {
        updateStatus(accumulatedText);
      }

      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("okr_reviewer", accumulatedText, duration, {
        skillRoute: true,
      });
      healthMonitor.trackAgentCall("okr_reviewer", duration, true);

      if (mastraMemory && memoryThread && memoryResource) {
        try {
          const timestamp = new Date();
          const userMessageId = `msg-${memoryThread}-okr-user-${timestamp.getTime()}`;
          const assistantMessageId = `msg-${memoryThread}-okr-assistant-${timestamp.getTime()}`;
          
          await mastraMemory.saveMessages({
            messages: [
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
            ],
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
        { skillRoute: true }
      );
      // Fall through to manager if specialist fails
    }
    } // Close the if (routingDecision.category === "okr") block
  } else if (routingDecision.type === "skill") {
    // Inject skill into manager and execute (P&L priority 2, Alignment priority 3)
    console.log(
      `[Manager] Skill-based routing: Injecting ${routingDecision.category} skill into manager (confidence: ${routingDecision.confidence.toFixed(2)})`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      skillRoute: routingDecision.agentName,
      confidence: routingDecision.confidence,
      skillInjection: true,
    });
    
    try {
      // Get skill for the category
      const registry = getSkillRegistry();
      // Skill IDs match directory names
      const skillId = routingDecision.category === "pnl" ? "pnl-analysis" : 
                      routingDecision.category === "alignment" ? "alignment-tracking" : null;
      
      if (!skillId) {
        console.warn(`[Manager] Unknown category for skill injection: ${routingDecision.category}`);
      } else {
        const skill = registry.getSkill(skillId);
      
        if (!skill) {
          console.warn(`[Manager] Skill ${skillId} not found, falling back to manager`);
        } else {
        // Inject skill directly into messages
        console.log(`[Manager] Injecting skill: ${skill.metadata.name}`);
        
        // Compose skill instructions
        let skillContext = `**Active Skill Available**:\n\n## Skill: ${skill.metadata.name}\n`;
        skillContext += `**Description**: ${skill.metadata.description}\n`;
        if (skill.metadata.version) {
          skillContext += `**Version**: ${skill.metadata.version}\n`;
        }
        skillContext += `\n${skill.instructions}\n\n---\n\n`;
        
        // Prepend skill instructions to the first user message
        const enhancedMessages: CoreMessage[] = [...messages];
        if (enhancedMessages.length > 0 && enhancedMessages[0].role === "user") {
          const firstMessage = enhancedMessages[0];
          if (typeof firstMessage.content === "string") {
            enhancedMessages[0] = {
              ...firstMessage,
              content: skillContext + firstMessage.content,
            };
          }
        }
          
          // Use manager agent with skill-injected messages
          const result = await managerAgentInstance!.stream(enhancedMessages);
          
          let accumulatedText = "";
          let lastUpdateLength = 0;
          let lastUpdateTime = Date.now();
          
          for await (const textDelta of result.textStream) {
            accumulatedText += textDelta;
            const timeSinceLastUpdate = Date.now() - lastUpdateTime;
            const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
            
            const shouldUpdate = updateStatus && (
              accumulatedText.length % 50 === 0 ||
              timeSinceLastUpdate >= 200 ||
              charsSinceLastUpdate >= 30
            );
            
            if (shouldUpdate) {
              updateStatus(accumulatedText);
              lastUpdateLength = accumulatedText.length;
              lastUpdateTime = Date.now();
            }
          }
          
          // Send final update
          if (updateStatus && accumulatedText.length > lastUpdateLength) {
            updateStatus(accumulatedText);
          }
          
          const duration = Date.now() - startTime;
          devtoolsTracker.trackResponse(routingDecision.agentName, accumulatedText, duration, {
            skillRoute: true,
            skillInjection: true,
          });
          healthMonitor.trackAgentCall(routingDecision.agentName, duration, true);
          
          // Save to memory
          if (mastraMemory && memoryThread && memoryResource) {
            try {
              const timestamp = new Date();
              const userMessageId = `msg-${memoryThread}-${routingDecision.category}-user-${timestamp.getTime()}`;
              const assistantMessageId = `msg-${memoryThread}-${routingDecision.category}-assistant-${timestamp.getTime()}`;
              
              await mastraMemory.saveMessages({
                messages: [
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
                ],
                format: 'v2',
              });
              
              console.log(`[Manager] Saved ${routingDecision.category} response to memory`);
            } catch (error) {
              console.warn(`[Manager] Failed to save ${routingDecision.category} response to memory:`, error);
            }
          }
          
          console.log(`[Manager] ${routingDecision.category} response complete (length=${accumulatedText.length})`);
          return accumulatedText;
        }
      }
    } catch (error) {
      console.error(`[Manager] Error injecting skill for ${routingDecision.category}:`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      devtoolsTracker.trackError(
        routingDecision.agentName,
        error instanceof Error ? error : new Error(errorMsg),
        { skillRoute: true }
      );
      // Fall through to manager
    }
  }

  // Legacy alignment agent routing - DISABLED (now handled by skill injection)
  if (false && routingDecision.category === "alignment") {
    console.log(
      `[Manager] Workflow routing: Alignment Agent (confidence: ${routingDecision.confidence.toFixed(2)})`
    );
    devtoolsTracker.trackAgentCall("Manager", query, {
      workflowRoute: "alignment_agent",
      confidence: routingDecision.confidence,
    });
    try {
      // Lazy import to avoid circular dependency with observability-config
      const { mastra } = await import("../observability-config");
      const alignmentAgent = mastra.getAgent("alignment");
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = `feishu:${chatId}:${rootId}`;
        const userScopeId = userId
          ? `user:${userId}`
          : `user:${chatId}`;
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
      let lastUpdateLength = 0;
      let lastUpdateTime = Date.now();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/123f91e6-ddc1-4f3e-81a7-3f3fdad928ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manager-agent-mastra.ts:363',message:'Starting alignment agent stream',data:{agent:'alignment_agent'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
        // Stream updates with improved batching
        const shouldUpdate = updateStatus && (
          accumulatedText.length % 50 === 0 ||
          timeSinceLastUpdate >= 200 ||
          charsSinceLastUpdate >= 30
        );
        if (shouldUpdate) {
          updateStatus(accumulatedText);
          lastUpdateLength = accumulatedText.length;
          lastUpdateTime = Date.now();
        }
      }
      // Send final update if there's remaining text
      if (updateStatus && accumulatedText.length > lastUpdateLength) {
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

  // P&L Agent routing - DISABLED (not active yet)
  // TODO: Re-enable when pnl agent is ready
  if (false && routingDecision.category === "pnl") {
    console.log(`[Manager] Workflow routing: P&L Agent (confidence: ${routingDecision.confidence.toFixed(2)})`);
    devtoolsTracker.trackAgentCall("Manager", query, {
      workflowRoute: "pnl_agent",
      confidence: routingDecision.confidence,
    });
    try {
      // Lazy import to avoid circular dependency with observability-config
      const { mastra } = await import("../observability-config");
      const pnlAgent = mastra.getAgent("pnl");
      const executionContext: any = {
        _memoryAddition: "",
      };

      if (chatId && rootId) {
        const conversationId = `feishu:${chatId}:${rootId}`;
        const userScopeId = userId
          ? `user:${userId}`
          : `user:${chatId}`;
        executionContext.chatId = conversationId;
        executionContext.userId = userScopeId;
        if (userId) {
          executionContext.feishuUserId = userId;
        }
      }

      const result = await pnlAgent.stream({ messages, executionContext });

      let accumulatedText = "";
      let lastUpdateLength = 0;
      let lastUpdateTime = Date.now();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/123f91e6-ddc1-4f3e-81a7-3f3fdad928ed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'manager-agent-mastra.ts:459',message:'Starting PnL agent stream',data:{agent:'pnl_agent'},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      for await (const textDelta of result.textStream) {
        accumulatedText += textDelta;
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const charsSinceLastUpdate = accumulatedText.length - lastUpdateLength;
        // Stream updates with improved batching
        const shouldUpdate = updateStatus && (
          accumulatedText.length % 50 === 0 ||
          timeSinceLastUpdate >= 200 ||
          charsSinceLastUpdate >= 30
        );
        if (shouldUpdate) {
          updateStatus(accumulatedText);
          lastUpdateLength = accumulatedText.length;
          lastUpdateTime = Date.now();
        }
      }
      // Send final update if there's remaining text
      if (updateStatus && accumulatedText.length > lastUpdateLength) {
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

  // No specialist matched - use manager agent for general guidance (web search disabled)
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
    // Inject relevant skills into instructions dynamically
    // We inject skills by prepending them to the first user message
    // This avoids recreating the agent instance
    let messagesWithSkills = [...messages];
    try {
      const skillInjection = await injectSkillsIntoInstructions(
        getManagerInstructions(),
        query,
        {
          maxSkills: 3,
          minScore: 0.5,
          includeMetadata: true,
        }
      );
      
      if (skillInjection.injectedSkills.length > 0) {
        console.log(`[Manager] Injected ${skillInjection.injectedSkills.length} skills: ${skillInjection.injectedSkills.map(s => s.metadata.name).join(", ")}`);
        
        // Prepend skill instructions to the first user message
        // This way the agent sees the skills in context without recreating the agent
        if (messagesWithSkills.length > 0 && messagesWithSkills[0].role === "user") {
          const firstMessage = messagesWithSkills[0];
          if (typeof firstMessage.content === "string") {
            const skillContext = `**Active Skills Available**:\n\n${skillInjection.instructions}\n\n---\n\n`;
            messagesWithSkills[0] = {
              ...firstMessage,
              content: skillContext + firstMessage.content,
            };
          }
        }
      }
    } catch (error) {
      console.warn(`[Manager] Failed to inject skills:`, error);
      // Continue without skills
    }
    
    // Load conversation history from Mastra Memory before calling agent
    // Use messagesWithSkills (which may have skill context prepended)
    let messagesWithHistory = [...messagesWithSkills];
    
    if (mastraMemory && memoryResource && memoryThread) {
      try {
        console.log(`[Manager] Loading conversation history from Mastra Memory...`);
        const historyMessages = await loadMemoryHistory(memoryContext!);
        
        if (historyMessages.length > 0) {
          console.log(`[Manager] Loaded ${historyMessages.length} messages from memory`);
          // Prepend history to current messages
          messagesWithHistory = [...historyMessages, ...messagesWithSkills];
        }
      } catch (error) {
        console.warn(`[Manager] Failed to load memory history:`, error);
        // Continue without history
      }
    }
    
    // ENHANCE MESSAGES WITH WORKING MEMORY (Layer 1)
    if (workingMemory) {
      console.log(`[Manager] Enhancing messages with working memory:`, workingMemory);
      // Add working memory as system message at the beginning
      const workingMemoryContext = buildSystemMessageWithMemory("", workingMemory);
      const systemMessage: CoreMessage = {
        role: "system",
        content: workingMemoryContext.trim(),
      };
      messagesWithHistory = [systemMessage, ...messagesWithHistory];
    }
    
    // MASTRA STREAMING: Call manager agent with streaming
    // NOTE: Do NOT pass memory instance in executionContext - it causes model resolution issues
    // Memory operations are handled manually before/after streaming
    const executionContext: any = {};
    if (memoryThread && memoryResource) {
      executionContext.threadId = memoryThread;
      executionContext.resourceId = memoryResource;
      // DO NOT pass executionContext.memory - causes "Invalid model configuration" error
      console.log(`[Manager] Executing agent with thread/resource context`);
      console.log(`   Resource: ${memoryResource}, Thread: ${memoryThread}`);
    } else {
      console.log(`[Manager] Executing agent without memory context`);
    }
    
    const stream = await managerAgentInstance!.stream(messagesWithHistory, executionContext);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }
    
    // Save both user message and response to Mastra Memory for future conversations
    if (memoryContext && mastraMemory) {
      try {
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
        
        // Extract and save working memory facts from response
        await extractAndSaveWorkingMemory(text, memoryContext);
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
