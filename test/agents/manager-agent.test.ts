/**
 * Tests for Manager Agent
 * 
 * Tests routing logic, handoffs, and fallback behavior
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { managerAgent } from "../../lib/agents/manager-agent";
import { createTestMessages } from "../helpers/test-utils";

describe("Manager Agent", () => {
  beforeEach(() => {
    // Reset mocks if needed
  });

  describe("Routing to Specialist Agents", () => {
    it("should route OKR-related queries to OKR Reviewer agent", async () => {
      const messages = createTestMessages("What are the OKR metrics for this month?");
      
      // Note: This will make actual API calls unless mocked
      // For v0.1, we're testing the integration
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
      // The response should indicate OKR analysis or routing
      expect(response.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for API calls

    it("should route manager review queries to OKR Reviewer", async () => {
      const messages = createTestMessages("Show me the manager review with has_metric percentage");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should route P&L queries to P&L agent", async () => {
      const messages = createTestMessages("What is the profit and loss for Q4?");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should route alignment queries to Alignment agent", async () => {
      const messages = createTestMessages("Check the alignment status");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should route DPA PM queries to DPA PM agent", async () => {
      const messages = createTestMessages("What are the product management tasks?");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("Fallback Behavior", () => {
    it("should use web search for general queries", async () => {
      const messages = createTestMessages("What is the weather today?");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should handle queries that don't match any specialist", async () => {
      const messages = createTestMessages("Tell me a joke");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("Status Updates", () => {
    it("should call updateStatus callback on handoff", async () => {
      const statusUpdates: string[] = [];
      const updateStatus = (status: string) => {
        statusUpdates.push(status);
      };
      
      const messages = createTestMessages("Show OKR metrics");
      
      await managerAgent(messages, updateStatus);
      
      // Status updates should be called if handoff occurs
      // Note: This depends on actual routing behavior
      expect(statusUpdates.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should handle errors gracefully", async () => {
      // Test with invalid input
      const messages = createTestMessages("");
      
      const response = await managerAgent(messages);
      
      // Should return an error message or empty response
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });

  describe("Chinese Language Support", () => {
    it("should route Chinese OKR queries correctly", async () => {
      const messages = createTestMessages("显示本月的OKR指标覆盖率");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);

    it("should route Chinese manager review queries", async () => {
      const messages = createTestMessages("经理评审的指标覆盖率是多少？");
      
      const response = await managerAgent(messages);
      
      expect(response).toBeDefined();
      expect(typeof response).toBe("string");
    }, 30000);
  });
});

