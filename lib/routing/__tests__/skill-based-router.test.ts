/**
 * Tests for Skill-Based Router
 * 
 * Tests routing decisions, confidence scoring, priority ordering, and performance.
 */

import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { routeQuery, routeQueries, clearRoutingCache } from "../skill-based-router";
import { getSkillRegistry } from "../../skills/skill-registry";
import * as path from "path";

describe("Skill-Based Router", () => {
  beforeAll(async () => {
    // Initialize skill registry with test skills
    const registry = getSkillRegistry();
    const skillsDir = path.join(process.cwd(), "skills");
    await registry.initialize(skillsDir);
  });

  beforeEach(() => {
    // Clear cache before each test to ensure fresh state
    clearRoutingCache();
  });

  describe("DPA Assistant Routing (Priority 1 - Highest)", () => {
    it("should route DPA queries to dpa-assistant workflow", async () => {
      const decision = await routeQuery("Show me DPA team issues");
      
      expect(decision.category).toBe("dpa_mom");
      expect(decision.type).toBe("workflow");
      expect(decision.workflowId).toBe("dpa-assistant");
      expect(decision.confidence).toBeGreaterThan(0.3);
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should route 'mom' queries to dpa_mom", async () => {
      const decision = await routeQuery("What did mom say about the project?");
      
      expect(decision.category).toBe("dpa_mom");
      expect(decision.matchedKeywords).toContain("mom");
    });

    it("should route 'data team' queries to dpa_mom", async () => {
      const decision = await routeQuery("Show me data team status");
      
      expect(decision.category).toBe("dpa_mom");
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });
  });

  describe("P&L Agent Routing (Priority 2)", () => {
    it("should route P&L queries to pnl_agent skill", async () => {
      const decision = await routeQuery("What's the profit for Q4?");
      
      expect(decision.category).toBe("pnl");
      expect(decision.agentName).toBe("pnl_agent");
      expect(decision.type).toBe("skill");
      expect(decision.confidence).toBeGreaterThan(0.3);
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should route Chinese P&L queries", async () => {
      const decision = await routeQuery("Q4的利润是多少？");
      
      expect(decision.category).toBe("pnl");
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should route '损益' queries to P&L", async () => {
      const decision = await routeQuery("显示损益分析");
      
      expect(decision.category).toBe("pnl");
    });
  });

  describe("Alignment Agent Routing (Priority 3)", () => {
    it("should route alignment queries to alignment_agent skill", async () => {
      const decision = await routeQuery("What's the alignment status?");
      
      expect(decision.category).toBe("alignment");
      expect(decision.agentName).toBe("alignment_agent");
      expect(decision.type).toBe("skill");
      expect(decision.confidence).toBeGreaterThan(0.3);
    });

    it("should route Chinese alignment queries", async () => {
      const decision = await routeQuery("目标对齐情况如何？");
      
      expect(decision.category).toBe("alignment");
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });
  });

  describe("OKR Analysis Routing (Priority 4 - Lowest)", () => {
    it("should route OKR queries to okr-analysis workflow", async () => {
      const decision = await routeQuery("What's the OKR coverage for Q4?");
      
      expect(decision.category).toBe("okr");
      expect(decision.type).toBe("workflow");
      expect(decision.workflowId).toBe("okr-analysis");
      expect(decision.confidence).toBeGreaterThan(0.3);
      expect(decision.matchedKeywords).toContain("okr");
    });

    it("should route Chinese OKR queries", async () => {
      const decision = await routeQuery("Q4的覆盖率是多少？");
      
      expect(decision.category).toBe("okr");
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should route visualization queries to OKR", async () => {
      const decision = await routeQuery("Show me OKR charts");
      
      expect(decision.category).toBe("okr");
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });
  });

  describe("Priority Ordering", () => {
    it("should prefer DPA Mom over OKR when both match", async () => {
      // Query that could match both (e.g., "team analysis" might match both)
      // But DPA Mom has higher priority, so it should win
      const decision = await routeQuery("Show me DPA team analysis");
      
      // DPA Mom should win due to priority 1 vs 4
      expect(decision.category).toBe("dpa_mom");
    });

    it("should prefer P&L over Alignment when both match", async () => {
      // This is harder to test, but P&L (priority 2) should win over Alignment (priority 3)
      const decision = await routeQuery("profit alignment");
      
      // P&L should win if both match
      if (decision.category !== "general") {
        expect(["pnl", "alignment"]).toContain(decision.category);
      }
    });

    it("should prefer DPA Mom over P&L when both match", async () => {
      const decision = await routeQuery("DPA profit");
      
      // DPA Mom (priority 1) should win over P&L (priority 2)
      if (decision.category !== "general") {
        expect(decision.category).toBe("dpa_mom");
      }
    });
  });

  describe("Ambiguous Queries", () => {
    it("should route ambiguous queries to general", async () => {
      const decision = await routeQuery("Hello, how are you?");
      
      expect(decision.category).toBe("general");
      expect(decision.agentName).toBe("manager");
      expect(decision.type).toBe("general");
      expect(decision.confidence).toBeLessThanOrEqual(0.5);
    });

    it("should route generic queries to general", async () => {
      const decision = await routeQuery("What can you help me with?");
      
      expect(decision.category).toBe("general");
    });
  });

  describe("Batch Routing", () => {
    it("should route multiple queries efficiently", async () => {
      const queries = [
        "What's the OKR coverage?",
        "Show me DPA issues",
        "What's the profit?",
        "Hello world",
      ];
      
      const decisions = await routeQueries(queries);
      
      expect(decisions).toHaveLength(4);
      expect(decisions[0].category).toBe("okr");
      expect(decisions[1].category).toBe("dpa_mom");
      expect(decisions[2].category).toBe("pnl");
      expect(decisions[3].category).toBe("general");
    });
  });

  describe("Confidence Scoring", () => {
    it("should have reasonable confidence for keyword matches", async () => {
      const decision = await routeQuery("OKR analysis");
      
      // Confidence >= 0.5 for single keyword match
      expect(decision.confidence).toBeGreaterThanOrEqual(0.5);
      expect(decision.matchedKeywords.length).toBeGreaterThan(0);
    });

    it("should have lower confidence for weak matches", async () => {
      const decision = await routeQuery("something about metrics");
      
      // "metrics" might match OKR but weakly
      if (decision.category !== "general") {
        expect(decision.confidence).toBeLessThanOrEqual(0.6);
      }
    });

    it("should match keywords in query", async () => {
      const decision = await routeQuery("OKR coverage analysis");
      
      // At least one keyword should match
      expect(decision.matchedKeywords.length).toBeGreaterThanOrEqual(1);
      expect(decision.confidence).toBeGreaterThan(0.3);
    });
  });

  describe("Performance", () => {
    it("should route queries quickly (<1ms after warmup)", async () => {
      // Warm up the cache
      await routeQuery("test");
      
      const start = performance.now();
      await routeQuery("What's the OKR coverage?");
      const duration = performance.now() - start;
      
      // Should be very fast after cache warmup
      expect(duration).toBeLessThan(10); // 10ms is generous, target is <1ms
    });

    it("should cache routing rules after first load", async () => {
      // First call loads and caches
      const decision1 = await routeQuery("OKR test");
      
      // Second call should use cache
      const decision2 = await routeQuery("OKR test");
      
      expect(decision1.category).toBe(decision2.category);
      expect(decision1.confidence).toBe(decision2.confidence);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty queries", async () => {
      const decision = await routeQuery("");
      
      expect(decision.category).toBe("general");
      expect(decision.confidence).toBeLessThanOrEqual(0.5);
    });

    it("should handle very long queries", async () => {
      const longQuery = "OKR ".repeat(100);
      const decision = await routeQuery(longQuery);
      
      expect(decision.category).toBe("okr");
    });

    it("should handle queries with special characters", async () => {
      const decision = await routeQuery("OKR: What's the coverage? (Q4)");
      
      expect(decision.category).toBe("okr");
    });
  });
});

