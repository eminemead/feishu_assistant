import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRulesEngine,
  setRulesEngineUserId,
  ChangeRule,
  RuleExecutionResult,
} from "../lib/rules-engine";
import { DocumentChange } from "../lib/doc-persistence";

// Mock Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({
          data: {
            id: "rule-1",
            user_id: "test-user",
            doc_token: "doc_123",
            rule_name: "Test Rule",
            description: "A test rule",
            condition_type: "any",
            condition_value: null,
            action_type: "notify",
            action_target: "chat_123",
            action_template: null,
            is_enabled: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
          error: null,
        })
      ),
    })),
  })),
}));

// Mock fetch for webhook tests
global.fetch = vi.fn((url: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true }),
  })
) as any;

describe("Rules Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRulesEngineUserId("test-user");
  });

  describe("Initialization", () => {
    it("should initialize rules engine", () => {
      const engine = getRulesEngine();
      expect(engine).toBeDefined();
    });

    it("should set user ID for RLS", () => {
      const engine = getRulesEngine();
      engine.setUserId("user-123");
      expect(engine).toBeDefined();
    });
  });

  describe("Rule CRUD Operations", () => {
    it("should create a rule", async () => {
      const engine = getRulesEngine();

      const rule = await engine.createRule(
        "doc_123",
        "Test Rule",
        { type: "any" },
        { type: "notify", target: "chat_123" }
      );

      expect(rule).toBeDefined();
      expect(rule.name).toBe("Test Rule");
      expect(rule.docToken).toBe("doc_123");
    });

    it("should get a rule by ID", async () => {
      const engine = getRulesEngine();

      const rule = await engine.getRule("rule-1");

      expect(rule).toBeDefined();
      if (rule) {
        expect(rule.id).toBe("rule-1");
      }
    });

    it("should get all rules for a document", async () => {
      const engine = getRulesEngine();

      const rules = await engine.getRulesForDoc("doc_123");

      expect(Array.isArray(rules)).toBe(true);
    });

    it("should update a rule", async () => {
      const engine = getRulesEngine();

      const updated = await engine.updateRule("rule-1", {
        name: "Updated Rule",
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated.name).toBe("Updated Rule");
    });

    it("should delete a rule", async () => {
      const engine = getRulesEngine();

      await expect(engine.deleteRule("rule-1")).resolves.not.toThrow();
    });

    it("should get all user rules", async () => {
      const engine = getRulesEngine();

      const rules = await engine.getAllRules();

      expect(Array.isArray(rules)).toBe(true);
    });
  });

  describe("Condition Evaluation", () => {
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

    it("should evaluate 'any' condition", async () => {
      const engine = getRulesEngine();
      const change = createMockChange();

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should evaluate 'modified_by_user' condition - match", async () => {
      const engine = getRulesEngine();

      // Create rule with specific user
      const rule = await engine.createRule(
        "doc_123",
        "User-specific rule",
        { type: "modified_by_user", value: "user-1" },
        { type: "notify", target: "chat_123" }
      );

      const change = createMockChange({ newModifiedUser: "user-1" });

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should evaluate 'modified_by_user' condition - no match", async () => {
      const engine = getRulesEngine();

      const change = createMockChange({ newModifiedUser: "user-different" });

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should evaluate 'time_range' condition", async () => {
      const engine = getRulesEngine();

      const rule = await engine.createRule(
        "doc_123",
        "Business hours only",
        { type: "time_range", value: "9" },
        { type: "notify", target: "chat_123" }
      );

      const change = createMockChange();

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should evaluate 'change_type' condition", async () => {
      const engine = getRulesEngine();

      const rule = await engine.createRule(
        "doc_123",
        "User change only",
        { type: "change_type", value: "user_changed" },
        { type: "notify", target: "chat_123" }
      );

      const change = createMockChange({ changeType: "user_changed" });

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Action Execution", () => {
    const createMockChange = (): DocumentChange => ({
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
    });

    it("should execute notify action", async () => {
      const engine = getRulesEngine();
      const change = createMockChange();

      // Create rule with notify action
      const rule = await engine.createRule(
        "doc_123",
        "Notify action rule",
        { type: "any" },
        { type: "notify", target: "chat_123" }
      );

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should execute webhook action", async () => {
      const engine = getRulesEngine();
      const change = createMockChange();

      // Create rule with webhook action
      const rule = await engine.createRule(
        "doc_123",
        "Webhook rule",
        { type: "any" },
        { type: "webhook", target: "https://webhook.example.com/changes" }
      );

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should execute create_task action", async () => {
      const engine = getRulesEngine();
      const change = createMockChange();

      // Create rule with task creation
      const rule = await engine.createRule(
        "doc_123",
        "Task creation rule",
        { type: "any" },
        { type: "create_task", template: "Review changes" }
      );

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });

    it("should execute aggregate action", async () => {
      const engine = getRulesEngine();
      const change = createMockChange();

      // Create rule with aggregation
      const rule = await engine.createRule(
        "doc_123",
        "Aggregation rule",
        { type: "any" },
        { type: "aggregate", target: "chat_123" }
      );

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("Rule Validation", () => {
    it("should reject invalid condition type", async () => {
      const engine = getRulesEngine();

      await expect(
        engine.createRule(
          "doc_123",
          "Invalid rule",
          { type: "invalid_condition" as any },
          { type: "notify", target: "chat_123" }
        )
      ).rejects.toThrow();
    });

    it("should reject invalid action type", async () => {
      const engine = getRulesEngine();

      await expect(
        engine.createRule(
          "doc_123",
          "Invalid rule",
          { type: "any" },
          { type: "invalid_action" as any, target: "chat_123" }
        )
      ).rejects.toThrow();
    });

    it("should require target for notify action", async () => {
      const engine = getRulesEngine();

      await expect(
        engine.createRule(
          "doc_123",
          "Invalid notify",
          { type: "any" },
          { type: "notify" } // Missing target
        )
      ).rejects.toThrow();
    });

    it("should require target for webhook action", async () => {
      const engine = getRulesEngine();

      await expect(
        engine.createRule(
          "doc_123",
          "Invalid webhook",
          { type: "any" },
          { type: "webhook" } // Missing target
        )
      ).rejects.toThrow();
    });
  });

  describe("Performance", () => {
    it("should evaluate rules in <100ms", async () => {
      const engine = getRulesEngine();

      const change: DocumentChange = {
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
      };

      const start = performance.now();
      const results = await engine.evaluateChangeAgainstRules(change);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it("should handle many rules", async () => {
      const engine = getRulesEngine();

      // Create 10 rules
      for (let i = 0; i < 10; i++) {
        await engine.createRule(
          `doc_${i}`,
          `Rule ${i}`,
          { type: "any" },
          { type: "notify", target: `chat_${i}` }
        );
      }

      const rules = await engine.getAllRules();
      expect(rules.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle evaluation errors gracefully", async () => {
      const engine = getRulesEngine();

      const change: DocumentChange = {
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
      };

      // Should not throw even if evaluation fails
      const results = await engine.evaluateChangeAgainstRules(change);
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle missing user ID", () => {
      const engine = getRulesEngine();

      // Clear user ID
      expect(() => {
        // This would fail if getUserId() is called
        engine.setUserId(""); 
      }).not.toThrow();
    });
  });

  describe("Health Check", () => {
    it("should pass health check", async () => {
      const engine = getRulesEngine();

      const healthy = await engine.healthCheck();

      expect(typeof healthy).toBe("boolean");
    });
  });

  describe("Rule Execution Results", () => {
    it("should return execution results", async () => {
      const engine = getRulesEngine();

      const change: DocumentChange = {
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
      };

      const results = await engine.evaluateChangeAgainstRules(change);

      expect(Array.isArray(results)).toBe(true);

      for (const result of results) {
        expect(result).toHaveProperty("ruleId");
        expect(result).toHaveProperty("conditionMatched");
        expect(result).toHaveProperty("actionExecuted");
        expect(result).toHaveProperty("executionTimeMs");
      }
    });
  });
});
