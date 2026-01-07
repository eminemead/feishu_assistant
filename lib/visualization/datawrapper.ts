/**
 * Datawrapper API Integration
 * 
 * Creates professional-quality charts via Datawrapper API
 * Returns PNG images for embedding in Feishu cards
 * 
 * API Docs: https://developer.datawrapper.de/reference
 */

const DATAWRAPPER_API_URL = 'https://api.datawrapper.de/v3';

/**
 * Datawrapper chart types
 * See: https://developer.datawrapper.de/docs/chart-types
 */
export type DatawrapperChartType =
  // Bar charts
  | 'd3-bars'           // Horizontal bar chart
  | 'd3-bars-stacked'   // Stacked horizontal bars
  | 'd3-bars-split'     // Split bars (positive/negative)
  | 'd3-bars-bullet'    // Bullet chart
  // Column charts  
  | 'd3-columns'        // Vertical column chart (recommended for most use cases!)
  | 'column-chart'      // Alias for d3-columns
  | 'd3-columns-stacked'// Stacked columns
  | 'd3-columns-grouped'// Grouped columns
  // Line charts
  | 'd3-lines'          // Line chart
  | 'd3-area'           // Area chart
  // Pie/Donut
  | 'd3-pies'           // Pie chart
  | 'd3-donuts'         // Donut chart
  | 'd3-multiple-pies'  // Multiple pies
  | 'd3-multiple-donuts'// Multiple donuts
  // Scatter/Dot
  | 'd3-scatter-plot'   // Scatter plot
  | 'd3-dot-plot'       // Dot plot
  // Tables
  | 'tables'            // Data table
  // Maps
  | 'd3-maps-choropleth'// Choropleth map
  | 'd3-maps-symbols'   // Symbol map
  | 'locator-map'       // Locator map;

export interface DatawrapperConfig {
  apiKey: string;
}

export interface ChartMetadata {
  title?: string;
  describe?: {
    intro?: string;
    byline?: string;
    'source-name'?: string;
    'source-url'?: string;
  };
  visualize?: Record<string, unknown>;
  publish?: {
    'embed-width'?: number;
    'embed-height'?: number;
  };
}

export interface CreateChartOptions {
  type: DatawrapperChartType;
  title: string;
  data: string | Array<Record<string, unknown>>; // CSV string or array of objects
  metadata?: ChartMetadata;
  folderId?: string;
}

export interface ExportOptions {
  format?: 'png' | 'pdf' | 'svg';
  width?: number;
  height?: number;
  scale?: number;
  borderWidth?: number;
  plain?: boolean;  // Remove header/footer
}

interface DatawrapperChart {
  id: string;
  title: string;
  type: string;
  publicUrl?: string;
  publicVersion?: number;
}

/**
 * Check if Datawrapper is configured
 */
export function hasDatawrapperConfig(): boolean {
  return !!process.env.DATAWRAPPER_API_KEY;
}

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const key = process.env.DATAWRAPPER_API_KEY;
  if (!key) {
    throw new Error('DATAWRAPPER_API_KEY not set in environment');
  }
  return key;
}

/**
 * Make authenticated API request to Datawrapper
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getApiKey();
  
  const response = await fetch(`${DATAWRAPPER_API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Datawrapper API error (${response.status}): ${errorText}`);
  }

  // Some endpoints return empty response
  const text = await response.text();
  if (!text) return {} as T;
  
  return JSON.parse(text) as T;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(data: Array<Record<string, unknown>>): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(h => {
      const val = row[h];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return String(val ?? '');
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Create a new chart
 */
export async function createChart(options: CreateChartOptions): Promise<DatawrapperChart> {
  const { type, title, data, metadata, folderId } = options;

  // Step 1: Create chart
  const chart = await apiRequest<DatawrapperChart>('/charts', {
    method: 'POST',
    body: JSON.stringify({
      type,
      title,
      folderId,
      metadata: metadata || {},
    }),
  });

  // Step 2: Upload data
  const csvData = typeof data === 'string' ? data : arrayToCSV(data);
  
  await fetch(`${DATAWRAPPER_API_URL}/charts/${chart.id}/data`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'text/csv',
    },
    body: csvData,
  });

  return chart;
}

/**
 * Update chart metadata/settings
 */
export async function updateChart(
  chartId: string,
  updates: Partial<ChartMetadata & { title?: string }>
): Promise<DatawrapperChart> {
  return apiRequest<DatawrapperChart>(`/charts/${chartId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/**
 * Publish a chart (required before export)
 */
export async function publishChart(chartId: string): Promise<void> {
  await apiRequest(`/charts/${chartId}/publish`, {
    method: 'POST',
  });
  
  // Wait a moment for publishing to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Export chart as image (PNG/PDF/SVG)
 */
export async function exportChart(
  chartId: string,
  options: ExportOptions = {}
): Promise<Buffer> {
  const {
    format = 'png',
    width = 800,
    height,
    scale = 2,
    borderWidth = 20,
    plain = false,
  } = options;

  const apiKey = getApiKey();
  
  // Build query params
  const params = new URLSearchParams();
  params.set('width', String(width));
  if (height) params.set('height', String(height));
  params.set('scale', String(scale));
  params.set('borderWidth', String(borderWidth));
  if (plain) params.set('plain', 'true');

  const response = await fetch(
    `${DATAWRAPPER_API_URL}/charts/${chartId}/export/${format}?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': format === 'png' ? 'image/png' : format === 'pdf' ? 'application/pdf' : 'image/svg+xml',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Export failed (${response.status}): ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Delete a chart (cleanup after export)
 */
export async function deleteChart(chartId: string): Promise<void> {
  await apiRequest(`/charts/${chartId}`, {
    method: 'DELETE',
  });
}

/**
 * High-level function: Create chart, publish, export as PNG, then delete
 * 
 * This is the main function to use for one-off chart generation
 */
export async function generateChartImage(
  options: CreateChartOptions,
  exportOptions: ExportOptions = {}
): Promise<Buffer> {
  let chartId: string | null = null;
  
  try {
    // Create chart
    const chart = await createChart(options);
    chartId = chart.id;
    console.log(`[Datawrapper] Created chart: ${chartId}`);

    // Publish
    await publishChart(chartId);
    console.log(`[Datawrapper] Published chart: ${chartId}`);

    // Export as PNG
    const imageBuffer = await exportChart(chartId, exportOptions);
    console.log(`[Datawrapper] Exported chart: ${imageBuffer.length} bytes`);

    return imageBuffer;
  } finally {
    // Cleanup: delete chart to avoid clutter
    if (chartId) {
      try {
        await deleteChart(chartId);
        console.log(`[Datawrapper] Deleted chart: ${chartId}`);
      } catch (e) {
        console.warn(`[Datawrapper] Failed to delete chart ${chartId}:`, e);
      }
    }
  }
}

// ============================================================================
// Convenience functions for common chart types
// ============================================================================

/**
 * Generate a bar chart
 */
export async function generateBarChart(
  data: Array<{ label: string; value: number }>,
  options: {
    title: string;
    horizontal?: boolean;
    width?: number;
  }
): Promise<Buffer> {
  const csvData = data.map(d => ({ Label: d.label, Value: d.value }));
  
  return generateChartImage({
    type: options.horizontal ? 'd3-bars' : 'd3-columns',
    title: options.title,
    data: csvData,
  }, {
    width: options.width || 600,
  });
}

/**
 * Generate a line chart
 */
export async function generateLineChart(
  data: Array<{ x: string; y: number; series?: string }>,
  options: {
    title: string;
    width?: number;
  }
): Promise<Buffer> {
  // Group by series if present
  const csvData = data.map(d => ({
    X: d.x,
    Y: d.y,
    ...(d.series ? { Series: d.series } : {}),
  }));
  
  return generateChartImage({
    type: 'd3-lines',
    title: options.title,
    data: csvData,
  }, {
    width: options.width || 600,
  });
}

/**
 * Generate a pie/donut chart
 */
export async function generatePieChart(
  data: Array<{ label: string; value: number }>,
  options: {
    title: string;
    donut?: boolean;
    width?: number;
  }
): Promise<Buffer> {
  const csvData = data.map(d => ({ Label: d.label, Value: d.value }));
  
  return generateChartImage({
    type: options.donut ? 'd3-donuts' : 'd3-pies',
    title: options.title,
    data: csvData,
  }, {
    width: options.width || 400,
  });
}

/**
 * Generate a table visualization
 */
export async function generateTable(
  data: Array<Record<string, unknown>>,
  options: {
    title: string;
    width?: number;
  }
): Promise<Buffer> {
  return generateChartImage({
    type: 'tables',
    title: options.title,
    data,
  }, {
    width: options.width || 600,
  });
}

