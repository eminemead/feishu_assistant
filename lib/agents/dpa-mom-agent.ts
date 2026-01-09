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

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import { devtoolsTracker } from "../devtools-integration";
import { createAgentMemoryAsync, getMemoryThreadId, getMemoryResourceId, ensureWorkingMemoryInitialized } from "../memory-factory";
import { inputProcessors } from "../memory-processors";
import { getMastraModelSingle } from "../shared/model-router";
import { hasInternalModel, getInternalModelInfo } from "../shared/internal-model";
import { healthMonitor } from "../health-monitor";
import { getLinkedIssue, IssueThreadMapping } from "../services/issue-thread-mapping-service";

// Import tool factories
import { 
  createGitLabCliTool, 
  createFeishuChatHistoryTool, 
  createFeishuDocsTool,
  createOkrReviewTool,
  chartGenerationTool,
} from "../tools";
import { okrVisualizationTool } from "./okr-visualization-tool";
import { okrChartStreamingTool } from "../tools/okr-chart-streaming-tool";
import { createExecuteWorkflowTool } from "../tools/execute-workflow-tool";

// Lazy-initialized agent and memory
let dpaMomInstance: Agent | null = null;
let dpaMomMemory: ReturnType<typeof createAgentMemory> = null;
let isInitializing = false;

/**
 * Get system prompt for unified agent
 */
function getSystemPrompt(): string {
  return `You are a Feishu/Lark AI assistant that helps users with OKR analysis, team coordination, and data operations. Most queries will be in Chinese (中文).

你是Feishu/Lark AI助手，帮助用户进行OKR分析、团队协调和数据操作。大多数查询将是中文。

IDENTITY:
- You are dpa_mom, the caring chief-of-staff for the DPA (Data Product & Analytics) team
- Ian is the team lead; you support both Ian and every team member
- Be warm, professional, and proactive in helping the team

AVAILABLE TOOLS:
1. **gitlab_cli**: GitLab operations (issues, MRs, CI/CD) via glab CLI
2. **feishu_chat_history**: Search Feishu group chat histories
3. **feishu_docs**: Read Feishu documents (Docs, Sheets, Bitable)
4. **mgr_okr_review**: Fetch OKR metrics data (has_metric_percentage per company)
5. **chart_generation**: Generate Mermaid/Vega-Lite charts
6. **okr_visualization**: Generate OKR heatmap visualizations
7. **okr_chart_streaming**: Generate comprehensive OKR analysis with charts
8. **execute_workflow**: Execute deterministic workflows for multi-step operations

WORKFLOW USAGE (execute_workflow tool):
Use execute_workflow when you need:
- **dpa-assistant**: GitLab issue creation with confirmation buttons
- **okr-analysis**: Complete OKR analysis with data + charts + insights
- **document-tracking**: Set up document change tracking

DIRECT TOOL USAGE:
Use tools directly for:
- Simple GitLab queries (list issues, check MRs)
- Chat history search
- Document reading
- Quick OKR data lookups
- Single chart generation

OKR ANALYSIS GUIDELINES:
- Period format: "11月" → pass "11 月" (with space before 月)
- Always generate at least ONE chart for OKR analysis requests
- Use okr_chart_streaming for comprehensive analysis with embedded charts

RESPONSE FORMAT:
- Use Markdown (Lark format) for Feishu cards
- Do not tag users (不要@用户)
- Current date: ${new Date().toISOString().split("T")[0]}
- Be concise but comprehensive

WORKING MEMORY (用户画像):
You have access to a persistent user profile that tracks preferences and context across conversations.
- **DO**: Update specific fields when you learn new info (e.g., user prefers charts, focuses on NIO brand)
- **DO**: Preserve the template structure — only fill in or update individual fields
- **DON'T**: Replace the entire working memory with task notes or tool outputs
- **DON'T**: Store temporary data like query results — that goes in your response, not working memory
- Fields to track: name, language preference, role, analysis preferences, OKR focus areas, active tasks
- Example update: If user says "我主要看乐道的数据", update "关注的品牌/Focus Brands: 乐道"`;
}

/**
 * Initialize the unified agent (async - ensures storage is ready)
 */
async function initializeAgentAsync(): Promise<void> {
  if (dpaMomInstance || isInitializing) {
    return;
  }

  isInitializing = true;

  // Log internal model availability
  if (hasInternalModel()) {
    console.log(`✅ [DpaMom] Internal fallback model available: ${getInternalModelInfo()}`);
  }

  // Create tool instances
  const gitlabCliTool = createGitLabCliTool(true);
  const feishuChatHistoryTool = createFeishuChatHistoryTool(true);
  const feishuDocsTool = createFeishuDocsTool(true);
  const mgrOkrReviewTool = createOkrReviewTool(true, true, 60 * 60 * 1000);
  const executeWorkflowTool = createExecuteWorkflowTool();

  // Create native Mastra memory with async init (ensures storage tables exist)
  dpaMomMemory = await createAgentMemoryAsync({
    lastMessages: 20,
    enableWorkingMemory: true,
    enableSemanticRecall: true,
  });

  // Single model - Mastra Agent expects single model
  const model = getMastraModelSingle(true); // requireTools=true

  dpaMomInstance = new Agent({
    id: "dpa_mom",
    name: "DPA Mom",
    instructions: getSystemPrompt(),
    model,
    memory: dpaMomMemory || undefined,
    inputProcessors,
    tools: {
      // DPA Mom tools
      gitlab_cli: gitlabCliTool,
      feishu_chat_history: feishuChatHistoryTool,
      feishu_docs: feishuDocsTool,
      // OKR Reviewer tools
      mgr_okr_review: mgrOkrReviewTool,
      chart_generation: chartGenerationTool,
      okr_visualization: okrVisualizationTool as any,
      okr_chart_streaming: okrChartStreamingTool,
      // Workflow execution
      execute_workflow: executeWorkflowTool,
    },
  });

  isInitializing = false;
  console.log(`✅ [DpaMom] Agent initialized with 8 tools + ${inputProcessors.length} processors (TokenLimiter, ToolCallFilter)`);
}

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
): Promise<string | DpaMomResult> {
  // Lazy initialize (async to ensure storage is ready)
  await initializeAgentAsync();

  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[FeishuAssistant] Query: "${query}"`);

  // Build memory config
  const memoryResource = userId ? getMemoryResourceId(userId) : undefined;
  const memoryThread = chatId && rootId ? getMemoryThreadId(chatId, rootId) : undefined;
  
  const memoryConfig = memoryResource && memoryThread ? {
    resource: memoryResource,
    thread: {
      id: memoryThread,
      metadata: { chatId, rootId, userId },
      title: `Feishu Chat ${chatId}`,
    },
  } : undefined;

  if (memoryConfig) {
    console.log(`✅ [DpaMom] Memory: resource=${memoryResource}, thread=${memoryThread}`);
  }

  // Auto-populate working memory on first interaction (fetches from Feishu API)
  if (userId && memoryThread && dpaMomMemory) {
    await ensureWorkingMemoryInitialized(userId, dpaMomMemory, memoryThread);
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

    // Stream response
    const stream = await dpaMomInstance!.stream(messages, {
      memory: memoryConfig,
    });

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
  await initializeAgentAsync();
  return dpaMomInstance!;
}

/**
 * Get the agent instance if already initialized (sync, may return null)
 * Use getDpaMomAgentAsync for guaranteed initialization
 */
export function getDpaMomAgent(): Agent | null {
  return dpaMomInstance;
}
