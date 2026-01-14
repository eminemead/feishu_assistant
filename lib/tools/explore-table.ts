/**
 * Explore Table Tool
 *
 * Restricted tool for sampling rows from tables defined in the semantic layer.
 * Use for discovery/exploration before defining metrics.
 *
 * Limitations:
 * - Only tables defined in /semantic-layer/entities/ can be queried
 * - Max 100 rows per query
 * - Only columns defined in entity YAML are selectable
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  prepareExploreQuery,
  loadEntity,
  listEntities,
  type ExploreTableInput,
} from "../query-builder";
import { queryStarrocks, hasStarrocksConfig } from "../starrocks/client";
import { trackToolCall } from "../devtools-integration";

const MAX_EXPLORE_ROWS = 100;

interface ExploreTableOutput {
  success: boolean;
  data?: Record<string, any>[];
  sql?: string;
  rowCount?: number;
  error?: string;
  columns?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  executionTimeMs?: number;
}

async function executeExploreQuery(
  input: ExploreTableInput
): Promise<ExploreTableOutput> {
  const startTime = Date.now();

  // Prepare query using query builder
  const prepared = prepareExploreQuery(input);

  if (!prepared.success || !prepared.sql) {
    return {
      success: false,
      error: prepared.error || "Query preparation failed",
      columns: prepared.entity?.columns.map((c) => ({
        name: c.name,
        type: c.type,
        description: c.description,
      })),
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
      columns: prepared.entity?.columns.map((c) => ({
        name: c.name,
        type: c.type,
        description: c.description,
      })),
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
 * Creates the explore_table tool
 */
export function createExploreTableTool(enableDevtoolsTracking: boolean = true) {
  const availableTables = listEntities();
  const tablesHint =
    availableTables.length > 0
      ? `Available tables: ${availableTables.join(", ")}`
      : "Check /semantic-layer/entities/ for available tables";

  return createTool({
    id: "explore_table",
    description: `Sample rows from a table defined in the semantic layer.

Use this for discovery/exploration. For actual analysis, use query_metric instead.

${tablesHint}

Example:
{
  "table": "okr_metrics",
  "columns": ["okr_id", "city_company", "has_metric"],
  "limit": 10
}

Limitations:
- Only tables in /semantic-layer/entities/ are queryable
- Max ${MAX_EXPLORE_ROWS} rows per query
- Use query_metric for aggregations`,

    inputSchema: z.object({
      table: z.string().describe("Table name from semantic layer"),
      columns: z
        .array(z.string())
        .optional()
        .describe("Columns to select (default: all)"),
      filters: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe("Simple WHERE filters"),
      limit: z
        .number()
        .default(10)
        .describe(`Max rows (max ${MAX_EXPLORE_ROWS})`),
    }),

    execute: async (input, context) => {
      if (context?.abortSignal?.aborted) {
        return { success: false, error: "Query aborted" };
      }

      const exploreInput: ExploreTableInput = {
        table: input.table,
        columns: input.columns,
        filters: input.filters,
        limit: Math.min(input.limit, MAX_EXPLORE_ROWS),
      };

      if (enableDevtoolsTracking) {
        return trackToolCall("explore_table", executeExploreQuery)(exploreInput);
      }
      return executeExploreQuery(exploreInput);
    },
  });
}

/**
 * Get table schema without querying data
 */
export function createGetTableSchemaInfoTool() {
  return createTool({
    id: "get_table_info",
    description: `Get schema information for a table defined in the semantic layer.
Use this to understand table structure before exploring or building queries.`,

    inputSchema: z.object({
      table: z.string().describe("Table name"),
    }),

    execute: async ({ table }) => {
      const entity = loadEntity(table);
      if (!entity) {
        return {
          success: false,
          error: `Table "${table}" not found in semantic layer`,
          available: listEntities(),
        };
      }

      return {
        success: true,
        table: {
          name: entity.name,
          description: entity.description,
          database: entity.database,
          columns: entity.columns.map((c) => ({
            name: c.name,
            type: c.type,
            description: c.description,
            nullable: c.nullable,
            primary_key: c.primary_key,
          })),
          common_filters: entity.common_filters,
          joins: entity.joins,
        },
      };
    },
  });
}

// Export for direct use
export { executeExploreQuery };
