/**
 * Query Builder for Semantic Layer
 *
 * Builds safe SQL queries from metric/entity YAML definitions.
 * Agent specifies intent (metric, dimensions, filters), builder constructs SQL.
 * No raw SQL from agent = no SQL injection.
 */

import { readFileSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { join } from "path";

const SEMANTIC_LAYER_PATH =
  process.env.SEMANTIC_LAYER_PATH || "./semantic-layer";
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

// ============================================================================
// Types
// ============================================================================

export interface MetricDefinition {
  name: string;
  description: string;
  sql_expression: string;
  source_table: string;
  database: "starrocks" | "duckdb";
  schema?: string;
  grain?: string;
  aggregation?: string;
  unit?: string;
  dimensions: string[];
  filterable?: string[]; // columns that can be filtered on
  examples?: Array<{
    question: string;
    chinese?: string;
    sql: string;
  }>;
}

export interface EntityDefinition {
  name: string;
  description: string;
  database: "starrocks" | "duckdb";
  schema?: string;
  table_name_pattern?: string;
  columns: Array<{
    name: string;
    type: string;
    description: string;
    primary_key?: boolean;
    nullable?: boolean;
    example_values?: any[];
  }>;
  common_filters?: string[];
  joins?: Array<{
    target: string;
    type: string;
    on: string;
    purpose: string;
  }>;
}

export interface QueryParams {
  metric?: string;
  dimensions?: string[];
  filters?: Record<string, string | number | string[] | number[]>;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  limit?: number;
}

export interface QueryResult {
  sql: string;
  params: any[];
  metric?: MetricDefinition;
  entity?: EntityDefinition;
}

export interface ValidationError {
  field: string;
  message: string;
  allowed?: string[];
}

// ============================================================================
// Loaders
// ============================================================================

export function loadMetric(name: string): MetricDefinition | null {
  const path = join(SEMANTIC_LAYER_PATH, "metrics", `${name}.yaml`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
    return parseYaml(content) as MetricDefinition;
  } catch {
    return null;
  }
}

export function loadEntity(name: string): EntityDefinition | null {
  const path = join(SEMANTIC_LAYER_PATH, "entities", `${name}.yaml`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
    return parseYaml(content) as EntityDefinition;
  } catch {
    return null;
  }
}

export function listMetrics(): string[] {
  const metricsPath = join(SEMANTIC_LAYER_PATH, "metrics");
  if (!existsSync(metricsPath)) return [];

  const { readdirSync } = require("fs");
  return readdirSync(metricsPath)
    .filter((f: string) => f.endsWith(".yaml") && !f.startsWith("_"))
    .map((f: string) => f.replace(".yaml", ""));
}

export function listEntities(): string[] {
  const entitiesPath = join(SEMANTIC_LAYER_PATH, "entities");
  if (!existsSync(entitiesPath)) return [];

  const { readdirSync } = require("fs");
  return readdirSync(entitiesPath)
    .filter((f: string) => f.endsWith(".yaml") && !f.startsWith("_"))
    .map((f: string) => f.replace(".yaml", ""));
}

// ============================================================================
// Validation
// ============================================================================

export function validateQueryParams(
  metric: MetricDefinition,
  params: QueryParams
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Validate dimensions
  const allowedDimensions = metric.dimensions || [];
  for (const dim of params.dimensions || []) {
    if (!allowedDimensions.includes(dim)) {
      errors.push({
        field: "dimensions",
        message: `Invalid dimension "${dim}"`,
        allowed: allowedDimensions,
      });
    }
  }

  // Validate filter columns
  // Filterable columns = explicit filterable list, or dimensions, or all columns from entity
  const filterableCols = metric.filterable || metric.dimensions || [];
  for (const col of Object.keys(params.filters || {})) {
    if (filterableCols.length > 0 && !filterableCols.includes(col)) {
      errors.push({
        field: "filters",
        message: `Cannot filter by "${col}"`,
        allowed: filterableCols,
      });
    }
  }

  // Validate orderBy
  if (params.orderBy) {
    const validOrderCols = [...allowedDimensions, metric.name];
    if (!validOrderCols.includes(params.orderBy)) {
      errors.push({
        field: "orderBy",
        message: `Cannot order by "${params.orderBy}"`,
        allowed: validOrderCols,
      });
    }
  }

  return errors;
}

// ============================================================================
// SQL Escaping
// ============================================================================

function escapeValue(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  // Escape single quotes by doubling them
  return `'${value.replace(/'/g, "''")}'`;
}

function escapeIdentifier(name: string): string {
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
}

// ============================================================================
// Query Building
// ============================================================================

export function buildMetricQuery(
  metric: MetricDefinition,
  params: QueryParams
): QueryResult {
  const dimensions = params.dimensions || [];
  const filters = params.filters || {};
  const limit = Math.min(params.limit || DEFAULT_LIMIT, MAX_LIMIT);

  // Build SELECT clause
  const selectParts: string[] = [];

  // Add dimensions
  for (const dim of dimensions) {
    selectParts.push(escapeIdentifier(dim));
  }

  // Add metric expression with alias
  selectParts.push(`${metric.sql_expression} AS ${escapeIdentifier(metric.name)}`);

  // Build WHERE clause
  const whereParts: string[] = [];
  for (const [col, val] of Object.entries(filters)) {
    const colName = escapeIdentifier(col);
    if (Array.isArray(val)) {
      // IN clause
      const escaped = val.map(escapeValue).join(", ");
      whereParts.push(`${colName} IN (${escaped})`);
    } else {
      whereParts.push(`${colName} = ${escapeValue(val)}`);
    }
  }

  // Build GROUP BY clause
  const groupByClause =
    dimensions.length > 0
      ? `GROUP BY ${dimensions.map(escapeIdentifier).join(", ")}`
      : "";

  // Build ORDER BY clause
  let orderByClause = "";
  if (params.orderBy) {
    const dir = params.orderDir || "DESC";
    orderByClause = `ORDER BY ${escapeIdentifier(params.orderBy)} ${dir}`;
  } else if (dimensions.length > 0) {
    // Default: order by metric value descending
    orderByClause = `ORDER BY ${escapeIdentifier(metric.name)} DESC`;
  }

  // Assemble query
  const sql = [
    `SELECT`,
    `  ${selectParts.join(",\n  ")}`,
    `FROM ${escapeIdentifier(metric.source_table)}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join("\n  AND ")}` : "",
    groupByClause,
    orderByClause,
    `LIMIT ${limit}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { sql, params: [], metric };
}

export function buildExploreQuery(
  entity: EntityDefinition,
  columns?: string[],
  filters?: Record<string, string | number>,
  limit?: number
): QueryResult {
  const safeLimit = Math.min(limit || 10, 100); // Explore is limited to 100 rows

  // Validate columns if specified
  const validCols = entity.columns.map((c) => c.name);
  const selectCols = columns
    ? columns.filter((c) => validCols.includes(c))
    : ["*"];

  if (columns && selectCols.length === 0) {
    throw new Error(
      `No valid columns specified. Available: ${validCols.join(", ")}`
    );
  }

  // Build WHERE clause
  const whereParts: string[] = [];
  for (const [col, val] of Object.entries(filters || {})) {
    if (!validCols.includes(col)) {
      throw new Error(
        `Invalid filter column "${col}". Available: ${validCols.join(", ")}`
      );
    }
    whereParts.push(`${escapeIdentifier(col)} = ${escapeValue(val)}`);
  }

  const sql = [
    `SELECT ${selectCols.join(", ")}`,
    `FROM ${escapeIdentifier(entity.name)}`,
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "",
    `LIMIT ${safeLimit}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { sql, params: [], entity };
}

// ============================================================================
// High-level API
// ============================================================================

export interface QueryMetricInput {
  metric: string;
  dimensions?: string[];
  filters?: Record<string, string | number | string[] | number[]>;
  orderBy?: string;
  orderDir?: "ASC" | "DESC";
  limit?: number;
}

export interface QueryMetricResult {
  success: boolean;
  sql?: string;
  errors?: ValidationError[];
  metric?: MetricDefinition;
}

export function prepareMetricQuery(input: QueryMetricInput): QueryMetricResult {
  // Load metric definition
  const metric = loadMetric(input.metric);
  if (!metric) {
    return {
      success: false,
      errors: [
        {
          field: "metric",
          message: `Metric "${input.metric}" not found`,
          allowed: listMetrics(),
        },
      ],
    };
  }

  // Validate params
  const errors = validateQueryParams(metric, input);
  if (errors.length > 0) {
    return { success: false, errors, metric };
  }

  // Build query
  const result = buildMetricQuery(metric, input);
  return {
    success: true,
    sql: result.sql,
    metric,
  };
}

export interface ExploreTableInput {
  table: string;
  columns?: string[];
  filters?: Record<string, string | number>;
  limit?: number;
}

export interface ExploreTableResult {
  success: boolean;
  sql?: string;
  error?: string;
  entity?: EntityDefinition;
}

export function prepareExploreQuery(
  input: ExploreTableInput
): ExploreTableResult {
  // Load entity definition
  const entity = loadEntity(input.table);
  if (!entity) {
    return {
      success: false,
      error: `Table "${input.table}" not found in semantic layer`,
    };
  }

  try {
    const result = buildExploreQuery(
      entity,
      input.columns,
      input.filters,
      input.limit
    );
    return {
      success: true,
      sql: result.sql,
      entity,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      entity,
    };
  }
}
