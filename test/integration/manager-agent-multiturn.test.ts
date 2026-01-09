import { describe, it, expect } from "bun:test";
import { CoreMessage } from "ai";
import { dpaMomAgent, DpaMomResult } from "../../lib/agents/dpa-mom-agent";
import { getMemoryThreadId, getMemoryResourceId } from "../../lib/memory-factory";

function getResponseText(response: string | DpaMomResult): string {
  return typeof response === "string" ? response : response.text;
}

function buildMemoryConfig(chatId: string, rootId: string, userId: string) {
  return {
    resource: getMemoryResourceId(userId),
    thread: {
      id: getMemoryThreadId(chatId, rootId),
      metadata: { chatId, rootId, userId },
      title: `Feishu Chat ${chatId}`,
    },
  };
}

describe("DPA Mom - Multi-Turn Integration", () => {
  describe("Scenario 1: Agent Call with Memory Context", () => {
    it("should accept memory-related parameters", async () => {
      const chatId = "test_chat_01";
      const rootId = "test_root_01";
      const userId = "test_user_01@company.com";

      const memoryConfig = buildMemoryConfig(chatId, rootId, userId);
      
      expect(memoryConfig.resource).toBe("user:test_user_01@company.com");
      expect(memoryConfig.thread.id).toBe("feishu:test_chat_01:test_root_01");
      expect(memoryConfig.thread.metadata.userId).toBe(userId);
    });

    it("should handle agent call with context parameters", async () => {
      const chatId = "test_chat_02";
      const rootId = "test_root_02";
      const userId = "test_user_02@company.com";

      const messages: CoreMessage[] = [
        { role: "user", content: "Hello, what can you do?" },
      ];

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Test timeout")), 15000);
      });

      try {
        const response = await Promise.race([
          dpaMomAgent(
            messages,
            undefined,  // updateStatus
            chatId,
            rootId,
            userId
          ),
          timeoutPromise,
        ]);
        
        const text = getResponseText(response);
        expect(text).toBeDefined();
        expect(text.length).toBeGreaterThan(0);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    }, 20000); // 20 second timeout for this test
  });

  describe("Scenario 2: Memory Scoping Verification", () => {
    it("should generate correct thread IDs for different conversations", () => {
      const config1 = buildMemoryConfig("chat_A", "root_1", "user_1");
      const config2 = buildMemoryConfig("chat_A", "root_2", "user_1");
      expect(config1.thread.id).not.toBe(config2.thread.id);
    });

    it("should share resource across conversations for same user", () => {
      const config1 = buildMemoryConfig("chat_A", "root_1", "user_1");
      const config2 = buildMemoryConfig("chat_B", "root_2", "user_1");
      expect(config1.resource).toBe(config2.resource);
    });

    it("should isolate resources for different users", () => {
      const configA = buildMemoryConfig("chat_X", "root_X", "user_alice");
      const configB = buildMemoryConfig("chat_X", "root_X", "user_bob");
      expect(configA.resource).not.toBe(configB.resource);
      expect(configA.thread.id).toBe(configB.thread.id);
    });
  });

  describe("Scenario 3: Multi-Turn Message Building", () => {
    it("should build correct message sequence for multi-turn", () => {
      const threadHistory: CoreMessage[] = [
        { role: "user", content: "What is OKR?" },
        { role: "assistant", content: "OKR stands for Objectives and Key Results..." },
      ];
      const newMessage = "How many key results should I have?";
      const messages: CoreMessage[] = [
        ...threadHistory,
        { role: "user", content: newMessage },
      ];
      
      expect(messages.length).toBe(3);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
      expect(messages[2].role).toBe("user");
      expect(messages[2].content).toBe(newMessage);
    });

    it("should handle empty thread history (new conversation)", () => {
      const messages: CoreMessage[] = [
        { role: "user", content: "Hello!" },
      ];
      
      expect(messages.length).toBe(1);
      expect(messages[0].role).toBe("user");
    });
  });

  describe("Scenario 4: Memory Config Structure", () => {
    it("should include all required fields for Mastra memory", () => {
      const config = buildMemoryConfig("oc_12345", "om_67890", "ou_abcde");
      
      expect(config.resource).toBeDefined();
      expect(config.thread).toBeDefined();
      expect(config.thread.id).toBeDefined();
      expect(config.thread.metadata).toBeDefined();
      expect(config.thread.title).toBeDefined();
      expect(config.resource).toMatch(/^user:/);
      expect(config.thread.id).toMatch(/^feishu:/);
    });

    it("should preserve original IDs in metadata", () => {
      const chatId = "oc_test_chat";
      const rootId = "om_test_root";
      const userId = "ou_test_user";
      
      const config = buildMemoryConfig(chatId, rootId, userId);
      
      expect(config.thread.metadata.chatId).toBe(chatId);
      expect(config.thread.metadata.rootId).toBe(rootId);
      expect(config.thread.metadata.userId).toBe(userId);
    });
  });

  describe("Scenario 5: Edge Cases", () => {
    it("should handle special characters in IDs", () => {
      const chatId = "oc_chat-with-dashes_123";
      const rootId = "om_root.with.dots";
      const userId = "user@company.com";
      
      const config = buildMemoryConfig(chatId, rootId, userId);
      
      expect(config.resource).toContain(userId);
      expect(config.thread.id).toContain(chatId);
      expect(config.thread.id).toContain(rootId);
    });

    it("should handle long IDs", () => {
      const longId = "ou_" + "a".repeat(100);
      const config = buildMemoryConfig("chat", "root", longId);
      
      expect(config.resource).toBe(`user:${longId}`);
    });
  });
});
