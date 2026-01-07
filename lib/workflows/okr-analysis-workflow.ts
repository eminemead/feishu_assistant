/**
 * OKR Analysis Workflow
 * 
 * Orchestrates OKR analysis using Mastra workflows:
 * 1. Query DB → Get OKR metrics
 * 2. Generate Charts → Create visualizations
 * 3. Analyze → Agent generates insights
 * 4. Format Response → Combine into final report
 * 
 * Uses Mastra v1 beta workflow pattern for deterministic multi-step processes
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { analyzeHasMetricPercentage } from "../agents/okr-reviewer-agent";
import { chartGenerationTool, ChartResponse } from "../tools/chart-generation-tool";
import { getOkrReviewerAgent } from "../agents/okr-reviewer-agent";

/**
 * Step 1: Query OKR Data
 * Fetches OKR metrics from database
 */
const queryOkrDataStep = createStep({
  id: "query-okr-data",
  description: "Query OKR metrics from database",
  inputSchema: z.object({
    period: z.string().describe('Period to analyze (e.g., "10 月", "11 月")'),
    userId: z.string().optional().describe('Optional user ID for data filtering (RLS)')
  }),
  outputSchema: z.object({
    metrics: z.any().describe('OKR metrics data from database'),
    period: z.string(),
    userId: z.string().optional()
  }),
  execute: async ({ inputData }) => {
    const { period, userId } = inputData;
    
    console.log(`[OKR Workflow] Querying OKR data for period: ${period}, userId: ${userId || 'none'}`);
    const metrics = await analyzeHasMetricPercentage(period, userId);
    
    // Better error diagnostics
    if (metrics.error) {
      throw new Error(`OKR query failed for period "${period}": ${metrics.error}`);
    }
    
    if (metrics.filtered_by_user && metrics.total_companies === 0) {
      throw new Error(`No OKR data accessible for user "${userId}" in period "${period}". User may lack permissions or no matching data exists.`);
    }
    
    if (!metrics.summary || metrics.summary.length === 0) {
      throw new Error(`No OKR data found for period "${period}". Check if data exists for this period.`);
    }
    
    return {
      metrics,
      period,
      userId
    };
  }
});

/**
 * Step 2: Generate Charts
 * Creates visualizations from OKR data
 */
const generateChartsStep = createStep({
  id: "generate-charts",
  description: "Generate charts from OKR metrics",
  inputSchema: z.object({
    metrics: z.any(),
    period: z.string(),
    userId: z.string().optional()
  }),
  outputSchema: z.object({
    charts: z.array(z.object({
      type: z.string(),
      markdown: z.string(),
      title: z.string()
    })),
    metrics: z.any(),
    period: z.string()
  }),
  execute: async ({ inputData }) => {
    const { metrics, period } = inputData;
    
    console.log(`[OKR Workflow] Generating charts for ${metrics.total_companies} companies`);
    
    const charts: Array<{ type: string; markdown: string; title: string }> = [];
    
    // Chart 1: Bar chart by company
    if (metrics.summary && metrics.summary.length > 0) {
      const chartData = metrics.summary.map((item: any) => ({
        category: item.company || item.company_name,
        value: parseFloat(item.average_has_metric_percentage) || parseFloat(item.avg_has_metric_pct) || 0
      }));
      
      if (chartData.length > 0) {
        const barChart = await (chartGenerationTool.execute as any)({
          chartType: 'vega-lite',
          subType: 'bar',
          title: `Has Metric % by Company (${period})`,
          description: 'Percentage of metrics with values by company',
          data: chartData,
          options: {
            width: 500,
            height: 300,
            xLabel: 'Company',
            yLabel: 'Has Metric %',
            orientation: 'vertical'
          }
        }) as ChartResponse;
        
        charts.push({
          type: 'bar',
          markdown: barChart.markdown,
          title: `Company Performance - ${period}`
        });
      }
    }
    
    // Chart 2: Pie chart for metric types (if available)
    const metricCounts: Record<string, number> = {};
    if (metrics.summary) {
      metrics.summary.forEach((item: any) => {
        const metricDetails = item.metrics || item.metric_details || [];
        metricDetails.forEach((detail: any) => {
          const typeKey = detail.metric_type;
          if (typeKey) {
            metricCounts[typeKey] = (metricCounts[typeKey] || 0) + 1;
          }
        });
      });
    }
    
    if (Object.keys(metricCounts).length > 0) {
      const pieChart = await (chartGenerationTool.execute as any)({
        chartType: 'mermaid',
        subType: 'pie',
        title: `Metric Type Distribution (${period})`,
        description: 'Distribution of metrics by type',
        data: metricCounts
      }) as ChartResponse;
      
      charts.push({
        type: 'pie',
        markdown: pieChart.markdown,
        title: `Metric Types - ${period}`
      });
    }
    
    return {
      charts,
      metrics,
      period
    };
  }
});

/**
 * Step 3: Analyze with Agent
 * Uses OKR Reviewer Agent to generate insights
 */
const analyzeStep = createStep({
  id: "analyze",
  description: "Generate insights using OKR Reviewer Agent",
  inputSchema: z.object({
    charts: z.array(z.object({
      type: z.string(),
      markdown: z.string(),
      title: z.string()
    })),
    metrics: z.any(),
    period: z.string()
  }),
  outputSchema: z.object({
    analysis: z.string(),
    charts: z.array(z.object({
      type: z.string(),
      markdown: z.string(),
      title: z.string()
    })),
    metrics: z.any(),
    period: z.string()
  }),
  execute: async ({ inputData }) => {
    const { charts, metrics, period } = inputData;
    
    console.log(`[OKR Workflow] Generating analysis with OKR Reviewer Agent`);
    
    // Get OKR Reviewer Agent
    const okrAgent = getOkrReviewerAgent();
    
    // Create analysis prompt
    const analysisPrompt = `Analyze the following OKR metrics for period ${period}:

Overall Statistics:
- Total Companies: ${metrics.total_companies}
- Overall Average Has Metric: ${(metrics.overall_average || 0).toFixed(1)}%

Company Performance:
${metrics.summary?.map((s: any) => `- ${s.company || s.company_name}: ${(parseFloat(s.average_has_metric_percentage) || parseFloat(s.avg_has_metric_pct) || 0).toFixed(1)}%`).join('\n') || 'No data'}

Generate a comprehensive analysis with:
1. Key insights from the data
2. Top performing companies
3. Companies needing attention
4. Recommendations for improvement
5. Trends and patterns

Format your response in Markdown.`;

    // Generate analysis
    const result = await okrAgent.generate(analysisPrompt);
    
    return {
      analysis: result.text,
      charts,
      metrics,
      period
    };
  }
});

/**
 * Step 4: Format Response
 * Combines analysis and charts into final report
 */
const formatResponseStep = createStep({
  id: "format-response",
  description: "Format final response with analysis and charts",
  inputSchema: z.object({
    analysis: z.string(),
    charts: z.array(z.object({
      type: z.string(),
      markdown: z.string(),
      title: z.string()
    })),
    metrics: z.any(),
    period: z.string()
  }),
  outputSchema: z.object({
    response: z.string(),
    period: z.string()
  }),
  execute: async ({ inputData }) => {
    const { analysis, charts, metrics, period } = inputData;
    
    console.log(`[OKR Workflow] Formatting final response`);
    
    let response = `# OKR Metrics Analysis Report\n\n`;
    response += `**Period**: ${period}\n`;
    response += `**Total Companies**: ${metrics.total_companies}\n`;
    response += `**Overall Has Metric Average**: ${(metrics.overall_average || 0).toFixed(1)}%\n\n`;
    
    // Add charts
    if (charts.length > 0) {
      response += `## Visualizations\n\n`;
      charts.forEach((chart, index) => {
        response += `### ${index + 1}. ${chart.title}\n\n`;
        response += chart.markdown + '\n\n';
      });
    }
    
    // Add analysis
    response += `## Analysis\n\n`;
    response += analysis + '\n\n';
    
    // Add summary
    response += `## Summary\n\n`;
    response += `- **Period Analyzed**: ${period}\n`;
    response += `- **Companies Analyzed**: ${metrics.total_companies}\n`;
    response += `- **Average Performance**: ${(metrics.overall_average || 0).toFixed(1)}%\n`;
    response += `- **Charts Generated**: ${charts.length}\n\n`;
    
    return {
      response,
      period
    };
  }
});

/**
 * OKR Analysis Workflow
 * 
 * Orchestrates: Query → Generate Charts → Analyze → Format
 */
export const okrAnalysisWorkflow = createWorkflow({
  id: "okr-analysis",
  description: "Complete OKR analysis with charts and insights",
  inputSchema: z.object({
    period: z.string().describe('Period to analyze (e.g., "10 月", "11 月")'),
    userId: z.string().optional().describe('Optional user ID for data filtering (RLS)')
  }),
  outputSchema: z.object({
    response: z.string().describe('Formatted OKR analysis report with charts'),
    period: z.string()
  })
})
  .then(queryOkrDataStep)
  .then(generateChartsStep)
  .then(analyzeStep)
  .then(formatResponseStep)
  .commit();













