/**
 * OKR Metrics Heatmap Visualization using Observable Plot.js
 * 
 * Pure Node.js implementation - no Python required
 * Uses Observable Plot.js for powerful, declarative visualizations
 * 
 * Observable Plot is excellent because:
 * - Declarative API (very clean code)
 * - Built-in heatmap support (cell mark)
 * - Beautiful default styling
 * - Color schemes (RdYlGn like seaborn)
 * - Works great for exploratory data analysis
 */

import * as Plot from "@observablehq/plot";
import { JSDOM } from "jsdom";

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
 * Generate heatmap using Observable Plot.js
 * 
 * Observable Plot is perfect for this because:
 * - Cell mark is designed for heatmaps
 * - Built-in color scales (RdYlGn scheme)
 * - Clean, declarative syntax
 * - Excellent for tabular data visualization
 * 
 * @param analysisResult - Result from analyzeHasMetricPercentage
 * @returns PNG image buffer
 */
export async function generateHeatmapPlot(
  analysisResult: OKRAnalysisResult
): Promise<Buffer> {
  // Prepare data for Plot.js
  // Plot.js expects an array of objects
  const data: Array<{ company: string; metricType: string; value: number }> = [];

  for (const companyData of analysisResult.summary) {
    for (const metric of companyData.metrics) {
      data.push({
        company: companyData.company,
        metricType: metric.metric_type,
        value: metric.has_metric_percentage,
      });
    }
  }

  // Create DOM for Plot.js (required for server-side rendering)
  // Need to configure jsdom with canvas support for Plot.js legends
  const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
    // Provide canvas implementation for Plot.js legend rendering
    pretendToBeVisual: true,
    resources: "usable",
  });
  const document = dom.window.document;
  
  // Set up canvas for Plot.js (needed for color legend rendering)
  // Plot.js uses canvas internally for legend gradients
  if (typeof dom.window.HTMLCanvasElement === "undefined") {
    // Import canvas and patch jsdom
    const { Canvas } = require("canvas");
    
    // Patch jsdom to support canvas (required for Plot.js legend rendering)
    (dom.window as any).HTMLCanvasElement = Canvas;
    (dom.window as any).CanvasRenderingContext2D = require("canvas").CanvasRenderingContext2D;
  }

  // Create the plot using Observable Plot's declarative API
  // This is much cleaner than manual canvas drawing!
  const plot = Plot.plot({
    title: `OKR Metrics Coverage Heatmap - ${analysisResult.period}`,
    width: 1200,
    height: Math.max(600, analysisResult.summary.length * 50 + 200),
    marginTop: 60,
    marginRight: 200,
    marginBottom: 100,
    marginLeft: 150,
    
    // Color scale - RdYlGn scheme (Red-Yellow-Green) like seaborn
    color: {
      type: "linear",
      scheme: "RdYlGn",
      domain: [0, 100],
      label: "Has Metric Percentage (%)",
      legend: true,
      nice: true,
    },
    
    // X-axis: Metric types
    x: {
      label: "Metric Type",
      tickRotate: -45,
      padding: 0.1,
    },
    
    // Y-axis: Companies
    y: {
      label: "Company",
      padding: 0.1,
    },
    
    // Marks: The actual visualization elements
    marks: [
      // Cell mark - perfect for heatmaps!
      Plot.cell(data, {
        x: "metricType",
        y: "company",
        fill: "value",
        title: (d: any) => `${d.company} - ${d.metricType}: ${d.value.toFixed(1)}%`,
        stroke: "#666",
        strokeWidth: 0.5,
      }),
      
      // Text overlay with values
      Plot.text(data, {
        x: "metricType",
        y: "company",
        text: (d: any) => d.value.toFixed(1) + "%",
        fill: (d: any) => (d.value < 50 ? "white" : "black"), // White text on dark cells
        fontSize: 12,
        fontWeight: "bold",
      }),
    ],
    
    document, // Pass document for server-side rendering
  });

  // Append plot to document body (required for Plot.js)
  document.body.appendChild(plot);

  // Get SVG string from the plot element
  const svgElement = plot.querySelector("svg") || plot;
  const svgString = svgElement.outerHTML || svgElement.toString();
  
  // Convert SVG to PNG using sharp (more reliable than canvas for SVG)
  return await convertSVGToPNG(svgString);
}

/**
 * Convert SVG to PNG
 * 
 * Uses sharp library for high-quality SVG to PNG conversion
 */
async function convertSVGToPNG(svgString: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  
  // Convert SVG to PNG
  // Sharp can handle SVG directly
  const pngBuffer = await sharp(Buffer.from(svgString))
    .png()
    .toBuffer();
  
  return pngBuffer;
}

/**
 * Main function to generate heatmap visualization
 * 
 * Uses Observable Plot.js - much cleaner than manual canvas!
 * 
 * @param analysisResult - Result from analyzeHasMetricPercentage
 * @returns PNG image buffer
 */
export async function generateOKRHeatmap(
  analysisResult: OKRAnalysisResult
): Promise<Buffer> {
  return generateHeatmapPlot(analysisResult);
}
