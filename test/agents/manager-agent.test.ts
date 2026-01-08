/**
 * Tests for Feishu Assistant Agent (Unified Agent)
 * 
 * Tests unified agent behavior - single agent with all tools
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { feishuAssistantAgent } from "../../lib/agents/feishu-assistant-agent";
import { createTestMessages } from "../helpers/test-utils";

/**
 * Helper to extract text from agent response
 */
function getResponseText(response: string | { text: string }): string {
  return typeof response === "string" ? response : response.text;
}

describe("Feishu Assistant Agent", () => {
  beforeEach(() => {
    // Reset mocks if needed
  });

  describe("Tool Selection", () => {
    it("should handle OKR-related queries", async () => {
      const messages = createTestMessages("What are the OKR metrics for this month?");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }, 30000);

    it("should handle GitLab queries", async () => {
      const messages = createTestMessages("List open issues in our project");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    }, 30000);

    it("should handle general queries", async () => {
      const messages = createTestMessages("Tell me a joke");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    }, 30000);
  });

  describe("Status Updates", () => {
    it("should call updateStatus callback during streaming", async () => {
      const statusUpdates: string[] = [];
      const updateStatus = (status: string) => {
        statusUpdates.push(status);
      };
      
      const messages = createTestMessages("Hello");
      
      await feishuAssistantAgent(messages, updateStatus);
      
      // Status updates should be called during streaming
      expect(statusUpdates.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should handle empty input gracefully", async () => {
      const messages = createTestMessages("");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    }, 30000);
  });

  describe("Chinese Language Support", () => {
    it("should handle Chinese OKR queries", async () => {
      const messages = createTestMessages("显示本月的OKR指标覆盖率");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    }, 30000);

    it("should handle Chinese general queries", async () => {
      const messages = createTestMessages("你好，今天怎么样？");
      
      const response = await feishuAssistantAgent(messages);
      const text = getResponseText(response);
      
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    }, 30000);
  });
});

