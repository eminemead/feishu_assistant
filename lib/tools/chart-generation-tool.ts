/**
 * Chart Generation Tool for AI Agents
 * Enables agents to generate charts (Mermaid, Vega-Lite) that can be streamed in Feishu cards
 *
 * Usage:
 * - Agent calls this tool with chart request
 * - Tool returns markdown with embedded chart definition
 * - Markdown is streamed to Feishu card (typewriter effect)
 * - Client renders the chart in real-time
 */

import { tool } from 'ai';
import { z } from 'zod';
import * as mermaidCharts from '../visualization/mermaid-charts';
import * as vegaLiteCharts from '../visualization/vega-lite-charts';

/**
 * Chart request types
 */
export const ChartRequestSchema = z.object({
  chartType: z
    .enum(['mermaid', 'vega-lite'])
    .describe('Chart library: mermaid (text-based diagrams) or vega-lite (data visualization)'),

  subType: z
    .enum([
      // Mermaid diagrams
      'flowchart',
      'timeline',
      'pie',
      'hierarchy',
      'sequence',
      'mindmap',
      'architecture',
      'gantt',
      'state',
      'class',
      // Vega-Lite charts
      'bar',
      'line',
      'area',
      'scatter',
      'heatmap',
      'histogram',
      'boxplot',
      'waterfall',
      'bubble',
    ])
    .describe('Specific chart type'),

  data: z
    .any()
    .optional()
    .describe('Chart data - format depends on chart type. For mermaid: steps/nodes/connections. For vega-lite: array of data points'),

  title: z.string().describe('Chart title'),

  description: z
    .string()
    .describe(
      'Description of chart purpose - helps users understand what theyre looking at'
    ),

  options: z
    .record(z.any())
    .optional()
    .describe('Chart options (title, width, height, colors, etc.)'),
});

export type ChartRequest = z.infer<typeof ChartRequestSchema>;

/**
 * Chart response - contains markdown ready for streaming
 */
export interface ChartResponse {
  success: boolean;
  markdown: string;
  type: 'mermaid' | 'vega-lite';
  subType: string;
  title: string;
  description: string;
  rendererHint: string; // How to render: 'mermaid-native', 'vega-lite-json', 'fallback-markdown'
  streamable: true; // All outputs from this tool are streamable
}

/**
 * Generate chart based on request
 */
function generateChart(request: ChartRequest): ChartResponse {
  const options = request.options || {};

  try {
    if (request.chartType === 'mermaid') {
      return generateMermaidChart(request, options);
    } else if (request.chartType === 'vega-lite') {
      return generateVegaLiteChart(request, options);
    } else {
      throw new Error(`Unsupported chart type: ${request.chartType}`);
    }
  } catch (error) {
    return {
      success: false,
      markdown: `**Error generating ${request.subType} chart**: ${error instanceof Error ? error.message : String(error)}`,
      type: request.chartType,
      subType: request.subType,
      title: request.title,
      description: request.description,
      rendererHint: 'fallback-markdown',
      streamable: true,
    };
  }
}

/**
 * Generate Mermaid diagram
 */
function generateMermaidChart(request: ChartRequest, options: any): ChartResponse {
  let markdown: string;
  let rendererHint = 'mermaid-native';

  switch (request.subType) {
    case 'flowchart': {
      // Data format: { steps: Array<{id, label}>, connections: Array<{from, to, label}> }
      const data = request.data || { steps: [], connections: [] };
      const result = mermaidCharts.createFlowchart(
        data.steps || [],
        data.connections || [],
        {
          title: options.title || request.title,
          direction: options.direction || 'TB',
        }
      );
      markdown = result.markdown;
      break;
    }

    case 'timeline': {
      const data = request.data || [];
      const result = mermaidCharts.createTimeline(data, {
        title: options.title || request.title,
      });
      markdown = result.markdown;
      break;
    }

    case 'pie': {
      const data = request.data || {};
      const result = mermaidCharts.quickPieChart(data, {
        title: options.title || request.title,
      });
      markdown = result.markdown;
      break;
    }

    case 'hierarchy': {
      const data = request.data || { root: '', nodes: [] };
      const result = mermaidCharts.createHierarchy(
        data.root || '',
        data.nodes || [],
        {
          title: options.title || request.title,
          direction: options.direction || 'TB',
        }
      );
      markdown = result.markdown;
      break;
    }

    case 'sequence': {
      const data = request.data || { actors: [], interactions: [] };
      const result = mermaidCharts.createSequenceDiagram(
        data.actors || [],
        data.interactions || [],
        {
          title: options.title || request.title,
        }
      );
      markdown = result.markdown;
      break;
    }

    case 'mindmap': {
      const data = request.data || {};
      const result = mermaidCharts.createMindmap(
        options.title || request.title || 'Mindmap',
        data,
        { emoji: options.emoji }
      );
      markdown = result.markdown;
      break;
    }

    case 'architecture': {
      const data = request.data || { components: [], connections: [] };
      const result = mermaidCharts.createArchitecture(
        data.components || [],
        data.connections || [],
        {
          title: options.title || request.title,
        }
      );
      markdown = result.markdown;
      break;
    }

    case 'gantt': {
      const data = request.data || [];
      const result = mermaidCharts.createGanttChart(data, {
        title: options.title || request.title,
      });
      markdown = result.markdown;
      break;
    }

    case 'state': {
      const data = request.data || { states: [], transitions: [] };
      const result = mermaidCharts.createStateDiagram(
        data.states || [],
        data.transitions || [],
        {
          title: options.title || request.title,
          initialState: options.initialState,
          finalState: options.finalState,
        }
      );
      markdown = result.markdown;
      break;
    }

    case 'class': {
      const data = request.data || { classes: [], relationships: [] };
      const result = mermaidCharts.createClassDiagram(
        data.classes || [],
        data.relationships || [],
        {
          title: options.title || request.title,
        }
      );
      markdown = result.markdown;
      break;
    }

    default:
      throw new Error(`Unsupported mermaid chart type: ${request.subType}`);
  }

  return {
    success: true,
    markdown,
    type: 'mermaid',
    subType: request.subType,
    title: request.title,
    description: request.description,
    rendererHint,
    streamable: true,
  };
}

/**
 * Generate Vega-Lite chart
 */
function generateVegaLiteChart(request: ChartRequest, options: any): ChartResponse {
  let result: { markdown: string; json: any };
  const chartOptions = {
    title: options.title || request.title,
    width: options.width || 400,
    height: options.height || 300,
    ...options,
  };

  const data = request.data || [];

  switch (request.subType) {
    case 'bar':
      result = vegaLiteCharts.barChart(data, chartOptions);
      break;
    case 'line':
      result = vegaLiteCharts.lineChart(data, chartOptions);
      break;
    case 'area':
      result = vegaLiteCharts.areaChart(data, chartOptions);
      break;
    case 'scatter':
      result = vegaLiteCharts.scatterPlot(data, chartOptions);
      break;
    case 'pie':
      result = vegaLiteCharts.pieChart(data, chartOptions);
      break;
    case 'heatmap':
      result = vegaLiteCharts.heatmap(data, chartOptions);
      break;
    case 'histogram':
      result = vegaLiteCharts.histogram(data, chartOptions);
      break;
    case 'boxplot':
      result = vegaLiteCharts.boxPlot(data, chartOptions);
      break;
    case 'waterfall':
      result = vegaLiteCharts.waterfallChart(data, chartOptions);
      break;
    case 'bubble':
      result = vegaLiteCharts.bubbleChart(data, chartOptions);
      break;
    default:
      throw new Error(`Unsupported vega-lite chart type: ${request.subType}`);
  }

  return {
    success: true,
    markdown:
      result.markdown +
      `\n\n**Chart Type**: ${request.subType}\n**Data Points**: ${Array.isArray(data) ? data.length : 0}`,
    type: 'vega-lite',
    subType: request.subType,
    title: request.title,
    description: request.description,
    rendererHint: 'vega-lite-json',
    streamable: true,
  };
}

/**
 * AI Tool Definition - Chart Generation
 * This tool is used by agents to generate charts for Feishu responses
 */
export const chartGenerationTool = tool({
  description: `Generate charts (Mermaid diagrams or Vega-Lite visualizations) as markdown for streaming in Feishu cards.

IMPORTANT: All outputs from this tool are fully streamable in Feishu.

Supported Mermaid diagrams (text-based, render natively):
- flowchart: Process flows, decision trees, workflows
- timeline: Events, milestones, project schedule
- pie: Composition, market share, percentages
- hierarchy: Org charts, taxonomies, category trees
- sequence: API calls, system interactions, message flows
- mindmap: Brainstorming, knowledge structure, concepts
- architecture: System design, component relationships
- gantt: Project timelines, schedules
- state: State machines, workflow states
- class: OOP design, data structures

Supported Vega-Lite charts (data-driven, 50+ types):
- bar: Categorical comparisons
- line: Time series, trends
- area: Stacked areas, cumulative trends
- scatter: Correlation, distribution
- pie: Composition
- heatmap: Matrix visualization, correlation
- histogram: Distribution analysis
- boxplot: Statistical distribution
- waterfall: Cumulative effect
- bubble: Multi-dimensional data`,

  parameters: ChartRequestSchema,

  execute: async (params: ChartRequest): Promise<ChartResponse> => {
    return generateChart(params);
  },
});

/**
 * Example usage guide for agents
 */
export const CHART_TOOL_EXAMPLES = {
  flowchart: {
    request: {
      chartType: 'mermaid',
      subType: 'flowchart',
      title: 'User Authentication Flow',
      description: 'Shows how user authentication works',
      data: {
        steps: [
          { id: 'start', label: 'User Login' },
          { id: 'validate', label: 'Validate Credentials', shape: 'diamond' },
          { id: 'success', label: 'Login Success' },
          { id: 'error', label: 'Show Error' },
        ],
        connections: [
          { from: 'start', to: 'validate' },
          { from: 'validate', to: 'success', label: 'Valid' },
          { from: 'validate', to: 'error', label: 'Invalid' },
        ],
      },
    },
  },

  timeline: {
    request: {
      chartType: 'mermaid',
      subType: 'timeline',
      title: 'Product Launch Timeline',
      description: 'Key milestones for product launch',
      data: [
        { date: '2024-01-15', event: 'Design Phase Complete' },
        { date: '2024-02-01', event: 'Development Starts' },
        { date: '2024-03-15', event: 'Beta Testing' },
        { date: '2024-04-01', event: 'General Release' },
      ],
    },
  },

  barChart: {
    request: {
      chartType: 'vega-lite',
      subType: 'bar',
      title: 'Q1 Sales by Region',
      description: 'Sales performance across regions',
      data: [
        { category: 'North', value: 28000 },
        { category: 'South', value: 35000 },
        { category: 'East', value: 42000 },
        { category: 'West', value: 38000 },
      ],
    },
  },

  lineChart: {
    request: {
      chartType: 'vega-lite',
      subType: 'line',
      title: 'User Growth Over Time',
      description: 'Monthly active users trend',
      data: [
        { x: '2024-01', y: 1000 },
        { x: '2024-02', y: 1200 },
        { x: '2024-03', y: 1500 },
        { x: '2024-04', y: 1800 },
      ],
    },
  },

  pieChart: {
    request: {
      chartType: 'mermaid',
      subType: 'pie',
      title: 'Market Share Distribution',
      description: 'Competitor market share',
      data: {
        'Company A': 35,
        'Company B': 25,
        'Company C': 20,
        'Others': 20,
      },
    },
  },
};
