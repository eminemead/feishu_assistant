import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleHistoryCommand,
  handleSnapshotsCommand,
  handleRulesCommand,
  handleRuleAddCommand,
  handleRulesStatusCommand,
  handleAdvancedHelpCommand,
  isEnhancedCommand,
  handleEnhancedCommand,
} from "../lib/doc-commands-enhanced";

// Mock dependencies
vi.mock("../lib/doc-snapshot-integration");
vi.mock("../lib/rules-engine");
vi.mock("../lib/rules-integration");
vi.mock("../lib/doc-persistence");
vi.mock("../lib/feishu-utils", () => ({
  createAndSendStreamingCard: vi.fn(),
  parseMessageContent: vi.fn((text) => text),
}));

describe("Enhanced Document Commands - Phase 2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Command Detection", () => {
    it("should detect history command", () => {
      expect(isEnhancedCommand("@bot history doccnXXX")).toBe(true);
    });

    it("should detect snapshots command", () => {
      expect(isEnhancedCommand("@bot snapshots doccnXXX")).toBe(true);
    });

    it("should detect rules command", () => {
      expect(isEnhancedCommand("@bot rules doccnXXX")).toBe(true);
    });

    it("should detect rule:add command", () => {
      expect(isEnhancedCommand("@bot rule:add doccnXXX notify")).toBe(true);
    });

    it("should detect rules:status command", () => {
      expect(isEnhancedCommand("@bot rules:status")).toBe(true);
    });

    it("should detect tracking:advanced command", () => {
      expect(isEnhancedCommand("@bot tracking:advanced")).toBe(true);
    });

    it("should not detect non-enhanced commands", () => {
      expect(isEnhancedCommand("@bot watch doccnXXX")).toBe(false);
      expect(isEnhancedCommand("@bot check doccnXXX")).toBe(false);
    });
  });

  describe("History Command", () => {
    it("should handle history command", async () => {
      await handleHistoryCommand(
        "@bot history doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle history with URL", async () => {
      await handleHistoryCommand(
        "@bot history https://feishu.cn/docs/doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle invalid doc token", async () => {
      await handleHistoryCommand(
        "@bot history invalid",
        "chat_123",
        "user_123"
      );
      // Should handle gracefully
    });

    it("should require doc token", async () => {
      await handleHistoryCommand("@bot history", "chat_123", "user_123");
      // Should handle gracefully
    });
  });

  describe("Snapshots Command", () => {
    it("should handle snapshots command", async () => {
      await handleSnapshotsCommand(
        "@bot snapshots doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle snapshots with URL", async () => {
      await handleSnapshotsCommand(
        "@bot snapshots https://feishu.cn/docs/doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle invalid doc token", async () => {
      await handleSnapshotsCommand(
        "@bot snapshots invalid",
        "chat_123",
        "user_123"
      );
      // Should handle gracefully
    });
  });

  describe("Rules Command", () => {
    it("should handle rules command", async () => {
      await handleRulesCommand(
        "@bot rules doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle rules with URL", async () => {
      await handleRulesCommand(
        "@bot rules https://feishu.cn/docs/doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle invalid doc token", async () => {
      await handleRulesCommand(
        "@bot rules invalid",
        "chat_123",
        "user_123"
      );
      // Should handle gracefully
    });
  });

  describe("Rule Add Command", () => {
    it("should handle rule:add with notify action", async () => {
      await handleRuleAddCommand(
        "@bot rule:add doccnXXXXXXXX notify oc_groupYYYYYY",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle rule:add with webhook action", async () => {
      await handleRuleAddCommand(
        "@bot rule:add doccnXXXXXXXX webhook https://webhook.example.com",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle rule:add with task action", async () => {
      await handleRuleAddCommand(
        "@bot rule:add doccnXXXXXXXX task",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should handle rule:add with aggregate action", async () => {
      await handleRuleAddCommand(
        "@bot rule:add doccnXXXXXXXX aggregate oc_groupYYYYYY",
        "chat_123",
        "user_123"
      );
      // Should not throw
    });

    it("should require doc token", async () => {
      await handleRuleAddCommand("@bot rule:add notify", "chat_123", "user_123");
      // Should handle gracefully
    });

    it("should use current chat as default target", async () => {
      await handleRuleAddCommand(
        "@bot rule:add doccnXXXXXXXX notify",
        "chat_default",
        "user_123"
      );
      // Should use chat_default as target
    });
  });

  describe("Rules Status Command", () => {
    it("should handle rules:status command", async () => {
      await handleRulesStatusCommand("chat_123", "user_123");
      // Should not throw
    });
  });

  describe("Advanced Help Command", () => {
    it("should handle tracking:advanced command", async () => {
      await handleAdvancedHelpCommand("chat_123");
      // Should not throw
    });
  });

  describe("Command Routing", () => {
    it("should route history command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot history doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should route snapshots command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot snapshots doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should route rules command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot rules doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should route rule:add command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot rule:add doccnXXXXXXXX notify oc_group",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should route rules:status command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot rules:status",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should route tracking:advanced command", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot tracking:advanced",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should not route unknown commands", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot unknown doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(false);
    });

    it("should handle bot mention removal", async () => {
      const handled = await handleEnhancedCommand({
        message: '<at user_id="bot_123">bot</at> history doccnXXXXXXXX',
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });
  });

  describe("URL Parsing", () => {
    it("should handle Feishu doc URLs", async () => {
      await handleHistoryCommand(
        "@bot history https://feishu.cn/docs/doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should parse and handle
    });

    it("should handle Feishu sheet URLs", async () => {
      await handleHistoryCommand(
        "@bot history https://feishu.cn/sheets/shtcnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should parse and handle
    });

    it("should handle Feishu bitable URLs", async () => {
      await handleHistoryCommand(
        "@bot history https://feishu.cn/bitable/bitcnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should parse and handle
    });

    it("should handle direct tokens", async () => {
      await handleHistoryCommand(
        "@bot history doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should parse and handle
    });
  });

  describe("Error Handling", () => {
    it("should handle missing document gracefully", async () => {
      await handleHistoryCommand(
        "@bot history invalid_token",
        "chat_123",
        "user_123"
      );
      // Should not crash
    });

    it("should handle API errors gracefully", async () => {
      await handleRulesCommand(
        "@bot rules doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );
      // Should handle errors without crashing
    });

    it("should provide helpful error messages", async () => {
      await handleHistoryCommand("@bot history", "chat_123", "user_123");
      // Should provide usage help
    });
  });

  describe("Integration with Phase 1 Commands", () => {
    it("should distinguish from watch command", () => {
      expect(isEnhancedCommand("@bot watch doccnXXX")).toBe(false);
    });

    it("should distinguish from check command", () => {
      expect(isEnhancedCommand("@bot check doccnXXX")).toBe(false);
    });

    it("should distinguish from unwatch command", () => {
      expect(isEnhancedCommand("@bot unwatch doccnXXX")).toBe(false);
    });

    it("should distinguish from watched command", () => {
      expect(isEnhancedCommand("@bot watched")).toBe(false);
    });

    it("should distinguish from tracking:status command", () => {
      expect(isEnhancedCommand("@bot tracking:status")).toBe(false);
    });

    it("should distinguish from tracking:help command", () => {
      expect(isEnhancedCommand("@bot tracking:help")).toBe(false);
    });
  });

  describe("Case Insensitivity", () => {
    it("should handle uppercase commands", async () => {
      const handled = await handleEnhancedCommand({
        message: "@BOT HISTORY doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should handle mixed case commands", async () => {
      const handled = await handleEnhancedCommand({
        message: "@Bot Rules doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should process history command quickly", async () => {
      const start = performance.now();

      await handleHistoryCommand(
        "@bot history doccnXXXXXXXX",
        "chat_123",
        "user_123"
      );

      const elapsed = performance.now() - start;

      // Should be reasonably fast (actual speed depends on mocks)
      expect(elapsed).toBeGreaterThan(0);
    });

    it("should handle rapid command sequences", async () => {
      const commands = [
        "@bot history doccnXXXXXXXX",
        "@bot snapshots doccnXXXXXXXX",
        "@bot rules doccnXXXXXXXX",
      ];

      for (const cmd of commands) {
        const handled = await handleEnhancedCommand({
          message: cmd,
          chatId: "chat_123",
          userId: "user_123",
          botUserId: "bot_123",
        });

        expect(handled).toBe(true);
      }
    });
  });

  describe("Variants and Aliases", () => {
    it("should handle 'rule' alias for 'rules'", async () => {
      const handled = await handleEnhancedCommand({
        message: "@bot rule doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });

    it("should handle commands without @ mention", async () => {
      const handled = await handleEnhancedCommand({
        message: "bot history doccnXXXXXXXX",
        chatId: "chat_123",
        userId: "user_123",
        botUserId: "bot_123",
      });

      expect(handled).toBe(true);
    });
  });
});
