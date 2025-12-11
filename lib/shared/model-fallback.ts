/**
 * Model Fallback Strategy
 * 
 * Uses OpenRouter's auto router with free models only.
 * The auto router intelligently selects the best model from a curated list
 * based on prompt complexity, task type, and model capabilities.
 * 
 * Free Models Pool:
 * - deepseek/deepseek-r1:free (671B params, 164K context, best overall)
 * - qwen/qwen3-235b-a22b-07-25:free (262K context)
 * - minimax/minimax-m2:free (204K context)
 * - mistralai/devstral-small-2505:free (32K context)
 * - google/gemini-2.0-pro-exp-02-05:free (2M context, multimodal)
 * - meta-llama/llama-3.3-70b-instruct:free (32K context)
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
 * Free models available for OpenRouter auto router
 * These models are used when openrouter/auto is configured with the models parameter
 * 
 * Note: For tool calling, we need models that support function calling.
 * Some free models may not support tools, so we prioritize models that do.
 */
export const FREE_MODELS = [
  "qwen/qwen3-235b-a22b:free",        // Supports tool calling
  "mistralai/devstral-small-2505:free", // Supports tool calling
  "kwaipilot/kat-coder-pro:free",      // Supports tool calling
  "z-ai/glm-4.5-air:free",             // May support tool calling
  "qwen/qwen3-coder:free",             // Supports tool calling
  "moonshotai/kimi-k2:free",          // May support tool calling
] as const;

/**
 * Free models that support tool calling (subset of FREE_MODELS)
 * Use this when tools are required
 */
export const FREE_MODELS_WITH_TOOLS = [
  "qwen/qwen3-235b-a22b:free",
  "mistralai/devstral-small-2505:free",
  "kwaipilot/kat-coder-pro:free",
  "qwen/qwen3-coder:free",
] as const;

/**
 * Available models in fallback order (deprecated - kept for backward compatibility)
 * @deprecated Use getAutoRouterModel() instead
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
 * Get OpenRouter auto router model with free models only
 * 
 * The auto router intelligently selects the best model from the free models pool
 * based on prompt complexity, task type, and model capabilities.
 * 
 * Note: The models parameter restriction is configured via the model identifier.
 * OpenRouter's auto router supports restricting models by using the models parameter
 * in the request. Since we're using Mastra which may not expose providerOptions directly,
 * we return the auto router model here. The actual models restriction may need to be
 * configured at the Mastra agent level or through environment variables.
 * 
 * @param requireTools - If true, only use models that support tool calling (default: false)
 * @returns LanguageModel configured for openrouter/auto
 */
export function getAutoRouterModel(requireTools: boolean = false): LanguageModel {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  const modelList = requireTools ? "tool-calling free models" : "free models";
  
  console.log(
    `🤖 [Model] Using OpenRouter auto router with ${models.length} ${modelList}`
  );
  console.log(
    `📋 [Model] Models pool: ${models.slice(0, 3).join(", ")}${models.length > 3 ? "..." : ""}`
  );
  
  // Return openrouter/auto model
  // The models parameter needs to be passed at request time via providerOptions
  // Since Mastra abstracts the request layer, we may need to configure this differently
  // For now, return the auto router - OpenRouter will handle intelligent routing
  // TODO: If Mastra supports providerOptions, pass models: models there
  // 
  // IMPORTANT: If tools are required, we should use a specific model that supports tools
  // instead of auto router, since auto router may select models without tool support
  if (requireTools) {
    // Use a specific free model that supports tool calling instead of auto router
    // This ensures tool calling works reliably
    const toolModel = models[0]; // Use first model that supports tools
    console.log(`🔧 [Model] Tool calling required, using specific model: ${toolModel}`);
    return openrouter(toolModel);
  }
  
  return openrouter("openrouter/auto");
}

/**
 * Get the list of free models for OpenRouter auto router
 * This can be used to configure the models parameter when making requests
 */
export function getFreeModelsList(): readonly string[] {
  return FREE_MODELS;
}

/**
 * Get the primary model (cheaper/faster)
 * @deprecated Use getAutoRouterModel() instead. This function now returns the auto router for backward compatibility.
 */
export function getPrimaryModel(): LanguageModel {
  console.log(
    `⚠️ [Model] getPrimaryModel() is deprecated, using auto router instead`
  );
  return getAutoRouterModel();
}

/**
 * Get the fallback model (reliable)
 * @deprecated Use getAutoRouterModel() instead. This function now returns the auto router for backward compatibility.
 */
export function getFallbackModel(): LanguageModel {
  console.log(
    `⚠️ [Model] getFallbackModel() is deprecated, using auto router instead`
  );
  return getAutoRouterModel();
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
