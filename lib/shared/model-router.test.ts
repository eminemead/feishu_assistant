/**
 * Test: Native Mastra Model Router
 * 
 * Validates that the new model routing layer works correctly
 * without the OpenRouter SDK dependency.
 */

import { describe, it, expect } from "bun:test";
import { getMastraModel, getMastraModelSingle, getModelProviderOptions, isWhitelistedModel } from "./model-router";

describe("Native Mastra Model Router", () => {
  it("should return array of model strings with 'openrouter/' prefix", () => {
    const models = getMastraModel();
    
    expect(Array.isArray(models)).toBe(true);
    expect((models as string[]).length).toBeGreaterThan(0);
    
    // All models should have openrouter/ prefix
    (models as string[]).forEach((model) => {
      expect(model).toMatch(/^openrouter\//);
    });
  });

  it("should return tool-calling models when requireTools=true", () => {
    const toolModels = getMastraModel(true);
    const allModels = getMastraModel(false);
    
    expect(Array.isArray(toolModels)).toBe(true);
    expect((toolModels as string[]).length).toBeLessThanOrEqual((allModels as string[]).length);
  });

  it("should return single model string from getMastraModelSingle", () => {
    const model = getMastraModelSingle();
    
    expect(typeof model).toBe("string");
    expect(model).toMatch(/^openrouter\//);
  });

  it("should provide provider options for requests", () => {
    const options = getModelProviderOptions();
    
    expect(options).toBeDefined();
    expect(options.openrouter).toBeDefined();
    expect(Array.isArray(options.openrouter.models)).toBe(true);
    expect(options.openrouter.models.length).toBeGreaterThan(0);
  });

  it("should validate whitelisted models", () => {
    expect(isWhitelistedModel("openrouter/nvidia/nemotron-3-nano-30b-a3b:free")).toBe(true);
    expect(isWhitelistedModel("nvidia/nemotron-3-nano-30b-a3b:free")).toBe(true);
    expect(isWhitelistedModel("openrouter/anthropic/claude-3-5-sonnet")).toBe(false);
    expect(isWhitelistedModel("gpt-4")).toBe(false);
  });

  it("should include specific free models in whitelist", () => {
    const models = getMastraModel() as string[];
    
    // Should include at least the primary tool models
    const modelStrings = models.map((m) => m.replace(/^openrouter\//, ""));
    expect(modelStrings).toContain("nvidia/nemotron-3-nano-30b-a3b:free");
    expect(modelStrings).toContain("qwen/qwen3-235b-a22b:free");
  });
});
