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
  
  console.log(`[Workflow] Executing workflow: ${workflowId}`);
  
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
    context: options.context,
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
    
    // Execute workflow
    const result = await registration.workflow.run(input as Record<string, unknown>);
    
    // Extract response from result
    let response: string;
    let artifacts: Array<{ type: string; content: string; title?: string }> | undefined;
    
    if (typeof result === "string") {
      response = result;
    } else if (result && typeof result === "object") {
      const resultObj = result as Record<string, unknown>;
      // Handle different workflow output formats
      if ("response" in resultObj) {
        response = String(resultObj.response);
      } else if ("message" in resultObj) {
        response = String(resultObj.message);
      } else if ("text" in resultObj) {
        response = String(resultObj.text);
      } else {
        response = JSON.stringify(result, null, 2);
      }
      
      // Extract artifacts if present
      if ("artifacts" in resultObj && Array.isArray(resultObj.artifacts)) {
        artifacts = resultObj.artifacts;
      }
    } else {
      response = String(result);
    }
    
    const durationMs = Date.now() - startTime;
    console.log(`[Workflow] Completed ${workflowId} in ${durationMs}ms`);
    
    // Send final update
    if (options.onUpdate) {
      options.onUpdate(response);
    }
    
    return {
      response,
      success: true,
      durationMs,
      workflowId,
      artifacts,
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

