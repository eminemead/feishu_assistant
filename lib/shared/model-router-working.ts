/**
 * WORKING FIX: OpenRouter Model Router with Enforced FREE_MODELS Whitelist
 * 
 * Uses OpenRouter SDK to ensure whitelist is enforced at API request time.
 * This is the ONLY reliable method to prevent paid models from being selected.
 * 
 * Key difference from naive approach:
 * - Explicit model IDs don't work reliably with Mastra at runtime
 * - Must use OpenRouter SDK + wrap to inject whitelist on every request
 * - OpenRouter API respects the `models` parameter to restrict auto-router
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LanguageModel } from "ai";
import { FREE_MODELS, FREE_MODELS_WITH_TOOLS } from "./model-fallback";

/**
 * Create OpenRouter model with enforced FREE_MODELS whitelist
 * 
 * This wraps openrouter/auto but injects the models parameter on every request,
 * ensuring OpenRouter can ONLY select models in FREE_MODELS.
 * 
 * @param requireTools - If true, restrict to tool-calling capable models
 * @returns LanguageModel with whitelist enforcement
 */
export function getOpenRouterWithWhitelist(requireTools: boolean = false): LanguageModel {
  const models = requireTools ? FREE_MODELS_WITH_TOOLS : FREE_MODELS;
  
  console.log(
    `🔐 [OpenRouter] Creating auto-router with ${models.length} ${
      requireTools ? "tool-calling " : ""
    }free models ENFORCED`
  );
  console.log(`📋 [OpenRouter] Whitelist: ${models.join(", ")}`);

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  // Get the base auto-router model
  const autoRouter = openrouter("openrouter/auto");

  // Wrap to enforce whitelist on EVERY request
  return {
    ...autoRouter,
    async doGenerate(input: any, options?: any) {
      const enrichedOptions = {
        ...options,
        headers: {
          ...options?.headers,
          "HTTP-Referer":
            process.env.HTTP_REFERER || "https://feishu-assistant.app",
          "X-Title": "Feishu Assistant",
        },
        providerOptions: {
          ...options?.providerOptions,
          openrouter: {
            ...options?.providerOptions?.openrouter,
            // CRITICAL: This parameter restricts OpenRouter's auto-router
            models: Array.from(models) as string[],
          },
        },
      };

      // @ts-ignore - OpenRouter provider model typing varies across versions
      return autoRouter.doGenerate(input, enrichedOptions);
    },
    async doStream(input: any, options?: any) {
      const enrichedOptions = {
        ...options,
        headers: {
          ...options?.headers,
          "HTTP-Referer":
            process.env.HTTP_REFERER || "https://feishu-assistant.app",
          "X-Title": "Feishu Assistant",
        },
        providerOptions: {
          ...options?.providerOptions,
          openrouter: {
            ...options?.providerOptions?.openrouter,
            models: Array.from(models) as string[],
          },
        },
      };

      // @ts-ignore - OpenRouter provider model typing varies across versions
      return autoRouter.doStream(input, enrichedOptions);
    },
  } as LanguageModel;
}
