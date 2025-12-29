/**
 * Model Router - Use AI SDK Provider with Explicit Free Models
 * 
 * Uses the OpenRouter AI SDK provider with explicit free model IDs.
 * This ensures:
 * - The :free suffix is properly preserved (billing against free quota)
 * - Mastra recognizes the model objects at runtime
 * - Fallback mechanism works correctly
 * 
 * CRITICAL: Do NOT strip the :free suffix or use native Mastra string format.
 * Without :free, OpenRouter bills against PAID quota (same model name, different tier).
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { FREE_MODELS, FREE_MODELS_WITH_TOOLS } from "./model-fallback";

/**
 * Initialize OpenRouter provider once
 */
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Get explicit free model(s) for Mastra
 * 
 * Returns AI SDK provider model objects with :free suffix properly preserved.
 * 
 * CRITICAL: The `:free` suffix MUST be included. Without it, OpenRouter
 * bills against paid quota even though the model name is identical.
 * 
 * @param requireTools - If true, only return models that support tool calling
 * @returns Primary model object OR array of model objects for fallback
 */
export function getMastraModel(requireTools: boolean = false): any {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  
  console.log(
    `✅ [Model Router] Using AI SDK provider with explicit free models`
  );
  console.log(
    `🔐 [Model Router] Whitelist: ${models.length} ${
      requireTools ? "tool-calling " : ""
    }free models ONLY`
  );
  console.log(
    `📋 [Model Router] Primary: ${models[0]}`
  );
  if (models.length > 1) {
    console.log(
      `📋 [Model Router] Fallbacks: ${models.slice(1, 3).join(", ")}${
        models.length > 3 ? "..." : ""
      }`
    );
  }

  // Create model objects via AI SDK provider
  // This properly handles the :free suffix for billing
  const modelObjects = models.map((model) => openrouter(model));
  
  console.log(`🎯 [Model Router] Using provider objects: ${models[0]} + ${models.length - 1} fallbacks`);
  
  // Return array for Mastra's built-in fallback, or single model if only one
  return modelObjects.length > 1 ? modelObjects : modelObjects[0];
}

/**
 * Get single explicit model for backward compatibility
 * Defaults to primary free model with :free suffix preserved
 * 
 * @returns Single explicit model object for Mastra
 */
export function getMastraModelSingle(requireTools: boolean = false): any {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  const model = openrouter(models[0]);
  console.log(`📌 [Model Router] Using single model: ${models[0]}`);
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
