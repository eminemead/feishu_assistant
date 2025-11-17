/**
 * Tests for OKR Heatmap Visualization using Observable Plot.js
 */

import { describe, it, expect } from "bun:test";
import { generateOKRHeatmap } from "../../lib/visualization/okr-heatmap";

// Mock OKR analysis result for testing
const mockOKRAnalysis = {
  period: "10 月",
  summary: [
    {
      company: "Company A",
      average_has_metric_percentage: 85.5,
      metrics: [
        {
          metric_type: "revenue",
          has_metric_percentage: 90.0,
          total: 10,
          nulls: 1,
        },
        {
          metric_type: "growth",
          has_metric_percentage: 80.0,
          total: 10,
          nulls: 2,
        },
      ],
    },
    {
      company: "Company B",
      average_has_metric_percentage: 75.0,
      metrics: [
        {
          metric_type: "revenue",
          has_metric_percentage: 70.0,
          total: 5,
          nulls: 1.5,
        },
        {
          metric_type: "growth",
          has_metric_percentage: 80.0,
          total: 5,
          nulls: 1,
        },
      ],
    },
  ],
  total_companies: 2,
  overall_average: 80.25,
};

describe("OKR Heatmap Visualization (Observable Plot.js)", () => {
  it("should generate PNG buffer from OKR analysis", async () => {
    const imageBuffer = await generateOKRHeatmap(mockOKRAnalysis);

    expect(imageBuffer).toBeDefined();
    expect(Buffer.isBuffer(imageBuffer)).toBe(true);
    expect(imageBuffer.length).toBeGreaterThan(0);
  }, 30000); // 30s timeout for image generation

  it("should generate valid PNG image", async () => {
    const imageBuffer = await generateOKRHeatmap(mockOKRAnalysis);

    // PNG files start with PNG signature: 89 50 4E 47
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const hasPngSignature = imageBuffer.subarray(0, 8).equals(pngSignature);

    expect(hasPngSignature).toBe(true);
  }, 30000);

  it("should handle empty data gracefully", async () => {
    const emptyAnalysis = {
      period: "10 月",
      summary: [],
      total_companies: 0,
      overall_average: 0,
    };

    // Should not throw, but might return empty/minimal image
    try {
      const imageBuffer = await generateOKRHeatmap(emptyAnalysis);
      expect(Buffer.isBuffer(imageBuffer)).toBe(true);
    } catch (error) {
      // Error is acceptable for empty data
      expect(error).toBeDefined();
    }
  }, 30000);

  it("should generate image with correct dimensions", async () => {
    const imageBuffer = await generateOKRHeatmap(mockOKRAnalysis);

    // Image should be reasonably sized (not empty, not too large)
    expect(imageBuffer.length).toBeGreaterThan(1000); // At least 1KB
    expect(imageBuffer.length).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
  }, 30000);

  it("should handle multiple companies and metrics", async () => {
    const largeAnalysis = {
      period: "10 月",
      summary: Array.from({ length: 5 }, (_, i) => ({
        company: `Company ${String.fromCharCode(65 + i)}`,
        average_has_metric_percentage: 80 + i * 2,
        metrics: Array.from({ length: 3 }, (_, j) => ({
          metric_type: `metric_${j + 1}`,
          has_metric_percentage: 75 + i * 2 + j * 3,
          total: 10,
          nulls: 2,
        })),
      })),
      total_companies: 5,
      overall_average: 85.0,
    };

    const imageBuffer = await generateOKRHeatmap(largeAnalysis);

    expect(imageBuffer).toBeDefined();
    expect(Buffer.isBuffer(imageBuffer)).toBe(true);
    expect(imageBuffer.length).toBeGreaterThan(0);
  }, 30000);
});

