/**
 * OKR Chart Streaming Tool
 * 
 * Wraps OKR chart streaming functions as a tool for the OKR Reviewer Agent
 * Enables the agent to generate comprehensive OKR analysis with charts
 */

import { tool } from 'ai';
import { z } from 'zod';
import { streamComprehensiveOKRAnalysis, streamOKRCompanyAnalysis, streamOKRMetricTypeAnalysis } from '../okr-chart-streaming';

/**
 * OKR Chart Streaming Tool
 * 
 * Generates comprehensive OKR analysis with embedded charts
 * Returns markdown-ready content that can be streamed to Feishu cards
 */
export const okrChartStreamingTool = tool({
  description: `Generate comprehensive OKR analysis with charts. Use this when users ask for OKR analysis, visualization, or charts.
  
  This tool:
  - Queries real OKR metrics from the database
  - Generates bar charts showing company performance
  - Generates pie charts showing metric type distribution
  - Provides insights and recommendations
  - Returns markdown with embedded charts ready for streaming
  
  Always use this tool when users request:
  - "OKR分析" (OKR analysis)
  - "图表" (charts)
  - "可视化" (visualization)
  - "Show OKR charts"
  - "OKR metrics with charts"`,
  parameters: z.object({
    period: z.string().describe('Period to analyze (e.g., "10 月", "11 月"). Must include space before "月".'),
    analysisType: z.enum(['comprehensive', 'company', 'metric-type']).optional().default('comprehensive').describe('Type of analysis: comprehensive (bar + pie charts), company (bar chart only), metric-type (pie chart only)'),
    userId: z.string().optional().describe('Optional user ID for data filtering (RLS)')
  }),
  execute: async ({ period, analysisType = 'comprehensive', userId }) => {
    try {
      let result: string;
      
      switch (analysisType) {
        case 'company':
          result = await streamOKRCompanyAnalysis(period, userId);
          break;
        case 'metric-type':
          result = await streamOKRMetricTypeAnalysis(period, userId);
          break;
        case 'comprehensive':
        default:
          result = await streamComprehensiveOKRAnalysis(period, userId);
          break;
      }
      
      return {
        success: true,
        markdown: result,
        period,
        analysisType
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        period,
        analysisType
      };
    }
  }
});









