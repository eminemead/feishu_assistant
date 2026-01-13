/**
 * DPA Mom Agent Factory
 *
 * Single source of truth for creating the real production `dpa_mom` Agent instance.
 * This is used by Mastra registry initialization so observability hooks apply.
 */

import { Agent } from "@mastra/core/agent";
import type { Memory } from "@mastra/memory";

import {
  createAgentMemoryAsync,
} from "../memory-factory";
import { inputProcessors } from "../memory-processors";
import { getMastraModelSingle } from "../shared/model-router";
import { hasInternalModel, getInternalModelInfo } from "../shared/internal-model";

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

let dpaMomAgentInstance: Agent | null = null;
let dpaMomMemoryInstance: Memory | null = null;
let initPromise: Promise<{ agent: Agent; memory: Memory | null }> | null = null;

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
- **feedback-collection**: Summarize user feedback and create issues (e.g., "总结 @xxx 的反馈")

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
You have a persistent user profile via the updateWorkingMemory tool. Use it to remember user preferences across conversations.

**WHEN TO UPDATE**: Call updateWorkingMemory when you learn:
- User's name, role, or team (e.g., "I'm Ian, lead of DPA team")
- Analysis preferences (e.g., "我喜欢看图表" → Chart Preference: chart)
- OKR focus areas (e.g., "我主要看乐道的数据" → Focus Brands: 乐道)
- Language preference (if user consistently uses Chinese or English)

**HOW TO UPDATE**: Call updateWorkingMemory with the FULL template, updating only the relevant fields:
\`\`\`
# 用户画像 (User Profile)
## 身份信息 (Identity)
- **姓名/Name**: Ian          ← updated
- **角色/Role**: lead         ← updated
...rest of template unchanged...
\`\`\`

**DON'T**: Store query results, tool outputs, or temporary data in working memory.`;
}

async function createDpaMomAgentInternalAsync(): Promise<{
  agent: Agent;
  memory: Memory | null;
}> {
  // Log internal model availability
  if (hasInternalModel()) {
    console.log(
      `✅ [DpaMom] Internal fallback model available: ${getInternalModelInfo()}`,
    );
  }

  // Create tool instances (production mode: true)
  const gitlabCliTool = createGitLabCliTool(true);
  const feishuChatHistoryTool = createFeishuChatHistoryTool(true);
  const feishuDocsTool = createFeishuDocsTool(true);
  const mgrOkrReviewTool = createOkrReviewTool(true, true, 60 * 60 * 1000);
  const executeWorkflowTool = createExecuteWorkflowTool();

  // Create native Mastra memory (async init; may be null if storage unavailable)
  const memory = await createAgentMemoryAsync({
    lastMessages: 20,
    enableWorkingMemory: true,
    enableSemanticRecall: true,
  });

  if (memory) {
    console.log(`✅ [DpaMom] Memory created with working memory enabled`);
  } else {
    console.warn(`⚠️ [DpaMom] Memory creation failed - agent will run without memory`);
  }

  // Single model - Mastra Agent expects single model
  const model = getMastraModelSingle(true); // requireTools=true

  const agent = new Agent({
    id: "dpa_mom",
    name: "DPA Mom",
    instructions: getSystemPrompt(),
    model,
    memory: memory ?? undefined,
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

  console.log(
    `✅ [DpaMom] Agent created (8 tools + ${inputProcessors.length} processors)`,
  );

  return { agent, memory };
}

/**
 * Create or return the singleton production DPA Mom agent.
 */
/**
 * INTERNAL: use `getMastraAsync().getAgent("dpa_mom")` in app code.
 * Exported only so Mastra registry can register the real agent instance.
 */
export async function __internalGetDpaMomAgentAndMemoryAsync(): Promise<{
  agent: Agent;
  memory: Memory | null;
}> {
  if (dpaMomAgentInstance) {
    return { agent: dpaMomAgentInstance, memory: dpaMomMemoryInstance };
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const { agent, memory } = await createDpaMomAgentInternalAsync();
        dpaMomAgentInstance = agent;
        dpaMomMemoryInstance = memory;
        return { agent, memory };
      } catch (err) {
        // Allow retry on the next call (don't pin a rejected promise forever)
        initPromise = null;
        throw err;
      }
    })();
  }

  return await initPromise;
}

/**
 * INTERNAL: used by request handlers to initialize working memory.
 */
export function __internalGetDpaMomMemory(): Memory | null {
  return dpaMomMemoryInstance;
}

