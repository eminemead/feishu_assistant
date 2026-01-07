/**
 * ASCII/Emoji Charts - Lightweight inline visualizations
 * 
 * Perfect for Feishu because:
 * - Zero rendering dependencies
 * - Works in any markdown context
 * - Instant generation (no latency)
 * - Fully streamable
 * - Unicode-based, looks good everywhere
 */

export interface AsciiChartOptions {
  barWidth?: number;      // Max width of bars (default: 20)
  showValues?: boolean;   // Show numeric values (default: true)
  showPercent?: boolean;  // Show as percentage (default: false)
  labelWidth?: number;    // Fixed label width for alignment (default: auto)
  sortDesc?: boolean;     // Sort by value descending (default: false)
  useEmoji?: boolean;     // Use emoji instead of blocks (default: false)
  colorize?: boolean;     // Use color indicators (default: true)
}

/**
 * Horizontal bar chart using Unicode blocks
 * 
 * Example output:
 * Company A    ████████████████████ 95.2%
 * Company B    ███████████████░░░░░ 75.0%
 * Company C    ██████████░░░░░░░░░░ 50.0%
 */
export function horizontalBarChart(
  data: Array<{ label: string; value: number }>,
  options: AsciiChartOptions = {}
): string {
  const {
    barWidth = 20,
    showValues = true,
    showPercent = true,
    labelWidth,
    sortDesc = false,
    colorize = true,
  } = options;

  if (data.length === 0) return '(No data)';

  // Sort if requested
  const sortedData = sortDesc
    ? [...data].sort((a, b) => b.value - a.value)
    : data;

  const maxValue = Math.max(...sortedData.map(d => d.value), 1);
  const maxLabelLen = labelWidth || Math.max(...sortedData.map(d => d.label.length));

  const lines = sortedData.map(d => {
    const label = d.label.padEnd(maxLabelLen);
    const ratio = d.value / maxValue;
    const filledCount = Math.round(ratio * barWidth);
    const emptyCount = barWidth - filledCount;

    // Choose bar style based on value (for OKR: higher = better)
    const filled = '█'.repeat(filledCount);
    const empty = '░'.repeat(emptyCount);

    // Color indicator emoji
    let indicator = '';
    if (colorize) {
      if (d.value >= 80) indicator = '🟢';
      else if (d.value >= 50) indicator = '🟡';
      else indicator = '🔴';
    }

    // Value display
    let valueStr = '';
    if (showValues) {
      valueStr = showPercent
        ? ` ${d.value.toFixed(1)}%`
        : ` ${d.value.toFixed(1)}`;
    }

    return `${indicator} ${label} ${filled}${empty}${valueStr}`;
  });

  return lines.join('\n');
}

/**
 * Vertical bar chart using Unicode blocks
 * Good for comparing few items
 * 
 * Example output:
 *          A     B     C
 *    100% ▓▓▓▓▓
 *     75%       ▓▓▓▓▓
 *     50%             ▓▓▓▓▓
 */
export function verticalBarChart(
  data: Array<{ label: string; value: number }>,
  options: { height?: number; barChar?: string } = {}
): string {
  const { height = 8, barChar = '▓' } = options;

  if (data.length === 0) return '(No data)';

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const colWidth = Math.max(...data.map(d => d.label.length), 5) + 1;

  const lines: string[] = [];

  // Build chart from top to bottom
  for (let row = height; row >= 1; row--) {
    const threshold = (row / height) * maxValue;
    let line = '';

    data.forEach(d => {
      const filled = d.value >= threshold;
      const cell = filled ? barChar.repeat(colWidth - 1) : ' '.repeat(colWidth - 1);
      line += cell + ' ';
    });

    // Add axis label
    const axisLabel = `${Math.round((row / height) * 100)}%`.padStart(4);
    lines.push(`${axisLabel} ${line}`);
  }

  // Add x-axis labels
  const xLabels = data.map(d => d.label.padEnd(colWidth)).join('');
  lines.push('     ' + '─'.repeat(data.length * colWidth));
  lines.push('     ' + xLabels);

  return lines.join('\n');
}

/**
 * Inline sparkline using Unicode blocks
 * Good for showing trends in a single line
 * 
 * Example: ▁▂▃▅▆▇█▇▅▃
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return '';

  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map(v => {
      const idx = Math.round(((v - min) / range) * (blocks.length - 1));
      return blocks[idx];
    })
    .join('');
}

/**
 * Progress bar with percentage
 * 
 * Example: [████████████░░░░░░░░] 60%
 */
export function progressBar(
  value: number,
  max: number = 100,
  options: { width?: number; showPercent?: boolean } = {}
): string {
  const { width = 20, showPercent = true } = options;
  const ratio = Math.min(value / max, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percent = showPercent ? ` ${(ratio * 100).toFixed(1)}%` : '';

  return `[${bar}]${percent}`;
}

/**
 * Mini pie chart using emoji segments
 * Good for showing composition
 * 
 * Example: 🟢🟢🟢🟢🟡🟡🔴 (70% green, 20% yellow, 10% red)
 */
export function emojiPieChart(
  data: Array<{ label: string; value: number; emoji?: string }>,
  options: { segments?: number } = {}
): string {
  const { segments = 10 } = options;
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  const defaultEmojis = ['🟢', '🔵', '🟡', '🟠', '🔴', '🟣', '⚪', '⚫'];

  let result = '';
  let segmentIndex = 0;

  data.forEach((d, i) => {
    const emoji = d.emoji || defaultEmojis[i % defaultEmojis.length];
    const count = Math.round((d.value / total) * segments);
    result += emoji.repeat(count);
    segmentIndex += count;
  });

  // Legend
  const legend = data
    .map((d, i) => {
      const emoji = d.emoji || defaultEmojis[i % defaultEmojis.length];
      const pct = ((d.value / total) * 100).toFixed(0);
      return `${emoji} ${d.label}: ${pct}%`;
    })
    .join('  ');

  return `${result}\n\n${legend}`;
}

/**
 * Comparison table with inline bars
 * 
 * Example:
 * | Metric      | Value | Chart           |
 * |-------------|-------|-----------------|
 * | Revenue     | 85%   | ████████░░ 🟢   |
 * | Conversion  | 42%   | ████░░░░░░ 🔴   |
 */
export function comparisonTable(
  data: Array<{ label: string; value: number; target?: number }>,
  options: { barWidth?: number; showTarget?: boolean } = {}
): string {
  const { barWidth = 10, showTarget = true } = options;

  if (data.length === 0) return '(No data)';

  const maxLabel = Math.max(...data.map(d => d.label.length), 6);
  const header = `| ${'Metric'.padEnd(maxLabel)} | Value  | Progress |`;
  const separator = `|${'-'.repeat(maxLabel + 2)}|--------|${'-'.repeat(barWidth + 6)}|`;

  const rows = data.map(d => {
    const label = d.label.padEnd(maxLabel);
    const value = `${d.value.toFixed(1)}%`.padStart(6);

    const ratio = Math.min(d.value / 100, 1);
    const filled = Math.round(ratio * barWidth);
    const empty = barWidth - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    // Status indicator
    let status = '🟢';
    if (d.value < 50) status = '🔴';
    else if (d.value < 80) status = '🟡';

    return `| ${label} | ${value} | ${bar} ${status} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Heatmap row using colored blocks/emoji
 * 
 * Example: Company A: 🟢🟢🟡🔴🟢 (metric values per type)
 */
export function heatmapRow(
  label: string,
  values: number[],
  options: { thresholds?: [number, number] } = {}
): string {
  const { thresholds = [50, 80] } = options;
  const [low, high] = thresholds;

  const cells = values.map(v => {
    if (v >= high) return '🟩';
    if (v >= low) return '🟨';
    return '🟥';
  });

  return `${label}: ${cells.join('')}`;
}

/**
 * Full ASCII heatmap for OKR metrics
 * 
 * Example:
 *              MetricA  MetricB  MetricC
 * Company A      🟢       🟡       🔴
 * Company B      🟡       🟢       🟢
 */
export function asciiHeatmap(
  data: Array<{
    company: string;
    metrics: Array<{ type: string; value: number }>;
  }>,
  options: { thresholds?: [number, number]; showValues?: boolean } = {}
): string {
  const { thresholds = [50, 80], showValues = false } = options;
  const [low, high] = thresholds;

  if (data.length === 0) return '(No data)';

  // Get all metric types
  const metricTypes = [...new Set(data.flatMap(d => d.metrics.map(m => m.type)))];
  const colWidth = Math.max(...metricTypes.map(t => t.length), 8) + 1;
  const labelWidth = Math.max(...data.map(d => d.company.length), 10) + 1;

  // Header
  const header = ' '.repeat(labelWidth) + metricTypes.map(t => t.padEnd(colWidth)).join('');
  const lines = [header];

  // Data rows
  data.forEach(row => {
    let line = row.company.padEnd(labelWidth);

    metricTypes.forEach(type => {
      const metric = row.metrics.find(m => m.type === type);
      const value = metric?.value ?? 0;

      let cell: string;
      if (value >= high) cell = showValues ? `🟢${value.toFixed(0).padStart(3)}` : '  🟢  ';
      else if (value >= low) cell = showValues ? `🟡${value.toFixed(0).padStart(3)}` : '  🟡  ';
      else cell = showValues ? `🔴${value.toFixed(0).padStart(3)}` : '  🔴  ';

      line += cell.padEnd(colWidth);
    });

    lines.push(line);
  });

  // Legend
  lines.push('');
  lines.push(`Legend: 🟢 ≥${high}%  🟡 ${low}-${high}%  🔴 <${low}%`);

  return lines.join('\n');
}

/**
 * Distribution histogram using blocks
 * 
 * Example:
 * 0-20%   ██ 2
 * 20-40%  ████ 4
 * 40-60%  ██████████ 10
 * 60-80%  ████████ 8
 * 80-100% ██████ 6
 */
export function histogram(
  values: number[],
  options: { buckets?: number; maxWidth?: number } = {}
): string {
  const { buckets = 5, maxWidth = 20 } = options;

  if (values.length === 0) return '(No data)';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const bucketSize = range / buckets;

  // Count values per bucket
  const counts = new Array(buckets).fill(0);
  values.forEach(v => {
    const idx = Math.min(Math.floor((v - min) / bucketSize), buckets - 1);
    counts[idx]++;
  });

  const maxCount = Math.max(...counts, 1);

  const lines = counts.map((count, i) => {
    const lo = (min + i * bucketSize).toFixed(0);
    const hi = (min + (i + 1) * bucketSize).toFixed(0);
    const label = `${lo}-${hi}%`.padEnd(10);
    const barLen = Math.round((count / maxCount) * maxWidth);
    const bar = '█'.repeat(barLen);
    return `${label} ${bar} ${count}`;
  });

  return lines.join('\n');
}

/**
 * Summary stats block
 * 
 * Example:
 * 📊 Summary Statistics
 * ├─ Count: 15
 * ├─ Average: 72.5%
 * ├─ Min: 45.0% 🔴
 * ├─ Max: 95.0% 🟢
 * └─ Spread: 50.0 pts
 */
export function summaryStats(
  values: number[],
  options: { title?: string; showDistribution?: boolean } = {}
): string {
  const { title = 'Summary Statistics', showDistribution = true } = options;

  if (values.length === 0) return '(No data)';

  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / count;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  const minIndicator = min >= 80 ? '🟢' : min >= 50 ? '🟡' : '🔴';
  const maxIndicator = max >= 80 ? '🟢' : max >= 50 ? '🟡' : '🔴';
  const avgIndicator = avg >= 80 ? '🟢' : avg >= 50 ? '🟡' : '🔴';

  const lines = [
    `📊 ${title}`,
    `├─ Count: ${count}`,
    `├─ Average: ${avg.toFixed(1)}% ${avgIndicator}`,
    `├─ Min: ${min.toFixed(1)}% ${minIndicator}`,
    `├─ Max: ${max.toFixed(1)}% ${maxIndicator}`,
    `└─ Spread: ${spread.toFixed(1)} pts`,
  ];

  if (showDistribution) {
    const dist = sparkline(values.slice().sort((a, b) => a - b));
    lines.push(`\nDistribution: ${dist}`);
  }

  return lines.join('\n');
}

/**
 * Trend indicator
 * Shows direction and magnitude of change
 */
export function trendIndicator(
  current: number,
  previous: number,
  options: { showDelta?: boolean } = {}
): string {
  const { showDelta = true } = options;
  const delta = current - previous;
  const pctChange = previous !== 0 ? (delta / previous) * 100 : 0;

  let arrow: string;
  let indicator: string;

  if (delta > 0) {
    arrow = '↑';
    indicator = '🟢';
  } else if (delta < 0) {
    arrow = '↓';
    indicator = '🔴';
  } else {
    arrow = '→';
    indicator = '🟡';
  }

  const deltaStr = showDelta
    ? ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}, ${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%)`
    : '';

  return `${indicator} ${arrow}${deltaStr}`;
}
