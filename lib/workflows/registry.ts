/**
 * Workflow Registry - Centralized workflow management
 * 
 * Provides:
 * - Workflow registration by ID
 * - Workflow discovery and lookup
 * - Integration with skill router
 * - Execution helpers with streaming support
 */

import type { RegisteredWorkflow, WorkflowMetadata, WorkflowExecutionContext, WorkflowRunnerOptions } from "./types";

/**
 * Workflow registry singleton
 */
class WorkflowRegistry {
  private workflows: Map<string, RegisteredWorkflow> = new Map();
  private initialized = false;

  /**
   * Register a workflow with metadata
   */
  register(registration: RegisteredWorkflow): void {
    const { metadata } = registration;
    
    if (this.workflows.has(metadata.id)) {
      console.warn(`[WorkflowRegistry] Overwriting existing workflow: ${metadata.id}`);
    }
    
    this.workflows.set(metadata.id, registration);
    console.log(`[WorkflowRegistry] Registered workflow: ${metadata.id}`);
  }

  /**
   * Get a workflow by ID
   */
  get(workflowId: string): RegisteredWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Check if a workflow exists
   */
  has(workflowId: string): boolean {
    return this.workflows.has(workflowId);
  }

  /**
   * Get all registered workflows
   */
  getAll(): RegisteredWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get all workflow IDs
   */
  getIds(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Find workflows by tag
   */
  findByTag(tag: string): RegisteredWorkflow[] {
    return this.getAll().filter(w => w.metadata.tags?.includes(tag));
  }

  /**
   * Execute a workflow by ID
   */
  async execute<TInput, TOutput>(
    workflowId: string,
    input: TInput,
    _context?: WorkflowExecutionContext,
    _options?: WorkflowRunnerOptions
  ): Promise<TOutput> {
    const registration = this.get(workflowId);
    
    if (!registration) {
      throw new Error(`[WorkflowRegistry] Workflow not found: ${workflowId}`);
    }
    
    console.log(`[WorkflowRegistry] Executing workflow: ${workflowId}`);
    const startTime = Date.now();
    
    try {
      const result = await registration.workflow.run(input as Record<string, unknown>);
      const durationMs = Date.now() - startTime;
      
      console.log(`[WorkflowRegistry] Workflow ${workflowId} completed in ${durationMs}ms`);
      
      return result as TOutput;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      console.error(`[WorkflowRegistry] Workflow ${workflowId} failed after ${durationMs}ms:`, error);
      throw error;
    }
  }

  /**
   * Stream a workflow execution (for workflows that support streaming)
   */
  async *stream<TInput>(
    workflowId: string,
    input: TInput,
    _context?: WorkflowExecutionContext,
    _options?: WorkflowRunnerOptions
  ): AsyncGenerator<{ type: "step" | "text" | "done"; data: unknown }> {
    const registration = this.get(workflowId);
    
    if (!registration) {
      throw new Error(`[WorkflowRegistry] Workflow not found: ${workflowId}`);
    }
    
    if (!registration.metadata.supportsStreaming) {
      // For non-streaming workflows, execute normally and yield final result
      const result = await registration.workflow.run(input as Record<string, unknown>);
      yield { type: "done", data: result };
      return;
    }
    
    // For streaming workflows, use createRun pattern
    // Note: Full streaming implementation depends on Mastra's workflow streaming API
    console.log(`[WorkflowRegistry] Starting streaming workflow: ${workflowId}`);
    
    // Execute workflow and yield result
    // TODO: Implement proper streaming when integrated with createRun
    const result = await registration.workflow.run(input as Record<string, unknown>);
    yield { type: "done", data: result };
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.workflows.clear();
    this.initialized = false;
  }

  /**
   * Mark registry as initialized
   */
  setInitialized(): void {
    this.initialized = true;
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get summary of registered workflows
   */
  getSummary(): { id: string; name: string; tags?: string[] }[] {
    return this.getAll().map(w => ({
      id: w.metadata.id,
      name: w.metadata.name,
      tags: w.metadata.tags,
    }));
  }
}

// Singleton instance
let registryInstance: WorkflowRegistry | null = null;

/**
 * Get or create the global workflow registry
 */
export function getWorkflowRegistry(): WorkflowRegistry {
  if (!registryInstance) {
    registryInstance = new WorkflowRegistry();
  }
  return registryInstance;
}

/**
 * Helper to register a workflow (shorthand)
 */
export function registerWorkflow(
  metadata: WorkflowMetadata,
  workflow: RegisteredWorkflow["workflow"]
): void {
  getWorkflowRegistry().register({ metadata, workflow });
}

/**
 * Helper to execute a workflow (shorthand)
 */
export async function executeWorkflow<TInput, TOutput>(
  workflowId: string,
  input: TInput,
  context?: WorkflowExecutionContext,
  options?: WorkflowRunnerOptions
): Promise<TOutput> {
  return getWorkflowRegistry().execute<TInput, TOutput>(workflowId, input, context, options);
}

export { WorkflowRegistry };

