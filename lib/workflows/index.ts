/**
 * Workflows Module - Mastra Workflow Integration
 * 
 * Provides deterministic workflow execution for skills.
 * Workflows replace non-deterministic subagent routing with
 * explicit step-by-step pipelines.
 * 
 * Usage:
 * 1. Define workflow in lib/workflows/
 * 2. Register in initializeWorkflows()
 * 3. Reference by workflowId in SKILL.md
 * 4. Router executes workflow instead of delegating to agent
 */

// Types
export * from "./types";

// Registry
export { 
  getWorkflowRegistry, 
  registerWorkflow, 
  executeWorkflow,
  WorkflowRegistry,
} from "./registry";

// Execution helper
export {
  executeSkillWorkflow,
  isWorkflowAvailable,
  getAvailableWorkflows,
  getWorkflowInfo,
  type ExecuteWorkflowOptions,
  type WorkflowExecutionResult,
} from "./execute-workflow";

// Workflows
export { okrAnalysisWorkflow } from "./okr-analysis-workflow";
export { documentTrackingWorkflow, runDocumentTrackingWorkflow } from "./document-tracking-workflow";
export { dpaAssistantWorkflow, runDpaAssistantWorkflow } from "./dpa-assistant-workflow";
// Note: manager-routing-workflow is deprecated, see skill-based-router.ts

import { getWorkflowRegistry, registerWorkflow } from "./registry";
import { okrAnalysisWorkflow } from "./okr-analysis-workflow";
import { documentTrackingWorkflow } from "./document-tracking-workflow";
import { dpaAssistantWorkflow } from "./dpa-assistant-workflow";

/**
 * Initialize and register all workflows
 * 
 * Call this during app startup to register workflows with the registry.
 * This enables:
 * - Workflow discovery by ID
 * - Integration with skill router
 * - Mastra observability
 */
export function initializeWorkflows(): void {
  const registry = getWorkflowRegistry();
  
  if (registry.isInitialized()) {
    console.log("[Workflows] Already initialized, skipping");
    return;
  }

  // Register OKR Analysis Workflow
  registerWorkflow(
    {
      id: "okr-analysis",
      name: "OKR Analysis",
      description: "Complete OKR analysis with data query, charts, and insights",
      tags: ["okr", "analytics", "visualization"],
      supportsStreaming: true,
      estimatedDurationSec: 10,
    },
    okrAnalysisWorkflow
  );

  // Register Document Tracking Workflow
  registerWorkflow(
    {
      id: "document-tracking",
      name: "Document Tracking",
      description: "Poll Feishu doc, detect changes, persist, and notify",
      tags: ["document", "tracking", "notification"],
      supportsStreaming: false,
      estimatedDurationSec: 3,
    },
    documentTrackingWorkflow
  );

  // Register DPA Assistant Workflow
  registerWorkflow(
    {
      id: "dpa-assistant",
      name: "DPA Assistant",
      description: "DPA team assistant with intent-based routing for GitLab, chat, docs, and general conversation",
      tags: ["dpa", "gitlab", "feishu", "assistant"],
      supportsStreaming: false,
      estimatedDurationSec: 5,
    },
    dpaAssistantWorkflow
  );

  registry.setInitialized();
  console.log(`[Workflows] Initialized ${registry.getIds().length} workflows: ${registry.getIds().join(", ")}`);
}

/**
 * Get workflow for skill execution
 * 
 * Used by the skill router to find and execute workflows by ID.
 */
export function getWorkflowForSkill(workflowId: string) {
  return getWorkflowRegistry().get(workflowId);
}

