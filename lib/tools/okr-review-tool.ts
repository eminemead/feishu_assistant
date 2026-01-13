/**
 * OKR Review Tool Factory
 * 
 * Creates the OKR review tool used by the OKR Reviewer Agent.
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 * 
 * The "sharing" here is between production code and development tools (dspyground),
 * NOT between different agents.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { cached, createCachedWithTTL } from "../cache";
import { devtoolsTracker } from "../devtools-integration";
import { analyzeHasMetricPercentage } from "../agents/okr-reviewer-agent";

/**
 * OKR review result type
 */
interface OkrReviewResult {
  period: string;
  total_companies?: number;
  overall_average?: number;
  companies?: Array<{ name: string; percentage: number }>;
  error?: string;
}

/**
 * Core execution logic (single source of truth)
 */
async function executeOkrReview(period: string): Promise<OkrReviewResult> {
  try {
    const analysis = await analyzeHasMetricPercentage(period);
    return analysis;
  } catch (error: any) {
    return {
      error: error.message || "Failed to analyze OKR metrics",
      period,
    };
  }
}

/**
 * Creates the OKR review tool
 * 
 * Used by:
 * - OKR Reviewer Agent (production): With caching (1 hour TTL) and devtools tracking
 * - DSPyground config (development): Without caching or devtools
 * 
 * @param enableCaching - Whether to enable caching (default: true)
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @param cacheTTL - Cache TTL in milliseconds (default: 1 hour for production, ignored if enableCaching is false)
 * @returns Configured OKR review tool instance
 */
export function createOkrReviewTool(
  enableCaching: boolean = true,
  enableDevtoolsTracking: boolean = true,
  cacheTTL?: number
) {
  const mgrOkrReviewToolBase = createTool({
    id: "mgr_okr_review",
    description:
      "Analyze manager OKR metrics by checking has_metric_percentage per city company. This tool queries StarRocks (or DuckDB as fallback) to analyze if management criteria are met by managers of different levels across different city companies. Results are automatically filtered by user permissions (RLS).",
    inputSchema: z.object({
      period: z
        .string()
        .describe(
          "The period to analyze (e.g., '10 月', '11 月', '9 月'). Defaults to current month if not specified.",
        ),
    }),
execute: async (inputData, context) => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { period: inputData.period, error: "Analysis aborted" };
      }
      
      const { period } = inputData;
      
      if (enableDevtoolsTracking) {
        const startTime = Date.now();
        devtoolsTracker.trackToolCall("mgr_okr_review", { period }, startTime);
        
        try {
          const result = await executeOkrReview(period);
          return result;
        } catch (error: any) {
          devtoolsTracker.trackError(
            "mgr_okr_review",
            error instanceof Error ? error : new Error(String(error)),
            { toolName: "mgr_okr_review", params: { period } }
          );
          throw error;
        }
      }
      
      return executeOkrReview(period);
    },
  });

  // Return cached or uncached version
  if (!enableCaching) {
    return mgrOkrReviewToolBase;
  }

  // Use custom TTL if provided, otherwise use default cached
  if (cacheTTL !== undefined) {
    return createCachedWithTTL(cacheTTL)(mgrOkrReviewToolBase);
  }

  return cached(mgrOkrReviewToolBase);
}

