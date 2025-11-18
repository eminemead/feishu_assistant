/**
 * OKR Analysis Artifact Schema
 * 
 * Defines the structure for OKR analysis results with visualization support.
 * Uses Zod for type-safe, validated data structures.
 */

import { z } from 'zod';

/**
 * Artifact schema for OKR analysis results
 */
export const okrAnalysisArtifactSchema = z.object({
  period: z.string().describe('The analysis period (e.g., "10 月", "11 月")'),
  table_used: z.string().optional().describe('The database table used for analysis'),
  status: z.enum(['analyzing', 'generating_viz', 'uploading', 'complete', 'error']).optional()
    .describe('Current processing status'),
  summary: z.array(z.object({
    company: z.string(),
    average_has_metric_percentage: z.number(),
    metrics: z.array(z.object({
      metric_type: z.string(),
      has_metric_percentage: z.number(),
      total: z.number(),
      nulls: z.number(),
    })),
  })).optional(),
  total_companies: z.number().optional(),
  overall_average: z.number().optional(),
  visualization: z.object({
    image_key: z.string().optional().describe('Feishu image_key for the heatmap visualization'),
    generated: z.boolean(),
    error: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
});

// Stub artifact object for compatibility
export const okrAnalysisArtifact = {
  schema: okrAnalysisArtifactSchema,
  create: (data: any) => data,
};

export type OKRAnalysisArtifact = z.infer<typeof okrAnalysisArtifactSchema>;

