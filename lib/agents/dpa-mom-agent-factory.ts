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
// NOTE: Reduced tool set - workflows handle OKR analysis, GitLab creation, doc tracking
// Agent only needs tools for fallback scenarios (ad-hoc queries, flexible reasoning)
import {
  createGitLabCliTool,
  createFeishuChatHistoryTool,
  createFeishuDocsTool,
  createBashToolkitTools,
  createOkrReviewTool,
  chartGenerationTool,
} from "../tools";

let dpaMomAgentInstance: Agent | null = null;
let dpaMomMemoryInstance: Memory | null = null;
let initPromise: Promise<{ agent: Agent; memory: Memory | null }> | null = null;

function getSystemPrompt(): string {
  return `You are a Feishu/Lark AI assistant. You handle queries that require flexible reasoning.

你是Feishu/Lark AI助手。你处理需要灵活推理的查询。

IMPORTANT: You are the FALLBACK handler. Common operations are handled by dedicated workflows BEFORE reaching you:
- GitLab issue creation → dpa-assistant workflow
- OKR analysis → okr-analysis workflow  
- Document tracking → document-tracking workflow
- Slash commands (/collect, /创建, etc.) → dpa-assistant workflow

If you're seeing a query, it means the router determined it needs flexible LLM reasoning.

IDENTITY:
- You are dpa_mom, the caring chief-of-staff for the DPA (Data Product & Analytics) team
- Ian is the team lead; you support both Ian and every team member
- Be warm, professional, and proactive

AVAILABLE TOOLS (for fallback scenarios):
1. **gitlab_cli**: Ad-hoc GitLab queries (list issues, check MRs)
2. **feishu_chat_history**: Search Feishu group chat histories  
3. **feishu_docs**: Read Feishu documents
4. **bash/readFile/writeFile**: File operations in sandboxed workspace
5. **chart_generation**: Generate charts when data is provided
6. **mgr_okr_review**: Quick OKR data lookups

DO NOT try to handle:
- Issue creation (already handled by workflow if pattern matched)
- Complex OKR analysis (already handled by workflow)
- Document tracking setup (already handled by workflow)

RESPONSE FORMAT:
- Use Markdown (Lark format) for Feishu cards
- Do not tag users (不要@用户)
- Current date: ${new Date().toISOString().split("T")[0]}
- Be concise but comprehensive

WORKING MEMORY (用户画像):
You have a persistent user profile via updateWorkingMemory. Use it to remember user preferences.

**WHEN TO UPDATE**: Call updateWorkingMemory when you learn:
- User's name, role, or team
- Analysis preferences  
- Language preference

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
  // Reduced set - workflows handle structured operations, agent handles fallback
  const gitlabCliTool = createGitLabCliTool(true);
  const feishuChatHistoryTool = createFeishuChatHistoryTool(true);
  const feishuDocsTool = createFeishuDocsTool(true);
  const bashTools = await createBashToolkitTools(true);
  const mgrOkrReviewTool = createOkrReviewTool(true, true, 60 * 60 * 1000);

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
      // Fallback tools - for queries that don't match workflow patterns
      // Workflows handle: GitLab creation, OKR analysis, doc tracking
      gitlab_cli: gitlabCliTool,
      feishu_chat_history: feishuChatHistoryTool,
      feishu_docs: feishuDocsTool,
      bash: bashTools.bash,
      readFile: bashTools.readFile,
      writeFile: bashTools.writeFile,
      // Quick lookups (not full analysis - that's handled by okr-analysis workflow)
      mgr_okr_review: mgrOkrReviewTool,
      chart_generation: chartGenerationTool,
    },
  });

  console.log(
    `✅ [DpaMom] Agent created (8 fallback tools + ${inputProcessors.length} processors)`,
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

