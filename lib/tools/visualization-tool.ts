/**
 * Visualization Tool
 *
 * General-purpose chart generation for any data analysis scenario.
 * Uses VisualizationService for unified rendering across agents.
 *
 * Data input options:
 * - Direct data: Pass structured [{label, value}] array
 * - From file: Pass source with raw text (CSV/JSON) and column mappings
 *
 * Render modes:
 * - auto (default): Datawrapper PNG if configured, else ASCII
 * - ascii: Instant emoji/unicode charts, works everywhere
 * - datawrapper: Professional PNG charts (requires DATAWRAPPER_API_KEY)
 *
 * For Feishu: Images are auto-uploaded, returns markdown with image_key.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  getVisualizationService,
  type RenderMode,
} from "../services/visualization-service";

// =============================================================================
// CSV/JSON Parsing Helpers
// =============================================================================

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);

  // Parse rows
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseJSON(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function extractChartData(
  rows: Record<string, unknown>[],
  labelColumn: string,
  valueColumn: string,
  targetColumn?: string
): Array<{ label: string; value: number; target?: number }> {
  return rows
    .map((row) => {
      const label = String(row[labelColumn] || "");
      const value = parseFloat(String(row[valueColumn] || "0")) || 0;
      const target = targetColumn
        ? parseFloat(String(row[targetColumn] || "0")) || undefined
        : undefined;
      return { label, value, target };
    })
    .filter((d) => d.label); // Remove empty labels
}

// =============================================================================
// Schema
// =============================================================================

const dataPointSchema = z.object({
  label: z.string().describe("Category/row label"),
  value: z.number().describe("Numeric value"),
  target: z.number().optional().describe("Optional target value (for tables)"),
});

const sourceSchema = z.object({
  text: z.string().describe("Raw file content (CSV or JSON text)"),
  format: z.enum(["csv", "json"]).describe("File format"),
  labelColumn: z.string().describe("Column name for labels/categories"),
  valueColumn: z.string().describe("Column name for numeric values"),
  targetColumn: z.string().optional().describe("Column name for target values (optional)"),
});

const visualizationInputSchema = z.object({
  chartType: z
    .enum(["bar", "pie", "line", "heatmap", "table"])
    .describe("Type of chart to generate"),

  // Either direct data OR source (file content)
  data: z
    .array(dataPointSchema)
    .optional()
    .describe("Direct chart data as label-value pairs"),

  source: sourceSchema
    .optional()
    .describe("File source: raw text content with column mappings (use readFile first to get the text)"),

  title: z.string().describe("Chart title"),

  options: z
    .object({
      horizontal: z.boolean().optional().describe("For bar: use horizontal bars"),
      sortDesc: z.boolean().optional().describe("For bar: sort by value descending"),
      donut: z.boolean().optional().describe("For pie: render as donut"),
      showValues: z.boolean().optional().describe("For heatmap: show numeric values"),
      thresholds: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe("For heatmap: [low, high] color thresholds"),
    })
    .optional()
    .describe("Chart-specific options"),

  renderMode: z
    .enum(["auto", "ascii", "datawrapper"])
    .optional()
    .default("auto")
    .describe("Render mode: auto (best available), ascii (instant), datawrapper (PNG)"),
});

// =============================================================================
// Tool Implementation
// =============================================================================

export const visualizationTool = createTool({
  id: "visualization",
  description: `Generate charts for data analysis. Returns markdown with embedded chart.

DATA INPUT - Two options:

1. **Direct data** (when you already have structured data):
   { data: [{ label: "North", value: 85 }, { label: "South", value: 72 }] }

2. **From file** (use readFile first, then pass the text):
   Step 1: readFile("/workspace/sales.csv") → returns raw CSV text
   Step 2: visualization({ 
     source: { 
       text: "<csv content from readFile>",
       format: "csv",
       labelColumn: "Region",
       valueColumn: "Sales"
     },
     chartType: "bar",
     title: "Sales by Region"
   })

CHART TYPES:
- bar: Compare categories (sales by region, scores by team)
- pie: Show composition (market share, budget allocation)  
- line: Show trends (growth over time, metrics by month)
- heatmap: Matrix with color coding (performance grid)
- table: Comparison with progress bars (actual vs target)

RENDER MODES:
- auto: Datawrapper PNG if API key set, else ASCII (default)
- ascii: Instant emoji/unicode charts, always works
- datawrapper: Professional PNG charts uploaded to Feishu`,

  inputSchema: visualizationInputSchema,

  execute: async (input, context) => {
    if (context?.abortSignal?.aborted) {
      return { success: false, markdown: "", error: "Aborted" };
    }

    const { chartType, title, options = {}, renderMode = "auto" } = input;
    let { data } = input;
    const { source } = input;

    // Validate: need either data or source
    if (!data && !source) {
      return {
        success: false,
        markdown: "",
        error: "Must provide either 'data' array or 'source' with file content",
      };
    }

    // Parse source if provided
    if (source && !data) {
      try {
        const rows =
          source.format === "csv"
            ? parseCSV(source.text)
            : parseJSON(source.text);

        if (rows.length === 0) {
          return {
            success: false,
            markdown: "",
            error: `No data rows found in ${source.format.toUpperCase()} content`,
          };
        }

        // Validate columns exist
        const firstRow = rows[0];
        if (!(source.labelColumn in firstRow)) {
          const available = Object.keys(firstRow).join(", ");
          return {
            success: false,
            markdown: "",
            error: `Column '${source.labelColumn}' not found. Available: ${available}`,
          };
        }
        if (!(source.valueColumn in firstRow)) {
          const available = Object.keys(firstRow).join(", ");
          return {
            success: false,
            markdown: "",
            error: `Column '${source.valueColumn}' not found. Available: ${available}`,
          };
        }

        data = extractChartData(
          rows,
          source.labelColumn,
          source.valueColumn,
          source.targetColumn
        );

        if (data.length === 0) {
          return {
            success: false,
            markdown: "",
            error: "No valid data rows after parsing",
          };
        }
      } catch (error) {
        return {
          success: false,
          markdown: "",
          error: `Failed to parse ${source.format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // At this point, data is guaranteed to exist
    const chartData = data!;
    const viz = getVisualizationService();
    const mode = renderMode as RenderMode;

    try {
      switch (chartType) {
        case "bar": {
          const result = await viz.barChart(chartData, {
            title,
            horizontal: options.horizontal,
            sortDesc: options.sortDesc,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            imageKey: result.imageKey,
            usedFallback: result.usedFallback,
            rowCount: chartData.length,
          };
        }

        case "pie": {
          const result = await viz.pieChart(chartData, {
            title,
            donut: options.donut,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            imageKey: result.imageKey,
            usedFallback: result.usedFallback,
            rowCount: chartData.length,
          };
        }

        case "line": {
          const lineData = chartData.map((d) => ({ x: d.label, y: d.value }));
          const result = await viz.lineChart(lineData, { title, mode });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            imageKey: result.imageKey,
            usedFallback: result.usedFallback,
            rowCount: chartData.length,
          };
        }

        case "heatmap": {
          const heatmapData = chartData.map((d) => ({
            row: d.label,
            metrics: [{ column: "Value", value: d.value }],
          }));
          const result = await viz.heatmap(heatmapData, {
            title,
            showValues: options.showValues ?? true,
            thresholds: options.thresholds,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
            rowCount: chartData.length,
          };
        }

        case "table": {
          const result = await viz.comparisonTable(chartData, { title, mode });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
            rowCount: chartData.length,
          };
        }

        default:
          return {
            success: false,
            markdown: "",
            error: `Unknown chart type: ${chartType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        markdown: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Factory function for custom configuration
 */
export function createVisualizationTool() {
  return visualizationTool;
}
