/**
 * OKR Chart Streaming Integration
 * 
 * Streams real OKR metrics from okr_metrics.db as charts to Feishu cards
 * Uses the same data source as the OKR Reviewer Agent
 */

import { analyzeHasMetricPercentage } from './agents/okr-reviewer-agent';
import { chartGenerationTool, ChartRequest, ChartResponse } from './tools/chart-generation-tool';

/**
 * Convert OKR analysis results to bar chart data
 * 
 * @param analysis - Result from analyzeHasMetricPercentage
 * @returns Array formatted for bar chart
 */
function transformToBarChartData(analysis: any) {
  if (!analysis.summary || analysis.summary.length === 0) {
    return [];
  }

  return analysis.summary.map((item: any) => ({
    category: item.company || item.company_name,
    value: parseFloat(item.average_has_metric_percentage) || parseFloat(item.avg_has_metric_pct) || 0
  }));
}

/**
 * Convert OKR summary to pie chart data for metric types
 * 
 * @param analysis - Result from analyzeHasMetricPercentage
 * @returns Object with metric type as key and count as value
 */
function transformToMetricTypePie(analysis: any) {
  if (!analysis.summary || analysis.summary.length === 0) {
    return {};
  }

  const metricCounts: Record<string, number> = {};
  
  analysis.summary.forEach((item: any) => {
    const metrics = item.metrics || item.metric_details || [];
    metrics.forEach((detail: any) => {
      const typeKey = detail.metric_type;
      if (typeKey) {
        metricCounts[typeKey] = (metricCounts[typeKey] || 0) + 1;
      }
    });
  });

  return metricCounts;
}

/**
 * Generate Mermaid flowchart showing OKR hierarchy
 * 
 * Shows: Period → Companies → Metric Types → Has Metric %
 */
function createOKRHierarchyChart(analysis: any) {
  const steps = [
    { id: 'period', label: `Period: ${analysis.period}` },
    { id: 'companies', label: `Companies: ${analysis.total_companies}` },
    { id: 'metrics', label: `Avg Has Metric: ${(analysis.overall_average || 0).toFixed(1)}%`, shape: 'diamond' }
  ];

  const connections = [
    { from: 'period', to: 'companies' },
    { from: 'companies', to: 'metrics' }
  ];

  return { steps, connections };
}

/**
 * Stream OKR analysis with bar chart - by company
 * 
 * Shows has_metric_percentage for each company
 */
export async function streamOKRCompanyAnalysis(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `## OKR Metrics Analysis - ${analysis.period}\n\n`;
  response += `**Overall Average Has Metric**: ${(analysis.overall_average || 0).toFixed(1)}%\n`;
  response += `**Total Companies**: ${analysis.total_companies}\n\n`;

  // Generate bar chart by company
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    response += `### Company Performance\n\n`;
    
    const barChart = await chartGenerationTool.execute({
      chartType: 'vega-lite',
      subType: 'bar',
      title: `Has Metric Percentage by Company (${analysis.period})`,
      description: 'Percentage of metrics with values by company',
      data: chartData,
      options: {
        width: 500,
        height: 300,
        xLabel: 'Company',
        yLabel: 'Has Metric %',
        orientation: 'vertical'
      }
    } as ChartRequest);

    response += barChart.markdown + '\n\n';

    // Add insights
    const topCompany = chartData.reduce((a, b) => a.value > b.value ? a : b);
    const bottomCompany = chartData.reduce((a, b) => a.value < b.value ? a : b);
    
    response += `**Key Insights:**\n`;
    response += `- **Top performer**: ${topCompany.category} (${topCompany.value.toFixed(1)}%)\n`;
    response += `- **Needs attention**: ${bottomCompany.category} (${bottomCompany.value.toFixed(1)}%)\n\n`;
  }

  return response;
}

/**
 * Stream OKR analysis with pie chart - metric type distribution
 */
export async function streamOKRMetricTypeAnalysis(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `## OKR Metric Type Distribution - ${analysis.period}\n\n`;

  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    const pieChart = await chartGenerationTool.execute({
      chartType: 'mermaid',
      subType: 'pie',
      title: `Metric Type Distribution (${analysis.period})`,
      description: 'Distribution of metrics by type',
      data: metricData
    } as ChartRequest);

    response += pieChart.markdown + '\n\n';

    // Add breakdown
    response += `**Metric Type Breakdown:**\n`;
    Object.entries(metricData).forEach(([type, count]) => {
      response += `- **${type}**: ${count} records\n`;
    });
    response += '\n';
  }

  return response;
}

/**
 * Stream comprehensive OKR analysis with multiple charts
 */
export async function streamComprehensiveOKRAnalysis(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `# OKR Metrics Analysis Report\n`;
  response += `**Period**: ${analysis.period}\n`;
  response += `**Total Companies**: ${analysis.total_companies}\n`;
  response += `**Overall Has Metric Average**: ${(analysis.overall_average || 0).toFixed(1)}%\n\n`;

  // Chart 1: Company performance bar chart
  response += `## 1. Company Performance\n\n`;
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    const barChart = await chartGenerationTool.execute({
      chartType: 'vega-lite',
      subType: 'bar',
      title: `Has Metric % by Company`,
      description: 'How well each company is capturing metrics',
      data: chartData,
      options: {
        width: 500,
        height: 300
      }
    } as ChartRequest);

    response += barChart.markdown + '\n\n';
  }

  // Chart 2: Metric type distribution
  response += `## 2. Metric Type Distribution\n\n`;
  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    const pieChart = await chartGenerationTool.execute({
      chartType: 'mermaid',
      subType: 'pie',
      title: `Metrics by Type`,
      description: 'What types of metrics are being tracked',
      data: metricData
    } as ChartRequest);

    response += pieChart.markdown + '\n\n';
  }

  // Summary insights
  response += `## 3. Summary Insights\n\n`;
  
  const avgMetrics = analysis.summary.map((s: any) => parseFloat(s.avg_has_metric_pct) || 0);
  const maxAvg = Math.max(...avgMetrics);
  const minAvg = Math.min(...avgMetrics);
  const rangeSpread = maxAvg - minAvg;

  response += `- **Highest performer**: ${maxAvg.toFixed(1)}%\n`;
  response += `- **Lowest performer**: ${minAvg.toFixed(1)}%\n`;
  response += `- **Performance spread**: ${rangeSpread.toFixed(1)} percentage points\n`;
  response += `- **Assessment**: ${rangeSpread > 30 ? 'High variance between companies' : 'Consistent performance across companies'}\n\n`;

  return response;
}

/**
 * Test streaming - returns chart markdown without Feishu integration
 * Use this to see what the output looks like
 */
export async function testOKRChartStreaming(
  period: string = '10 月'
): Promise<{ success: boolean; response: string; error?: string }> {
  try {
    const response = await streamComprehensiveOKRAnalysis(period);
    return {
      success: true,
      response
    };
  } catch (error) {
    return {
      success: false,
      response: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export {
  analyzeHasMetricPercentage,
  transformToBarChartData,
  transformToMetricTypePie,
  createOKRHierarchyChart
};
