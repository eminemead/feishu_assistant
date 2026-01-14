/**
 * Semantic Layer Discovery Tools
 *
 * Tools for listing and discovering available metrics and tables
 * in the semantic layer.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  listMetrics,
  listEntities,
  loadMetric,
  loadEntity,
} from "../query-builder";

/**
 * List all available metrics
 */
export function createListMetricsTool() {
  return createTool({
    id: "list_metrics",
    description: `List all available metrics in the semantic layer.
Returns metric names with brief descriptions. Use get_metric_info for details.`,

    inputSchema: z.object({
      filter: z
        .string()
        .optional()
        .describe("Optional keyword to filter metrics"),
    }),

    execute: async ({ filter }) => {
      const metricNames = listMetrics();

      const metrics = metricNames
        .map((name) => {
          const def = loadMetric(name);
          return def
            ? {
                name: def.name,
                description: def.description.split("\n")[0].trim(), // First line only
                dimensions: def.dimensions,
                source_table: def.source_table,
              }
            : null;
        })
        .filter(Boolean);

      // Filter if keyword provided
      const filtered = filter
        ? metrics.filter(
            (m) =>
              m!.name.toLowerCase().includes(filter.toLowerCase()) ||
              m!.description.toLowerCase().includes(filter.toLowerCase())
          )
        : metrics;

      return {
        success: true,
        count: filtered.length,
        metrics: filtered,
        hint: "Use get_metric_info(metric_name) for full details including examples",
      };
    },
  });
}

/**
 * List all available tables/entities
 */
export function createListTablesTool() {
  return createTool({
    id: "list_tables",
    description: `List all available tables in the semantic layer.
Returns table names with brief descriptions. Use get_table_info for schema details.`,

    inputSchema: z.object({
      filter: z
        .string()
        .optional()
        .describe("Optional keyword to filter tables"),
    }),

    execute: async ({ filter }) => {
      const entityNames = listEntities();

      const entities = entityNames
        .map((name) => {
          const def = loadEntity(name);
          return def
            ? {
                name: def.name,
                description: def.description.split("\n")[0].trim(),
                database: def.database,
                column_count: def.columns.length,
              }
            : null;
        })
        .filter(Boolean);

      // Filter if keyword provided
      const filtered = filter
        ? entities.filter(
            (e) =>
              e!.name.toLowerCase().includes(filter.toLowerCase()) ||
              e!.description.toLowerCase().includes(filter.toLowerCase())
          )
        : entities;

      return {
        success: true,
        count: filtered.length,
        tables: filtered,
        hint: "Use get_table_info(table_name) for full schema details",
      };
    },
  });
}

/**
 * Search across metrics and tables
 */
export function createSearchSemanticLayerTool() {
  return createTool({
    id: "search_semantic_layer",
    description: `Search for metrics and tables by keyword.
Searches names and descriptions across the entire semantic layer.`,

    inputSchema: z.object({
      query: z.string().describe("Search keyword"),
    }),

    execute: async ({ query }) => {
      const q = query.toLowerCase();

      // Search metrics
      const metricNames = listMetrics();
      const matchingMetrics = metricNames
        .map((name) => {
          const def = loadMetric(name);
          if (!def) return null;

          const nameMatch = def.name.toLowerCase().includes(q);
          const descMatch = def.description.toLowerCase().includes(q);
          const dimMatch = def.dimensions.some((d) =>
            d.toLowerCase().includes(q)
          );

          if (nameMatch || descMatch || dimMatch) {
            return {
              type: "metric",
              name: def.name,
              description: def.description.split("\n")[0].trim(),
              matchedIn: [
                nameMatch && "name",
                descMatch && "description",
                dimMatch && "dimensions",
              ].filter(Boolean),
            };
          }
          return null;
        })
        .filter(Boolean);

      // Search entities
      const entityNames = listEntities();
      const matchingEntities = entityNames
        .map((name) => {
          const def = loadEntity(name);
          if (!def) return null;

          const nameMatch = def.name.toLowerCase().includes(q);
          const descMatch = def.description.toLowerCase().includes(q);
          const colMatch = def.columns.some(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.description.toLowerCase().includes(q)
          );

          if (nameMatch || descMatch || colMatch) {
            return {
              type: "table",
              name: def.name,
              description: def.description.split("\n")[0].trim(),
              matchedIn: [
                nameMatch && "name",
                descMatch && "description",
                colMatch && "columns",
              ].filter(Boolean),
            };
          }
          return null;
        })
        .filter(Boolean);

      return {
        success: true,
        query,
        results: {
          metrics: matchingMetrics,
          tables: matchingEntities,
        },
        totalMatches: matchingMetrics.length + matchingEntities.length,
      };
    },
  });
}

/**
 * Bundle all semantic layer tools
 */
export function createSemanticLayerTools() {
  return {
    listMetrics: createListMetricsTool(),
    listTables: createListTablesTool(),
    searchSemanticLayer: createSearchSemanticLayerTool(),
  };
}
