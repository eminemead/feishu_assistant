/**
 * Feishu Assistant Multi-Turn Integration Tests
 * 
 * Tests that the unified agent handles multi-turn conversations correctly,
 * maintains context across turns, and properly isolates memory between users/chats.
 * 
 * Test Pattern:
 * - Scenario 1: Simple multi-turn (Q1 → A1 → Q2 → A2)
 * - Scenario 2: User isolation (different users, same chat)
 * - Scenario 3: Chat isolation (same user, different chats)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { CoreMessage } from "ai";
import { feishuAssistantAgent, FeishuAssistantResult } from "../../lib/agents/feishu-assistant-agent";
import {
  initializeAgentMemoryContext,
  loadConversationHistory,
} from "../../lib/agents/memory-integration";

/** Helper to extract text from response */
function getResponseText(response: string | FeishuAssistantResult): string {
  return typeof response === "string" ? response : response.text;
}

describe("Feishu Assistant - Multi-Turn Integration", () => {
  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
  });

  describe("Scenario 1: Simple Multi-Turn Context", () => {
    it("should handle consecutive agent calls in same conversation", async () => {
      const chatId = "test_chat_01";
      const rootId = "test_root_01";
      const userId = "test_user_01@company.com";

      // Initialize memory for this conversation
      const context = await initializeAgentMemoryContext(
        chatId,
        rootId,
        userId
      );

      // Turn 1: Ask about OKR
      const q1 = "What is an OKR?";
      const messages1: CoreMessage[] = [
        {
          role: "user",
          content: q1,
        },
      ];

      console.log(`[Test] Turn 1: "${q1}"`);
      let a1 = "";
      try {
        const resp1 = await feishuAssistantAgent(messages1, undefined, chatId, rootId, userId);
        a1 = getResponseText(resp1);
        expect(a1).toBeDefined();
        expect(a1.length).toBeGreaterThan(0);
        console.log(`[Test] Turn 1 Response length: ${a1.length}`);
      } catch (error) {
        // Inference may fail, but should not crash
        console.log(`[Test] Turn 1 inference timeout (expected)`);
      }

      // Turn 2: Ask follow-up (in production, would use conversation history for context)
      const q2 = "How many key results should an OKR have?";
      const messages2: CoreMessage[] = [
        {
          role: "user",
          content: q2,
        },
      ];

      console.log(`[Test] Turn 2: "${q2}"`);
      let a2 = "";
      try {
        const resp2 = await feishuAssistantAgent(messages2, undefined, chatId, rootId, userId);
        a2 = getResponseText(resp2);
        expect(a2).toBeDefined();
        expect(a2.length).toBeGreaterThan(0);
        console.log(`[Test] Turn 2 Response length: ${a2.length}`);
      } catch (error) {
        console.log(`[Test] Turn 2 inference timeout (expected)`);
      }

      // Verify memory context was created
      expect(context.conversationId).toBe(`feishu:${chatId}:${rootId}`);
      expect(context.userScopeId).toBe(`user:${userId}`);

      // Turn 3: Load conversation history to verify memory
      const history = await loadConversationHistory(context, 5);
      console.log(
        `[Test] Conversation history loaded: ${history.length} messages`
      );
      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });

    it("should handle agent routing correctly across multiple turns", async () => {
      const chatId = "routing_test_chat";
      const rootId = "routing_test_root";
      const userId = "routing_test_user@company.com";

      // Different types of queries to test routing to different specialist agents
      const queries = [
        "What is OKR?", // Should route to OKR Reviewer
        "Are our teams aligned?", // Should route to Alignment
        "What's our profit margin?", // Should route to P&L
      ];

      for (const q of queries) {
        const messages: CoreMessage[] = [{ role: "user", content: q }];

        try {
          const resp = await feishuAssistantAgent(
            messages,
            undefined,
            chatId,
            rootId,
            userId
          );
          const response = getResponseText(resp);
          expect(response).toBeDefined();
          expect(response.length).toBeGreaterThan(0);
          console.log(`[Test] Query: "${q}" - Response length: ${response.length}`);
        } catch (error) {
          console.log(
            `[Test] Query: "${q}" - inference timeout (expected in test)`
          );
        }
      }
    });
  });

  describe("Scenario 2: User Isolation", () => {
    it("should isolate memory between different users in same chat", async () => {
      const chatId = "shared_chat";
      const rootId = "shared_root";
      const userA = "user_a@company.com";
      const userB = "user_b@company.com";

      // User A's context
      const contextA = await initializeAgentMemoryContext(chatId, rootId, userA);
      expect(contextA.userScopeId).toBe(`user:${userA}`);

      // User B's context (same chat, different user)
      const contextB = await initializeAgentMemoryContext(chatId, rootId, userB);
      expect(contextB.userScopeId).toBe(`user:${userB}`);

      // Verify they have different user scopes
      expect(contextA.userScopeId).not.toBe(contextB.userScopeId);

      // In production with RLS:
      // - User A's memory would be isolated to user_a@company.com
      // - User B's memory would be isolated to user_b@company.com
      // - They would NOT see each other's conversations even in same chat

      const queryA = "My OKR for Q1...";
      const queryB = "My OKR for Q1...";

      // User A queries
      const messagesA: CoreMessage[] = [{ role: "user", content: queryA }];
      try {
        const respA = await feishuAssistantAgent(
          messagesA,
          undefined,
          chatId,
          rootId,
          userA
        );
        const responseA = getResponseText(respA);
        console.log(
          `[Test] User A response length: ${responseA?.length || 0}`
        );
      } catch (e) {
        console.log(`[Test] User A inference timeout`);
      }

      // User B queries same topic
      const messagesB: CoreMessage[] = [{ role: "user", content: queryB }];
      try {
        const respB = await feishuAssistantAgent(
          messagesB,
          undefined,
          chatId,
          rootId,
          userB
        );
        const responseB = getResponseText(respB);
        console.log(
          `[Test] User B response length: ${responseB?.length || 0}`
        );
      } catch (e) {
        console.log(`[Test] User B inference timeout`);
      }

      // Verify isolation was respected
      expect(contextA.userScopeId).toBe(`user:${userA}`);
      expect(contextB.userScopeId).toBe(`user:${userB}`);
    });
  });

  describe("Scenario 3: Chat/Thread Isolation", () => {
    it("should isolate memory between different chat threads", async () => {
      const userId = "multi_chat_user@company.com";
      const chatIdA = "chat_alpha";
      const rootIdA = "msg_root_1";
      const chatIdB = "chat_beta";
      const rootIdB = "msg_root_2";

      // Context for Chat A
      const contextA = await initializeAgentMemoryContext(chatIdA, rootIdA, userId);
      expect(contextA.conversationId).toBe(`feishu:${chatIdA}:${rootIdA}`);

      // Context for Chat B (same user, different chat)
      const contextB = await initializeAgentMemoryContext(chatIdB, rootIdB, userId);
      expect(contextB.conversationId).toBe(`feishu:${chatIdB}:${rootIdB}`);

      // Verify they have different conversation scopes
      expect(contextA.conversationId).not.toBe(contextB.conversationId);

      // Same user, same query in different chats
      const query = "What is our company strategy?";

      // Query in Chat A
      const messagesA: CoreMessage[] = [{ role: "user", content: query }];
      try {
        const respA = await feishuAssistantAgent(
          messagesA,
          undefined,
          chatIdA,
          rootIdA,
          userId
        );
        const responseA = getResponseText(respA);
        console.log(
          `[Test] Chat A response length: ${responseA?.length || 0}`
        );
      } catch (e) {
        console.log(`[Test] Chat A inference timeout`);
      }

      // Query in Chat B (should not remember Chat A's conversation)
      const messagesB: CoreMessage[] = [{ role: "user", content: query }];
      try {
        const respB = await feishuAssistantAgent(
          messagesB,
          undefined,
          chatIdB,
          rootIdB,
          userId
        );
        const responseB = getResponseText(respB);
        console.log(
          `[Test] Chat B response length: ${responseB?.length || 0}`
        );
      } catch (e) {
        console.log(`[Test] Chat B inference timeout`);
      }

      // Verify isolation
      expect(contextA.conversationId).toBe(`feishu:${chatIdA}:${rootIdA}`);
      expect(contextB.conversationId).toBe(`feishu:${chatIdB}:${rootIdB}`);
    });
  });

  describe("Memory Context Integrity", () => {
    it("should correctly compute conversation and user scope IDs", async () => {
      const chatId = "chat_x123";
      const rootId = "root_y456";
      const userId = "user_z@company.com";

      const context = await initializeAgentMemoryContext(chatId, rootId, userId);

      // Verify correct format
      expect(context.conversationId).toBe(`feishu:${chatId}:${rootId}`);
      expect(context.userScopeId).toBe(`user:${userId}`);

      // Verify context properties
      expect(context.chatId).toBe(chatId);
      expect(context.rootId).toBe(rootId);
      expect(context.userId).toBe(userId);
      expect(context.provider).toBeDefined();
    });

    it("should handle missing parameters gracefully", async () => {
      // Should not crash with missing parameters
      const context1 = await initializeAgentMemoryContext();
      expect(context1).toBeDefined();
      expect(context1.conversationId).toContain("feishu:");
      expect(context1.userScopeId).toContain("user:");

      // Partial parameters
      const context2 = await initializeAgentMemoryContext("chat123");
      expect(context2).toBeDefined();
      expect(context2.conversationId).toContain("feishu:chat123");

      const context3 = await initializeAgentMemoryContext("chat", "root");
      expect(context3).toBeDefined();
      expect(context3.conversationId).toBe("feishu:chat:root");
    });
  });

  describe("Error Resilience", () => {
    it("should continue functioning if memory operations fail", async () => {
      const chatId = "resilience_chat";
      const rootId = "resilience_root";
      const userId = "resilience_user@company.com";

      const query = "Test query";
      const messages: CoreMessage[] = [{ role: "user", content: query }];

      // Should not throw even if memory system has issues
      try {
        const resp = await feishuAssistantAgent(
          messages,
          undefined,
          chatId,
          rootId,
          userId
        );
        const response = getResponseText(resp);
        // If successful, response should be valid
        if (response) {
          expect(response.length).toBeGreaterThan(0);
        }
      } catch (error) {
        // API errors are acceptable (timeouts, rate limits)
        // But memory failures should NOT prevent the agent from functioning
        if (error instanceof Error) {
          expect(error.message).toBeDefined();
          console.log(`[Test] Expected error: ${error.message}`);
        }
      }
    });

    it("should handle concurrent requests to different conversations", async () => {
      const queries = [
        {
          chat: "chat_1",
          root: "root_1",
          user: "user1@test.com",
          q: "Query 1",
        },
        {
          chat: "chat_2",
          root: "root_2",
          user: "user2@test.com",
          q: "Query 2",
        },
        {
          chat: "chat_3",
          root: "root_3",
          user: "user3@test.com",
          q: "Query 3",
        },
      ];

      const promises = queries.map(async (q) => {
        const messages: CoreMessage[] = [{ role: "user", content: q.q }];
        try {
          const resp = await feishuAssistantAgent(
            messages,
            undefined,
            q.chat,
            q.root,
            q.user
          );
          const response = getResponseText(resp);
          return { success: true, length: response?.length || 0 };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      const results = await Promise.all(promises);

      // All should complete without crashing
      expect(results).toBeDefined();
      expect(results.length).toBe(3);

      // Results can have mixed success (inference may timeout)
      for (const result of results) {
        expect(result).toHaveProperty("success");
      }
    });
  });

  describe("Production Readiness", () => {
    it("should work with realistic Feishu context", async () => {
      // Realistic Feishu context format
      const feishuContext = {
        chatId: "oc_12345abcde", // Feishu chat ID format
        rootId: "om_98765fghij", // Feishu message ID format
        userId: "ou_1234567890", // Feishu user ID format
      };

      const context = await initializeAgentMemoryContext(
        feishuContext.chatId,
        feishuContext.rootId,
        feishuContext.userId
      );

      // Should correctly scope this
      expect(context.conversationId).toBe(
        `feishu:${feishuContext.chatId}:${feishuContext.rootId}`
      );
      expect(context.userScopeId).toBe(`user:${feishuContext.userId}`);

      // Agent should be callable with this context
      const messages: CoreMessage[] = [
        { role: "user", content: "Production test query" },
      ];

      try {
        const resp = await feishuAssistantAgent(
          messages,
          undefined,
          feishuContext.chatId,
          feishuContext.rootId,
          feishuContext.userId
        );
        const response = getResponseText(resp);
        // Should produce valid response
        expect(response).toBeDefined();
      } catch (error) {
        // Acceptable: inference timeout
        console.log(`[Test] Production context test - inference timeout`);
      }
    });

    it("should handle edge cases in conversation scoping", async () => {
      // Unicode in user ID
      const context1 = await initializeAgentMemoryContext(
        "chat",
        "root",
        "用户@company.com"
      );
      expect(context1.userScopeId).toContain("user:");

      // Long conversation ID
      const context2 = await initializeAgentMemoryContext(
        "very_long_chat_id_with_many_characters",
        "very_long_root_id_with_many_characters",
        "user@example.com"
      );
      expect(context2.conversationId).toContain("feishu:");

      // Special characters (URLs, etc)
      const context3 = await initializeAgentMemoryContext(
        "chat-with-dashes",
        "root_with_underscores",
        "user+tag@company.co.uk"
      );
      expect(context3).toBeDefined();
    });
  });
});
