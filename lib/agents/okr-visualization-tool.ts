/**
 * OKR Visualization Tool
 * 
 * Generates heatmap visualization and uploads to Feishu
 * Uses artifacts for structured, validated data with progress tracking
 */

import { tool } from "ai";
import { z } from "zod";
import { analyzeHasMetricPercentage } from "./okr-reviewer-agent";
import { generateOKRHeatmap } from "../visualization/okr-heatmap";
import { uploadImageToFeishu } from "../feishu-image-utils";
import { okrAnalysisArtifact } from "../artifacts/okr-analysis-artifact";
import { createCachedWithTTL } from "../cache";
import { devtoolsTracker } from "../devtools-integration";

/**
 * Base tool that generates OKR analysis with optional visualization
 * Uses artifacts for type-safe data structures and progress tracking
 */
const okrVisualizationToolBase = (tool as any)({
    description:
        "Analyze manager OKR metrics and optionally generate a heatmap visualization. Returns analysis data and image_key for visualization if requested. Progress updates are streamed during generation.",
    parameters: z.object({
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
    }),
    execute: async ({
        period,
        generateVisualization = false,
    }: {
        period: string;
        generateVisualization?: boolean;
    }): Promise<any> => {
        // Start a tool session for comprehensive tracking
        const sessionId = devtoolsTracker.startToolSession('mgr_okr_visualization');

        // Create artifact instance for structured, validated data
        // Using 'as any' to avoid deep type recursion issues
        const artifact = okrAnalysisArtifact.create({
            period,
            status: 'analyzing',
        } as any);

        try {
            // Update artifact with analyzing status
            artifact.update({ status: 'analyzing' });
            devtoolsTracker.addToSession(sessionId, 'analysis_started', { period });

            // Get analysis data
            const analyzeStartTime = Date.now();
            const analysis = await analyzeHasMetricPercentage(period);
            const analyzeDuration = Date.now() - analyzeStartTime;

            devtoolsTracker.addToSession(sessionId, 'analysis_complete', {
                duration: analyzeDuration,
                companies: analysis.total_companies,
                average_percentage: analysis.overall_average,
            });

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
                    devtoolsTracker.addToSession(sessionId, 'viz_generation_started', {});

                    // Generate heatmap PNG
                    const heatmapStartTime = Date.now();
                    const imageBuffer = await generateOKRHeatmap(analysis);
                    const heatmapDuration = Date.now() - heatmapStartTime;

                    devtoolsTracker.addToSession(sessionId, 'viz_generation_complete', {
                        duration: heatmapDuration,
                        bufferSize: imageBuffer.length,
                    });

                    // Update status: uploading
                    artifact.update({
                        status: 'uploading',
                        visualization: { generated: false },
                    });
                    devtoolsTracker.addToSession(sessionId, 'upload_started', {});

                    // Upload to Feishu
                    const uploadStartTime = Date.now();
                    const imageKey = await uploadImageToFeishu(imageBuffer, "card");
                    const uploadDuration = Date.now() - uploadStartTime;

                    devtoolsTracker.addToSession(sessionId, 'upload_complete', {
                        duration: uploadDuration,
                        imageKey,
                    });

                    // Complete artifact with final visualization data
                    artifact.update({
                        status: 'complete',
                        visualization: {
                            image_key: imageKey,
                            generated: true,
                        },
                    });

                    artifact.complete();

                    // Complete the session with success
                    devtoolsTracker.completeToolSession(sessionId, {
                        status: 'success',
                        imageKey,
                        companies: analysis.total_companies,
                    });

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

                    // Fail the session with error
                    devtoolsTracker.failToolSession(sessionId, vizError instanceof Error ? vizError : new Error(String(vizError)));

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

            // Complete session without visualization
            devtoolsTracker.completeToolSession(sessionId, {
                status: 'success',
                companies: analysis.total_companies,
                visualizationGenerated: false,
            });

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

            // Fail the session with error
            devtoolsTracker.failToolSession(sessionId, error instanceof Error ? error : new Error(String(error)));

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

/**
 * Cached version - This is the most expensive operation:
 * - Database queries
 * - Python heatmap generation
 * - Image upload to Feishu
 * 
 * Cache for 2 hours since visualizations don't change frequently
 * Same period + generateVisualization flag = instant response from cache
 */
export const okrVisualizationTool = createCachedWithTTL(2 * 60 * 60 * 1000)(okrVisualizationToolBase);

