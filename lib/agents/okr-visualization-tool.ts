/**
 * OKR Visualization Tool
 * 
 * Generates heatmap visualization and uploads to Feishu
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { analyzeHasMetricPercentage } from "./okr-reviewer-agent";
import { generateOKRHeatmap } from "../visualization/okr-heatmap";
import { uploadImageToFeishu } from "../feishu-image-utils";

/**
 * Tool that generates OKR analysis with optional visualization
 */
export const okrVisualizationTool = tool({
  description:
    "Analyze manager OKR metrics and optionally generate a heatmap visualization. Returns analysis data and image_key for visualization if requested.",
  parameters: zodSchema(
    z.object({
      period: z
        .string()
        .describe(
          "The period to analyze (e.g., '10 月', '11 月', '9 月'). Defaults to current month if not specified."
        ),
      generateVisualization: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Whether to generate a heatmap visualization. If true, returns image_key that can be used to display the image in Feishu."
        ),
    })
  ),
  execute: async ({
    period,
    generateVisualization = false,
  }: {
    period: string;
    generateVisualization?: boolean;
  }) => {
    try {
      // Get analysis data
      const analysis = await analyzeHasMetricPercentage(period);

      // If visualization requested, generate and upload
      if (generateVisualization) {
        try {
          // Generate heatmap PNG
          const imageBuffer = await generateOKRHeatmap(analysis);

          // Upload to Feishu
          const imageKey = await uploadImageToFeishu(imageBuffer, "card");

          return {
            ...analysis,
            visualization: {
              image_key: imageKey,
              generated: true,
            },
          };
        } catch (vizError: any) {
          console.error("Failed to generate visualization:", vizError);
          // Return analysis without visualization if viz fails
          return {
            ...analysis,
            visualization: {
              generated: false,
              error: vizError.message || "Failed to generate visualization",
            },
          };
        }
      }

      // Return analysis without visualization
      return {
        ...analysis,
        visualization: {
          generated: false,
        },
      };
    } catch (error: any) {
      return {
        error: error.message || "Failed to analyze OKR metrics",
        period,
        visualization: {
          generated: false,
        },
      };
    }
  },
});

