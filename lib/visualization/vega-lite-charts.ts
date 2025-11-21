/**
 * Vega-Lite Chart Builders - Create data-driven charts as JSON for embedding in markdown
 * Reference: https://vega.github.io/vega-lite/
 *
 * Vega-Lite is declarative JSON - perfect for embedding in markdown code blocks
 * Advantage over Mermaid: Better for data visualization, 50+ chart types
 * Challenge: Needs Vega runtime to render (or fallback to Kroki.io image service)
 */

export interface VegaLiteSpec {
  $schema: string;
  description: string;
  data: any;
  mark: string | Record<string, any>;
  encoding: Record<string, any>;
  config?: Record<string, any>;
  width?: number;
  height?: number;
  title?: string | Record<string, any>;
}

/**
 * Base function to create vega-lite specs and output as markdown code block
 */
function createVegaLiteMarkdown(
  spec: VegaLiteSpec,
  title: string,
  description: string
): { markdown: string; json: VegaLiteSpec } {
  const markdown = `\`\`\`json
${JSON.stringify(spec, null, 2)}
\`\`\``;

  return {
    markdown,
    json: spec,
  };
}

/**
 * Bar Chart - for categorical comparisons
 */
export function barChart(
  data: Array<{ category: string; value: number }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
    orientation?: 'vertical' | 'horizontal';
  }
): { markdown: string; json: VegaLiteSpec } {
  const isHorizontal = options?.orientation === 'horizontal';

  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Bar Chart',
    description: 'Bar chart for categorical comparison',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'bar',
    encoding: isHorizontal
      ? {
          y: { field: 'category', type: 'nominal', title: options?.yLabel || 'Category' },
          x: { field: 'value', type: 'quantitative', title: options?.xLabel || 'Value' },
        }
      : {
          x: { field: 'category', type: 'nominal', title: options?.xLabel || 'Category' },
          y: { field: 'value', type: 'quantitative', title: options?.yLabel || 'Value' },
        },
  };

  return createVegaLiteMarkdown(spec, 'Bar Chart', 'Bar chart for categorical comparison');
}

/**
 * Line Chart - for time series or continuous data
 */
export function lineChart(
  data: Array<{ x: string | number; y: number }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
    xType?: 'temporal' | 'ordinal' | 'quantitative';
    multiSeries?: Array<{ name: string; color?: string }>;
  }
): { markdown: string; json: VegaLiteSpec } {
  const xType = options?.xType || 'temporal';

  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Line Chart',
    description: 'Line chart for time series or trends',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'line',
    encoding: {
      x: { field: 'x', type: xType, title: options?.xLabel || 'X' },
      y: { field: 'y', type: 'quantitative', title: options?.yLabel || 'Y' },
    },
  };

  if (options?.multiSeries) {
    spec.encoding = {
      ...spec.encoding,
      color: { field: 'series', type: 'nominal', title: 'Series' },
    };
  }

  return createVegaLiteMarkdown(spec, 'Line Chart', 'Line chart showing trends over time');
}

/**
 * Pie Chart - for composition and percentages
 */
export function pieChart(
  data: Array<{ label: string; value: number }>,
  options?: {
    title?: string;
    width?: number;
    height?: number;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Pie Chart',
    description: 'Pie chart showing composition',
    width: options?.width || 300,
    height: options?.height || 300,
    data: { values: data },
    mark: { type: 'arc', innerRadius: 0 },
    encoding: {
      theta: { field: 'value', type: 'quantitative' },
      color: { field: 'label', type: 'nominal', legend: { title: 'Category' } },
    },
  };

  return createVegaLiteMarkdown(spec, 'Pie Chart', 'Pie chart for composition analysis');
}

/**
 * Scatter Plot - for correlation and distribution analysis
 */
export function scatterPlot(
  data: Array<{ x: number; y: number; group?: string; size?: number }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
    showTrendline?: boolean;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Scatter Plot',
    description: 'Scatter plot for correlation analysis',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'circle',
    encoding: {
      x: { field: 'x', type: 'quantitative', title: options?.xLabel || 'X' },
      y: { field: 'y', type: 'quantitative', title: options?.yLabel || 'Y' },
      color: data[0]?.group ? { field: 'group', type: 'nominal' } : undefined,
      size: data[0]?.size ? { field: 'size', type: 'quantitative' } : { value: 100 },
    },
  };

  // Remove undefined encodings
  Object.keys(spec.encoding).forEach((key) => {
    if ((spec.encoding as any)[key] === undefined) {
      delete (spec.encoding as any)[key];
    }
  });

  return createVegaLiteMarkdown(spec, 'Scatter Plot', 'Scatter plot for correlation analysis');
}

/**
 * Area Chart - for stacked area and trends over time
 */
export function areaChart(
  data: Array<{ x: string | number; y: number; category?: string }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
    stacked?: boolean;
    xType?: 'temporal' | 'ordinal' | 'quantitative';
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Area Chart',
    description: 'Area chart for stacked trends',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: { type: 'area', opacity: 0.7 },
    encoding: {
      x: { field: 'x', type: options?.xType || 'temporal', title: options?.xLabel || 'X' },
      y: {
        field: 'y',
        type: 'quantitative',
        title: options?.yLabel || 'Y',
        stack: options?.stacked !== false ? 'zero' : null,
      },
      color: data[0]?.category ? { field: 'category', type: 'nominal' } : undefined,
    },
  };

  // Remove null y.stack if not stacking
  if (options?.stacked === false) {
    (spec.encoding.y as any).stack = undefined;
  }

  return createVegaLiteMarkdown(spec, 'Area Chart', 'Area chart showing trends over time');
}

/**
 * Heatmap - for matrix visualization and correlation
 */
export function heatmap(
  data: Array<{ row: string; column: string; value: number }>,
  options?: {
    title?: string;
    width?: number;
    height?: number;
    colorScheme?: string;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Heatmap',
    description: 'Heatmap for matrix visualization',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'rect',
    encoding: {
      x: { field: 'column', type: 'ordinal' },
      y: { field: 'row', type: 'ordinal' },
      color: {
        field: 'value',
        type: 'quantitative',
        scale: { scheme: options?.colorScheme || 'viridis' },
      },
    },
  };

  return createVegaLiteMarkdown(spec, 'Heatmap', 'Heatmap for correlation analysis');
}

/**
 * Histogram - for distribution analysis
 */
export function histogram(
  data: Array<{ value: number }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
    bins?: number;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Histogram',
    description: 'Histogram for distribution analysis',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'bar',
    encoding: {
      x: {
        field: 'value',
        type: 'quantitative',
        bin: { maxbins: options?.bins || 30 },
        title: options?.xLabel || 'Value',
      },
      y: { aggregate: 'count', type: 'quantitative', title: options?.yLabel || 'Count' },
    },
  };

  return createVegaLiteMarkdown(spec, 'Histogram', 'Histogram showing distribution');
}

/**
 * Box Plot - for outlier and quartile analysis
 */
export function boxPlot(
  data: Array<{ category: string; value: number }>,
  options?: {
    title?: string;
    yLabel?: string;
    width?: number;
    height?: number;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Box Plot',
    description: 'Box plot for statistical distribution',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: { type: 'boxplot', extent: 'min-max' },
    encoding: {
      x: { field: 'category', type: 'nominal' },
      y: { field: 'value', type: 'quantitative', title: options?.yLabel || 'Value' },
    },
  };

  return createVegaLiteMarkdown(spec, 'Box Plot', 'Box plot for statistical analysis');
}

/**
 * Waterfall Chart - for showing cumulative effect
 */
export function waterfallChart(
  data: Array<{ label: string; value: number }>,
  options?: {
    title?: string;
    width?: number;
    height?: number;
  }
): { markdown: string; json: VegaLiteSpec } {
  // Vega-Lite doesn't have native waterfall, so we use a custom approach
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Waterfall Chart',
    description: 'Waterfall chart for cumulative analysis',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'bar',
    encoding: {
      x: { field: 'label', type: 'ordinal' },
      y: { field: 'value', type: 'quantitative' },
      color: {
        field: 'value',
        type: 'quantitative',
        scale: { scheme: 'spectral' },
      },
    },
  };

  return createVegaLiteMarkdown(spec, 'Waterfall Chart', 'Waterfall chart showing cumulative effect');
}

/**
 * Bubble Chart - multi-dimensional visualization
 */
export function bubbleChart(
  data: Array<{ x: number; y: number; size: number; label?: string; group?: string }>,
  options?: {
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
  }
): { markdown: string; json: VegaLiteSpec } {
  const spec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: options?.title || 'Bubble Chart',
    description: 'Bubble chart for multi-dimensional analysis',
    width: options?.width || 400,
    height: options?.height || 300,
    data: { values: data },
    mark: 'circle',
    encoding: {
      x: { field: 'x', type: 'quantitative', title: options?.xLabel || 'X' },
      y: { field: 'y', type: 'quantitative', title: options?.yLabel || 'Y' },
      size: { field: 'size', type: 'quantitative', title: 'Size' },
      color: data[0]?.group ? { field: 'group', type: 'nominal' } : undefined,
    },
  };

  return createVegaLiteMarkdown(spec, 'Bubble Chart', 'Bubble chart for multi-dimensional data');
}

/**
 * Custom spec builder - for advanced use cases
 */
export function customChart(
  spec: VegaLiteSpec,
  title: string = 'Custom Chart'
): { markdown: string; json: VegaLiteSpec } {
  return createVegaLiteMarkdown(spec, title, spec.description || 'Custom Vega-Lite chart');
}
