/**
 * Model Fallback Strategy
 * 
 * Provides flexible model selection with automatic fallback on rate limits.
 * Tries cheaper/faster models first, falls back to reliable models if needed.
 * 
 * Supported models:
 * - Primary (cheap): kwaipilot/kat-coder-pro:free
 * - Fallback: google/gemini-2.5-flash-lite
 */

import { LanguageModel } from "ai";
import { openrouter } from "./config";

export type ModelTier = "primary" | "fallback";

export interface ModelConfig {
  name: string;
  tier: ModelTier;
  model: string;
  costNote: string;
}

/**
 * Available models in fallback order
 */
export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    name: "kwaipilot/kat-coder-pro",
    tier: "primary",
    model: "kwaipilot/kat-coder-pro:free",
    costNote: "Free tier (may have rate limits)",
  },
  {
    name: "Google Gemini 2.5 Flash",
    tier: "fallback",
    model: "google/gemini-2.5-flash-lite",
    costNote: "Paid (reliable, no rate limits)",
  },
];

/**
 * Get the primary model (cheaper/faster)
 */
export function getPrimaryModel(): LanguageModel {
  const model = AVAILABLE_MODELS.find((m) => m.tier === "primary");
  if (!model) {
    throw new Error("No primary model configured");
  }
  console.log(
    `🤖 [Model] Using primary model: ${model.name} (${model.costNote})`
  );
  return openrouter(model.model);
}

/**
 * Get the fallback model (reliable)
 */
export function getFallbackModel(): LanguageModel {
  const model = AVAILABLE_MODELS.find((m) => m.tier === "fallback");
  if (!model) {
    throw new Error("No fallback model configured");
  }
  console.log(
    `🤖 [Model] Using fallback model: ${model.name} (${model.costNote})`
  );
  return openrouter(model.model);
}

/**
 * Get the current recommended model
 * Checks for rate limit indicators and returns appropriate model
 *
 * Note: This is a static recommendation. For true rate-limit detection,
 * we need to handle errors during stream processing and switch models there.
 *
 * @param forceModelTier - Force use of specific tier ("primary" or "fallback")
 */
export function getRecommendedModel(
  forceModelTier?: ModelTier
): LanguageModel {
  // Check environment variable for forced model selection
  const envModel = process.env.AI_MODEL_TIER as ModelTier | undefined;
  
  if (envModel) {
    console.log(`🔧 [Model] Model tier forced via env var: ${envModel}`);
    if (envModel === "fallback") {
      return getFallbackModel();
    }
    if (envModel === "primary") {
      return getPrimaryModel();
    }
  }
  
  if (forceModelTier === "fallback") {
    return getFallbackModel();
  }
  if (forceModelTier === "primary") {
    return getPrimaryModel();
  }

  // Default: try primary first
  return getPrimaryModel();
}

/**
 * Detect if an error is due to rate limiting
 */
export function isRateLimitError(error: any): boolean {
  const errorStr = String(error);
  return (
    error?.statusCode === 429 ||
    error?.status === 429 ||
    errorStr.includes("429") ||
    errorStr.includes("Too Many Requests") ||
    errorStr.includes("rate limit") ||
    errorStr.toLowerCase().includes("rate limit")
  );
}

/**
 * List all available models for debugging
 */
export function listAvailableModels(): void {
  console.log("📋 Available Models:");
  AVAILABLE_MODELS.forEach((model, idx) => {
    console.log(
      `  ${idx + 1}. ${model.name} (${model.tier}) - ${model.costNote}`
    );
  });
}

/**
 * Get model config by tier
 */
export function getModelConfig(tier: ModelTier): ModelConfig {
  const config = AVAILABLE_MODELS.find((m) => m.tier === tier);
  if (!config) {
    throw new Error(`No model configured for tier: ${tier}`);
  }
  return config;
}
