/**
 * Mastra Observability Configuration
 * 
 * Configures Arize Phoenix (OSS) for AI tracing and PinoLogger for structured logging.
 * 
 * This module initializes Mastra with observability enabled, allowing all agents
 * and workflows to be automatically traced and logged.
 * 
 * ARCHITECTURE: Single unified agent (feishu_assistant) replaces multi-agent routing.
 */

import { Mastra } from "@mastra/core";
import { ArizeExporter } from "@mastra/arize";
import { Observability } from "@mastra/observability";
import { getFeishuAssistantAgent } from "./agents/feishu-assistant-agent";
import { okrAnalysisWorkflow } from "./workflows/okr-analysis-workflow";
import { documentTrackingWorkflow } from "./workflows/document-tracking-workflow";
import { documentReadWorkflow } from "./workflows/document-read-workflow";
import { dpaAssistantWorkflow } from "./workflows/dpa-assistant-workflow";
import { initializeWorkflows } from "./workflows";
import { getSharedStorage } from "./memory-factory";

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
 * Initialize Mastra instance with observability enabled.
 * Single unified agent handles all queries with tool selection.
 */
const registeredAgents = {
  feishuAssistant: getFeishuAssistantAgent(),
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
