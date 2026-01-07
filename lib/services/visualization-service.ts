/**
 * Visualization Service
 * 
 * Unified interface for all chart generation across agents.
 * Handles render mode selection, caching, and Feishu integration.
 * 
 * Usage:
 *   const viz = getVisualizationService();
 *   const result = await viz.barChart(data, { title: 'My Chart' });
 *   // result.markdown contains the chart (ASCII, image ref, or JSON)
 */

import * as asciiCharts from '../visualization/ascii-charts';
import * as datawrapper from '../visualization/datawrapper';
import * as mermaidCharts from '../visualization/mermaid-charts';
import * as vegaLiteCharts from '../visualization/vega-lite-charts';
import { uploadImageToFeishu } from '../feishu-image-utils';

// ============================================================================
// Types
// ============================================================================

export type RenderMode = 'ascii' | 'datawrapper' | 'mermaid' | 'vega-lite' | 'auto';

export interface VisualizationConfig {
  /** Default render mode (can be overridden per-call) */
  defaultMode: RenderMode;
  /** Fallback mode if primary fails */
  fallbackMode: RenderMode;
  /** Upload images to Feishu automatically */
  autoUploadToFeishu: boolean;
  /** Cache generated charts (TTL in ms) */
  cacheTTL?: number;
}

export interface ChartResult {
  /** Markdown content (chart, image ref, or JSON) */
  markdown: string;
  /** Render mode used */
  mode: RenderMode;
  /** Feishu image key (if uploaded) */
  imageKey?: string;
  /** Raw PNG buffer (if generated) */
  imageBuffer?: Buffer;
  /** Whether fallback was used */
  usedFallback: boolean;
}

export interface BarChartOptions {
  title: string;
  horizontal?: boolean;
  width?: number;
  sortDesc?: boolean;
  mode?: RenderMode;
}

export interface PieChartOptions {
  title: string;
  donut?: boolean;
  width?: number;
  mode?: RenderMode;
}

export interface LineChartOptions {
  title: string;
  width?: number;
  mode?: RenderMode;
}

export interface HeatmapOptions {
  title: string;
  thresholds?: [number, number];
  showValues?: boolean;
  mode?: RenderMode;
}

export interface TableOptions {
  title: string;
  mode?: RenderMode;
}

// ============================================================================
// Default Configuration
// ============================================================================

function getDefaultConfig(): VisualizationConfig {
  // Determine default mode from environment
  const envMode = process.env.VISUALIZATION_DEFAULT_MODE as RenderMode;
  const validModes: RenderMode[] = ['ascii', 'datawrapper', 'mermaid', 'vega-lite', 'auto'];
  
  const defaultMode: RenderMode = validModes.includes(envMode) ? envMode : 'auto';
  
  return {
    defaultMode,
    fallbackMode: 'ascii',
    autoUploadToFeishu: true,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
  };
}

// ============================================================================
// Visualization Service Class
// ============================================================================

export class VisualizationService {
  private config: VisualizationConfig;
  private cache: Map<string, { result: ChartResult; expires: number }> = new Map();

  constructor(config?: Partial<VisualizationConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Resolve render mode based on config and availability
   */
  private resolveMode(requested?: RenderMode): RenderMode {
    const mode = requested || this.config.defaultMode;
    
    if (mode === 'auto') {
      // Auto-select: prefer datawrapper if available, else ASCII
      if (datawrapper.hasDatawrapperConfig()) {
        return 'datawrapper';
      }
      return 'ascii';
    }
    
    // Check if requested mode is available
    if (mode === 'datawrapper' && !datawrapper.hasDatawrapperConfig()) {
      console.warn('[Viz] Datawrapper not configured, falling back to ASCII');
      return this.config.fallbackMode;
    }
    
    return mode;
  }

  /**
   * Generate cache key for deduplication
   */
  private getCacheKey(type: string, data: unknown, options: unknown): string {
    return `${type}:${JSON.stringify(data)}:${JSON.stringify(options)}`;
  }

  /**
   * Check cache for existing result
   */
  private checkCache(key: string): ChartResult | null {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }
    this.cache.delete(key);
    return null;
  }

  /**
   * Store result in cache
   */
  private setCache(key: string, result: ChartResult): void {
    if (this.config.cacheTTL) {
      this.cache.set(key, {
        result,
        expires: Date.now() + this.config.cacheTTL,
      });
    }
  }

  // ==========================================================================
  // Chart Generation Methods
  // ==========================================================================

  /**
   * Generate a bar chart
   */
  async barChart(
    data: Array<{ label: string; value: number }>,
    options: BarChartOptions
  ): Promise<ChartResult> {
    const cacheKey = this.getCacheKey('bar', data, options);
    const cached = this.checkCache(cacheKey);
    if (cached) return cached;

    const mode = this.resolveMode(options.mode);
    let result: ChartResult;

    try {
      switch (mode) {
        case 'datawrapper': {
          const pngBuffer = await datawrapper.generateBarChart(data, {
            title: options.title,
            horizontal: options.horizontal,
            width: options.width,
          });
          
          let markdown = '';
          let imageKey: string | undefined;
          
          if (this.config.autoUploadToFeishu) {
            imageKey = await uploadImageToFeishu(pngBuffer, 'message');
            markdown = `![${options.title}](${imageKey})`;
          } else {
            markdown = `[Chart: ${options.title}]`;
          }
          
          result = { markdown, mode, imageKey, imageBuffer: pngBuffer, usedFallback: false };
          break;
        }

        case 'mermaid': {
          // Mermaid doesn't have great bar charts, use pie as fallback
          const mermaidData = Object.fromEntries(data.map(d => [d.label, d.value]));
          const chart = mermaidCharts.quickPieChart(mermaidData, { title: options.title });
          result = { markdown: chart.markdown, mode, usedFallback: false };
          break;
        }

        case 'vega-lite': {
          const chartData = data.map(d => ({ category: d.label, value: d.value }));
          const chart = vegaLiteCharts.barChart(chartData, {
            title: options.title,
            orientation: options.horizontal ? 'horizontal' : 'vertical',
          });
          result = { markdown: chart.markdown, mode, usedFallback: false };
          break;
        }

        case 'ascii':
        default: {
          const sortedData = options.sortDesc
            ? [...data].sort((a, b) => b.value - a.value)
            : data;
          
          let markdown = `**${options.title}**\n\n\`\`\`\n`;
          markdown += asciiCharts.horizontalBarChart(sortedData, {
            barWidth: 20,
            showPercent: true,
            sortDesc: false, // Already sorted
            colorize: true,
          });
          markdown += '\n```';
          
          result = { markdown, mode: 'ascii', usedFallback: false };
          break;
        }
      }
    } catch (error) {
      console.error(`[Viz] ${mode} bar chart failed, using fallback:`, error);
      
      // Fallback to ASCII
      let markdown = `**${options.title}**\n\n\`\`\`\n`;
      markdown += asciiCharts.horizontalBarChart(data, {
        barWidth: 20,
        showPercent: true,
        sortDesc: options.sortDesc,
        colorize: true,
      });
      markdown += '\n```';
      
      result = { markdown, mode: 'ascii', usedFallback: true };
    }

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Generate a pie/donut chart
   */
  async pieChart(
    data: Array<{ label: string; value: number }>,
    options: PieChartOptions
  ): Promise<ChartResult> {
    const cacheKey = this.getCacheKey('pie', data, options);
    const cached = this.checkCache(cacheKey);
    if (cached) return cached;

    const mode = this.resolveMode(options.mode);
    let result: ChartResult;

    try {
      switch (mode) {
        case 'datawrapper': {
          const pngBuffer = await datawrapper.generatePieChart(data, {
            title: options.title,
            donut: options.donut,
            width: options.width,
          });
          
          let markdown = '';
          let imageKey: string | undefined;
          
          if (this.config.autoUploadToFeishu) {
            imageKey = await uploadImageToFeishu(pngBuffer, 'message');
            markdown = `![${options.title}](${imageKey})`;
          } else {
            markdown = `[Chart: ${options.title}]`;
          }
          
          result = { markdown, mode, imageKey, imageBuffer: pngBuffer, usedFallback: false };
          break;
        }

        case 'mermaid': {
          const mermaidData = Object.fromEntries(data.map(d => [d.label, d.value]));
          const chart = mermaidCharts.quickPieChart(mermaidData, { title: options.title });
          result = { markdown: chart.markdown, mode, usedFallback: false };
          break;
        }

        case 'vega-lite': {
          const chart = vegaLiteCharts.pieChart(data, { title: options.title });
          result = { markdown: chart.markdown, mode, usedFallback: false };
          break;
        }

        case 'ascii':
        default: {
          let markdown = `**${options.title}**\n\n`;
          markdown += asciiCharts.emojiPieChart(data, { segments: 15 });
          
          result = { markdown, mode: 'ascii', usedFallback: false };
          break;
        }
      }
    } catch (error) {
      console.error(`[Viz] ${mode} pie chart failed, using fallback:`, error);
      
      let markdown = `**${options.title}**\n\n`;
      markdown += asciiCharts.emojiPieChart(data, { segments: 15 });
      
      result = { markdown, mode: 'ascii', usedFallback: true };
    }

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Generate a line chart
   */
  async lineChart(
    data: Array<{ x: string; y: number; series?: string }>,
    options: LineChartOptions
  ): Promise<ChartResult> {
    const mode = this.resolveMode(options.mode);
    let result: ChartResult;

    try {
      switch (mode) {
        case 'datawrapper': {
          const pngBuffer = await datawrapper.generateLineChart(data, {
            title: options.title,
            width: options.width,
          });
          
          let markdown = '';
          let imageKey: string | undefined;
          
          if (this.config.autoUploadToFeishu) {
            imageKey = await uploadImageToFeishu(pngBuffer, 'message');
            markdown = `![${options.title}](${imageKey})`;
          } else {
            markdown = `[Chart: ${options.title}]`;
          }
          
          result = { markdown, mode, imageKey, imageBuffer: pngBuffer, usedFallback: false };
          break;
        }

        case 'vega-lite': {
          const chartData = data.map(d => ({ x: d.x, y: d.y }));
          const chart = vegaLiteCharts.lineChart(chartData, { title: options.title });
          result = { markdown: chart.markdown, mode, usedFallback: false };
          break;
        }

        case 'ascii':
        default: {
          // Use sparkline for trend visualization
          const values = data.map(d => d.y);
          let markdown = `**${options.title}**\n\n`;
          markdown += `Trend: ${asciiCharts.sparkline(values)}\n\n`;
          
          // Add data points
          markdown += data.map(d => `${d.x}: ${d.y}`).join(' → ');
          
          result = { markdown, mode: 'ascii', usedFallback: false };
          break;
        }
      }
    } catch (error) {
      console.error(`[Viz] ${mode} line chart failed, using fallback:`, error);
      
      const values = data.map(d => d.y);
      let markdown = `**${options.title}**\n\n`;
      markdown += `Trend: ${asciiCharts.sparkline(values)}`;
      
      result = { markdown, mode: 'ascii', usedFallback: true };
    }

    return result;
  }

  /**
   * Generate a heatmap
   */
  async heatmap(
    data: Array<{
      row: string;
      metrics: Array<{ column: string; value: number }>;
    }>,
    options: HeatmapOptions
  ): Promise<ChartResult> {
    const mode = this.resolveMode(options.mode);

    // ASCII heatmap is the best option for most cases
    const heatmapData = data.map(d => ({
      company: d.row,
      metrics: d.metrics.map(m => ({ type: m.column, value: m.value })),
    }));

    let markdown = `**${options.title}**\n\n\`\`\`\n`;
    markdown += asciiCharts.asciiHeatmap(heatmapData, {
      thresholds: options.thresholds || [50, 80],
      showValues: options.showValues,
    });
    markdown += '\n```';

    return { markdown, mode: 'ascii', usedFallback: false };
  }

  /**
   * Generate a comparison table
   */
  async comparisonTable(
    data: Array<{ label: string; value: number; target?: number }>,
    options: TableOptions
  ): Promise<ChartResult> {
    let markdown = `**${options.title}**\n\n`;
    markdown += asciiCharts.comparisonTable(data);
    
    return { markdown, mode: 'ascii', usedFallback: false };
  }

  /**
   * Generate summary statistics
   */
  summaryStats(
    values: number[],
    options: { title?: string; showDistribution?: boolean } = {}
  ): string {
    return asciiCharts.summaryStats(values, options);
  }

  /**
   * Generate a progress bar
   */
  progressBar(value: number, max: number = 100): string {
    return asciiCharts.progressBar(value, max);
  }

  /**
   * Generate a sparkline
   */
  sparkline(values: number[]): string {
    return asciiCharts.sparkline(values);
  }

  /**
   * Generate a trend indicator
   */
  trendIndicator(current: number, previous: number): string {
    return asciiCharts.trendIndicator(current, previous);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): VisualizationConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: VisualizationService | null = null;

/**
 * Get the global visualization service instance
 */
export function getVisualizationService(config?: Partial<VisualizationConfig>): VisualizationService {
  if (!_instance || config) {
    _instance = new VisualizationService(config);
  }
  return _instance;
}

/**
 * Reset the global instance (for testing)
 */
export function resetVisualizationService(): void {
  _instance = null;
}
