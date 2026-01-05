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
import { getMemoryThreadId, getMemoryResourceId } from "../memory-factory";
import { createAgentMemory } from "../memory-factory";
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
import { routeQuery, shouldUseWorkflow, getRoutingSummary } from "../routing/query-router";
import { getSkillRegistry } from "../skills/skill-registry";
import { injectSkillsIntoInstructions, injectSkillsIntoMessages } from "../skills/skill-injector";
import { executeSkillWorkflow } from "../workflows";
import * as path from "path";

// Web search tool temporarily disabled - will be replaced with Brave Search API
// const searchWebTool = createSearchWebTool(true, true);

// Track model tier for rate limit handling
let currentModelTier: "primary" | "fallback" = "primary";

// Lazy-initialized agent
let managerAgentInstance: Agent | null = null;
let isInitializing: boolean = false;
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
  
  // Create native Mastra memory for this agent
  const agentMemory = createAgentMemory({
    lastMessages: 20,
    enableWorkingMemory: true,
    enableSemanticRecall: false, // Will enable in Phase 2 after PgVector setup
  });

  managerAgentInstance = new Agent({
    id: "manager",
    name: "Manager",
    instructions: getManagerInstructions(),
    
    // Single model - Mastra Agent doesn't support model arrays
    // Primary: nvidia/nemotron-3-nano-30b-a3b:free
    model: model,

    // Native Mastra memory - makes memory visible in Studio
    memory: agentMemory || undefined,

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

/**
 * Manager agent result - can be string or structured with confirmation data
 */
export interface ManagerAgentResult {
  text: string;
  needsConfirmation?: boolean;
  confirmationData?: string;
}

export async function managerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<string | ManagerAgentResult> {
  // Lazy initialize agent and skill registry
  initializeAgent();
  await initializeSkillRegistry();

  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[Manager] Received query: "${query}"`);

  // Set up memory context using Mastra-native pattern
  // Memory is attached to the agent at construction; we just need resource/thread IDs
  const memoryResource = userId ? getMemoryResourceId(userId) : undefined;
  const memoryThread = chatId && rootId ? getMemoryThreadId(chatId, rootId) : undefined;
  
  // Build memory config for agent calls (native Mastra pattern)
  const memoryConfig = memoryResource && memoryThread ? {
    resource: memoryResource,
    thread: {
      id: memoryThread,
      metadata: { chatId, rootId, userId },
      title: `Feishu Chat ${chatId}`,
    },
  } : undefined;

  if (memoryConfig) {
    console.log(`✅ [Manager] Memory context ready (native Mastra pattern)`);
    console.log(`   Resource: ${memoryResource}, Thread: ${memoryThread}`);
  } else {
    console.log(`[Manager] No memory context (missing userId, chatId, or rootId)`);
  }

  // Use skill-based routing for declarative classification
  const routingDecision = await routeQuery(query);

  console.log(
    `[Manager] Skill-based routing: ${getRoutingSummary(routingDecision)}`
  );

  // Route based on skill-based routing decision
  // Priority: workflow > skill > general
  
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

      // NOTE: Workflow responses are not automatically saved to agent memory
      // because workflows execute independently. Memory is handled by the workflow itself.
      console.log(`[Workflow] ${routingDecision.workflowId} complete (length=${result.response.length}, durationMs=${result.durationMs})`);
      
      // Return structured result if confirmation is needed
      if (result.needsConfirmation && result.confirmationData) {
        console.log(`[Workflow] Returning confirmation request`);
        return {
          text: result.response,
          needsConfirmation: true,
          confirmationData: result.confirmationData,
        };
      }
      
      return result.response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Manager] Workflow ${routingDecision.workflowId} failed:`, errorMsg);
      healthMonitor.trackError("OTHER", `Workflow ${routingDecision.workflowId} failed: ${errorMsg}`);
      // Fall through to skill/manager if workflow fails
    }
  }

  // 2. Skill injection (P&L priority 2, Alignment priority 3)
  if (routingDecision.type === "skill") {
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
          
          // Use manager agent with skill-injected messages and native memory
          const result = await managerAgentInstance!.stream(enhancedMessages, {
            memory: memoryConfig,
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
          
          // Memory is automatically saved by Mastra when memoryConfig is provided
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

  // NOTE: Legacy alignment and P&L agent routing removed in Phase 2 memory refactor
  // These are now handled by skill injection above

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
    
    // MASTRA NATIVE MEMORY: Pass messages and memoryConfig to agent
    // Mastra automatically handles:
    // - Loading conversation history from the thread
    // - Saving user/assistant messages after the call
    // - Working memory (when configured)
    // - Semantic recall (when enabled)
    
    const stream = await managerAgentInstance!.stream(messagesWithSkills, {
      memory: memoryConfig,
    });

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }
    
    // Memory is automatically saved by Mastra when memoryConfig is provided

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
