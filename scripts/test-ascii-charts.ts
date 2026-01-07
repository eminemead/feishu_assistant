#!/usr/bin/env bun
/**
 * Test ASCII Charts - Demo script
 * 
 * Run with: bun scripts/test-ascii-charts.ts
 */

import * as ascii from '../lib/visualization/ascii-charts';

console.log('='.repeat(60));
console.log('ASCII Charts Demo - Perfect for Feishu');
console.log('='.repeat(60));
console.log();

// Sample OKR data
const companyData = [
  { label: 'Shanghai HQ', value: 92.5 },
  { label: 'Beijing', value: 78.3 },
  { label: 'Guangzhou', value: 65.0 },
  { label: 'Shenzhen', value: 54.2 },
  { label: 'Hangzhou', value: 45.8 },
];

// 1. Horizontal Bar Chart
console.log('📊 1. Horizontal Bar Chart (Company Performance)');
console.log('-'.repeat(50));
console.log(ascii.horizontalBarChart(companyData, {
  barWidth: 25,
  showPercent: true,
  sortDesc: true,
  colorize: true,
}));
console.log();

// 2. Progress Bars
console.log('📊 2. Progress Bars');
console.log('-'.repeat(50));
companyData.forEach(d => {
  console.log(`${d.label.padEnd(15)} ${ascii.progressBar(d.value, 100, { width: 20 })}`);
});
console.log();

// 3. Sparkline
console.log('📊 3. Sparkline (Trend)');
console.log('-'.repeat(50));
const trendData = [45, 52, 48, 65, 72, 68, 78, 85, 82, 90, 88, 92];
console.log(`Monthly trend: ${ascii.sparkline(trendData)}`);
console.log();

// 4. Emoji Pie Chart
console.log('📊 4. Emoji Pie Chart (Metric Distribution)');
console.log('-'.repeat(50));
const metricData = [
  { label: 'Revenue', value: 35 },
  { label: 'Conversion', value: 25 },
  { label: 'Retention', value: 20 },
  { label: 'NPS', value: 15 },
  { label: 'Other', value: 5 },
];
console.log(ascii.emojiPieChart(metricData, { segments: 20 }));
console.log();

// 5. Comparison Table
console.log('📊 5. Comparison Table');
console.log('-'.repeat(50));
console.log(ascii.comparisonTable(companyData.map(d => ({
  label: d.label,
  value: d.value,
  target: 80,
}))));
console.log();

// 6. Summary Statistics
console.log('📊 6. Summary Statistics');
console.log('-'.repeat(50));
const values = companyData.map(d => d.value);
console.log(ascii.summaryStats(values, {
  title: 'OKR Coverage Overview',
  showDistribution: true,
}));
console.log();

// 7. Histogram
console.log('📊 7. Distribution Histogram');
console.log('-'.repeat(50));
const allValues = [23, 45, 52, 55, 58, 62, 65, 68, 72, 75, 78, 82, 85, 88, 92, 95];
console.log(ascii.histogram(allValues, { buckets: 5, maxWidth: 20 }));
console.log();

// 8. Heatmap
console.log('📊 8. ASCII Heatmap');
console.log('-'.repeat(50));
const heatmapData = [
  {
    company: 'Shanghai',
    metrics: [
      { type: 'Revenue', value: 95 },
      { type: 'Conv', value: 72 },
      { type: 'NPS', value: 45 },
    ],
  },
  {
    company: 'Beijing',
    metrics: [
      { type: 'Revenue', value: 78 },
      { type: 'Conv', value: 85 },
      { type: 'NPS', value: 62 },
    ],
  },
  {
    company: 'Guangzhou',
    metrics: [
      { type: 'Revenue', value: 55 },
      { type: 'Conv', value: 48 },
      { type: 'NPS', value: 82 },
    ],
  },
];
console.log(ascii.asciiHeatmap(heatmapData, { thresholds: [50, 80] }));
console.log();

// 9. Trend Indicator
console.log('📊 9. Trend Indicators');
console.log('-'.repeat(50));
console.log(`Shanghai: 85% → 92% ${ascii.trendIndicator(92, 85)}`);
console.log(`Beijing:  80% → 78% ${ascii.trendIndicator(78, 80)}`);
console.log(`Hangzhou: 65% → 65% ${ascii.trendIndicator(65, 65)}`);
console.log();

// 10. Vertical Bar Chart
console.log('📊 10. Vertical Bar Chart');
console.log('-'.repeat(50));
console.log(ascii.verticalBarChart(companyData.slice(0, 4), { height: 6 }));
console.log();

console.log('='.repeat(60));
console.log('✅ All charts render perfectly in any markdown context!');
console.log('='.repeat(60));
