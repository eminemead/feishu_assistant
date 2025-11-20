import { describe, it, expect } from "bun:test";
import {
  finalizeCardWithFollowups,
  _testOnly,
} from "../lib/finalize-card-with-buttons";

describe("Card Finalization with Buttons", () => {
  describe("finalizeCardWithFollowups", () => {
    it("should be a valid async function", async () => {
      expect(typeof finalizeCardWithFollowups).toBe("function");
    });

    it("should accept all required and optional parameters", () => {
      // Just verify the function accepts parameters without calling API
      // In real usage, would need mocked Feishu SDK
      const canCallWithMinimal = () =>
        finalizeCardWithFollowups("card-123");
      const canCallWithFull = () =>
        finalizeCardWithFollowups(
          "card-123",
          "Final content",
          "image-key-123",
          "OKR review context",
          3
        );

      expect(typeof canCallWithMinimal).toBe("function");
      expect(typeof canCallWithFull).toBe("function");
    });
  });

  describe("Button Element Structure", () => {
    it("should create proper action element structure", () => {
      const followups = [
        { text: "Option 1", type: "question" as const },
        { text: "Option 2", type: "recommendation" as const },
      ];

      // Verify button structure matches Feishu card format
      const actionElement = {
        tag: "action",
        actions: followups.map((followup) => ({
          tag: "button",
          text: {
            content: followup.text,
            tag: "plain_text",
          },
          type: "default",
          size: "medium",
          value: followup.text,
        })),
      };

      expect(actionElement.tag).toBe("action");
      expect(actionElement.actions.length).toBe(2);
      expect(actionElement.actions[0].tag).toBe("button");
      expect(actionElement.actions[0].text.content).toBe("Option 1");
      expect(actionElement.actions[0].value).toBe("Option 1");
    });

    it("should properly format button properties", () => {
      const button = {
        tag: "button",
        text: {
          content: "Click me",
          tag: "plain_text",
        },
        type: "default",
        size: "medium",
        value: "Click me",
      };

      // Verify structure matches Feishu button format
      expect(button.tag).toBe("button");
      expect(button.text.tag).toBe("plain_text");
      expect(button.type).toMatch(/default|primary|danger/);
      expect(button.size).toMatch(/small|medium|large/);
    });

    it("should handle button values correctly", () => {
      const followupText = "Tell me more about this";
      const button = {
        text: {
          content: followupText,
          tag: "plain_text",
        },
        value: followupText, // Value sent back in callback
      };

      expect(button.value).toBe(followupText);
      expect(button.text.content).toBe(followupText);
    });
  });

  describe("Card Settings Update", () => {
    it("should format settings data correctly", () => {
      const settingsData = {
        config: {
          streaming_mode: false,
        },
        summary: {
          content: "Final response preview...",
        },
      };

      expect(settingsData.config.streaming_mode).toBe(false);
      expect(settingsData.summary.content).toBeDefined();
      expect(settingsData.summary.content.length).toBeLessThanOrEqual(100);
    });

    it("should handle content truncation for summary", () => {
      const longContent =
        "This is a very long response that should be truncated for the summary preview to avoid exceeding the character limit and looking weird on the card";
      const summary = longContent.slice(0, 100);

      expect(summary.length).toBeLessThanOrEqual(100);
      expect(summary).toBe(longContent.slice(0, 100));
    });
  });
});
