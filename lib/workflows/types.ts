/**
 * Workflow Types for Mastra Workflows Integration
 * 
 * Defines type-safe interfaces for workflow-based skill execution.
 * Workflows provide deterministic multi-step pipelines with:
 * - Explicit step ordering (.then, .branch, .parallel)
 * - Different models per step
 * - Type-safe input/output schemas
 * - Streaming support via writer
 * 
 * ## Direct Tool Execution Pattern
 * 
 * Workflows sometimes need to call tools directly for deterministic control flow.
 * This is an accepted pattern when you need explicit step-by-step execution
 * rather than agent-driven tool selection.
 * 
 * ```typescript
 * // Import result types for proper typing
 * import { GitLabCliResult, ChatHistoryResult, ChartResponse } from "../tools";
 * 
 * // Pattern: Cast execute and result
 * const result = await (gitlabTool.execute as any)({ command: "..." }) as GitLabCliResult;
 * ```
 * 
 * This pattern is necessary because:
 * 1. Mastra tool.execute has complex generic types
 * 2. We're calling tools outside agent context
 * 3. The `as any` is safe - runtime behavior is correct
 * 
 * Result types are exported from tools/index.ts for use in workflows.
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
 * Linked GitLab issue schema for thread-to-issue mapping
 */
export const linkedIssueSchema = z.object({
  chatId: z.string(),
  rootId: z.string(),
  project: z.string(),
  issueIid: z.number(),
  issueUrl: z.string(),
  createdBy: z.string(),
}).optional();

/**
 * Common workflow input schema (base for all skill workflows)
 */
export const baseWorkflowInputSchema = z.object({
  query: z.string().describe("User's original query"),
  userId: z.string().optional().describe("User ID for RLS"),
  chatId: z.string().optional().describe("Chat ID for responses"),
  messageId: z.string().optional().describe("Message ID for threading"),
  rootId: z.string().optional().describe("Root message ID for thread identification"),
  context: z.record(z.unknown()).optional().describe("Additional context"),
  linkedIssue: linkedIssueSchema.describe("Linked GitLab issue if thread has one"),
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

