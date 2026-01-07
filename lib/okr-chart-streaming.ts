/**
 * OKR Chart Streaming Integration
 * 
 * Streams real OKR metrics from okr_metrics.db as charts to Feishu cards
 * Uses the same data source as the OKR Reviewer Agent
 * 
 * Rendering modes:
 * - ascii: Instant emoji/unicode charts (default, works everywhere)
 * - datawrapper: Professional PNG charts via Datawrapper API
 * - json: Vega-Lite/Mermaid specs (requires client rendering)
 */

import { analyzeHasMetricPercentage } from './agents/okr-reviewer-agent';
import { chartGenerationTool, ChartRequest, ChartResponse } from './tools/chart-generation-tool';
import * as asciiCharts from './visualization/ascii-charts';
import * as datawrapper from './visualization/datawrapper';
import { uploadImageToFeishu } from './feishu-image-utils';

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
    
    const barChart = await (chartGenerationTool.execute as any)({
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
    } as ChartRequest) as ChartResponse;

    response += barChart.markdown + '\n\n';

    // Add insights
    const topCompany = chartData.reduce((a: { category: string; value: number }, b: { category: string; value: number }) => a.value > b.value ? a : b);
    const bottomCompany = chartData.reduce((a: { category: string; value: number }, b: { category: string; value: number }) => a.value < b.value ? a : b);
    
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
    const pieChart = await (chartGenerationTool.execute as any)({
      chartType: 'mermaid',
      subType: 'pie',
      title: `Metric Type Distribution (${analysis.period})`,
      description: 'Distribution of metrics by type',
      data: metricData
    } as ChartRequest) as ChartResponse;

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
    const barChart = await (chartGenerationTool.execute as any)({
      chartType: 'vega-lite',
      subType: 'bar',
      title: `Has Metric % by Company`,
      description: 'How well each company is capturing metrics',
      data: chartData,
      options: {
        width: 500,
        height: 300
      }
    } as ChartRequest) as ChartResponse;

    response += barChart.markdown + '\n\n';
  }

  // Chart 2: Metric type distribution
  response += `## 2. Metric Type Distribution\n\n`;
  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    const pieChart = await (chartGenerationTool.execute as any)({
      chartType: 'mermaid',
      subType: 'pie',
      title: `Metrics by Type`,
      description: 'What types of metrics are being tracked',
      data: metricData
    } as ChartRequest) as ChartResponse;

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

// ============================================================================
// ASCII CHART STREAMING FUNCTIONS
// ============================================================================
// These use lightweight ASCII/emoji charts that render perfectly in Feishu
// No external dependencies, instant generation, fully streamable

/**
 * Stream OKR analysis with ASCII bar chart - by company
 * 
 * Uses emoji-enhanced horizontal bars that render perfectly in Feishu
 */
export async function streamOKRCompanyAnalysisAscii(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `## 📊 OKR Metrics Analysis - ${analysis.period}\n\n`;
  response += `**Overall Average**: ${(analysis.overall_average || 0).toFixed(1)}%\n`;
  response += `**Companies Analyzed**: ${analysis.total_companies}\n\n`;

  // Transform data for bar chart
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    response += `### Company Performance\n\n`;
    response += '```\n';
    response += asciiCharts.horizontalBarChart(chartData, {
      barWidth: 20,
      showPercent: true,
      sortDesc: true,
      colorize: true,
    });
    response += '\n```\n\n';

    // Summary stats
    const values = chartData.map((d: { category: string; value: number }) => d.value);
    response += asciiCharts.summaryStats(values, {
      title: 'Performance Overview',
      showDistribution: true,
    });
    response += '\n\n';

    // Key insights with emoji
    const topCompany = chartData.reduce((a: any, b: any) => a.value > b.value ? a : b);
    const bottomCompany = chartData.reduce((a: any, b: any) => a.value < b.value ? a : b);
    
    response += `### 💡 Key Insights\n\n`;
    response += `- **🏆 Top performer**: ${topCompany.category} (${topCompany.value.toFixed(1)}%)\n`;
    response += `- **⚠️ Needs attention**: ${bottomCompany.category} (${bottomCompany.value.toFixed(1)}%)\n`;
  }

  return response;
}

/**
 * Stream OKR analysis with ASCII pie chart - metric type distribution
 */
export async function streamOKRMetricTypeAnalysisAscii(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `## 📈 Metric Type Distribution - ${analysis.period}\n\n`;

  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    // Convert to array format for emoji pie
    const pieData = Object.entries(metricData).map(([label, value]) => ({
      label,
      value: value as number,
    }));

    response += asciiCharts.emojiPieChart(pieData, { segments: 15 });
    response += '\n\n';

    // Distribution histogram
    response += `### Distribution\n\n`;
    response += '```\n';
    const values = Object.values(metricData) as number[];
    response += asciiCharts.histogram(values, { buckets: 4, maxWidth: 15 });
    response += '\n```\n';
  }

  return response;
}

/**
 * Stream comprehensive OKR analysis with ASCII charts
 * 
 * This is the main function for OKR analysis with instant-rendering charts
 */
export async function streamComprehensiveOKRAnalysisAscii(
  period: string,
  userId?: string
): Promise<string> {
  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `# 📊 OKR Metrics Analysis Report\n\n`;
  response += `| 📅 Period | 🏢 Companies | 📈 Average |\n`;
  response += `|-----------|--------------|------------|\n`;
  response += `| ${analysis.period} | ${analysis.total_companies} | ${(analysis.overall_average || 0).toFixed(1)}% |\n\n`;

  // Section 1: Company Performance Bar Chart
  response += `## 1️⃣ Company Performance\n\n`;
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    response += '```\n';
    response += asciiCharts.horizontalBarChart(chartData, {
      barWidth: 20,
      showPercent: true,
      sortDesc: true,
      colorize: true,
    });
    response += '\n```\n\n';
  }

  // Section 2: Metric Type Distribution
  response += `## 2️⃣ Metric Type Distribution\n\n`;
  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    const pieData = Object.entries(metricData).map(([label, value]) => ({
      label,
      value: value as number,
    }));
    response += asciiCharts.emojiPieChart(pieData, { segments: 12 });
    response += '\n\n';
  }

  // Section 3: Heatmap (if we have detailed metrics)
  if (analysis.summary[0]?.metrics || analysis.summary[0]?.metric_details) {
    response += `## 3️⃣ Metrics Heatmap\n\n`;
    
    const heatmapData = analysis.summary.slice(0, 10).map((item: any) => ({
      company: item.company || item.company_name,
      metrics: (item.metrics || item.metric_details || []).map((m: any) => ({
        type: m.metric_type,
        value: m.has_metric_percentage || 0,
      })),
    }));

    if (heatmapData.length > 0 && heatmapData[0].metrics.length > 0) {
      response += '```\n';
      response += asciiCharts.asciiHeatmap(heatmapData, {
        thresholds: [50, 80],
        showValues: false,
      });
      response += '\n```\n\n';
    }
  }

  // Section 4: Summary Statistics
  response += `## 4️⃣ Summary\n\n`;
  const values = chartData.map((d: { category: string; value: number }) => d.value);
  
  if (values.length > 0) {
    response += asciiCharts.summaryStats(values, {
      title: 'Performance Statistics',
      showDistribution: true,
    });
    response += '\n\n';

    // Recommendations based on data
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const spread = Math.max(...values) - min;

    response += `### 📋 Recommendations\n\n`;
    
    if (avg < 50) {
      response += `- 🔴 **Critical**: Overall metric coverage is low (${avg.toFixed(1)}%). Focus on improving data capture across all companies.\n`;
    } else if (avg < 80) {
      response += `- 🟡 **Improvement Needed**: Average coverage at ${avg.toFixed(1)}%. Target 80%+ for reliable metrics.\n`;
    } else {
      response += `- 🟢 **Good Performance**: Average coverage at ${avg.toFixed(1)}%. Maintain current practices.\n`;
    }

    if (spread > 30) {
      response += `- ⚠️ **High Variance**: ${spread.toFixed(1)} point spread between companies. Standardize processes for consistency.\n`;
    }

    if (min < 40) {
      const lowPerformers = chartData.filter((d: any) => d.value < 40);
      response += `- 🎯 **Priority**: ${lowPerformers.length} company(ies) below 40%. Provide targeted support.\n`;
    }
  }

  return response;
}

/**
 * Quick comparison chart for period-over-period analysis
 */
export async function streamOKRComparisonAscii(
  currentPeriod: string,
  previousPeriod: string,
  userId?: string
): Promise<string> {
  const [current, previous] = await Promise.all([
    analyzeHasMetricPercentage(currentPeriod, userId),
    analyzeHasMetricPercentage(previousPeriod, userId),
  ]);

  if (current.error || previous.error) {
    return `**Comparison Error**: Unable to fetch data for comparison.`;
  }

  let response = `# 📊 OKR Period Comparison\n\n`;
  response += `| Metric | ${previousPeriod} | ${currentPeriod} | Change |\n`;
  response += `|--------|---------|---------|--------|\n`;

  const prevAvg = previous.overall_average || 0;
  const currAvg = current.overall_average || 0;
  const trend = asciiCharts.trendIndicator(currAvg, prevAvg);

  response += `| Overall Avg | ${prevAvg.toFixed(1)}% | ${currAvg.toFixed(1)}% | ${trend} |\n`;
  response += `| Companies | ${previous.total_companies} | ${current.total_companies} | - |\n\n`;

  // Company-level comparison
  response += `## Company Changes\n\n`;

  const currentData = transformToBarChartData(current);
  const previousData = transformToBarChartData(previous);

  const comparisonData: Array<{ label: string; value: number; target?: number }> = [];

  currentData.forEach((curr: any) => {
    const prev = previousData.find((p: any) => p.category === curr.category);
    comparisonData.push({
      label: curr.category,
      value: curr.value,
      target: prev?.value || 0,
    });
  });

  if (comparisonData.length > 0) {
    response += asciiCharts.comparisonTable(comparisonData, { barWidth: 10 });
  }

  return response;
}

// ============================================================================
// DATAWRAPPER CHART STREAMING FUNCTIONS
// ============================================================================
// Professional-quality PNG charts via Datawrapper API
// Requires DATAWRAPPER_API_KEY in environment

/**
 * Stream OKR analysis with Datawrapper bar chart
 * 
 * Returns markdown with embedded Feishu image
 */
export async function streamOKRCompanyAnalysisDatawrapper(
  period: string,
  userId?: string
): Promise<string> {
  if (!datawrapper.hasDatawrapperConfig()) {
    console.warn('[OKR] Datawrapper not configured, falling back to ASCII');
    return streamOKRCompanyAnalysisAscii(period, userId);
  }

  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `## 📊 OKR Metrics Analysis - ${analysis.period}\n\n`;
  response += `**Overall Average**: ${(analysis.overall_average || 0).toFixed(1)}%\n`;
  response += `**Companies Analyzed**: ${analysis.total_companies}\n\n`;

  // Generate Datawrapper chart
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    try {
      // Sort by value descending for better readability
      const sorted = [...chartData].sort((a: any, b: any) => b.value - a.value);
      const pngBuffer = await datawrapper.generateBarChart(
        sorted.map((d: { category: string; value: number }) => ({ 
          label: d.category, 
          value: d.value 
        })),
        { title: `OKR Metrics Coverage - ${period}`, horizontal: true, width: 700 }
      );

      // Upload to Feishu
      const imageKey = await uploadImageToFeishu(pngBuffer, 'message');
      
      response += `### Company Performance\n\n`;
      response += `![OKR Chart](${imageKey})\n\n`;
      
      console.log(`[OKR] Datawrapper chart uploaded: ${imageKey}`);
    } catch (error) {
      console.error('[OKR] Datawrapper chart failed, adding ASCII fallback:', error);
      response += `### Company Performance\n\n`;
      response += '```\n';
      response += asciiCharts.horizontalBarChart(chartData, {
        barWidth: 20,
        showPercent: true,
        sortDesc: true,
        colorize: true,
      });
      response += '\n```\n\n';
    }

    // Key insights
    const topCompany = chartData.reduce((a: any, b: any) => a.value > b.value ? a : b);
    const bottomCompany = chartData.reduce((a: any, b: any) => a.value < b.value ? a : b);
    
    response += `### 💡 Key Insights\n\n`;
    response += `- **🏆 Top performer**: ${topCompany.category} (${topCompany.value.toFixed(1)}%)\n`;
    response += `- **⚠️ Needs attention**: ${bottomCompany.category} (${bottomCompany.value.toFixed(1)}%)\n`;
  }

  return response;
}

/**
 * Stream comprehensive OKR analysis with Datawrapper charts
 */
export async function streamComprehensiveOKRAnalysisDatawrapper(
  period: string,
  userId?: string
): Promise<string> {
  if (!datawrapper.hasDatawrapperConfig()) {
    console.warn('[OKR] Datawrapper not configured, falling back to ASCII');
    return streamComprehensiveOKRAnalysisAscii(period, userId);
  }

  const analysis = await analyzeHasMetricPercentage(period, userId);

  if (analysis.error || !analysis.summary || analysis.summary.length === 0) {
    return `**OKR Analysis for ${period}**\n\nNo data available for this period.`;
  }

  let response = `# 📊 OKR Metrics Analysis Report\n\n`;
  response += `| 📅 Period | 🏢 Companies | 📈 Average |\n`;
  response += `|-----------|--------------|------------|\n`;
  response += `| ${analysis.period} | ${analysis.total_companies} | ${(analysis.overall_average || 0).toFixed(1)}% |\n\n`;

  // Chart 1: Company Performance (Datawrapper bar chart)
  response += `## 1️⃣ Company Performance\n\n`;
  const chartData = transformToBarChartData(analysis);
  
  if (chartData.length > 0) {
    try {
      const sorted = [...chartData].sort((a: any, b: any) => b.value - a.value);
      const barPng = await datawrapper.generateBarChart(
        sorted.map((d: { category: string; value: number }) => ({ 
          label: d.category, 
          value: d.value 
        })),
        { title: `OKR Metrics Coverage - ${period}`, horizontal: true, width: 700 }
      );
      const barImageKey = await uploadImageToFeishu(barPng, 'message');
      response += `![Company Performance](${barImageKey})\n\n`;
    } catch (error) {
      console.error('[OKR] Bar chart failed:', error);
      response += '```\n';
      response += asciiCharts.horizontalBarChart(chartData, { barWidth: 20, sortDesc: true, colorize: true });
      response += '\n```\n\n';
    }
  }

  // Chart 2: Metric Distribution (Datawrapper pie chart)
  response += `## 2️⃣ Metric Type Distribution\n\n`;
  const metricData = transformToMetricTypePie(analysis);
  
  if (Object.keys(metricData).length > 0) {
    try {
      const pieData = Object.entries(metricData).map(([label, value]) => ({
        label,
        value: value as number,
      }));
      const piePng = await datawrapper.generatePieChart(pieData, {
        title: `Metric Type Distribution - ${period}`,
        donut: true,
        width: 400,
      });
      const pieImageKey = await uploadImageToFeishu(piePng, 'message');
      response += `![Metric Distribution](${pieImageKey})\n\n`;
    } catch (error) {
      console.error('[OKR] Pie chart failed:', error);
      const pieData = Object.entries(metricData).map(([label, value]) => ({
        label,
        value: value as number,
      }));
      response += asciiCharts.emojiPieChart(pieData, { segments: 12 });
      response += '\n\n';
    }
  }

  // Section 3: Summary (always ASCII - fast)
  response += `## 3️⃣ Summary\n\n`;
  const values = chartData.map((d: { category: string; value: number }) => d.value);
  
  if (values.length > 0) {
    response += asciiCharts.summaryStats(values, {
      title: 'Performance Statistics',
      showDistribution: true,
    });
    response += '\n\n';
  }

  return response;
}

/**
 * Check if Datawrapper is available
 */
export function isDatawrapperAvailable(): boolean {
  return datawrapper.hasDatawrapperConfig();
}

export {
  analyzeHasMetricPercentage,
  transformToBarChartData,
  transformToMetricTypePie,
  createOKRHierarchyChart
};
