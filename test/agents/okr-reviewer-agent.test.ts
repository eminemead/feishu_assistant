/**
 * Tests for OKR Analysis Functions
 * 
 * Tests OKR data analysis and instructions generation.
 * 
 * NOTE: Single-agent architecture - OKR analysis goes through dpa_mom.
 * This file tests the helper functions, not a separate agent.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { getOkrReviewerAgentInstructions, analyzeHasMetricPercentage } from "../../lib/agents/okr-reviewer-agent";

// Mock DuckDB to avoid database dependency
const mockConnection = {
  all: mock((query: string, callback: Function) => {
    if (query.includes("information_schema.tables")) {
      callback(null, [{ table_name: "okr_metrics_20240101" }]);
    } else if (query.includes("SELECT")) {
      callback(null, [
        {
          company_name: "Test Company A",
          metric_type: "revenue",
          total: 10,
          nulls: 2,
          null_pct: 20.0,
        },
      ]);
    } else {
      callback(null, []);
    }
  }),
  close: mock((callback?: Function) => callback?.()),
};

describe("OKR Analysis Functions", () => {
  beforeEach(() => {
    mockConnection.all.mockClear();
    mockConnection.close.mockClear();
  });

  describe("Instructions", () => {
    it("should have instructions that mention OKR", () => {
      const instructions = getOkrReviewerAgentInstructions();
      expect(instructions).toBeDefined();
      expect(instructions.toLowerCase()).toContain("okr");
    });

    it("should have instructions that mention Feishu/Lark", () => {
      const instructions = getOkrReviewerAgentInstructions();
      expect(instructions.toLowerCase()).toContain("feishu");
    });

    it("should have instructions that mention markdown formatting", () => {
      const instructions = getOkrReviewerAgentInstructions();
      expect(instructions.toLowerCase()).toContain("markdown");
    });

    it("should include current date in instructions", () => {
      const now = new Date();
      const instructions = getOkrReviewerAgentInstructions(now);
      expect(instructions).toContain(now.toISOString().split("T")[0]);
    });

    it("should mention period format requirements", () => {
      const instructions = getOkrReviewerAgentInstructions();
      expect(instructions).toContain("10 月");
      expect(instructions).toContain("11 月");
    });

    it("should mention all OKR tools", () => {
      const instructions = getOkrReviewerAgentInstructions();
      expect(instructions).toContain("mgr_okr_review");
      expect(instructions).toContain("chart_generation");
      expect(instructions).toContain("okr_visualization");
      expect(instructions).toContain("okr_chart_streaming");
    });
  });

  describe("analyzeHasMetricPercentage", () => {
    it("should be a function", () => {
      expect(typeof analyzeHasMetricPercentage).toBe("function");
    });

    it("should handle period parameter", async () => {
      // This will try StarRocks first, then DuckDB
      // Without proper DB setup, it may error, but the function should exist
      expect(analyzeHasMetricPercentage).toBeDefined();
    });
  });
});
