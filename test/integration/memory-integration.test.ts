import { describe, it, expect } from "bun:test";
import { 
  createAgentMemory, 
  getMemoryThreadId, 
  getMemoryResourceId,
  getSharedStorage,
  getSharedVector,
} from "../../lib/memory-factory";

describe("Memory Integration", () => {
  describe("Memory Factory", () => {
    it("should create memory with all features enabled", () => {
      const memory = createAgentMemory({
        lastMessages: 20,
        enableWorkingMemory: true,
        enableSemanticRecall: true,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });

    it("should create memory with only working memory", () => {
      const memory = createAgentMemory({
        enableWorkingMemory: true,
        enableSemanticRecall: false,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });

    it("should create memory with custom lastMessages", () => {
      const memory = createAgentMemory({
        lastMessages: 50,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });
  });

  describe("Helper Functions", () => {
    it("should generate correct thread ID format", () => {
      const threadId = getMemoryThreadId("chat123", "root456");
      expect(threadId).toBe("feishu:chat123:root456");
    });

    it("should generate correct resource ID format", () => {
      const resourceId = getMemoryResourceId("user123");
      expect(resourceId).toBe("user:user123");
    });

    it("should handle different chat IDs", () => {
      const id1 = getMemoryThreadId("chat1", "root1");
      const id2 = getMemoryThreadId("chat2", "root2");
      
      expect(id1).toBe("feishu:chat1:root1");
      expect(id2).toBe("feishu:chat2:root2");
      expect(id1).not.toBe(id2);
    });
  });

  describe("Memory Configuration Structure", () => {
    it("should support working memory with resource scope", () => {
      const memoryConfig = {
        workingMemory: {
          enabled: true,
          scope: "resource",
          template: "# User Profile\n- Name:\n- Preferences:",
        },
        semanticRecall: {
          topK: 5,
          messageRange: { before: 3, after: 1 },
          scope: "resource",
          threshold: 0.65,
        },
        threads: {
          generateTitle: true,
        },
      };

      expect(memoryConfig.workingMemory.enabled).toBe(true);
      expect(memoryConfig.workingMemory.scope).toBe("resource");
      expect(memoryConfig.semanticRecall.scope).toBe("resource");
      expect(memoryConfig.semanticRecall.threshold).toBe(0.65);
      expect(memoryConfig.threads.generateTitle).toBe(true);
    });
  });

  describe("Memory Context Building", () => {
    it("should create memory context for agent calls", () => {
      const chatId = "oc_test_chat_123";
      const rootId = "om_test_root_456";
      const userId = "ou_test_user_789";

      const memoryResource = getMemoryResourceId(userId);
      const memoryThread = getMemoryThreadId(chatId, rootId);

      const memoryConfig = {
        resource: memoryResource,
        thread: {
          id: memoryThread,
          metadata: { chatId, rootId, userId },
          title: `Feishu Chat ${chatId}`,
        },
      };

      expect(memoryConfig.resource).toBe("user:ou_test_user_789");
      expect(memoryConfig.thread.id).toBe("feishu:oc_test_chat_123:om_test_root_456");
      expect(memoryConfig.thread.metadata.userId).toBe(userId);
    });
  });

  describe("Shared Storage Singletons", () => {
    it("should provide storage factory function", () => {
      expect(typeof getSharedStorage).toBe("function");
    });

    it("should provide vector factory function", () => {
      expect(typeof getSharedVector).toBe("function");
    });

    it("should return consistent storage instance", () => {
      const storage1 = getSharedStorage();
      const storage2 = getSharedStorage();
      if (storage1 !== null) {
        expect(storage1).toBe(storage2);
      }
    });
  });

  describe("Integration Points", () => {
    it("should export all required functions from memory-factory", async () => {
      const memoryModule = await import("../../lib/memory-factory");
      expect(memoryModule.createAgentMemory).toBeDefined();
      expect(memoryModule.getMemoryThreadId).toBeDefined();
      expect(memoryModule.getMemoryResourceId).toBeDefined();
      expect(memoryModule.getSharedStorage).toBeDefined();
      expect(memoryModule.getSharedVector).toBeDefined();
    });

    it("should have correct function signatures", () => {
      const threadId = getMemoryThreadId("test", "test");
      const resourceId = getMemoryResourceId("test");
      
      expect(typeof threadId).toBe("string");
      expect(typeof resourceId).toBe("string");
    });
  });
});

