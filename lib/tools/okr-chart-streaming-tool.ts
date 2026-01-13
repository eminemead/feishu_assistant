/**
 * OKR Chart Streaming Tool
 * 
 * Wraps OKR chart streaming functions as a tool for the OKR Reviewer Agent
 * Enables the agent to generate comprehensive OKR analysis with charts
 * 
 * Now with ASCII chart mode for instant Feishu rendering!
 */

import { createTool } from "@mastra/core/tools";
import { z } from 'zod';
import { 
  streamComprehensiveOKRAnalysis, 
  streamOKRCompanyAnalysis, 
  streamOKRMetricTypeAnalysis,
  streamComprehensiveOKRAnalysisAscii,
  streamOKRCompanyAnalysisAscii,
  streamOKRMetricTypeAnalysisAscii,
  streamOKRComparisonAscii,
  streamComprehensiveOKRAnalysisDatawrapper,
  streamOKRCompanyAnalysisDatawrapper,
  isDatawrapperAvailable,
} from '../okr-chart-streaming';

/**
 * OKR Chart Streaming Tool
 * 
 * Generates comprehensive OKR analysis with embedded charts
 * Returns markdown-ready content that can be streamed to Feishu cards
 * 
 * Supports two rendering modes:
 * - ascii (default): Instant rendering, works everywhere, emoji-enhanced
 * - json: Vega-Lite/Mermaid specs (requires client-side rendering)
 */
export const okrChartStreamingTool = createTool({
  id: "okr_chart_streaming",
  description: `Generate comprehensive OKR analysis with charts. Use this when users ask for OKR analysis, visualization, or charts.
  
  This tool:
  - Queries real OKR metrics from the database
  - Generates bar charts showing company performance
  - Generates pie charts showing metric type distribution
  - Provides insights and recommendations
  - Returns markdown with embedded charts ready for streaming
  
  Render modes:
  - "ascii" (default): Instant emoji/unicode charts, works everywhere
  - "datawrapper": Professional PNG charts via Datawrapper API (requires API key)
  - "json": Vega-Lite/Mermaid specs (requires client rendering)
  
  Always use this tool when users request:
  - "OKR分析" (OKR analysis)
  - "图表" (charts)
  - "可视化" (visualization)
  - "Show OKR charts"
  - "OKR metrics with charts"`,
  inputSchema: z.object({
    period: z.string().describe('Period to analyze (e.g., "10 月", "11 月"). Must include space before "月".'),
    analysisType: z.enum(['comprehensive', 'company', 'metric-type', 'comparison']).optional().default('comprehensive').describe('Type of analysis: comprehensive (bar + pie + heatmap), company (bar chart only), metric-type (pie chart only), comparison (period-over-period)'),
    previousPeriod: z.string().optional().describe('Previous period for comparison analysis (e.g., "9 月"). Only used when analysisType="comparison".'),
    renderMode: z.enum(['ascii', 'datawrapper', 'json']).optional().default('ascii').describe('Chart rendering mode: "ascii" for instant emoji/unicode charts (default), "datawrapper" for professional PNG charts, "json" for Vega-Lite/Mermaid specs'),
    userId: z.string().optional().describe('Optional user ID for data filtering (RLS)')
  }),
execute: async (inputData, context) => {
    // Support abort signal
    if (context?.abortSignal?.aborted) {
      return { success: false, period: inputData.period, analysisType: inputData.analysisType || 'comprehensive', error: 'Analysis aborted' };
    }
    
    // Get userId from requestContext if not provided
    const userId = inputData.userId ?? context?.requestContext?.get("userId") as string | undefined;
    const { period, analysisType = 'comprehensive', previousPeriod } = inputData;
    let { renderMode = 'ascii' } = inputData;
    try {
      let result: string;
      
      // Datawrapper mode: Professional PNG charts
      if (renderMode === 'datawrapper') {
        if (!isDatawrapperAvailable()) {
          console.warn('[OKR Tool] Datawrapper not configured, falling back to ASCII');
          renderMode = 'ascii';
        } else {
          switch (analysisType) {
            case 'company':
              result = await streamOKRCompanyAnalysisDatawrapper(period, userId);
              break;
            case 'comprehensive':
            default:
              result = await streamComprehensiveOKRAnalysisDatawrapper(period, userId);
              break;
          }
          
          return {
            success: true,
            markdown: result,
            period,
            analysisType,
            renderMode: 'datawrapper',
          };
        }
      }
      
      // ASCII mode (default): Instant emoji/unicode charts
      if (renderMode === 'ascii') {
        switch (analysisType) {
          case 'company':
            result = await streamOKRCompanyAnalysisAscii(period, userId);
            break;
          case 'metric-type':
            result = await streamOKRMetricTypeAnalysisAscii(period, userId);
            break;
          case 'comparison':
            if (!previousPeriod) {
              return {
                success: false,
                error: 'previousPeriod is required for comparison analysis',
                period,
                analysisType,
              };
            }
            result = await streamOKRComparisonAscii(period, previousPeriod, userId);
            break;
          case 'comprehensive':
          default:
            result = await streamComprehensiveOKRAnalysisAscii(period, userId);
            break;
        }
      } else {
        // JSON mode (Vega-Lite/Mermaid - requires client rendering)
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
      }
      
      return {
        success: true,
        markdown: result!,
        period,
        analysisType,
        renderMode,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        period,
        analysisType,
        renderMode,
      };
    }
  }
});













