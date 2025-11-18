/**
 * Shared Configuration
 * 
 * Centralized configuration for shared services and utilities.
 * This reduces duplication across agent files and other modules.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * OpenRouter client instance
 * 
 * Shared across all agents to avoid duplication.
 * Configured once with API key from environment variables.
 */
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

