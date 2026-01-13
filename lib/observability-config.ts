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
import { ArizeExporter } from "@mastra/arize";
import { Observability } from "@mastra/observability";
import { __internalGetDpaMomAgentAndMemoryAsync } from "./agents/dpa-mom-agent-factory";
import { okrAnalysisWorkflow } from "./workflows/okr-analysis-workflow";
import { documentTrackingWorkflow } from "./workflows/document-tracking-workflow";
import { documentReadWorkflow } from "./workflows/document-read-workflow";
import { dpaAssistantWorkflow } from "./workflows/dpa-assistant-workflow";
import { initializeWorkflows } from "./workflows";
import { getSharedStorage } from "./memory-factory";

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || "development";
const PHOENIX_ENDPOINT_RAW = process.env.PHOENIX_ENDPOINT;
// Dev convenience: default to local Phoenix only in development.
const PHOENIX_ENDPOINT =
  PHOENIX_ENDPOINT_RAW || (NODE_ENV === "development" ? "http://localhost:6006/v1/traces" : undefined);
const PHOENIX_API_KEY = process.env.PHOENIX_API_KEY; // Optional for local instances
const PHOENIX_PROJECT_NAME = process.env.PHOENIX_PROJECT_NAME || "feishu-assistant";
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
const observability = PHOENIX_ENDPOINT
  ? new Observability({
      configs: {
        arize: {
          serviceName: PHOENIX_PROJECT_NAME,
          exporters: [
            new ArizeExporter({
              endpoint: PHOENIX_ENDPOINT,
              apiKey: PHOENIX_API_KEY, // Optional for local instances
              projectName: PHOENIX_PROJECT_NAME,
            }),
          ],
        },
      },
    } as any)
  : new Observability({} as any);

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

let mastraInstance: Mastra | null = null;
let mastraInitPromise: Promise<Mastra> | null = null;

/**
 * Async Mastra initializer.
 *
 * IMPORTANT: Single-agent architecture - only `dpa_mom` is registered.
 * All OKR, GitLab, and other capabilities are tools on the unified agent.
 * 
 * Registered agents:
 * - dpa_mom: The unified agent (chief-of-staff with all tools)
 */
export async function getMastraAsync(): Promise<Mastra> {
  if (mastraInstance) return mastraInstance;
  if (!mastraInitPromise) {
    mastraInitPromise = (async () => {
      // Initialize workflow registry for skill-based routing (idempotent)
      initializeWorkflows();

      const { agent: dpaMom } = await __internalGetDpaMomAgentAndMemoryAsync();

      console.log(`✅ [Mastra] Registering agent: dpa_mom`);

      const mastra = new Mastra({
        agents: { dpa_mom: dpaMom },
        workflows: registeredWorkflows,
        observability,
        storage: storage || undefined,
        server: {
          port: Number(process.env.PORT) || 3000,
        },
      } as any);

      mastraInstance = mastra;
      return mastra;
    })();
  }

  return await mastraInitPromise;
}

/**
 * Sync getter (may return null if not initialized).
 */
export function getMastra(): Mastra | null {
  return mastraInstance;
}

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
    phoenixEndpointRaw: PHOENIX_ENDPOINT_RAW,
    projectName: PHOENIX_PROJECT_NAME,
    environment: NODE_ENV,
    logLevel: LOG_LEVEL,
  };
}

// Export observability instance if needed elsewhere
export { observability };
