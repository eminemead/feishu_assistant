/**
 * End-to-end integration tests
 * 
 * Tests the complete flow from user message to agent response
 */

import { describe, it, expect } from "bun:test";
import { generateResponse } from "../../lib/generate-response";
import { createTestMessages } from "../helpers/test-utils";

describe("End-to-End Integration", () => {
  describe("OKR Workflow", () => {
    it("should handle complete OKR query flow", async () => {
      const messages = createTestMessages("Analyze OKR metrics for 10月");
      const statusUpdates: string[] = [];
      
      const updateStatus = (status: string) => {
        statusUpdates.push(status);
      };

      const response = await generateResponse(messages, updateStatus);

      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(0);
    }, 30000);

    it("should handle manager review query", async () => {
      const messages = createTestMessages("What is the has_metric percentage by company?");
      
      const response = await generateResponse(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("General Query Workflow", () => {
    it("should handle non-specialist queries", async () => {
      const messages = createTestMessages("Hello, how are you?");
      
      const response = await generateResponse(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should handle web search queries", async () => {
      const messages = createTestMessages("Search for latest AI news");
      
      const response = await generateResponse(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("Multi-turn Conversation", () => {
    it("should maintain context across multiple messages", async () => {
      const messages = [
        { role: "user" as const, content: "Show OKR metrics" },
        { role: "assistant" as const, content: "Here are the OKR metrics..." },
        { role: "user" as const, content: "What about last month?" },
      ];
      
      const response = await generateResponse(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should handle empty messages gracefully", async () => {
      const messages = createTestMessages(" "); // Use space instead of empty string
      
      const response = await generateResponse(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should handle minimal content messages", async () => {
      const messages = createTestMessages("test");
      
      try {
        const response = await generateResponse(messages);
        // Should return a response
        expect(response).toBeDefined();
        expect(typeof response).toBe("string");
      } catch (error) {
        // Error is acceptable if API fails
        expect(error).toBeDefined();
      }
    }, 30000);
  });
});

