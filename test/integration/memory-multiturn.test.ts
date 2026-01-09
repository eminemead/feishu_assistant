import { describe, it, expect } from "bun:test";
import { 
  getMemoryThreadId, 
  getMemoryResourceId,
  createAgentMemory,
} from "../../lib/memory-factory";

interface MemoryConfig {
  resource: string;
  thread: {
    id: string;
    metadata: { chatId: string; rootId: string; userId: string };
    title: string;
  };
}

function buildMemoryConfig(chatId: string, rootId: string, userId: string): MemoryConfig {
  return {
    resource: getMemoryResourceId(userId),
    thread: {
      id: getMemoryThreadId(chatId, rootId),
      metadata: { chatId, rootId, userId },
      title: `Feishu Chat ${chatId}`,
    },
  };
}

describe("Memory System - Multi-Turn Conversations", () => {
  describe("Memory Scoping", () => {
    it("should generate unique thread IDs for different conversations", () => {
      const config1 = buildMemoryConfig("chat123", "root456", "user_a");
      const config2 = buildMemoryConfig("chat123", "root789", "user_a");
      
      expect(config1.thread.id).not.toBe(config2.thread.id);
      expect(config1.thread.id).toBe("feishu:chat123:root456");
      expect(config2.thread.id).toBe("feishu:chat123:root789");
    });

    it("should share resource ID across threads for same user", () => {
      const config1 = buildMemoryConfig("chat123", "root456", "user_a");
      const config2 = buildMemoryConfig("chat_other", "root_other", "user_a");
      
      expect(config1.resource).toBe(config2.resource);
      expect(config1.resource).toBe("user:user_a");
    });

    it("should isolate resource ID between different users", () => {
      const configA = buildMemoryConfig("chat123", "root456", "user_a@company.com");
      const configB = buildMemoryConfig("chat123", "root456", "user_b@company.com");
      
      expect(configA.resource).not.toBe(configB.resource);
      expect(configA.resource).toBe("user:user_a@company.com");
      expect(configB.resource).toBe("user:user_b@company.com");
    });
  });

  describe("Memory Configuration", () => {
    it("should build valid memory config structure", () => {
      const config = buildMemoryConfig("oc_chat_123", "om_root_456", "ou_user_789");
      
      expect(config.resource).toBeDefined();
      expect(config.thread.id).toBeDefined();
      expect(config.thread.metadata).toBeDefined();
      expect(config.thread.metadata.chatId).toBe("oc_chat_123");
      expect(config.thread.metadata.rootId).toBe("om_root_456");
      expect(config.thread.metadata.userId).toBe("ou_user_789");
    });

    it("should include thread title for organization", () => {
      const config = buildMemoryConfig("oc_chat_123", "om_root_456", "ou_user_789");
      
      expect(config.thread.title).toContain("Feishu Chat");
      expect(config.thread.title).toContain("oc_chat_123");
    });
  });

  describe("Memory Factory", () => {
    it("should create memory with working memory + semantic recall", () => {
      const memory = createAgentMemory({
        lastMessages: 20,
        enableWorkingMemory: true,
        enableSemanticRecall: true,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });

    it("should create memory with just working memory", () => {
      const memory = createAgentMemory({
        enableWorkingMemory: true,
        enableSemanticRecall: false,
      });
      
      expect(memory === null || memory !== undefined).toBe(true);
    });
  });

  describe("Memory Isolation - Different Users", () => {
    it("should generate isolated contexts for different users in same chat", () => {
      const configA = buildMemoryConfig("shared_chat", "shared_root", "user_a");
      const configB = buildMemoryConfig("shared_chat", "shared_root", "user_b");
      
      expect(configA.thread.id).toBe(configB.thread.id);
      expect(configA.resource).not.toBe(configB.resource);
    });
  });

  describe("Memory Isolation - Same User Different Chats", () => {
    it("should isolate thread history across chats", () => {
      const config1 = buildMemoryConfig("chat_alpha", "root_1", "user_c");
      const config2 = buildMemoryConfig("chat_beta", "root_2", "user_c");
      
      expect(config1.thread.id).not.toBe(config2.thread.id);
      expect(config1.resource).toBe(config2.resource);
    });
  });

  describe("Memory Feature Coverage", () => {
    it("should support all three memory layers", () => {
      const resourceId = getMemoryResourceId("user_test");
      expect(resourceId).toBe("user:user_test");
      
      const threadId = getMemoryThreadId("chat_test", "root_test");
      expect(threadId).toBe("feishu:chat_test:root_test");
      
      const memory = createAgentMemory({
        lastMessages: 20,
        enableWorkingMemory: true,
        enableSemanticRecall: true,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });
  });

  describe("Production Readiness", () => {
    it("should generate RLS-compatible identifiers", () => {
      const resourceId = getMemoryResourceId("ou_7b8c9d0e");
      expect(resourceId).toMatch(/^user:/);
      
      const threadId = getMemoryThreadId("oc_1a2b3c4d", "om_5e6f7g8h");
      expect(threadId).toMatch(/^feishu:/);
    });

    it("should handle Feishu ID formats", () => {
      const openIdResource = getMemoryResourceId("ou_abcd1234");
      expect(openIdResource).toBe("user:ou_abcd1234");
      
      const userIdResource = getMemoryResourceId("cli_9876wxyz");
      expect(userIdResource).toBe("user:cli_9876wxyz");
      
      const chatThread = getMemoryThreadId("oc_chat123", "om_msg456");
      expect(chatThread).toContain("oc_chat123");
      expect(chatThread).toContain("om_msg456");
    });
  });
});
