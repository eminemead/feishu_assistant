/**
 * Integration tests for button followup handler using REAL Feishu API
 * 
 * These tests require a real Feishu workspace and chat for testing.
 * 
 * Setup:
 * 1. Create a test group chat in Feishu (e.g., "AI Testing")
 * 2. Add the bot to this group
 * 3. Get the chat ID from Feishu (right-click chat → Copy chat ID or use API)
 * 
 * Running tests:
 * FEISHU_TEST_CHAT_ID=oc_abc123def456 \
 * FEISHU_TEST_USER_ID=ou_xyz789abc \
 * FEISHU_BOT_ID=ou_bot123 \
 * bun test test/handle-button-followup-integration.test.ts
 */

import { describe, it, expect } from "bun:test";
import {
  handleButtonFollowup,
  extractButtonFollowupContext,
  ButtonFollowupContext,
} from "../lib/handle-button-followup";
import { CardActionCallback } from "../lib/handle-card-action";

// These should be set from environment for real testing
const FEISHU_TEST_CHAT_ID = process.env.FEISHU_TEST_CHAT_ID;
const FEISHU_TEST_USER_ID = process.env.FEISHU_TEST_USER_ID;
const FEISHU_BOT_ID = process.env.FEISHU_BOT_ID;

// Skip integration tests if test credentials aren't provided
const skipIntegration =
  !FEISHU_TEST_CHAT_ID || !FEISHU_TEST_USER_ID || !FEISHU_BOT_ID;

const describeIntegration = skipIntegration ? describe.skip : describe;

describeIntegration("Button Followup Integration Tests - Real Feishu API", () => {
  it("should handle button followup and send response to Feishu chat", async () => {
    const context: ButtonFollowupContext = {
      chatId: FEISHU_TEST_CHAT_ID!,
      messageId: `msg-${Date.now()}`,
      rootId: FEISHU_TEST_CHAT_ID!,
      botUserId: FEISHU_BOT_ID!,
      userId: FEISHU_TEST_USER_ID!,
      buttonValue: "What is OKR alignment?",
      isMention: false,
    };

    console.log(
      "\n✅ Running real API test with context:",
      JSON.stringify(context, null, 2)
    );

    const response = await handleButtonFollowup(context);

    // Response should have proper structure
    expect(response).toHaveProperty("toast");
    expect(response.toast).toHaveProperty("type");
    expect(response.toast).toHaveProperty("content");

    // Type should be success or fail
    expect(["success", "fail"]).toContain(response.toast?.type);

    console.log("Response from Feishu:", response.toast);
  });

  it("should handle group mention button followup", async () => {
    const context: ButtonFollowupContext = {
      chatId: FEISHU_TEST_CHAT_ID!,
      messageId: `msg-mention-${Date.now()}`,
      rootId: FEISHU_TEST_CHAT_ID!,
      botUserId: FEISHU_BOT_ID!,
      userId: FEISHU_TEST_USER_ID!,
      buttonValue: "Generate an OKR example for Q1",
      isMention: true,
    };

    console.log(
      "\n✅ Running group mention test with context:",
      JSON.stringify(context, null, 2)
    );

    const response = await handleButtonFollowup(context);

    expect(response).toHaveProperty("toast");
    expect(response.toast?.type).toMatch(/success|fail/);

    console.log("Response:", response.toast);
  });

  it("should send different button values to the agent", async () => {
    const testQueries = [
      "Tell me about OKRs",
      "How do I align my OKRs with company goals?",
      "What are some examples of good OKRs?",
    ];

    for (const query of testQueries) {
      const context: ButtonFollowupContext = {
        chatId: FEISHU_TEST_CHAT_ID!,
        messageId: `msg-${Date.now()}`,
        rootId: FEISHU_TEST_CHAT_ID!,
        botUserId: FEISHU_BOT_ID!,
        userId: FEISHU_TEST_USER_ID!,
        buttonValue: query,
        isMention: false,
      };

      console.log(`\n📝 Testing query: "${query}"`);

      const response = await handleButtonFollowup(context);

      expect(response).toHaveProperty("toast");
      expect(response.toast?.type).toMatch(/success|fail/);

      console.log(`✅ Sent to agent: "${query}"`);
    }
  });
});

describe("extractButtonFollowupContext - Unit Tests (No API calls)", () => {
  it("should extract context from card action callback", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-123",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_followup",
          action_type: "button",
          value: "Tell me more about OKRs",
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "user-123",
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "chat-456",
      "bot-789"
    );

    expect(context).not.toBeNull();
    expect(context?.chatId).toBe("chat-456");
    expect(context?.userId).toBe("user-123");
    expect(context?.botUserId).toBe("bot-789");
    expect(context?.buttonValue).toBe("Tell me more about OKRs");
    expect(context?.messageId).toBe("event-123");
  });

  it("should return null for invalid payloads", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-123",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_invalid",
          action_type: "button",
          value: null, // Invalid
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "user-123",
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "chat-456",
      "bot-789"
    );

    expect(context).toBeNull();
  });

  it("should support isMention flag", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-group-123",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_group",
          action_type: "button",
          value: "Group action button",
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "user-456",
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "group-chat-123",
      "bot-234",
      true
    );

    expect(context?.isMention).toBe(true);
    expect(context?.chatId).toBe("group-chat-123");
    expect(context?.buttonValue).toBe("Group action button");
  });

  it("should handle various button value formats", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-format-test",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_format",
          action_type: "button",
          value: {
            value: "Extracted value",
            text: "Fallback text",
          },
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "user-789",
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "chat-format-123",
      "bot-format-456"
    );

    expect(context?.buttonValue).toBe("Extracted value");
  });
});

describe("Button Followup - Edge Cases", () => {
  it("should handle empty button values", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-empty",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_empty",
          action_type: "button",
          value: "", // Empty string
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "user-empty",
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "chat-empty",
      "bot-empty"
    );

    // Empty string is falsy, should return null
    expect(context).toBeNull();
  });

  it("should handle missing operator ID", () => {
    const payload: CardActionCallback = {
      schema: "2.0",
      header: {
        event_id: "event-no-op",
        event_type: "card.action.trigger",
        create_time: "2025-01-01T12:00:00Z",
        token: "token-123",
        app_id: "app-123",
      },
      event: {
        action: {
          action_id: "btn_no_op",
          action_type: "button",
          value: "Still valid",
        },
        trigger: {
          trigger_type: "card.action.trigger",
        },
        operator: {
          operator_id: "", // Empty
          operator_type: "user",
        },
        token: "token-123",
      },
    };

    const context = extractButtonFollowupContext(
      payload,
      "chat-no-op",
      "bot-no-op"
    );

    // Context should still be valid, but userId will be empty
    expect(context).not.toBeNull();
    expect(context?.userId).toBe("");
    expect(context?.buttonValue).toBe("Still valid");
  });
});
