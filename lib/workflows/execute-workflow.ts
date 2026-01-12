/**
 * Workflow Execution Helper
 * 
 * Provides a unified interface for executing skill workflows with:
 * - Streaming support for real-time updates
 * - Integration with manager agent patterns
 * - Error handling and fallback
 * - Observability tracking
 */

import { getWorkflowRegistry } from "./registry";
import type { WorkflowExecutionContext, BaseWorkflowInput, BaseWorkflowOutput } from "./types";
import { stripThinkingTags } from "../streaming/thinking-panel";

/**
 * Options for workflow execution
 */
export interface ExecuteWorkflowOptions {
  /** Query from user */
  query: string;
  /** User ID for RLS */
  userId?: string;
  /** Chat ID for threading */
  chatId?: string;
  /** Message ID for threading */
  messageId?: string;
  /** Root message ID for threading */
  rootId?: string;
  /** Callback for streaming updates */
  onUpdate?: (text: string) => void;
  /** Additional context to pass to workflow */
  context?: Record<string, unknown>;
  /** Linked GitLab issue if thread has one */
  linkedIssue?: {
    chatId: string;
    rootId: string;
    project: string;
    issueIid: number;
    issueUrl: string;
    createdBy: string;
  };
}

/**
 * Result from workflow execution
 */
export interface WorkflowExecutionResult {
  /** Final response text */
  response: string;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Workflow ID that was executed */
  workflowId: string;
  /** Generated artifacts (charts, tables, etc) */
  artifacts?: Array<{
    type: string;
    content: string;
    title?: string;
  }>;
  /** Whether confirmation buttons should be shown */
  needsConfirmation?: boolean;
  /** JSON data for confirmation button (passed to callback) */
  confirmationData?: string;
  /** Whether workflow should be skipped (handled by agent instead) */
  skipWorkflow?: boolean;
}

/**
 * Execute a skill workflow by ID
 * 
 * This is the main entry point for workflow-based skill execution.
 * Integrates with the manager agent pattern for streaming updates.
 * 
 * @example
 * ```ts
 * const result = await executeSkillWorkflow("okr-analysis", {
 *   query: "分析10月OKR指标",
 *   userId: "user123",
 *   onUpdate: (text) => updateCard(text),
 * });
 * ```
 */
export async function executeSkillWorkflow(
  workflowId: string,
  options: ExecuteWorkflowOptions
): Promise<WorkflowExecutionResult> {
  const startTime = Date.now();
  const registry = getWorkflowRegistry();
  
  console.log(`[Workflow] ============================================`);
  console.log(`[Workflow] Executing workflow: ${workflowId}`);
  console.log(`[Workflow] Query preview: "${options.query?.substring(0, 100)}..."`);
  console.log(`[Workflow] Context: userId="${options.userId}", chatId="${options.chatId}", rootId="${options.rootId}"`);
  console.log(`[Workflow] LinkedIssue: ${options.linkedIssue ? `#${options.linkedIssue.issueIid}` : 'none'}`);
  console.log(`[Workflow] ============================================`);
  
  // Check if workflow exists
  const registration = registry.get(workflowId);
  if (!registration) {
    const error = `Workflow not found: ${workflowId}`;
    console.error(`[Workflow] ${error}`);
    return {
      response: `抱歉，无法执行请求的工作流: ${workflowId}`,
      success: false,
      error,
      durationMs: Date.now() - startTime,
      workflowId,
    };
  }
  
  // Build workflow input
  const input: BaseWorkflowInput = {
    query: options.query,
    userId: options.userId,
    chatId: options.chatId,
    messageId: options.messageId,
    rootId: options.rootId,
    context: options.context,
    linkedIssue: options.linkedIssue,
  };
  
  // For OKR analysis, extract period from query
  if (workflowId === "okr-analysis") {
    const periodMatch = options.query.match(/(\d+)\s*月/);
    const period = periodMatch ? `${periodMatch[1]} 月` : "10 月"; // Default to October
    (input as Record<string, unknown>).period = period;
    (input as Record<string, unknown>).userId = options.userId;
  }
  
  try {
    // Send initial update if callback provided
    if (options.onUpdate) {
      options.onUpdate(`⏳ 正在执行工作流: ${registration.metadata.name}...`);
    }
    
    // Execute workflow using createRun + start pattern
    const run = await registration.workflow.createRun();
    const result = await run.start({ inputData: input as Record<string, unknown> });
    
    // Extract response from result
    let response: string;
    let artifacts: Array<{ type: string; content: string; title?: string }> | undefined;
    let needsConfirmation: boolean | undefined;
    let confirmationData: string | undefined;
    
    if (typeof result === "string") {
      response = result;
    } else if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      
      // DEBUG: Log raw Mastra result structure
      console.log(`[Workflow] DEBUG Raw result keys:`, Object.keys(resultObj));
      console.log(`[Workflow] DEBUG Result structure:`, JSON.stringify(resultObj, null, 2).substring(0, 2000));
      
      // Mastra workflows return { status, steps: { "step-id": { status, output: {...} } } }
      // Step results have output nested inside .output property
      let outputData: Record<string, unknown> | undefined;
      
      if ("steps" in resultObj && typeof resultObj.steps === "object") {
        const steps = resultObj.steps as Record<string, unknown>;
        // Look for format-response step (DPA workflow) or any step with response
        const formatStep = steps["format-response"] as Record<string, unknown> | undefined;
        if (formatStep) {
          // Mastra step results wrap actual data in .output property
          outputData = (formatStep.output as Record<string, unknown>) || formatStep;
          console.log(`[Workflow] Extracted format-response step:`, {
            hasOutput: "output" in formatStep,
            keys: Object.keys(outputData || {}),
            needsConfirmation: outputData?.needsConfirmation,
            hasConfirmationData: !!outputData?.confirmationData,
          });
        } else {
          // Fallback: find any step with a 'response' field
          for (const [stepId, stepResult] of Object.entries(steps)) {
            if (stepResult && typeof stepResult === "object") {
              const stepObj = stepResult as Record<string, unknown>;
              // Check .output first, then step itself
              const stepOutput = (stepObj.output as Record<string, unknown>) || stepObj;
              if ("response" in stepOutput) {
                outputData = stepOutput;
                console.log(`[Workflow] Found response in step ${stepId}`);
                break;
              }
            }
          }
        }
      }
      
      // Use extracted output or fall back to top-level result
      const dataSource = outputData || resultObj;
      
      // Handle different workflow output formats
      if ("response" in dataSource) {
        response = String(dataSource.response);
      } else if ("message" in dataSource) {
        response = String(dataSource.message);
      } else if ("text" in dataSource) {
        response = String(dataSource.text);
      } else {
        response = JSON.stringify(result, null, 2);
      }
      
      // Extract artifacts if present
      if ("artifacts" in dataSource && Array.isArray(dataSource.artifacts)) {
        artifacts = dataSource.artifacts;
      }
      
      // Extract confirmation data if present
      if ("needsConfirmation" in dataSource && dataSource.needsConfirmation) {
        needsConfirmation = true;
        confirmationData = dataSource.confirmationData as string | undefined;
        console.log(`[Workflow] Workflow requires confirmation`);
      }
      
      // Check for skip workflow signal (general_chat should be handled by agent)
      // Skip signal can be in outputData (from step output) or resultObj (top-level)
      const hasSkipSignal = 
        (outputData && "skipWorkflow" in outputData && outputData.skipWorkflow) ||
        ("skipWorkflow" in resultObj && resultObj.skipWorkflow);
      
      if (hasSkipSignal) {
        console.log(`[Workflow] Skip signal detected, returning to manager for agent handling`);
        return {
          response: "",
          success: false,
          error: "SKIP_WORKFLOW",
          durationMs: Date.now() - startTime,
          workflowId,
          skipWorkflow: true,
        };
      }
    } else {
      response = String(result);
    }

    // Hide model thinking tags in workflow outputs (user-facing Feishu cards)
    // Workflows do not go through the agent streaming sanitizer, so we normalize here.
    response = stripThinkingTags(response).text;
    
    const durationMs = Date.now() - startTime;
    console.log(`[Workflow] Completed ${workflowId} in ${durationMs}ms`);
    console.log(`[Workflow] Final response (${response.length} chars): "${response.substring(0, 200)}..."`);
    
    // Send final update
    if (options.onUpdate) {
      console.log(`[Workflow] Calling onUpdate with final response...`);
      options.onUpdate(response);
      console.log(`[Workflow] onUpdate called successfully`);
    } else {
      console.warn(`[Workflow] No onUpdate callback provided, card will not be updated`);
    }
    
    return {
      response,
      success: true,
      durationMs,
      workflowId,
      artifacts,
      needsConfirmation,
      confirmationData,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`[Workflow] Error executing ${workflowId}:`, error);
    
    // Send error update
    if (options.onUpdate) {
      options.onUpdate(`❌ 工作流执行失败: ${errorMessage}`);
    }
    
    return {
      response: `抱歉，执行工作流时出错: ${errorMessage}`,
      success: false,
      error: errorMessage,
      durationMs,
      workflowId,
    };
  }
}

/**
 * Check if a workflow is available for execution
 */
export function isWorkflowAvailable(workflowId: string): boolean {
  return getWorkflowRegistry().has(workflowId);
}

/**
 * Get list of available workflow IDs
 */
export function getAvailableWorkflows(): string[] {
  return getWorkflowRegistry().getIds();
}

/**
 * Get workflow metadata by ID
 */
export function getWorkflowInfo(workflowId: string) {
  const registration = getWorkflowRegistry().get(workflowId);
  if (!registration) {
    return null;
  }
  return registration.metadata;
}

