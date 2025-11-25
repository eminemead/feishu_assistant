/**
 * Model Fallback Strategy
 * 
 * Provides flexible model selection with automatic fallback on rate limits.
 * Tries cheaper/faster models first, falls back to reliable models if needed.
 * 
 * Supported models:
 * - Primary (cheap): kwaipilot/kat-coder-pro:free
 * - Fallback: google/gemini-2.5-flash-lite
 * 
 * Rate Limit Handling:
 * - Exponential backoff: 2s, 4s, 8s (with jitter)
 * - Max 3 retries per request
 * - Separate cooldown tracking per model tier
 * - Automatic fallback to reliable model on rate limit
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
 * Rate limit state per model tier
 */
interface RateLimitState {
  tier: ModelTier;
  isRateLimited: boolean;
  cooldownUntil: number; // timestamp
  consecutiveFailures: number;
  lastErrorTime: number;
}

/**
 * Tracks rate limit state for each model tier
 */
const rateLimitStates: Map<ModelTier, RateLimitState> = new Map([
  ["primary", { tier: "primary", isRateLimited: false, cooldownUntil: 0, consecutiveFailures: 0, lastErrorTime: 0 }],
  ["fallback", { tier: "fallback", isRateLimited: false, cooldownUntil: 0, consecutiveFailures: 0, lastErrorTime: 0 }],
]);

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
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

/**
 * Check if a model tier is currently rate limited
 */
export function isModelRateLimited(tier: ModelTier): boolean {
  const state = rateLimitStates.get(tier);
  if (!state) return false;
  
  const now = Date.now();
  if (state.cooldownUntil > now) {
    return true;
  }
  
  // Clear cooldown if expired
  if (state.isRateLimited && state.cooldownUntil <= now) {
    state.isRateLimited = false;
    state.consecutiveFailures = 0;
    console.log(`✅ [RateLimit] ${tier} model cooldown expired, ready to use`);
  }
  
  return false;
}

/**
 * Mark a model tier as rate limited
 * Sets cooldown with exponential backoff based on failure count
 */
export function markModelRateLimited(tier: ModelTier): void {
  const state = rateLimitStates.get(tier);
  if (!state) return;
  
  state.isRateLimited = true;
  state.consecutiveFailures++;
  state.lastErrorTime = Date.now();
  
  // Exponential backoff: 2s, 4s, 8s
  const baseDelayMs = 2000;
  const backoffMultiplier = Math.pow(2, Math.min(state.consecutiveFailures - 1, 2));
  const delay = baseDelayMs * backoffMultiplier;
  
  state.cooldownUntil = Date.now() + delay;
  
  console.warn(
    `⚠️ [RateLimit] ${tier} model hit rate limit. ` +
    `Cooldown: ${delay}ms (attempt #${state.consecutiveFailures})`
  );
}

/**
 * Clear rate limit state for a model tier
 */
export function clearModelRateLimit(tier: ModelTier): void {
  const state = rateLimitStates.get(tier);
  if (!state) return;
  
  state.isRateLimited = false;
  state.consecutiveFailures = 0;
  state.cooldownUntil = 0;
  console.log(`✅ [RateLimit] Cleared rate limit for ${tier} model`);
}

/**
 * Get the number of consecutive failures for a model tier
 */
export function getConsecutiveFailures(tier: ModelTier): number {
  const state = rateLimitStates.get(tier);
  return state ? state.consecutiveFailures : 0;
}

/**
 * Sleep for a given number of milliseconds
 * Useful for backoff delays
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay with jitter
 * Prevents thundering herd problem when multiple requests retry simultaneously
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(2, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * (Math.random() - 0.5) * 2 * config.jitterFactor;
  return Math.round(cappedDelay + jitter);
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 2000,
  maxDelayMs: 8000,
  jitterFactor: 0.1, // ±10% jitter
};
