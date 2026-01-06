/**
 * Workflow Types for Mastra Workflows Integration
 * 
 * Defines type-safe interfaces for workflow-based skill execution.
 * Workflows provide deterministic multi-step pipelines with:
 * - Explicit step ordering (.then, .branch, .parallel)
 * - Different models per step
 * - Type-safe input/output schemas
 * - Streaming support via writer
 */

import { z } from "zod";

// Import Workflow type from Mastra
// Note: Mastra workflows use createRun() + start() pattern
// We use a flexible type to accommodate Mastra's complex generic types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowLike = any;

/**
 * Workflow execution context passed to steps
 */
export interface WorkflowExecutionContext {
  /** User ID for RLS and personalization */
  userId?: string;
  /** Chat ID for notifications */
  chatId?: string;
  /** Root message ID for threading */
  rootId?: string;
  /** Message ID being responded to */
  messageId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Workflow step result with streaming support
 */
export interface WorkflowStepResult<T = unknown> {
  /** Step output data */
  data: T;
  /** Whether the step streamed output */
  streamed?: boolean;
  /** Tokens used by this step (for LLM steps) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult<T = unknown> {
  /** Final workflow output */
  output: T;
  /** Workflow execution ID */
  executionId?: string;
  /** Total execution time in ms */
  durationMs?: number;
  /** Aggregate token usage */
  totalUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Step-by-step results for debugging */
  steps?: Array<{
    stepId: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Workflow metadata for registration and discovery
 */
export interface WorkflowMetadata {
  /** Unique workflow ID (matches workflowId in SKILL.md) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the workflow does */
  description: string;
  /** Tags for categorization */
  tags?: string[];
  /** Input schema for validation */
  inputSchema?: z.ZodType<unknown>;
  /** Output schema for validation */
  outputSchema?: z.ZodType<unknown>;
  /** Whether workflow supports streaming */
  supportsStreaming?: boolean;
  /** Estimated execution time in seconds */
  estimatedDurationSec?: number;
}

/**
 * Registered workflow with metadata
 */
export interface RegisteredWorkflow {
  /** Workflow metadata */
  metadata: WorkflowMetadata;
  /** The actual Mastra workflow instance */
  workflow: WorkflowLike;
}

/**
 * Skill routing configuration with workflow support
 */
export interface SkillRoutingConfig {
  /** Skill identifier */
  skillId: string;
  /** Routing keywords */
  keywords: string[];
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether skill is enabled */
  enabled: boolean;
  /** 
   * Routing type:
   * - "workflow": Execute via Mastra workflow (deterministic)
   * - "skill": Inject instructions into manager (deprecated)
   */
  type: "workflow" | "skill";
  /** Workflow ID to execute (required when type="workflow") */
  workflowId?: string;
  agentName?: string;
}

/**
 * Workflow runner options
 */
export interface WorkflowRunnerOptions {
  /** Enable streaming output */
  streaming?: boolean;
  /** Execution timeout in ms */
  timeoutMs?: number;
  /** Retry failed steps */
  retryOnFailure?: boolean;
  /** Maximum retries per step */
  maxRetries?: number;
}

/**
 * Common workflow input schema (base for all skill workflows)
 */
export const baseWorkflowInputSchema = z.object({
  query: z.string().describe("User's original query"),
  userId: z.string().optional().describe("User ID for RLS"),
  chatId: z.string().optional().describe("Chat ID for responses"),
  messageId: z.string().optional().describe("Message ID for threading"),
  context: z.record(z.unknown()).optional().describe("Additional context"),
});

export type BaseWorkflowInput = z.infer<typeof baseWorkflowInputSchema>;

/**
 * Common workflow output schema (base for all skill workflows)
 */
export const baseWorkflowOutputSchema = z.object({
  response: z.string().describe("Formatted response text"),
  metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
  artifacts: z.array(z.object({
    type: z.string(),
    content: z.string(),
    title: z.string().optional(),
  })).optional().describe("Generated artifacts (charts, tables, etc)"),
});

export type BaseWorkflowOutput = z.infer<typeof baseWorkflowOutputSchema>;

