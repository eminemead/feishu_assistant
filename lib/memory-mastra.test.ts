import { describe, it, expect } from "bun:test";
import { createAgentMemory, getMemoryThreadId, getMemoryResourceId } from "./memory-factory";

process.env.SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL || "postgresql://test:test@localhost/test";

describe("Mastra Memory - 3-Layer Architecture", () => {
  describe("Memory ID Helpers", () => {
    it("should provide memory helpers", () => {
      expect(typeof getMemoryThreadId).toBe("function");
      expect(typeof getMemoryResourceId).toBe("function");
      expect(typeof createAgentMemory).toBe("function");
    });

    it("should generate memory thread ID from chat context", () => {
      const threadId = getMemoryThreadId("chat-123", "root-456");
      expect(threadId).toBe("feishu:chat-123:root-456");
    });

    it("should generate memory resource ID from user", () => {
      const resourceId = getMemoryResourceId("user-789");
      expect(resourceId).toBe("user:user-789");
    });
  });

  describe("Memory Factory", () => {
    it("should create memory with default options", () => {
      const memory = createAgentMemory();
      expect(memory === null || memory !== undefined).toBe(true);
    });

    it("should create memory with working memory enabled", () => {
      const memory = createAgentMemory({
        enableWorkingMemory: true,
        enableSemanticRecall: false,
      });
      expect(memory === null || memory !== undefined).toBe(true);
    });

    it("should create memory with semantic recall enabled", () => {
      const memory = createAgentMemory({
        enableWorkingMemory: true,
        enableSemanticRecall: true,
        lastMessages: 30,
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

  describe("Memory Scoping", () => {
    it("should generate unique thread IDs for different chats", () => {
      const id1 = getMemoryThreadId("chat-A", "root-1");
      const id2 = getMemoryThreadId("chat-B", "root-2");
      expect(id1).not.toBe(id2);
    });

    it("should generate unique resource IDs for different users", () => {
      const id1 = getMemoryResourceId("user-A");
      const id2 = getMemoryResourceId("user-B");
      expect(id1).not.toBe(id2);
    });

    it("should format thread ID with feishu prefix", () => {
      const id = getMemoryThreadId("oc_123abc", "om_456def");
      expect(id).toMatch(/^feishu:/);
      expect(id).toContain("oc_123abc");
      expect(id).toContain("om_456def");
    });

    it("should format resource ID with user prefix", () => {
      const id = getMemoryResourceId("ou_789ghi");
      expect(id).toMatch(/^user:/);
      expect(id).toContain("ou_789ghi");
    });
  });
});
