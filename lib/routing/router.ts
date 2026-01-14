/**
 * Unified Router - Intent-First Query Routing
 *
 * Central routing layer that:
 * 1. Classifies intent (deterministic, <1ms)
 * 2. Routes to appropriate handler:
 *    - Workflows for multi-step operations
 *    - Direct tools for single-shot queries
 *    - Agent fallback for novel/complex queries
 *
 * This replaces scattered routing logic with a single entry point.
 */

import { CoreMessage } from "ai";
import { classifyIntent, ClassificationResult } from "./intent-classifier";
import { executeDirectTool, formatToolResult, DirectToolResult } from "./direct-tool-executor";
import { executeSkillWorkflow, type WorkflowExecutionResult } from "../workflows";
import { handleDocumentCommand } from "../handle-doc-commands";
import { SLASH_COMMANDS, HELP_COMMANDS } from "../workflows/dpa-assistant-workflow";
import { getLinkedIssue } from "../services/issue-thread-mapping-service";
import { devtoolsTracker } from "../devtools-integration";

/**
 * Router result - unified response format
 */
export interface RouterResult {
  /** Response text to display */
  response: string;
  /** How the query was routed */
  routedVia: "workflow" | "tool" | "agent" | "doc-command" | "slash-command";
  /** Classification result */
  classification: ClassificationResult;
  /** Workflow ID if routed to workflow */
  workflowId?: string;
  /** Tool ID if routed to tool */
  toolId?: string;
  /** Execution duration in ms */
  durationMs: number;
  /** Whether response needs confirmation buttons */
  needsConfirmation?: boolean;
  /** Confirmation data for buttons */
  confirmationData?: string;
  /** Reasoning/thinking from agent */
  reasoning?: string;
  /** Raw result for further processing */
  rawResult?: unknown;
}

/**
 * Router context - passed through to handlers
 */
export interface RouterContext {
  chatId?: string;
  rootId?: string;
  userId?: string;
  botUserId?: string;
  /** Callback for streaming updates */
  onUpdate?: (text: string) => Promise<void>;
}

/**
 * Route a query through the intent-first pipeline
 *
 * @param query - User query text (after bot mention removal)
 * @param messages - Full conversation history (for agent fallback)
 * @param context - Routing context (chat IDs, user ID, etc.)
 * @returns Router result with response and metadata
 */
export async function routeQuery(
  query: string,
  messages: CoreMessage[],
  context: RouterContext
): Promise<RouterResult> {
  const startTime = Date.now();

  // Step 1: Classify intent (deterministic, <1ms)
  const classification = classifyIntent(query);

  console.log(`[Router] ============================================`);
  console.log(`[Router] Query: "${query.substring(0, 80)}..."`);
  console.log(`[Router] Intent: ${classification.intent}`);
  console.log(`[Router] Target: ${JSON.stringify(classification.target)}`);
  console.log(`[Router] Confidence: ${classification.confidence}`);
  console.log(`[Router] ============================================`);

  // Track routing decision
  devtoolsTracker.trackAgentCall("Router", query, {
    intent: classification.intent,
    targetType: classification.target.type,
    confidence: classification.confidence,
  });

  // Step 2: Execute based on classification
  try {
    const result = await executeTarget(query, messages, context, classification);

    // Track successful routing
    devtoolsTracker.trackResponse("Router", result.response.substring(0, 200), result.durationMs, {
      routedVia: result.routedVia,
      intent: classification.intent,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Router] Execution failed:`, errorMsg);

    devtoolsTracker.trackError("Router", error instanceof Error ? error : new Error(errorMsg), {
      intent: classification.intent,
      targetType: classification.target.type,
    });

    return {
      response: `❌ Error: ${errorMsg}`,
      routedVia: "agent",
      classification,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute the classified target
 */
async function executeTarget(
  query: string,
  messages: CoreMessage[],
  context: RouterContext,
  classification: ClassificationResult
): Promise<RouterResult> {
  const startTime = Date.now();
  const { target } = classification;

  switch (target.type) {
    // ============================================================
    // Document Commands - existing handler
    // ============================================================
    case "doc-command": {
      console.log(`[Router] Executing doc command`);

      const handled = await handleDocumentCommand({
        message: query,
        chatId: context.chatId || "",
        userId: context.userId || "",
        botUserId: context.botUserId || "",
      });

      return {
        response: handled ? "✅ Command executed" : "❌ Command failed",
        routedVia: "doc-command",
        classification,
        durationMs: Date.now() - startTime,
      };
    }

    // ============================================================
    // Slash Commands - route to dpa-assistant workflow
    // ============================================================
    case "slash-command": {
      const slashCmd = target.command || extractSlashCommand(query);
      console.log(`[Router] Executing slash command: ${slashCmd}`);

      // Validate slash command
      const isKnown = slashCmd in SLASH_COMMANDS || HELP_COMMANDS.includes(slashCmd);
      if (!isKnown) {
        console.log(`[Router] Unknown slash command, falling back to agent`);
        return executeAgentFallback(query, messages, context, classification, startTime);
      }

      // Get linked issue for context
      const linkedIssue = context.chatId && context.rootId
        ? await getLinkedIssue(context.chatId, context.rootId)
        : null;

      // Execute workflow
      const workflowResult = await executeSkillWorkflow("dpa-assistant", {
        query,
        chatId: context.chatId,
        rootId: context.rootId,
        userId: context.userId,
        linkedIssue: linkedIssue || undefined,
        onUpdate: context.onUpdate,
      });

      // Handle skip signal (general_chat should fall through)
      if (workflowResult.skipWorkflow) {
        console.log(`[Router] Workflow returned skip signal, falling back to agent`);
        return executeAgentFallback(query, messages, context, classification, startTime);
      }

      return {
        response: workflowResult.response,
        routedVia: "slash-command",
        classification,
        workflowId: "dpa-assistant",
        durationMs: Date.now() - startTime,
        needsConfirmation: workflowResult.needsConfirmation,
        confirmationData: workflowResult.confirmationData,
        rawResult: workflowResult,
      };
    }

    // ============================================================
    // Workflows - deterministic multi-step execution
    // ============================================================
    case "workflow": {
      const { workflowId } = target;
      console.log(`[Router] Executing workflow: ${workflowId}`);

      // Get linked issue for GitLab workflows
      const linkedIssue = context.chatId && context.rootId
        ? await getLinkedIssue(context.chatId, context.rootId)
        : null;

      const workflowResult = await executeSkillWorkflow(workflowId, {
        query,
        chatId: context.chatId,
        rootId: context.rootId,
        userId: context.userId,
        linkedIssue: linkedIssue || undefined,
        onUpdate: context.onUpdate,
      });

      // Handle skip signal
      if (workflowResult.skipWorkflow) {
        console.log(`[Router] Workflow returned skip signal, falling back to agent`);
        return executeAgentFallback(query, messages, context, classification, startTime);
      }

      return {
        response: workflowResult.response,
        routedVia: "workflow",
        classification,
        workflowId,
        durationMs: Date.now() - startTime,
        needsConfirmation: workflowResult.needsConfirmation,
        confirmationData: workflowResult.confirmationData,
        rawResult: workflowResult,
      };
    }

    // ============================================================
    // Direct Tools - single-shot execution
    // ============================================================
    case "tool": {
      const { toolId } = target;
      console.log(`[Router] Executing direct tool: ${toolId}`);

      const toolResult = await executeDirectTool(toolId, query, {
        chatId: context.chatId,
        rootId: context.rootId,
        userId: context.userId,
      });

      // Format result for display
      const formattedResponse = formatToolResult(toolResult);

      return {
        response: formattedResponse,
        routedVia: "tool",
        classification,
        toolId,
        durationMs: Date.now() - startTime,
        rawResult: toolResult,
      };
    }

    // ============================================================
    // Agent Fallback - LLM reasoning for novel queries
    // ============================================================
    case "agent":
    default: {
      return executeAgentFallback(query, messages, context, classification, startTime);
    }
  }
}

/**
 * Execute agent fallback for unclassified queries
 */
async function executeAgentFallback(
  query: string,
  messages: CoreMessage[],
  context: RouterContext,
  classification: ClassificationResult,
  startTime: number
): Promise<RouterResult> {
  console.log(`[Router] Executing agent fallback`);

  // Dynamic import to avoid circular dependencies
  const { dpaMomAgent } = await import("../agents/dpa-mom-agent");

  // Wrap onUpdate for compatibility
  const updateStatus = context.onUpdate
    ? (status: string) => { context.onUpdate!(status); }
    : undefined;

  const result = await dpaMomAgent(
    messages,
    updateStatus,
    context.chatId,
    context.rootId,
    context.userId
  );

  return {
    response: result.text,
    routedVia: "agent",
    classification,
    durationMs: Date.now() - startTime,
    needsConfirmation: result.needsConfirmation,
    confirmationData: result.confirmationData,
    reasoning: result.reasoning,
    rawResult: result,
  };
}

/**
 * Extract slash command from query
 */
function extractSlashCommand(query: string): string {
  const match = query.match(/^\/([^\s]+)/);
  return match ? `/${match[1].toLowerCase()}` : "";
}

/**
 * Check if a query would be routed to agent (for testing/introspection)
 */
export function wouldRouteToAgent(query: string): boolean {
  const classification = classifyIntent(query);
  return classification.target.type === "agent";
}

/**
 * Get routing decision without executing (for debugging)
 */
export function getRoutingDecision(query: string): ClassificationResult {
  return classifyIntent(query);
}
