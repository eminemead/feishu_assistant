/**
 * Model Router - Use AI SDK Provider with Explicit Free Models
 * 
 * TEMPORARY: Using NVIDIA API directly for minimaxai/minimax-m2.1 (free)
 * 
 * Previous behavior used OpenRouter with :free suffix models.
 * Now defaults to NVIDIA's integrate.api.nvidia.com endpoint.
 * 
 * Set USE_OPENROUTER=true to revert to OpenRouter behavior.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { FREE_MODELS, FREE_MODELS_WITH_TOOLS, NVIDIA_MODEL_CONFIG } from "./model-fallback";

/**
 * Initialize OpenRouter provider once (used as fallback)
 */
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Initialize NVIDIA provider (OpenAI-compatible)
 */
const nvidia = createOpenAICompatible({
  name: "nvidia",
  baseURL: NVIDIA_MODEL_CONFIG.url,
  apiKey: process.env.NVIDIA_API_TOKEN || "",
});

/**
 * Check if we should use NVIDIA API (default) or OpenRouter
 */
const useNvidiaApi = process.env.USE_OPENROUTER !== "true" && !!process.env.NVIDIA_API_TOKEN;

/**
 * Get explicit free model(s) for Mastra
 * 
 * Returns:
 * - NVIDIA model (default): Uses NVIDIA API directly (free)
 * - OpenRouter model: When USE_OPENROUTER=true or NVIDIA_API_TOKEN not set
 * 
 * @param requireTools - If true, only return models that support tool calling
 * @returns LanguageModel for AI SDK / Mastra Agent
 */
export function getMastraModel(requireTools: boolean = false): any {
  return getMastraModelSingle(requireTools);
}

/**
 * Get single explicit model for backward compatibility
 * 
 * @returns LanguageModel for AI SDK
 */
export function getMastraModelSingle(requireTools: boolean = false): any {
  if (useNvidiaApi) {
    console.log(`📌 [Model Router] Using NVIDIA API: ${NVIDIA_MODEL_CONFIG.id}`);
    return nvidia.chatModel(NVIDIA_MODEL_CONFIG.id);
  }
  
  // Fallback to OpenRouter
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  const model = openrouter(models[0]);
  console.log(`📌 [Model Router] Using OpenRouter: ${models[0]}`);
  return model;
}

/**
 * Get NVIDIA model config object for Mastra Agent (inline config format)
 * Use this when passing to Mastra Agent's model property
 * 
 * @returns Model config object {url, id, apiKey} for Mastra Agent
 */
export function getMastraAgentModelConfig(): any {
  if (useNvidiaApi) {
    console.log(`📌 [Model Router] Using NVIDIA config for Agent: ${NVIDIA_MODEL_CONFIG.id}`);
    return NVIDIA_MODEL_CONFIG;
  }
  
  // Fallback to OpenRouter
  const models = FREE_MODELS_WITH_TOOLS;
  const model = openrouter(models[0]);
  console.log(`📌 [Model Router] Using OpenRouter for Agent: ${models[0]}`);
  return model;
}

/**
 * DEPRECATED: Provider options approach doesn't work with Mastra string routing
 *
 * Kept for reference only - use explicit model IDs instead.
 * Mastra doesn't pass providerOptions when using "openrouter/..." strings.
 *
 * @deprecated Use getMastraModel() which returns explicit model IDs
 */
export function getModelProviderOptions(requireTools: boolean = false): any {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;

  // This is NOT used - kept for reference
  return {
    openrouter: {
      models: Array.from(models) as string[],
    },
  };
}

/**
 * Validate if a model string is in our whitelist
 *
 * @param modelString - Model string in format "openrouter/provider/model"
 * @returns true if model is in FREE_MODELS whitelist
 */
export function isWhitelistedModel(modelString: string): boolean {
  const cleanModel = modelString.replace(/^openrouter\//, "");
  return FREE_MODELS.includes(cleanModel as any);
}
