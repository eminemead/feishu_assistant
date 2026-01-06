/**
 * Manager Routing Workflow
 * 
 * @deprecated This workflow-based routing has been replaced by skill-based routing.
 * See `lib/routing/query-router.ts` for the new implementation.
 * 
 * Migration Notes:
 * - Old: `getRoutingDecision()` from this workflow
 * - New: `routeQuery()` from query-router
 * - Benefits: Faster (<1ms vs ~6-12ms), declarative (rules in SKILL.md), testable
 * 
 * This file is kept for reference but is no longer used in production.
 * It can be removed in a future cleanup after validation period.
 * 
 * Legacy implementation - kept for reference:
 * Declarative routing workflow that classifies queries and routes to specialist agents.
 * Replaces manual regex-based routing with a workflow-based approach.
 * 
 * Flow:
 * 1. Classify query → Determine which specialist (or general)
 * 2. Route to specialist → Execute appropriate agent
 * 3. Format response → Return structured result
 * 
 * Benefits:
 * - Visual workflow graphs
 * - Better testability (test classification independently)
 * - Automatic observability (each step traced)
 * - Easier to add new routing rules
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { CoreMessage } from "ai";
import { getOkrReviewerAgent } from "../agents/okr-reviewer-agent";
import { getAlignmentAgent } from "../agents/alignment-agent";
import { getPnlAgent } from "../agents/pnl-agent";
import { getDpaMomAgent } from "../agents/dpa-mom-agent";

/**
 * Query category classification
 */
export type QueryCategory = "okr" | "alignment" | "pnl" | "dpa_mom" | "general";

/**
 * Step 1: Classify Query
 * Determines which specialist agent should handle the query
 */
const classifyQueryStep = createStep({
  id: "classify-query",
  description: "Classify user query to determine routing",
  inputSchema: z.object({
    query: z.string(),
    messages: z.any().optional(), // CoreMessage[] - using any for workflow compatibility
  }),
  outputSchema: z.object({
    query: z.string(),
    category: z.enum(["okr", "alignment", "pnl", "dpa_mom", "general"]),
    confidence: z.number().min(0).max(1),
    messages: z.any().optional(),
  }),
  execute: async ({ inputData }) => {
    const { query } = inputData;
    const lowerQuery = query.toLowerCase();

    // OKR patterns
    const okrPatterns = [
      /okr/i,
      /objective/i,
      /key result/i,
      /manager review/i,
      /has_metric/i,
      /覆盖率/i,
      /指标覆盖率/i,
      /经理评审/i,
      /目标/i,
      /关键结果/i,
      /okr指标/i,
      /指标/i,
      /okr分析/i,
      /分析/i,
      /图表/i,
      /可视化/i,
      /visualization/i,
      /chart/i,
      /analysis/i,
    ];
    const okrMatches = okrPatterns.filter((p) => p.test(lowerQuery)).length;
    const okrScore = okrMatches / okrPatterns.length;

    // Alignment patterns
    const alignmentPatterns = [/alignment/i, /对齐/i, /目标对齐/i];
    const alignmentMatches = alignmentPatterns.filter((p) => p.test(lowerQuery)).length;
    const alignmentScore = alignmentMatches / alignmentPatterns.length;

    // P&L patterns
    const pnlPatterns = [
      /pnl/i,
      /profit/i,
      /loss/i,
      /损益/i,
      /利润/i,
      /亏损/i,
      /ebit/i,
    ];
    const pnlMatches = pnlPatterns.filter((p) => p.test(lowerQuery)).length;
    const pnlScore = pnlMatches / pnlPatterns.length;

    // DPA Mom patterns
    const dpaPatterns = [/dpa/i, /data team/i, /\bae\b/i, /\bda\b/i, /dpa.mom/i, /mom/i, /\bma\b/i];
    const dpaMatches = dpaPatterns.filter((p) => p.test(lowerQuery)).length;
    const dpaScore = dpaMatches / dpaPatterns.length;

    // Determine category with confidence
    // NOTE: alignment and pnl agents are currently disabled - only okr_reviewer and dpa_mom are active
    const scores = {
      okr: okrScore,
      alignment: 0, // DISABLED: alignment agent not active yet
      pnl: 0, // DISABLED: pnl agent not active yet
      dpa_mom: dpaScore,
      general: 0.1, // Default fallback
    };

    const maxScore = Math.max(...Object.values(scores));
    const category =
      (Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] as QueryCategory) ||
      "general";

    // Confidence is based on how clear the match is
    const confidence = maxScore > 0.3 ? Math.min(maxScore * 2, 1) : 0.5;

    console.log(
      `[Manager Workflow] Classified query: "${query.substring(0, 50)}..." → ${category} (confidence: ${confidence.toFixed(2)})`
    );

    return {
      query,
      category,
      confidence,
      messages: inputData.messages,
    };
  },
});

/**
 * Step 2: Determine Agent Name
 * Maps category to agent name (execution happens outside workflow for streaming)
 */
const determineAgentStep = createStep({
  id: "determine-agent",
  description: "Map category to agent name for routing",
  inputSchema: z.object({
    query: z.string(),
    category: z.enum(["okr", "alignment", "pnl", "dpa_mom", "general"]),
    confidence: z.number(),
  }),
  outputSchema: z.object({
    query: z.string(),
    category: z.enum(["okr", "alignment", "pnl", "dpa_mom", "general"]),
    agentName: z.string(),
    confidence: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { category } = inputData;

    // Map category to agent name
    const agentNameMap: Record<QueryCategory, string> = {
      okr: "okr_reviewer",
      alignment: "alignment_agent",
      pnl: "pnl_agent",
      dpa_mom: "dpa_mom",
      general: "manager",
    };

    const agentName = agentNameMap[category] || "manager";

    console.log(
      `[Manager Workflow] Category ${category} → Agent: ${agentName}`
    );

    return {
      ...inputData,
      agentName,
    };
  },
});

/**
 * Manager Routing Workflow
 * 
 * Classifies queries and routes to specialist agents using declarative workflow pattern.
 * 
 * Note: This workflow handles classification and routing logic. For streaming responses,
 * the workflow result can be used to determine which agent to stream with.
 */
export const managerRoutingWorkflow = createWorkflow({
  id: "manager-routing",
  description: "Classify query and route to appropriate specialist agent",
  inputSchema: z.object({
    query: z.string(),
    messages: z.any().optional(),
    executionContext: z.any().optional(),
  }),
  outputSchema: z.object({
    query: z.string(),
    category: z.enum(["okr", "alignment", "pnl", "dpa_mom", "general"]),
    agentName: z.string(),
    confidence: z.number(),
  }),
})
  .then(classifyQueryStep)
  .then(determineAgentStep)
  .commit();

/**
 * Helper to run the workflow and get routing decision
 * Returns the category and agent name for streaming execution
 */
export async function getRoutingDecision(params: {
  query: string;
  messages?: CoreMessage[];
  executionContext?: any;
}): Promise<{
  category: QueryCategory;
  agentName: string;
  confidence: number;
  shouldUseWorkflow: boolean;
}> {
  try {
    const run = await managerRoutingWorkflow.createRun();
    const result = await run.start({
      inputData: {
        query: params.query,
        messages: params.messages,
        executionContext: params.executionContext,
      },
    }) as any;

    return {
      category: result.category,
      agentName: result.agentName,
      confidence: result.confidence || 0.5,
      shouldUseWorkflow: result.category !== "general",
    };
  } catch (error) {
    console.error("[Manager Workflow] Error in routing workflow:", error);
    // Fallback to general
    return {
      category: "general",
      agentName: "manager",
      confidence: 0.5,
      shouldUseWorkflow: false,
    };
  }
}
