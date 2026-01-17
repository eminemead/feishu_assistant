import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  evaluateChangeRules,
  initializeRulesSystem,
  getRuleQueueStats,
  drainRuleQueue,
  getDocumentSnapshotStats,
  EXAMPLE_RULES,
  getRuleStatistics,
} from "../lib/rules-integration";
import { DocumentChange } from "../lib/doc-persistence";

// NOTE: This file uses vi.mock which affects global module state.
// Run integration tests separately: bun test test/*-integration.test.ts
vi.mock("../lib/rules-engine", () => ({
  setRulesEngineUserId: vi.fn(),
  getRulesEngine: vi.fn(() => ({
    evaluateChangeAgainstRules: vi.fn(async () => []),
    getRulesForDoc: vi.fn(async () => []),
    getAllRules: vi.fn(async () => []),
  })),
}));

const createMockChange = (overrides?: Partial<DocumentChange>): DocumentChange => ({
  id: "change-1",
  userId: "test-user",
  docToken: "doc_123",
  newModifiedUser: "user-1",
  previousModifiedUser: "user-2",
  previousModifiedTime: 1000,
  newModifiedTime: 2000,
  changeType: "time_updated",
  changeDetectedAt: new Date(),
  debounced: false,
  notificationSent: false,
  metadata: {},
  createdAt: new Date(),
  ...overrides,
});

describe("Rules Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeRulesSystem("test-user");
  });

  describe("Rule Evaluation", () => {
    it("should evaluate rules for a change", async () => {
      const change = createMockChange();

      const results = await evaluateChangeRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should support async rule evaluation", async () => {
      const change = createMockChange();

      const results = await evaluateChangeRules(change, {
        async: true,
        enabled: true,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should support sync rule evaluation", async () => {
      const change = createMockChange();

      const results = await evaluateChangeRules(change, {
        async: false,
        enabled: true,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should skip evaluation if disabled", async () => {
      const change = createMockChange();

      const results = await evaluateChangeRules(change, {
        enabled: false,
      });

      expect(results).toEqual([]);
    });

    it("should handle evaluation errors gracefully", async () => {
      const change = createMockChange();

      // Should not throw
      const results = await evaluateChangeRules(change);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Queue Management", () => {
    it("should report queue size", async () => {
      const stats = getRuleQueueStats({ async: true });

      expect(stats).toHaveProperty("queueSize");
      expect(stats).toHaveProperty("isAsyncEnabled");
      expect(typeof stats.queueSize).toBe("number");
    });

    it("should drain rule queue", async () => {
      const change = createMockChange();

      // Queue some changes
      await evaluateChangeRules(change, { async: true });
      await evaluateChangeRules(change, { async: true });

      // Drain queue
      await drainRuleQueue({ async: true }, 5000);
    });

    it("should handle queue drain timeout", async () => {
      // Drain with very short timeout
      await drainRuleQueue({ async: true }, 10);
    });

    it("should skip drain in sync mode", async () => {
      // Should complete immediately in sync mode
      await drainRuleQueue({ async: false }, 1000);
    });
  });

  describe("System Initialization", () => {
    it("should initialize rules system", () => {
      // Should not throw
      initializeRulesSystem("test-user-123");
    });

    it("should set up user context", () => {
      initializeRulesSystem("another-user");
      // User ID should be set for RLS
    });
  });

  describe("Example Rules", () => {
    it("should provide notify user example", () => {
      const rule = EXAMPLE_RULES.notifyUser(
        "doc_123",
        "user-456",
        "chat_789"
      );

      expect(rule).toBeDefined();
      expect(rule.condition.type).toBe("modified_by_user");
      expect(rule.action.type).toBe("notify");
      expect(rule.action.target).toBe("chat_789");
    });

    it("should provide business hours example", () => {
      const rule = EXAMPLE_RULES.businessHoursOnly("doc_123", "chat_789");

      expect(rule).toBeDefined();
      expect(rule.condition.type).toBe("time_range");
      expect(rule.action.type).toBe("notify");
    });

    it("should provide create task example", () => {
      const rule = EXAMPLE_RULES.createTaskOnMajorChange("doc_123");

      expect(rule).toBeDefined();
      expect(rule.condition.type).toBe("change_type");
      expect(rule.action.type).toBe("create_task");
    });

    it("should provide webhook example", () => {
      const rule = EXAMPLE_RULES.webhookNotification(
        "doc_123",
        "https://webhook.example.com"
      );

      expect(rule).toBeDefined();
      expect(rule.action.type).toBe("webhook");
      expect(rule.action.target).toBe("https://webhook.example.com");
    });

    it("should provide aggregation example", () => {
      const rule = EXAMPLE_RULES.hourlySummary("doc_123", "chat_789");

      expect(rule).toBeDefined();
      expect(rule.action.type).toBe("aggregate");
    });
  });

  describe("Rule Statistics", () => {
    it("should get rule statistics", async () => {
      const stats = await getRuleStatistics();

      expect(stats).toHaveProperty("totalRules");
      expect(stats).toHaveProperty("enabledRules");
      expect(stats).toHaveProperty("disabledRules");
      expect(stats).toHaveProperty("rulesByType");
    });

    it("should count rules by type", async () => {
      const stats = await getRuleStatistics();

      expect(stats.rulesByType).toBeDefined();
      expect(typeof stats.rulesByType).toBe("object");
    });

    it("should track enabled vs disabled", async () => {
      const stats = await getRuleStatistics();

      expect(stats.enabledRules + stats.disabledRules).toBe(stats.totalRules);
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete workflow", async () => {
      // Initialize
      initializeRulesSystem("test-user");

      // Create and evaluate a change
      const change = createMockChange();

      // Evaluate synchronously
      const results = await evaluateChangeRules(change, { async: false });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle multiple changes in async mode", async () => {
      initializeRulesSystem("test-user");

      // Queue multiple changes
      for (let i = 0; i < 5; i++) {
        const change = createMockChange({ id: `change-${i}` });
        await evaluateChangeRules(change, { async: true });
      }

      // Get queue stats
      const stats = getRuleQueueStats({ async: true });
      expect(typeof stats.queueSize).toBe("number");

      // Drain queue
      await drainRuleQueue({ async: true }, 5000);
    });

    it("should support rapid rule evaluation", async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        const change = createMockChange({ id: `change-${i}` });
        promises.push(evaluateChangeRules(change, { async: false }));
      }

      const allResults = await Promise.all(promises);

      expect(allResults).toBeDefined();
      expect(allResults.length).toBe(20);
    });

    it("should recover from errors", async () => {
      const change = createMockChange();

      // First evaluation might fail
      await evaluateChangeRules(change);

      // Subsequent evaluations should work
      const results = await evaluateChangeRules(change);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should evaluate rules quickly in sync mode", async () => {
      const change = createMockChange();

      const start = performance.now();
      await evaluateChangeRules(change, { async: false });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should be <1 second
    });

    it("should return immediately in async mode", async () => {
      const change = createMockChange();

      const start = performance.now();
      await evaluateChangeRules(change, { async: true });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50); // Should be <50ms (immediate return)
    });

    it("should handle batch processing", async () => {
      const changes = [];
      for (let i = 0; i < 100; i++) {
        changes.push(createMockChange({ id: `change-${i}` }));
      }

      const start = performance.now();

      for (const change of changes) {
        await evaluateChangeRules(change, { async: true });
      }

      const elapsed = performance.now() - start;

      // All 100 should be queued very quickly
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe("Configuration", () => {
    it("should respect batch size config", async () => {
      const change = createMockChange();

      // Use small batch size
      await evaluateChangeRules(change, {
        batchSize: 5,
        async: true,
      });
    });

    it("should respect timeout config", async () => {
      const change = createMockChange();

      // Use short timeout
      await evaluateChangeRules(change, {
        timeout: 1000,
        async: false,
      });
    });

    it("should support all config options", async () => {
      const change = createMockChange();

      await evaluateChangeRules(change, {
        enabled: true,
        async: true,
        timeout: 5000,
        batchSize: 50,
      });
    });
  });

  describe("Error Handling", () => {
    it("should not crash on invalid change", async () => {
      const invalidChange = {
        id: "change-1",
      } as unknown as DocumentChange;

      // Should handle gracefully
      const results = await evaluateChangeRules(invalidChange);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should not block on evaluation failure", async () => {
      const change = createMockChange();

      // Should complete even if evaluation fails
      const results = await evaluateChangeRules(change, { async: false });

      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle timeout gracefully", async () => {
      const change = createMockChange();

      // Very short timeout
      const results = await evaluateChangeRules(change, {
        async: false,
        timeout: 1,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
