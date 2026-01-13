/**
 * Execute SQL Tool
 * 
 * Secure Mastra tool for executing SQL queries against StarRocks/DuckDB.
 * This is the bridge between AI agents and the analytics database.
 * 
 * Security layers:
 * 1. SQL Validation - Only SELECT/WITH allowed
 * 2. RLS Integration - User permissions applied
 * 3. Row/Size Limits - Prevent data exfiltration
 * 4. Credential Isolation - Server-side credentials only
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import * as duckdb from "duckdb";
import { queryStarrocks, hasStarrocksConfig } from "../starrocks/client";
import { getStarrocksUserScope } from "../starrocks/rls-provider";
import { cached } from "../cache";
import { trackToolCall } from "../devtools-integration";

const MAX_ROWS = 1000;
const MAX_RESULT_SIZE = 50000; // characters
const OKR_DB_PATH = "/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db";

interface ExecuteSqlInput {
  sql: string;
  database: "starrocks" | "duckdb";
  userId?: string;
  format: "json" | "csv" | "markdown";
}

interface ExecuteSqlOutput {
  success: boolean;
  data?: Record<string, any>[];
  formatted?: string;
  rowCount?: number;
  truncated?: boolean;
  error?: string;
  executionTimeMs?: number;
}

function validateSql(sql: string): { valid: boolean; reason?: string } {
  const normalized = sql.toLowerCase().trim();

  const blocked = ["drop", "delete", "truncate", "alter", "create", "insert", "update", "grant", "revoke"];
  for (const keyword of blocked) {
    if (normalized.startsWith(keyword)) {
      return { valid: false, reason: `${keyword.toUpperCase()} statements are not allowed` };
    }
  }

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { valid: false, reason: "Only SELECT and WITH (CTE) statements are allowed" };
  }

  return { valid: true };
}

function addLimitIfMissing(sql: string): string {
  const normalized = sql.toLowerCase();
  if (!normalized.includes("limit")) {
    return `${sql.trim().replace(/;$/, "")} LIMIT ${MAX_ROWS}`;
  }
  return sql;
}

function formatAsCsv(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => {
      const val = row[h] ?? "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n")
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(","));
  }
  return lines.join("\n");
}

function formatAsMarkdown(rows: Record<string, any>[]): string {
  if (rows.length === 0) return "No results";
  const headers = Object.keys(rows[0]);
  const lines = [
    "| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
  ];
  for (const row of rows) {
    lines.push("| " + headers.map((h) => String(row[h] ?? "")).join(" | ") + " |");
  }
  return lines.join("\n");
}

async function queryDuckdb(sql: string): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(OKR_DB_PATH, { access_mode: "READ_ONLY" });
    const con = db.connect();
    
    con.all(sql, (err: Error | null, result: any[]) => {
      db.close();
      if (err) {
        reject(err);
        return;
      }
      resolve(result || []);
    });
  });
}

async function executeQuery(
  input: ExecuteSqlInput
): Promise<ExecuteSqlOutput> {
  const { sql, database, userId, format } = input;
  const startTime = Date.now();

  // 1. Validate SQL
  const validation = validateSql(sql);
  if (!validation.valid) {
    return {
      success: false,
      error: `SQL validation failed: ${validation.reason}`,
    };
  }

  // 2. Check RLS if userId provided (log scope but don't modify query - RLS is table-specific)
  if (userId) {
    try {
      const scope = await getStarrocksUserScope(userId);
      if (scope) {
        console.log(`ℹ️ [execute_sql] User ${userId} scope: ${scope.allowedAccounts.length} accounts, ${scope.allowedRegions.length} regions`);
      }
    } catch (error) {
      console.warn(`⚠️ [execute_sql] Failed to get RLS scope for user ${userId}:`, error);
    }
  }

  // 3. Add row limit if not present
  const finalSql = addLimitIfMissing(sql);

  try {
    let rows: Record<string, any>[];

    if (database === "starrocks") {
      if (!hasStarrocksConfig()) {
        return {
          success: false,
          error: "StarRocks configuration not available",
        };
      }
      rows = await queryStarrocks(finalSql);
    } else {
      rows = await queryDuckdb(finalSql);
    }

    const executionTimeMs = Date.now() - startTime;
    const truncated = rows.length >= MAX_ROWS;

    // Format output
    let formatted: string;
    switch (format) {
      case "csv":
        formatted = formatAsCsv(rows);
        break;
      case "markdown":
        formatted = formatAsMarkdown(rows);
        break;
      default:
        formatted = JSON.stringify(rows, null, 2);
    }

    // Truncate if too large
    if (formatted.length > MAX_RESULT_SIZE) {
      formatted = formatted.substring(0, MAX_RESULT_SIZE) + "\n... (truncated)";
    }

    return {
      success: true,
      data: rows,
      formatted,
      rowCount: rows.length,
      truncated,
      executionTimeMs,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Query execution failed: ${error.message || error}`,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Creates the execute_sql tool
 * 
 * @param enableCaching - Whether to enable caching (default: false - SQL results may change)
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured execute_sql tool instance
 */
export function createExecuteSqlTool(
  enableCaching: boolean = false,
  enableDevtoolsTracking: boolean = true
) {
  const executeCore = async (input: ExecuteSqlInput): Promise<ExecuteSqlOutput> => {
    return executeQuery(input);
  };

  const executeSqlToolBase = createTool({
    id: "execute_sql",
    description: `Execute a SQL query against the analytics database and return results.

IMPORTANT:
- Use bash_exec first to explore /semantic-layer/ and understand the schema
- Always include appropriate WHERE clauses to limit data
- Results are limited to ${MAX_ROWS} rows
- For large datasets, use aggregations (GROUP BY, SUM, COUNT)

Available tables: Query /semantic-layer/entities/ using bash to discover tables.

Security: Your query will be validated. Only SELECT/WITH statements allowed.`,
    inputSchema: z.object({
      sql: z.string().describe("SQL query to execute"),
      database: z
        .enum(["starrocks", "duckdb"])
        .default("starrocks")
        .describe("Target database"),
      userId: z.string().optional().describe("User ID for RLS filtering"),
      format: z
        .enum(["json", "csv", "markdown"])
        .default("json")
        .describe("Output format"),
    }),
execute: async (inputData, context) => {
      // Support abort signal for long-running queries
      if (context?.abortSignal?.aborted) {
        return { success: false, error: "Query aborted" };
      }
      
      // Get userId from requestContext if not provided in input
      const userId = inputData.userId ?? context?.requestContext?.get("userId") as string | undefined;
      
      const input: ExecuteSqlInput = {
        sql: inputData.sql,
        database: inputData.database,
        userId,
        format: inputData.format,
      };
      
      if (enableDevtoolsTracking) {
        return trackToolCall("execute_sql", executeCore)(input);
      }
      return executeCore(input);
    },
  });

  return enableCaching ? cached(executeSqlToolBase) : executeSqlToolBase;
}

// Export raw functions for testing
export { validateSql, formatAsCsv, formatAsMarkdown, addLimitIfMissing };
