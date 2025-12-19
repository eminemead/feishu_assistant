/**
 * Native Mastra Model Router with FREE_MODELS Whitelist Enforcement
 * 
 * CRITICAL FIX: Instead of using openrouter/auto (which can select paid models),
 * we provide EXPLICIT free model IDs only.
 * 
 * Mastra will:
 * 1. Try first model
 * 2. If rate limited/failed, try next model (fallback)
 * 3. Continue until success
 * 
 * Result: ✅ ONLY free models can ever be selected
 *         ✅ No auto-router = no paid model risk
 *         ✅ Native Mastra fallback mechanism
 */

import { FREE_MODELS, FREE_MODELS_WITH_TOOLS } from "./model-fallback";

/**
 * Get array of explicit free model IDs for Mastra
 * 
 * These are FIXED model IDs, not auto-router.
 * Mastra's native array support will handle fallback automatically.
 * 
 * CRITICAL: Passing explicit models is the ONLY safe way to ensure
 * OpenRouter never selects paid models.
 * 
 * @param requireTools - If true, only return models that support tool calling
 * @returns Array of "openrouter/provider/model" strings
 */
export function getMastraModel(requireTools: boolean = false): string[] {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  
  console.log(
    `✅ [Model Router] Using EXPLICIT free models (no auto-router risk)`
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

  // Return array of EXPLICIT model IDs with openrouter/ prefix
  // Mastra will use these as-is (no auto-routing)
  const explicitModels = models.map((model) => `openrouter/${model}`) as string[];
  
  console.log(`🎯 [Model Router] Mastra model array ready (${explicitModels.length} models)`);
  return explicitModels;
}

/**
 * Get single explicit model ID (for backwards compatibility or specific use cases)
 * Defaults to primary free model
 * 
 * @returns Single explicit model string for Mastra or ai.generateText()
 */
export function getMastraModelSingle(requireTools: boolean = false): string {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  const model = `openrouter/${models[0]}`;
  console.log(`📌 [Model Router] Using single explicit model: ${model}`);
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
