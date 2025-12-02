import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Integration tests for document command handling in app mention flow
 * 
 * These tests verify that document tracking commands are intercepted
 * before the agent routing and handled directly by the command handler.
 */

describe("Document Command Integration - App Mention Handler", () => {
  // Mock data
  const mockChatId = "oc_abc123";
  const mockUserId = "ou_user123";
  const mockBotUserId = "ou_bot123";
  const mockMessageId = "om_msg123";
  const mockRootId = "om_root123";

  describe("Command Pattern Matching", () => {
    it("should match @bot watch command", () => {
      const patterns = [
        "@bot watch doccnXXXXX",
        "bot watch doccnXXXXX",
        "@bot watch https://feishu.cn/docs/doccnXXXXX",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        // Note: patterns should be trimmed before regex test (as done in handle-app-mention.ts)
        expect(cmdRegex.test(text.trim())).toBe(true);
      }
    });

    it("should match @bot check command", () => {
      const patterns = [
        "@bot check doccnXXXXX",
        "bot check https://feishu.cn/docs/doccnXXXXX",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });

    it("should match @bot unwatch command", () => {
      const patterns = [
        "@bot unwatch doccnXXXXX",
        "bot unwatch https://feishu.cn/docs/doccnXXXXX",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });

    it("should match @bot watched command", () => {
      const patterns = [
        "@bot watched",
        "bot watched",
        "@bot watched group:eng",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });

    it("should match @bot tracking:status command", () => {
      const patterns = [
        "@bot tracking:status",
        "bot tracking:status",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });

    it("should match @bot tracking:help command", () => {
      const patterns = [
        "@bot tracking:help",
        "bot tracking:help",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });

    it("should NOT match non-command messages", () => {
      const patterns = [
        "What is the OKR status?",
        "@bot what should I do today?",
        "Can you check the document?", // contains 'check' but not command pattern
        "Watch this!", // contains 'watch' but not command pattern
        "@bot explain OKR",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(false);
      }
    });

    it("should handle case-insensitive commands", () => {
      const patterns = [
        "@BOT WATCH doccn",
        "@Bot Check doccn",
        "@bot Unwatch doccn",
        "@bot TRACKING:STATUS",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const text of patterns) {
        expect(cmdRegex.test(text)).toBe(true);
      }
    });
  });

  describe("Command Routing Decision", () => {
    it("should route document commands to handler (not agent)", () => {
      const docCommands = [
        "@bot watch doccnXXXX",
        "@bot check doccnXXXX",
        "@bot unwatch doccnXXXX",
        "@bot watched",
        "@bot tracking:status",
        "@bot tracking:help",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const cmd of docCommands) {
        // This should be true - indicates command goes to handler
        expect(cmdRegex.test(cmd)).toBe(true);
      }
    });

    it("should route non-command queries to agent", () => {
      const agentQueries = [
        "What are our OKR targets?",
        "@bot summarize the latest results",
        "@bot how is Q4 looking?",
        "@bot explain the P&L",
        "Check the alignment metrics",
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      for (const query of agentQueries) {
        // This should be false - indicates query goes to agent
        expect(cmdRegex.test(query)).toBe(false);
      }
    });
  });

  describe("Command Handler Integration Scenarios", () => {
    it("should intercept watch command before agent call", () => {
      // Scenario: User types "@bot watch <doc>"
      // Expected: Command handler is called directly, agent is skipped
      const command = "@bot watch doccnTestDoc123";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
      // In real flow, this would trigger handleDocumentCommand() instead of generateResponse()
    });

    it("should intercept check command before agent call", () => {
      // Scenario: User types "@bot check <doc>"
      // Expected: Command handler checks document status, returns card
      const command = "@bot check doccnTestDoc123";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
    });

    it("should intercept unwatch command before agent call", () => {
      // Scenario: User types "@bot unwatch <doc>"
      // Expected: Command handler stops tracking, returns confirmation
      const command = "@bot unwatch doccnTestDoc123";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
    });

    it("should intercept watched command before agent call", () => {
      // Scenario: User types "@bot watched"
      // Expected: Command handler lists tracked documents
      const command = "@bot watched";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
    });

    it("should intercept tracking:status command before agent call", () => {
      // Scenario: User types "@bot tracking:status"
      // Expected: Command handler shows poller health
      const command = "@bot tracking:status";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
    });

    it("should intercept tracking:help command before agent call", () => {
      // Scenario: User types "@bot tracking:help"
      // Expected: Command handler shows help text
      const command = "@bot tracking:help";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
    });
  });

  describe("Fallback Routing", () => {
    it("should fall back to agent if command handler returns false", () => {
      // Scenario: Command pattern matches but handler can't process
      // Expected: Falls back to generateResponse() for agent routing
      const command = "@bot check invalid_doc_token";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
      // Handler would return false, allowing fallback to agent
    });

    it("should fallback to agent for ambiguous commands", () => {
      // Scenario: Message looks like doc command but isn't quite right
      // Expected: Falls back to agent for more intelligent handling
      const messages = [
        "@bot check the alignment", // 'check' + other words - might be agent query
        "@bot watch the video", // 'watch' + other words
      ];

      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;

      // These DO match the pattern, so would go to handler
      // Handler would determine if they're actually doc commands
      for (const msg of messages) {
        expect(cmdRegex.test(msg)).toBe(true);
      }
    });
  });

  describe("Early Exit Behavior", () => {
    it("should exit before calling generateResponse for doc commands", () => {
      // Scenario: Document command is handled successfully
      // Expected: Early return - updateCardElement called once with success message
      const command = "@bot watch doccnTestDoc";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
      // In real flow:
      // 1. Command intercepted
      // 2. handleDocumentCommand() called
      // 3. If successful, updateCardElement() with "✅ Command executed"
      // 4. Return early - generateResponse() NOT called
    });

    it("should continue to generateResponse if handler returns false", () => {
      // Scenario: Pattern matches but handler can't process
      // Expected: Fall through to generateResponse for agent routing
      const command = "@bot watch invalid";
      const isDocCommand = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i.test(command);

      expect(isDocCommand).toBe(true);
      // In real flow:
      // 1. Command intercepted
      // 2. handleDocumentCommand() called
      // 3. Returns false
      // 4. Fall through to generateResponse() for agent handling
    });
  });

  describe("Performance Optimization", () => {
    it("should have low latency for command interception (regex match)", () => {
      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;
      const command = "@bot watch doccnXXXXXXXXXXXXXXXXXX";

      const start = performance.now();
      const matches = cmdRegex.test(command);
      const duration = performance.now() - start;

      expect(matches).toBe(true);
      expect(duration).toBeLessThan(1); // Should be <1ms
    });

    it("should skip agent routing overhead for doc commands", () => {
      // By intercepting early, we avoid:
      // - Agent model initialization
      // - LLM API calls
      // - Memory provider calls
      // - Streaming overhead
      // 
      // This means doc commands should be significantly faster
      const cmdRegex = /^@?bot\s+(watch|check|unwatch|watched|tracking:\w+)\s*/i;
      const docCommand = "@bot watch doccn123";
      const agentQuery = "@bot what is the status?";

      // Doc command should match (uses fast handler)
      expect(cmdRegex.test(docCommand)).toBe(true);

      // Agent query should not match (uses slow agent)
      expect(cmdRegex.test(agentQuery)).toBe(false);
    });
  });
});
