/**
 * OKR Metrics Heatmap Visualization
 * 
 * Generates a heatmap visualization of has_metric_percentage by company and metric type
 * Pure Node.js implementation - no Python required
 * 
 * Uses Observable Plot.js (ojs) as default - powerful, declarative, and clean!
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { promisify } from "util";
import { exec } from "child_process";
import { createCanvas } from "canvas";

const execAsync = promisify(exec);

interface OKRAnalysisResult {
  period: string;
  summary: Array<{
    company: string;
    average_has_metric_percentage: number;
    metrics: Array<{
      metric_type: string;
      has_metric_percentage: number;
      total: number;
      nulls: number;
    }>;
  }>;
  total_companies: number;
  overall_average: number;
}

/**
 * Generate heatmap visualization using Python (similar to okr_reviewer repo)
 * 
 * Requires Python with matplotlib and seaborn installed:
 * pip install matplotlib seaborn pandas numpy
 * 
 * @param analysisResult - Result from analyzeHasMetricPercentage
 * @returns PNG image buffer
 */
export async function generateHeatmapPython(
  analysisResult: OKRAnalysisResult
): Promise<Buffer> {
  // Create temporary Python script
  const scriptContent = `
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np
import json
import sys

# Read data from stdin
data = json.load(sys.stdin)

# Prepare data for heatmap
companies = []
metric_types = []
values = []

for company_data in data['summary']:
    company = company_data['company']
    for metric in company_data['metrics']:
        companies.append(company)
        metric_types.append(metric['metric_type'])
        values.append(metric['has_metric_percentage'])

# Create DataFrame
df = pd.DataFrame({
    'Company': companies,
    'Metric Type': metric_types,
    'Has Metric %': values
})

# Pivot for heatmap
pivot_df = df.pivot_table(
    index='Company',
    columns='Metric Type',
    values='Has Metric %',
    aggfunc='mean'
)

# Create heatmap
plt.figure(figsize=(12, max(8, len(pivot_df) * 0.5)))
sns.heatmap(
    pivot_df,
    annot=True,
    fmt='.1f',
    cmap='RdYlGn',
    vmin=0,
    vmax=100,
    cbar_kws={'label': 'Has Metric Percentage (%)'},
    linewidths=0.5,
    linecolor='gray'
)

plt.title(f"OKR Metrics Coverage Heatmap - {data['period']}", fontsize=14, pad=20)
plt.xlabel('Metric Type', fontsize=12)
plt.ylabel('Company', fontsize=12)
plt.tight_layout()

# Save to stdout as PNG
plt.savefig(sys.stdout.buffer, format='png', dpi=150, bbox_inches='tight')
plt.close()
`;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "okr-viz-"));
  const scriptPath = path.join(tempDir, "generate_heatmap.py");

  try {
    // Write Python script
    await fs.writeFile(scriptPath, scriptContent);

    // Execute Python script with data
    const { stdout } = await execAsync(
      `python3 ${scriptPath}`,
      {
        input: JSON.stringify(analysisResult),
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for image
      }
    );

    // Return PNG buffer
    return Buffer.from(stdout, "binary");
  } finally {
    // Cleanup
    await fs.unlink(scriptPath).catch(() => {});
    await fs.rmdir(tempDir).catch(() => {});
  }
}

/**
 * Generate heatmap using pure Node.js (no Python required)
 * 
 * Uses canvas library to draw heatmap manually
 * 
 * @param analysisResult - Result from analyzeHasMetricPercentage
 * @returns PNG image buffer
 */
export async function generateHeatmapNode(
  analysisResult: OKRAnalysisResult
): Promise<Buffer> {
  // Prepare data for heatmap
  const companies: string[] = [];
  const metricTypes: string[] = [];
  const dataMap: Map<string, Map<string, number>> = new Map();

  // Extract unique companies and metric types, build data map
  for (const companyData of analysisResult.summary) {
    const company = companyData.company;
    if (!companies.includes(company)) {
      companies.push(company);
    }

    for (const metric of companyData.metrics) {
      const metricType = metric.metric_type;
      if (!metricTypes.includes(metricType)) {
        metricTypes.push(metricType);
      }

      if (!dataMap.has(company)) {
        dataMap.set(company, new Map());
      }
      dataMap.get(company)!.set(metricType, metric.has_metric_percentage);
    }
  }

  // Canvas dimensions
  const padding = { top: 80, right: 200, bottom: 60, left: 150 };
  const cellWidth = 80;
  const cellHeight = 40;
  const legendWidth = 100;
  const legendHeight = 20;

  const canvasWidth = padding.left + metricTypes.length * cellWidth + padding.right + legendWidth;
  const canvasHeight = padding.top + companies.length * cellHeight + padding.bottom;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Color gradient function (RdYlGn: Red-Yellow-Green)
  function getColor(value: number): string {
    // value is 0-100, map to color
    // Red (low) -> Yellow (medium) -> Green (high)
    if (value < 50) {
      // Red to Yellow
      const ratio = value / 50;
      const r = 255;
      const g = Math.floor(255 * ratio);
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Green
      const ratio = (value - 50) / 50;
      const r = Math.floor(255 * (1 - ratio));
      const g = 255;
      const b = 0;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Draw heatmap cells
  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const y = padding.top + i * cellHeight;

    for (let j = 0; j < metricTypes.length; j++) {
      const metricType = metricTypes[j];
      const x = padding.left + j * cellWidth;

      const value = dataMap.get(company)?.get(metricType) ?? 0;
      const color = getColor(value);

      // Draw cell
      ctx.fillStyle = color;
      ctx.fillRect(x, y, cellWidth, cellHeight);

      // Draw border
      ctx.strokeStyle = "#666666";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cellWidth, cellHeight);

      // Draw value text
      ctx.fillStyle = value < 50 ? "#ffffff" : "#000000"; // White text on dark, black on light
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        value.toFixed(1) + "%",
        x + cellWidth / 2,
        y + cellHeight / 2
      );
    }
  }

  // Draw company labels (y-axis)
  ctx.fillStyle = "#000000";
  ctx.font = "12px Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < companies.length; i++) {
    const y = padding.top + i * cellHeight + cellHeight / 2;
    ctx.fillText(companies[i], padding.left - 10, y);
  }

  // Draw metric type labels (x-axis) - rotated
  ctx.save();
  ctx.translate(padding.left, padding.top + companies.length * cellHeight + 20);
  ctx.rotate(-Math.PI / 4); // -45 degrees
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let j = 0; j < metricTypes.length; j++) {
    const x = j * cellWidth + cellWidth / 2;
    ctx.fillText(metricTypes[j], x, 0);
  }
  ctx.restore();

  // Draw title
  ctx.fillStyle = "#000000";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(
    `OKR Metrics Coverage Heatmap - ${analysisResult.period}`,
    canvasWidth / 2,
    20
  );

  // Draw axis labels
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    "Metric Type",
    canvasWidth / 2,
    padding.top + companies.length * cellHeight + 40
  );

  ctx.save();
  ctx.translate(20, canvasHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Company", 0, 0);
  ctx.restore();

  // Draw color legend
  const legendX = padding.left + metricTypes.length * cellWidth + 20;
  const legendY = padding.top + 20;

  ctx.font = "10px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Coverage %", legendX, legendY);

  // Draw gradient bar
  const barWidth = 20;
  const barHeight = 200;
  const gradient = ctx.createLinearGradient(0, 0, 0, barHeight);
  gradient.addColorStop(0, getColor(100)); // Green (high)
  gradient.addColorStop(0.5, getColor(50)); // Yellow (medium)
  gradient.addColorStop(1, getColor(0)); // Red (low)

  ctx.fillStyle = gradient;
  ctx.fillRect(legendX, legendY + 20, barWidth, barHeight);

  // Draw legend labels
  ctx.fillStyle = "#000000";
  ctx.font = "10px Arial";
  ctx.textAlign = "left";
  ctx.fillText("100%", legendX + barWidth + 5, legendY + 20);
  ctx.fillText("50%", legendX + barWidth + 5, legendY + 20 + barHeight / 2);
  ctx.fillText("0%", legendX + barWidth + 5, legendY + 20 + barHeight);

  // Convert to PNG buffer
  return canvas.toBuffer("image/png");
}

/**
 * Main function to generate heatmap visualization
 * 
 * Uses Observable Plot.js (ojs) as default - powerful, declarative, and clean!
 * 
 * @param analysisResult - Result from analyzeHasMetricPercentage
 * @returns PNG image buffer
 */
export async function generateOKRHeatmap(
  analysisResult: OKRAnalysisResult
): Promise<Buffer> {
  // Use Observable Plot.js implementation (default)
  // Much cleaner than manual canvas drawing!
  const { generateHeatmapPlot } = await import("./okr-heatmap-plot");
  return generateHeatmapPlot(analysisResult);
}

