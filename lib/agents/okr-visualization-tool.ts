/**
 * OKR Visualization Tool
 * 
 * Generates heatmap visualization and uploads to Feishu
 * Uses artifacts for structured, validated data with progress tracking
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { analyzeHasMetricPercentage } from "./okr-reviewer-agent";
import { generateOKRHeatmap } from "../visualization/okr-heatmap";
import { uploadImageToFeishu } from "../feishu-image-utils";
import { okrAnalysisArtifact } from "../artifacts/okr-analysis-artifact";

/**
 * Tool that generates OKR analysis with optional visualization
 * Uses artifacts for type-safe data structures and progress tracking
 */
export const okrVisualizationTool = tool({
  description:
    "Analyze manager OKR metrics and optionally generate a heatmap visualization. Returns analysis data and image_key for visualization if requested. Progress updates are streamed during generation.",
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
          "Whether to generate a heatmap visualization. If true, returns image_key that can be used to display the image in Feishu. Progress updates will be streamed during generation."
        ),
    })
  ),
  execute: async ({
    period,
    generateVisualization = false,
  }: {
    period: string;
    generateVisualization?: boolean;
  }): Promise<any> => {
    // Create artifact instance for structured, validated data
    // Using 'as any' to avoid deep type recursion issues
    const artifact = okrAnalysisArtifact.create({
      period,
      status: 'analyzing',
    } as any);

    try {
      // Update artifact with analyzing status
      artifact.update({ status: 'analyzing' });

      // Get analysis data
      const analysis = await analyzeHasMetricPercentage(period);

      // Update artifact with analysis results
      artifact.update({
        ...analysis,
        status: generateVisualization ? 'generating_viz' : 'complete',
      });

      // If visualization requested, generate and upload with progress updates
      if (generateVisualization) {
        try {
          // Update status: generating visualization
          artifact.update({ 
            status: 'generating_viz',
            visualization: { generated: false },
          });

          // Generate heatmap PNG
          const imageBuffer = await generateOKRHeatmap(analysis);

          // Update status: uploading
          artifact.update({ 
            status: 'uploading',
            visualization: { generated: false },
          });

          // Upload to Feishu
          const imageKey = await uploadImageToFeishu(imageBuffer, "card");

          // Complete artifact with final visualization data
          artifact.update({
            status: 'complete',
            visualization: {
              image_key: imageKey,
              generated: true,
            },
          });

          artifact.complete();
          
          // Return validated data (artifact ensures type safety)
          return {
            ...analysis,
            visualization: {
              image_key: imageKey,
              generated: true,
            },
          };
        } catch (vizError: any) {
          console.error("Failed to generate visualization:", vizError);
          
          // Update artifact with error
          artifact.update({
            status: 'error',
            visualization: {
              generated: false,
              error: vizError.message || "Failed to generate visualization",
            },
          });
          
          artifact.fail(vizError);
          
          // Return analysis without visualization
          return {
            ...analysis,
            visualization: {
              generated: false,
              error: vizError.message || "Failed to generate visualization",
            },
          };
        }
      }

      // Complete artifact without visualization
      artifact.update({ status: 'complete' });
      artifact.complete();

      // Return validated data
      return {
        ...analysis,
        visualization: {
          generated: false,
        },
      };
    } catch (error: any) {
      // Update artifact with error
      artifact.update({
        status: 'error',
        error: error.message || "Failed to analyze OKR metrics",
      });
      
      artifact.fail(error);
      
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

