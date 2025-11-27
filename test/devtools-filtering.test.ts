/**
 * Devtools Event Filtering Tests
 * 
 * Verifies that the devtools API filtering and search functionality works correctly
 */

import { describe, it, expect, beforeAll } from "bun:test";

// Enable devtools for testing
beforeAll(() => {
  process.env.ENABLE_DEVTOOLS = "true";
});

import { devtoolsTracker } from "../lib/devtools-integration";

describe("Devtools Event Filtering & Search", () => {
  describe("Filter by Agent", () => {
    it("should filter events by agent name", () => {
      // Create test events
      devtoolsTracker.trackAgentCall("Manager", "test query 1");
      devtoolsTracker.trackAgentCall("okr_reviewer", "test query 2");
      devtoolsTracker.trackAgentCall("Manager", "test query 3");

      // Filter by Manager agent
      const managerEvents = devtoolsTracker.filterEvents({ agents: ["Manager"] });

      // Should return only Manager events
      expect(managerEvents.length).toBeGreaterThanOrEqual(2);
      expect(managerEvents.every((e) => e.agent === "Manager")).toBe(true);
    });

    it("should filter by multiple agents", () => {
      devtoolsTracker.trackAgentCall("alignment", "query");
      devtoolsTracker.trackAgentCall("pnl", "query");
      devtoolsTracker.trackAgentCall("Manager", "query");

      const multiAgentEvents = devtoolsTracker.filterEvents({
        agents: ["alignment", "pnl"],
      });

      // All returned events should be from alignment or pnl
      expect(
        multiAgentEvents.every(
          (e) => e.agent === "alignment" || e.agent === "pnl"
        )
      ).toBe(true);
    });
  });

  describe("Filter by Event Type", () => {
    it("should filter events by type", () => {
      devtoolsTracker.trackAgentCall("test_agent", "query");
      devtoolsTracker.trackResponse("test_agent", "response", 100);
      devtoolsTracker.trackError("test_agent", new Error("test error"));

      const callEvents = devtoolsTracker.filterEvents({ types: ["agent_call"] });
      const responseEvents = devtoolsTracker.filterEvents({
        types: ["response"],
      });
      const errorEvents = devtoolsTracker.filterEvents({ types: ["error"] });

      expect(callEvents.every((e) => e.type === "agent_call")).toBe(true);
      expect(responseEvents.every((e) => e.type === "response")).toBe(true);
      expect(errorEvents.every((e) => e.type === "error")).toBe(true);
    });

    it("should filter by multiple event types", () => {
      devtoolsTracker.trackAgentCall("test", "q");
      devtoolsTracker.trackResponse("test", "r", 100);
      devtoolsTracker.trackError("test", new Error("e"));

      const mixed = devtoolsTracker.filterEvents({
        types: ["agent_call", "response"],
      });

      expect(mixed.every((e) => e.type === "agent_call" || e.type === "response")).toBe(true);
      expect(mixed.some((e) => e.type === "error")).toBe(false);
    });
  });

  describe("Search Query", () => {
    it("should search in agent data", () => {
      devtoolsTracker.trackAgentCall("Manager", "What is OKR?");
      devtoolsTracker.trackAgentCall("alignment", "Align teams please");
      devtoolsTracker.trackAgentCall("pnl", "Profit analysis");

      const okriesults = devtoolsTracker.filterEvents({
        searchQuery: "okr",
      });

      expect(okriesults.length).toBeGreaterThan(0);
      // Should contain events mentioning OKR
      expect(
        okriesults.some(
          (e) =>
            JSON.stringify(e).toLowerCase().includes("okr")
        )
      ).toBe(true);
    });

    it("should search across all event data", () => {
      devtoolsTracker.trackAgentCall("test", "user query");
      devtoolsTracker.trackResponse("test", "response text", 100);

      const results = devtoolsTracker.filterEvents({
        searchQuery: "response",
      });

      // Should find the response event
      expect(results.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      devtoolsTracker.trackAgentCall("Manager", "IMPORTANT QUESTION");
      devtoolsTracker.trackAgentCall("other", "different query");

      const results = devtoolsTracker.filterEvents({
        searchQuery: "important",
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Combined Filters", () => {
    it("should apply multiple filters together", () => {
      devtoolsTracker.trackAgentCall("Manager", "OKR analysis");
      devtoolsTracker.trackAgentCall("okr_reviewer", "OKR analysis");
      devtoolsTracker.trackResponse("Manager", "OKR response", 100);

      const combined = devtoolsTracker.filterEvents({
        agents: ["Manager"],
        types: ["agent_call"],
        searchQuery: "OKR",
      });

      // Should only return Manager agent_call events mentioning OKR
      expect(
        combined.every(
          (e) =>
            e.agent === "Manager" &&
            e.type === "agent_call" &&
            JSON.stringify(e).toLowerCase().includes("okr")
        )
      ).toBe(true);
    });
  });

  describe("Statistics & Aggregations", () => {
    it("should get unique agent names", () => {
      devtoolsTracker.trackAgentCall("Manager", "q");
      devtoolsTracker.trackAgentCall("okr_reviewer", "q");
      devtoolsTracker.trackAgentCall("Manager", "q");

      const agents = devtoolsTracker.getUniqueAgents();

      expect(agents).toContain("Manager");
      expect(agents).toContain("okr_reviewer");
      expect(agents.length).toBeGreaterThanOrEqual(2);
    });

    it("should get event statistics", () => {
      devtoolsTracker.trackAgentCall("test", "query");
      devtoolsTracker.trackResponse("test", "response", 100);

      const stats = devtoolsTracker.getEventStats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byType).toBeDefined();
      expect(stats.byAgent).toBeDefined();
      expect(stats.timeRange).toBeDefined();

      // Should have agent_call and response types
      expect(stats.byType["agent_call"]).toBeGreaterThan(0);
      expect(stats.byType["response"]).toBeGreaterThan(0);
    });

    it("should track events by agent", () => {
      devtoolsTracker.trackAgentCall("Manager", "q1");
      devtoolsTracker.trackAgentCall("Manager", "q2");
      devtoolsTracker.trackAgentCall("okr", "q3");

      const stats = devtoolsTracker.getEventStats();

      expect(stats.byAgent["Manager"]).toBeGreaterThanOrEqual(2);
      expect(stats.byAgent["okr"]).toBeGreaterThanOrEqual(1);
    });
  });

  describe("API Endpoint Compliance", () => {
    it("should handle empty filter options", () => {
      devtoolsTracker.trackAgentCall("test", "query");

      const results = devtoolsTracker.filterEvents({});

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should return events in reverse chronological order", () => {
      devtoolsTracker.trackAgentCall("test", "q1");
      devtoolsTracker.trackAgentCall("test", "q2");
      devtoolsTracker.trackAgentCall("test", "q3");

      const results = devtoolsTracker.filterEvents({});

      // Results should be newest first
      if (results.length >= 2) {
        expect(results[0].timestamp).toBeGreaterThanOrEqual(
          results[results.length - 1].timestamp
        );
      }
    });

    it("should respect limit parameter via getEvents", () => {
      // Add multiple events
      for (let i = 0; i < 10; i++) {
        devtoolsTracker.trackAgentCall("test", `query ${i}`);
      }

      const all = devtoolsTracker.getEvents();
      const limited = devtoolsTracker.getEvents(3);

      expect(all.length).toBeGreaterThanOrEqual(3);
      expect(limited.length).toBeLessThanOrEqual(3);
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent agent filter gracefully", () => {
      devtoolsTracker.trackAgentCall("Manager", "query");

      const results = devtoolsTracker.filterEvents({
        agents: ["non_existent_agent"],
      });

      // Should return empty or valid empty array
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle non-existent event type gracefully", () => {
      devtoolsTracker.trackAgentCall("test", "query");

      const results = devtoolsTracker.filterEvents({
        types: ["non_existent_type" as any],
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Performance Characteristics", () => {
    it("should filter large event queues efficiently", () => {
      // Add 100 events
      for (let i = 0; i < 100; i++) {
        const agent = i % 3 === 0 ? "Manager" : i % 3 === 1 ? "okr" : "alignment";
        devtoolsTracker.trackAgentCall(agent, `query ${i}`);
      }

      const start = performance.now();
      const results = devtoolsTracker.filterEvents({ agents: ["Manager"] });
      const duration = performance.now() - start;

      // Filtering should be fast (< 50ms for 100 events)
      expect(duration).toBeLessThan(50);
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle search efficiently", () => {
      for (let i = 0; i < 50; i++) {
        devtoolsTracker.trackAgentCall("test", `OKR query ${i}`);
      }

      const start = performance.now();
      const results = devtoolsTracker.filterEvents({
        searchQuery: "OKR",
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
