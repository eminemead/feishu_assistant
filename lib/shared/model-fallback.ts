/**
 * Model Fallback Strategy
 * 
 * Uses OpenRouter's auto router with free models only.
 * The auto router intelligently selects the best model from a curated list
 * based on prompt complexity, task type, and model capabilities.
 * 
 * Free Models Pool:
 * - nvidia/nemotron-3-nano-30b-a3b:free (30B params, 1M context, supports tools)
 * - qwen/qwen3-235b-a22b:free (262K context, supports tools)
 * - mistralai/devstral-small-2505:free (supports tools)
 * - kwaipilot/kat-coder-pro:free (coding-focused, supports tools)
 * - qwen/qwen3-coder:free (coding-focused, supports tools)
 * 
 * Rate Limit Handling:
 * - Exponential backoff: 2s, 4s, 8s (with jitter)
 * - Max 3 retries per request
 * - Separate cooldown tracking per model tier
 * - Automatic fallback to reliable model on rate limit
 */

import { LanguageModel } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
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
 * Free models available for OpenRouter
 * 
 * MANDATORY: These are the ONLY models allowed to be selected.
 * This whitelist prevents OpenRouter from selecting paid models.
 * 
 * Simplified to 2 models:
 * 1. Primary: nvidia/nemotron-3-nano-30b-a3b:free (30B params, 1M context, supports tools)
 * 2. Alternative: kwaipilot/kat-coder-pro:free (coding-focused, supports tools)
 */
export const FREE_MODELS = [
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "kwaipilot/kat-coder-pro:free",
] as const;

/**
 * Free models that support tool calling (same as FREE_MODELS - both support tools)
 * Use this when tools are required
 */
export const FREE_MODELS_WITH_TOOLS = [
  "nvidia/nemotron-3-nano-30b-a3b:free", // 1M context, excellent for long tasks
  "kwaipilot/kat-coder-pro:free", // Coding-focused alternative
] as const;

// ============================================================================
// GUARDRAIL: Validate all models are free at module load
// This prevents accidental addition of paid models to the whitelist
// ============================================================================
[...FREE_MODELS, ...FREE_MODELS_WITH_TOOLS].forEach((model) => {
  if (!model.endsWith(":free")) {
    throw new Error(
      `🚨 PAID MODEL DETECTED: "${model}" does not have :free suffix!\n` +
      `Only free models are allowed in FREE_MODELS arrays.\n` +
      `See AGENTS.md for model usage policy.`
    );
  }
});

/**
 * NVIDIA API Model Configuration (Direct API - Free)
 * 
 * Uses NVIDIA's integrate.api.nvidia.com endpoint directly.
 * This is OpenAI-compatible and free to use.
 * 
 * Model: z-ai/glm4.7 - GLM 4.7, supports tool calling
 */
export const NVIDIA_MODEL_CONFIG = {
  url: process.env.NVIDIA_URL || "https://integrate.api.nvidia.com/v1",
  id: process.env.NVIDIA_MODEL_ID || "z-ai/glm4.7",
  apiKey: process.env.NVIDIA_API_TOKEN,
} as const;

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
 * MANDATORY: The models parameter is ALWAYS passed to restrict auto router to free models only.
 * This prevents OpenRouter from selecting paid models like Perplexity Sonar.
 * 
 * @param requireTools - If true, only use models that support tool calling (default: false)
 * @returns LanguageModel configured for openrouter/auto with FREE_MODELS restriction
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
  
  // IMPORTANT: If tools are required, we should use a specific model that supports tools
  // instead of auto router, since auto router may select models without tool support
  if (requireTools) {
    // Use a specific free model that supports tool calling instead of auto router
    // This ensures tool calling works reliably
    // Try multiple models in order as fallback for rate limits
    const toolModel = models[0]; // Use first model that supports tools
    console.log(`🔧 [Model] Tool calling required, using specific model: ${toolModel}`);
    console.log(`📋 [Model] Fallback models available: ${models.slice(1, 3).join(", ")}`);
    return openrouter(toolModel);
  }
  
  // MANDATORY: Create restricted auto router with models whitelist
  // This prevents OpenRouter from selecting paid models (e.g., Perplexity Sonar)
  const modelsArray = Array.from(models) as string[];
  
  // Create a new OpenRouter instance with models restriction in provider options
  // The models array will be passed to OpenRouter's API to restrict auto router selection
  const restrictedOpenRouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  
  // Call openrouter/auto with models parameter to enforce free models only
  // We wrap the call to inject the models parameter into every request
  const baseModel = restrictedOpenRouter("openrouter/auto");
  
  // Return wrapped model that injects models restriction on each call
  return {
    ...baseModel,
    // Override the core call method to inject models parameter
    async call(input: any, options?: any) {
      const enrichedOptions = {
        ...options,
        // Inject models restriction via providerOptions
        providerOptions: {
          ...options?.providerOptions,
          openrouter: {
            ...options?.providerOptions?.openrouter,
            models: modelsArray,
          },
        },
      };
      // @ts-ignore - Accessing internal call method
      return baseModel.call(input, enrichedOptions);
    },
    // Override doStream for streaming responses
    async doStream(input: any, options?: any) {
      const enrichedOptions = {
        ...options,
        providerOptions: {
          ...options?.providerOptions,
          openrouter: {
            ...options?.providerOptions?.openrouter,
            models: modelsArray,
          },
        },
      };
      // @ts-ignore - Accessing internal doStream method
      return baseModel.doStream(input, enrichedOptions);
    },
    // Override doGenerate for non-streaming responses
    async doGenerate(input: any, options?: any) {
      const enrichedOptions = {
        ...options,
        providerOptions: {
          ...options?.providerOptions,
          openrouter: {
            ...options?.providerOptions?.openrouter,
            models: modelsArray,
          },
        },
      };
      // @ts-ignore - Accessing internal doGenerate method
      return baseModel.doGenerate(input, enrichedOptions);
    },
  } as unknown as LanguageModel;
}

/**
 * Get a model with fallback support for rate limits
 * Returns an array of models to try in order
 */
export function getAutoRouterModelWithFallback(requireTools: boolean = false): LanguageModel[] {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  
  // Return array of models for Mastra's fallback mechanism
  return models.map(model => openrouter(model));
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
