/**
 * Test: Model Router with AI SDK Provider
 * 
 * Validates that the model routing layer works correctly
 * using the AI SDK provider for proper :free suffix support.
 */

import { describe, it, expect } from "bun:test";
import { getMastraModel, getMastraModelSingle, getModelProviderOptions, isWhitelistedModel } from "./model-router";

describe("Model Router with AI SDK Provider", () => {
  it("should return provider model objects", () => {
    const models = getMastraModel();
    
    expect(Array.isArray(models) || typeof models === "object").toBe(true);
    // Should be proper AI SDK model objects
    if (Array.isArray(models)) {
      expect(models.length).toBeGreaterThan(0);
      models.forEach((m) => {
        expect(m).toBeTruthy();
        expect(typeof m).toBe("object");
      });
    }
  });

  it("should return tool-calling models when requireTools=true", () => {
    const toolModels = getMastraModel(true);
    const allModels = getMastraModel(false);
    
    // Both should be truthy
    expect(toolModels).toBeTruthy();
    expect(allModels).toBeTruthy();
  });

  it("should return single model object from getMastraModelSingle", () => {
    const model = getMastraModelSingle();
    
    expect(model).toBeTruthy();
    expect(typeof model).toBe("object");
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
});
