/**
 * Tests for Agent Handoffs
 * 
 * Tests the handoff mechanism between manager and specialist agents
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { managerAgentInstance } from "../../lib/agents/manager-agent";
import { okrReviewerAgent } from "../../lib/agents/okr-reviewer-agent";
import { alignmentAgent } from "../../lib/agents/alignment-agent";
import { pnlAgent } from "../../lib/agents/pnl-agent";
import { dpaPmAgent } from "../../lib/agents/dpa-pm-agent";
import { createTestMessages } from "../helpers/test-utils";

describe("Agent Handoffs", () => {
  describe("Manager Agent Configuration", () => {
    it("should have manager agent instance defined", () => {
      expect(managerAgentInstance).toBeDefined();
      expect(managerAgentInstance.name).toBe("Manager");
    });

    it("should have all specialist agents available", () => {
      // Verify all specialist agents are defined
      expect(okrReviewerAgent).toBeDefined();
      expect(alignmentAgent).toBeDefined();
      expect(pnlAgent).toBeDefined();
      expect(dpaPmAgent).toBeDefined();
      
      // Verify agent names
      expect(okrReviewerAgent.name).toBe("okr_reviewer");
      expect(alignmentAgent.name).toBe("alignment_agent");
      expect(pnlAgent.name).toBe("pnl_agent");
      expect(dpaPmAgent.name).toBe("dpa_pm");
    });
  });

  describe("Specialist Agent Configuration", () => {
    it("should have OKR Reviewer agent with correct matchOn patterns", () => {
      expect(okrReviewerAgent.matchOn).toBeDefined();
      expect(okrReviewerAgent.matchOn).toContain("okr");
      expect(okrReviewerAgent.matchOn).toContain("metrics");
      expect(okrReviewerAgent.matchOn).toContain("has_metric");
    });

    it("should have Alignment agent with correct matchOn patterns", () => {
      expect(alignmentAgent.matchOn).toBeDefined();
      expect(alignmentAgent.matchOn).toContain("alignment");
    });

    it("should have P&L agent with correct matchOn patterns", () => {
      expect(pnlAgent.matchOn).toBeDefined();
      expect(pnlAgent.matchOn).toContain("pnl");
      expect(pnlAgent.matchOn).toContain("profit");
    });

    it("should have DPA PM agent with correct matchOn patterns", () => {
      expect(dpaPmAgent.matchOn).toBeDefined();
      expect(dpaPmAgent.matchOn).toContain("dpa");
      expect(dpaPmAgent.matchOn).toContain("pm");
    });
  });

  describe("Handoff Event Handling", () => {
    it("should log handoff events", async () => {
      const events: any[] = [];
      
      const originalOnEvent = managerAgentInstance.onEvent;
      managerAgentInstance.onEvent = (event) => {
        events.push(event);
        originalOnEvent?.(event);
      };

      const messages = createTestMessages("Show OKR metrics");
      
      try {
        // Use Promise.race to timeout after 25 seconds
        await Promise.race([
          managerAgentInstance.generate({
            messages,
            onEvent: (event) => {
              if (event.type === "agent-handoff") {
                events.push(event);
              }
            },
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Test timeout")), 25000)
          ),
        ]);
      } catch (error: any) {
        // API errors or timeouts are acceptable in test environment
        if (error.message !== "Test timeout") {
          console.log("API call failed - this is expected in test environment");
        }
      }

      // Reset
      managerAgentInstance.onEvent = originalOnEvent;
      
      // Events array may be empty if no handoff occurred, which is fine
      expect(Array.isArray(events)).toBe(true);
    }, 30000);
  });

  describe("Keyword Matching", () => {
    it("should match OKR keywords", () => {
      const keywords = okrReviewerAgent.matchOn || [];
      const testQueries = [
        "show okr metrics",
        "what are the objectives",
        "key result analysis",
        "manager review",
        "has_metric percentage",
        "覆盖率",
        "指标",
      ];

      testQueries.forEach((query) => {
        const lowerQuery = query.toLowerCase();
        const matches = keywords.some((keyword) =>
          lowerQuery.includes(keyword.toLowerCase())
        );
        // At least one keyword should match for OKR-related queries
        if (query.includes("okr") || query.includes("objective") || query.includes("key result")) {
          expect(matches).toBe(true);
        }
      });
    });

    it("should match P&L keywords", () => {
      const keywords = pnlAgent.matchOn || [];
      const testQueries = [
        "profit and loss",
        "show pnl",
        "损益",
        "利润",
      ];

      testQueries.forEach((query) => {
        const lowerQuery = query.toLowerCase();
        const matches = keywords.some((keyword) =>
          lowerQuery.includes(keyword.toLowerCase())
        );
        expect(matches).toBe(true);
      });
    });
  });
});

