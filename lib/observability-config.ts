/**
 * Mastra Observability Configuration
 * 
 * Configures Arize Phoenix (OSS) for AI tracing and PinoLogger for structured logging.
 * 
 * This module initializes Mastra with observability enabled, allowing all agents
 * and workflows to be automatically traced and logged.
 */

import { Mastra } from "@mastra/core";
import { ArizeExporter } from "@mastra/arize";
import { Observability } from "@mastra/observability";
import { getManagerAgent } from "./agents/manager-agent-mastra";
import { getOkrReviewerAgent } from "./agents/okr-reviewer-agent";
import { getAlignmentAgent } from "./agents/alignment-agent";
import { getPnlAgent } from "./agents/pnl-agent";
import { getDpaMomAgent } from "./agents/dpa-mom-agent";

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
      logLevel: LOG_LEVEL as "debug" | "info" | "warn" | "error",
    },
  },
});

/**
 * Initialize Mastra instance with observability enabled and register all
 * production agents so Phoenix spans are emitted automatically.
 */
const registeredAgents = {
  manager: getManagerAgent(),
  okrReviewer: getOkrReviewerAgent(),
  alignment: getAlignmentAgent(),
  pnl: getPnlAgent(),
  dpaMom: getDpaMomAgent(),
};

export const mastra = new Mastra({
  name: "feishu-assistant",
  agents: registeredAgents,
  observability,
});

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
