/**
 * Visualization Tool
 * 
 * Generic chart generation tool for all agents.
 * Uses the unified VisualizationService for consistent rendering.
 * 
 * Features:
 * - Multiple chart types (bar, pie, line, heatmap, table)
 * - Multiple render modes (ascii, datawrapper, mermaid, vega-lite)
 * - Automatic fallback on failure
 * - Caching for performance
 * - Feishu image upload integration
 */

import { createTool } from "@mastra/core/tools";
import { z } from 'zod';
import { getVisualizationService, RenderMode } from '../services/visualization-service';

/**
 * Chart data schemas
 */
const BarDataSchema = z.array(z.object({
  label: z.string(),
  value: z.number(),
}));

const PieDataSchema = z.array(z.object({
  label: z.string(),
  value: z.number(),
}));

const LineDataSchema = z.array(z.object({
  x: z.string(),
  y: z.number(),
  series: z.string().optional(),
}));

const HeatmapDataSchema = z.array(z.object({
  row: z.string(),
  metrics: z.array(z.object({
    column: z.string(),
    value: z.number(),
  })),
}));

const TableDataSchema = z.array(z.object({
  label: z.string(),
  value: z.number(),
  target: z.number().optional(),
}));

/**
 * Generic Visualization Tool
 * 
 * Use this tool to generate charts and visualizations in any agent.
 */
export const visualizationTool = createTool({
  id: "visualization",
  description: `Generate charts and visualizations. Returns markdown with the chart embedded.

Supported chart types:
- bar: Horizontal or vertical bar chart for comparing categories
- pie: Pie or donut chart for showing composition/distribution
- line: Line chart for trends over time
- heatmap: Matrix visualization with color-coded cells
- table: Comparison table with inline progress bars
- stats: Summary statistics block
- sparkline: Inline trend indicator

Render modes:
- auto (default): Automatically selects best available (datawrapper > ascii)
- ascii: Instant emoji/unicode charts, works everywhere
- datawrapper: Professional PNG charts (requires API key)
- mermaid: Text-based diagrams
- vega-lite: JSON specs for client-side rendering

Examples:
- Bar chart: { chartType: "bar", data: [{ label: "A", value: 10 }], title: "Sales" }
- Pie chart: { chartType: "pie", data: [{ label: "A", value: 30 }], title: "Share" }
- Heatmap: { chartType: "heatmap", data: [{ row: "Co1", metrics: [{ column: "M1", value: 80 }] }] }`,

  inputSchema: z.object({
    chartType: z.enum(['bar', 'pie', 'line', 'heatmap', 'table', 'stats', 'sparkline'])
      .describe('Type of chart to generate'),
    
    data: z.union([BarDataSchema, PieDataSchema, LineDataSchema, HeatmapDataSchema, TableDataSchema, z.array(z.number())])
      .describe('Chart data. Format depends on chartType.'),
    
    title: z.string()
      .describe('Chart title'),
    
    options: z.object({
      horizontal: z.boolean().optional().describe('For bar charts: use horizontal bars'),
      donut: z.boolean().optional().describe('For pie charts: render as donut'),
      sortDesc: z.boolean().optional().describe('For bar charts: sort by value descending'),
      showValues: z.boolean().optional().describe('For heatmaps: show numeric values'),
      thresholds: z.tuple([z.number(), z.number()]).optional().describe('For heatmaps: [low, high] thresholds'),
    }).optional().describe('Chart-specific options'),
    
    renderMode: z.enum(['auto', 'ascii', 'datawrapper', 'mermaid', 'vega-lite']).optional()
      .default('auto')
      .describe('Rendering mode. Default: auto (best available)'),
  }),

execute: async (inputData, context) => {
    // Support abort signal
    if (context?.abortSignal?.aborted) {
      return { success: false, markdown: '', mode: 'ascii', error: 'Aborted' };
    }
    
    const { chartType, data, title, options = {}, renderMode = 'auto' } = inputData;
    const viz = getVisualizationService();
    const mode = renderMode as RenderMode;

    try {
      switch (chartType) {
        case 'bar': {
          const barData = data as Array<{ label: string; value: number }>;
          const result = await viz.barChart(barData, {
            title,
            horizontal: options.horizontal,
            sortDesc: options.sortDesc,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
          };
        }

        case 'pie': {
          const pieData = data as Array<{ label: string; value: number }>;
          const result = await viz.pieChart(pieData, {
            title,
            donut: options.donut,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
          };
        }

        case 'line': {
          const lineData = data as Array<{ x: string; y: number; series?: string }>;
          const result = await viz.lineChart(lineData, {
            title,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
          };
        }

        case 'heatmap': {
          const heatmapData = data as Array<{ row: string; metrics: Array<{ column: string; value: number }> }>;
          const result = await viz.heatmap(heatmapData, {
            title,
            showValues: options.showValues,
            thresholds: options.thresholds,
            mode,
          });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
          };
        }

        case 'table': {
          const tableData = data as Array<{ label: string; value: number; target?: number }>;
          const result = await viz.comparisonTable(tableData, { title, mode });
          return {
            success: true,
            markdown: result.markdown,
            mode: result.mode,
            usedFallback: result.usedFallback,
          };
        }

        case 'stats': {
          const values = data as number[];
          const markdown = viz.summaryStats(values, { title, showDistribution: true });
          return {
            success: true,
            markdown,
            mode: 'ascii',
            usedFallback: false,
          };
        }

        case 'sparkline': {
          const values = data as number[];
          const sparkline = viz.sparkline(values);
          return {
            success: true,
            markdown: `**${title}**: ${sparkline}`,
            mode: 'ascii',
            usedFallback: false,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown chart type: ${chartType}`,
            markdown: '',
            mode: 'ascii',
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        markdown: '',
        mode: 'ascii',
      };
    }
  },
});

/**
 * Quick chart helpers for programmatic use
 */
export async function quickBarChart(
  data: Array<{ label: string; value: number }>,
  title: string,
  options?: { horizontal?: boolean; sortDesc?: boolean; mode?: RenderMode }
): Promise<string> {
  const viz = getVisualizationService();
  const result = await viz.barChart(data, { title, ...options });
  return result.markdown;
}

export async function quickPieChart(
  data: Array<{ label: string; value: number }>,
  title: string,
  options?: { donut?: boolean; mode?: RenderMode }
): Promise<string> {
  const viz = getVisualizationService();
  const result = await viz.pieChart(data, { title, ...options });
  return result.markdown;
}

export async function quickLineChart(
  data: Array<{ x: string; y: number }>,
  title: string,
  options?: { mode?: RenderMode }
): Promise<string> {
  const viz = getVisualizationService();
  const result = await viz.lineChart(data, { title, ...options });
  return result.markdown;
}
