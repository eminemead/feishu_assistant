/**
 * Query Metric Tool
 *
 * Structured tool for querying metrics from the semantic layer.
 * Agent specifies metric name, dimensions, and filters — NOT raw SQL.
 * Query builder constructs safe SQL from YAML definitions.
 *
 * Security: No SQL injection possible — agent can't write SQL.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  prepareMetricQuery,
  loadMetric,
  listMetrics,
  type QueryMetricInput,
} from "../query-builder";
import { queryStarrocks, hasStarrocksConfig } from "../starrocks/client";
import { trackToolCall } from "../devtools-integration";

const MAX_ROWS = 1000;

interface QueryMetricOutput {
  success: boolean;
  data?: Record<string, any>[];
  sql?: string;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
  validationErrors?: Array<{
    field: string;
    message: string;
    allowed?: string[];
  }>;
  metric?: {
    name: string;
    description: string;
    dimensions: string[];
  };
  executionTimeMs?: number;
}

async function executeMetricQuery(
  input: QueryMetricInput
): Promise<QueryMetricOutput> {
  const startTime = Date.now();

  // Prepare query using query builder
  const prepared = prepareMetricQuery(input);

  if (!prepared.success || !prepared.sql) {
    return {
      success: false,
      error: "Query validation failed",
      validationErrors: prepared.errors,
      metric: prepared.metric
        ? {
            name: prepared.metric.name,
            description: prepared.metric.description,
            dimensions: prepared.metric.dimensions,
          }
        : undefined,
    };
  }

  // Check StarRocks config
  if (!hasStarrocksConfig()) {
    return {
      success: false,
      error: "StarRocks configuration not available",
      sql: prepared.sql,
    };
  }

  try {
    const rows = await queryStarrocks(prepared.sql);
    const executionTimeMs = Date.now() - startTime;

    return {
      success: true,
      data: rows,
      sql: prepared.sql,
      rowCount: rows.length,
      truncated: rows.length >= MAX_ROWS,
      metric: prepared.metric
        ? {
            name: prepared.metric.name,
            description: prepared.metric.description,
            dimensions: prepared.metric.dimensions,
          }
        : undefined,
      executionTimeMs,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Query execution failed: ${err.message}`,
      sql: prepared.sql,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Creates the query_metric tool
 */
export function createQueryMetricTool(enableDevtoolsTracking: boolean = true) {
  // Build available metrics list for description
  const availableMetrics = listMetrics();
  const metricsHint =
    availableMetrics.length > 0
      ? `Available metrics: ${availableMetrics.join(", ")}`
      : "Check /semantic-layer/metrics/ for available metrics";

  return createTool({
    id: "query_metric",
    description: `Query a metric from the semantic layer using structured parameters.

USE THIS instead of raw SQL. Metrics are defined in /semantic-layer/metrics/.

${metricsHint}

Example:
{
  "metric": "has_metric_percentage",
  "dimensions": ["city_company"],
  "filters": { "quarter": "2024-Q4" },
  "limit": 100
}

The tool validates your request against the metric definition and builds safe SQL.
If validation fails, you'll see which dimensions/filters are allowed.`,

    inputSchema: z.object({
      metric: z.string().describe("Metric name from semantic layer"),
      dimensions: z
        .array(z.string())
        .default([])
        .describe("Columns to GROUP BY (must be in metric's dimensions list)"),
      filters: z
        .record(z.union([z.string(), z.number(), z.array(z.string()), z.array(z.number())]))
        .default({})
        .describe("WHERE filters as key-value pairs. Arrays become IN clauses."),
      orderBy: z
        .string()
        .optional()
        .describe("Column to ORDER BY (defaults to metric value DESC)"),
      orderDir: z
        .enum(["ASC", "DESC"])
        .optional()
        .describe("Sort direction"),
      limit: z
        .number()
        .default(100)
        .describe(`Max rows to return (max ${MAX_ROWS})`),
    }),

    execute: async (input, context) => {
      if (context?.abortSignal?.aborted) {
        return { success: false, error: "Query aborted" };
      }

      const queryInput: QueryMetricInput = {
        metric: input.metric,
        dimensions: input.dimensions,
        filters: input.filters,
        orderBy: input.orderBy,
        orderDir: input.orderDir,
        limit: input.limit,
      };

      if (enableDevtoolsTracking) {
        return trackToolCall("query_metric", executeMetricQuery)(queryInput);
      }
      return executeMetricQuery(queryInput);
    },
  });
}

/**
 * Get metric info without executing a query
 */
export function createGetMetricInfoTool() {
  return createTool({
    id: "get_metric_info",
    description: `Get detailed information about a metric definition.
Use this to understand what dimensions and filters are available before querying.`,

    inputSchema: z.object({
      metric: z.string().describe("Metric name"),
    }),

    execute: async ({ metric }) => {
      const def = loadMetric(metric);
      if (!def) {
        return {
          success: false,
          error: `Metric "${metric}" not found`,
          available: listMetrics(),
        };
      }

      return {
        success: true,
        metric: {
          name: def.name,
          description: def.description,
          source_table: def.source_table,
          sql_expression: def.sql_expression,
          dimensions: def.dimensions,
          filterable: def.filterable || def.dimensions,
          unit: def.unit,
          examples: def.examples?.slice(0, 3), // Limit examples
        },
      };
    },
  });
}

// Export for direct use
export { executeMetricQuery };
