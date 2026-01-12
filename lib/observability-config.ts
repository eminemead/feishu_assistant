/**
 * Mastra Observability Configuration
 * 
 * Configures Arize Phoenix (OSS) for AI tracing and PinoLogger for structured logging.
 * 
 * This module initializes Mastra with observability enabled, allowing all agents
 * and workflows to be automatically traced and logged.
 * 
 * ARCHITECTURE: Single unified agent (dpa_mom) replaces multi-agent routing.
 */

import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { ArizeExporter } from "@mastra/arize";
import { Observability } from "@mastra/observability";
// Note: Production uses dpaMomAgent() from ./agents/dpa-mom-agent.ts with full async memory
import { okrAnalysisWorkflow } from "./workflows/okr-analysis-workflow";
import { documentTrackingWorkflow } from "./workflows/document-tracking-workflow";
import { documentReadWorkflow } from "./workflows/document-read-workflow";
import { dpaAssistantWorkflow } from "./workflows/dpa-assistant-workflow";
import { initializeWorkflows } from "./workflows";
import { getSharedStorage } from "./memory-factory";
import { getMastraModelSingle } from "./shared/model-router";
import { 
  createGitLabCliTool, 
  createFeishuChatHistoryTool, 
  createFeishuDocsTool,
  createOkrReviewTool,
  chartGenerationTool,
  createExecuteWorkflowTool,
} from "./tools";

// Environment configuration
const PHOENIX_ENDPOINT = process.env.PHOENIX_ENDPOINT || "http://localhost:6006/v1/traces";
const PHOENIX_API_KEY = process.env.PHOENIX_API_KEY; // Optional for local instances
const PHOENIX_PROJECT_NAME = process.env.PHOENIX_PROJECT_NAME || "feishu-assistant";
const NODE_ENV = process.env.NODE_ENV || "development";
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === "production" ? "info" : "debug");

/**
 * Initialize Arize Phoenix exporter for AI tracing
 * 
 * Phoenix is an open-source observability platform for LLM applications.
 * It provides:
 * - Automatic token counting and cost tracking
 * - Full trace visualization
 * - Model performance analytics
 * - Production-ready monitoring
 */
const phoenixExporter = new ArizeExporter({
  endpoint: PHOENIX_ENDPOINT,
  apiKey: PHOENIX_API_KEY, // Optional for local instances
  projectName: PHOENIX_PROJECT_NAME,
});

// Observability instance (new Mastra API)
const observability = new Observability({
  configs: {
    arize: {
      serviceName: PHOENIX_PROJECT_NAME,
      exporters: [phoenixExporter],
    },
  },
} as any);

/**
 * Create DPA Mom agent for Mastra Studio
 * 
 * This is a sync version without memory (for Studio exploration).
 * Production uses dpaMomAgent() from dpa-mom-agent.ts with full async memory.
 */
function createDpaMomAgentForStudio(): Agent {
  const model = getMastraModelSingle(true); // requireTools=true
  
  return new Agent({
    id: "dpa_mom",
    name: "DPA Mom",
    instructions: `You are a Feishu/Lark AI assistant that helps users with OKR analysis, team coordination, and data operations.

IDENTITY:
- You are dpa_mom, the caring chief-of-staff for the DPA (Data Product & Analytics) team
- Ian is the team lead; you support both Ian and every team member
- Be warm, professional, and proactive

AVAILABLE TOOLS:
1. gitlab_cli: GitLab operations (issues, MRs, CI/CD)
2. feishu_chat_history: Search Feishu group chat histories
3. feishu_docs: Read Feishu documents
4. mgr_okr_review: Fetch OKR metrics data
5. chart_generation: Generate Mermaid/Vega-Lite charts
6. execute_workflow: Execute deterministic workflows

Current date: ${new Date().toISOString().split("T")[0]}`,
    model,
    tools: {
      gitlab_cli: createGitLabCliTool(false),
      feishu_chat_history: createFeishuChatHistoryTool(false),
      feishu_docs: createFeishuDocsTool(false),
      mgr_okr_review: createOkrReviewTool(false, true, 60 * 60 * 1000),
      chart_generation: chartGenerationTool,
      execute_workflow: createExecuteWorkflowTool(),
    },
  });
}

/**
 * Registered agents for Mastra Studio
 * Agent is created synchronously for Studio exploration
 */
const registeredAgents: Record<string, Agent> = {
  dpa_mom: createDpaMomAgentForStudio(),
};

/**
 * Registered workflows for Mastra instance
 * These enable deterministic skill execution with full observability
 */
const registeredWorkflows = {
  okrAnalysis: okrAnalysisWorkflow,
  documentTracking: documentTrackingWorkflow,
  documentRead: documentReadWorkflow,
  dpaAssistant: dpaAssistantWorkflow,
};

// Initialize shared storage for Mastra memory (Supabase PostgreSQL)
const storage = getSharedStorage();
if (storage) {
  console.log('✅ [Mastra] Storage configured for memory persistence');
} else {
  console.warn('⚠️ [Mastra] No storage configured - memory will not persist');
}

export const mastra = new Mastra({
  agents: registeredAgents,
  workflows: registeredWorkflows,
  observability,
  storage: storage || undefined,
  server: {
    port: Number(process.env.PORT) || 3000,
  },
} as any);

// Initialize workflow registry for skill-based routing
initializeWorkflows();

/**
 * Check if observability is properly configured
 */
export function isObservabilityEnabled(): boolean {
  return !!PHOENIX_ENDPOINT;
}

/**
 * Get observability configuration status
 */
export function getObservabilityStatus() {
  return {
    enabled: isObservabilityEnabled(),
    phoenixEndpoint: PHOENIX_ENDPOINT,
    projectName: PHOENIX_PROJECT_NAME,
    environment: NODE_ENV,
    logLevel: LOG_LEVEL,
  };
}

// Export observability instance if needed elsewhere
export { observability };
