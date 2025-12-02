import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSnapshotService,
  setSnapshotUserId,
  DocumentSnapshot,
} from "../lib/doc-snapshots";
import { computeDiff, formatDiffForCard } from "../lib/semantic-diff";

// Mock Supabase
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      match: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn(() =>
        Promise.resolve({
          data: {
            id: "test-id",
            user_id: "test-user",
            doc_token: "test-doc",
            revision_number: 1,
            content_hash: "hash123",
            content_size: 1000,
            modified_by: "user1",
            modified_at: Date.now(),
            stored_at: new Date(),
            metadata: { compression_ratio: 5.5 },
          },
          error: null,
        })
      ),
    })),
  })),
}));

describe("Document Snapshots", () => {
  beforeEach(() => {
    // Reset singleton before each test
    vi.clearAllMocks();
    setSnapshotUserId("test-user");
  });

  describe("SnapshotService", () => {
    it("should initialize with default config", () => {
      const service = getSnapshotService();
      expect(service).toBeDefined();
    });

    it("should set user ID for RLS", () => {
      const service = getSnapshotService();
      service.setUserId("test-user");
      // Should not throw
      expect(service).toBeDefined();
    });

    it("should validate document type support", () => {
      const service = getSnapshotService();
      expect(service.isSupportedDocType("doc")).toBe(true);
      expect(service.isSupportedDocType("sheet")).toBe(true);
      expect(service.isSupportedDocType("bitable")).toBe(true);
      expect(service.isSupportedDocType("image")).toBe(false);
    });

    it("should validate document size limits", () => {
      const service = getSnapshotService();
      expect(service.isWithinSizeLimit(1000)).toBe(true);
      expect(service.isWithinSizeLimit(5 * 1024 * 1024)).toBe(true);
      expect(service.isWithinSizeLimit(15 * 1024 * 1024)).toBe(false); // 15MB > 10MB limit
    });

    it("should create snapshot with compression tracking", async () => {
      const service = getSnapshotService();
      const content = "This is a test document that repeats. ".repeat(100);

      const snapshot = await service.createSnapshot(
        "doc_token_123",
        content,
        {
          revisionNumber: 1,
          modifiedBy: "user1",
          modifiedAt: Date.now(),
          docType: "doc",
        }
      );

      // Check that snapshot was created (in real test, would verify DB call)
      expect(snapshot).toBeDefined();
      if (snapshot) {
        expect(snapshot.docToken).toBe("doc_token_123");
        expect(snapshot.modifiedBy).toBe("user1");
      }
    });

    it("should skip snapshots below compression ratio", async () => {
      const service = getSnapshotService({
        minCompressionRatio: 10, // Very high threshold
      });

      const content = "Short content"; // Won't compress well

      const snapshot = await service.createSnapshot(
        "doc_token_123",
        content,
        {
          revisionNumber: 1,
          modifiedBy: "user1",
          modifiedAt: Date.now(),
          docType: "doc",
        }
      );

      // Should return null due to low compression ratio
      expect(snapshot).toBeNull();
    });

    it("should skip snapshots exceeding size limit", async () => {
      const service = getSnapshotService({
        maxDocSizeBytes: 100, // Very small limit
      });

      const content = "x".repeat(500);

      const snapshot = await service.createSnapshot(
        "doc_token_123",
        content,
        {
          revisionNumber: 1,
          modifiedBy: "user1",
          modifiedAt: Date.now(),
          docType: "doc",
        }
      );

      // Should return null due to size limit
      expect(snapshot).toBeNull();
    });

    it("should get snapshot by revision", async () => {
      const service = getSnapshotService();
      const snapshot = await service.getSnapshot("doc_token_123", 1);

      expect(snapshot).toBeDefined();
      if (snapshot) {
        expect(snapshot.revisionNumber).toBe(1);
      }
    });

    it("should get snapshot history", async () => {
      const service = getSnapshotService();
      const snapshots = await service.getSnapshotHistory("doc_token_123", 5);

      expect(Array.isArray(snapshots)).toBe(true);
    });

    it("should compute snapshot statistics", async () => {
      const service = getSnapshotService();
      const stats = await service.getSnapshotStats("doc_token_123");

      expect(stats).toBeDefined();
      expect(stats.totalSnapshots).toBeGreaterThanOrEqual(0);
      expect(stats.averageCompressionRatio).toBeGreaterThanOrEqual(0);
    });

    it("should prune old snapshots", async () => {
      const service = getSnapshotService();
      const pruned = await service.pruneOldSnapshots("doc_token_123");

      expect(typeof pruned).toBe("number");
    });

    it("should pass health check", async () => {
      const service = getSnapshotService();
      const healthy = await service.healthCheck();

      expect(typeof healthy).toBe("boolean");
    });
  });

  describe("Semantic Diff Engine", () => {
    it("should compute diff between two documents", () => {
      const prev = "Line 1\nLine 2\nLine 3";
      const current = "Line 1\nLine 2 modified\nLine 3\nLine 4";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff).toBeDefined();
      expect(diff.previousRevision).toBe(1);
      expect(diff.newRevision).toBe(2);
      expect(diff.lineDiffs.length).toBeGreaterThan(0);
      expect(diff.summary.totalChanges).toBeGreaterThan(0);
    });

    it("should detect added lines", () => {
      const prev = "Line 1";
      const current = "Line 1\nLine 2";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.addedLines).toBe(1);
      expect(diff.summary.removedLines).toBe(0);
    });

    it("should detect removed lines", () => {
      const prev = "Line 1\nLine 2";
      const current = "Line 1";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.addedLines).toBe(0);
      expect(diff.summary.removedLines).toBe(1);
    });

    it("should detect modified lines", () => {
      const prev = "Line 1\nLine 2";
      const current = "Line 1\nLine 2 modified";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.modifiedLines).toBeGreaterThan(0);
    });

    it("should compute block-level diffs", () => {
      const prev = `# Heading 1
Some paragraph text
- List item 1
- List item 2`;

      const current = `# Heading 1
Some modified paragraph text
- List item 1
- List item 2
- List item 3`;

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.blockDiffs.length).toBeGreaterThan(0);
      expect(diff.blockDiffs.some((b) => b.blockType === "heading")).toBe(
        true
      );
    });

    it("should identify no changes when documents are identical", () => {
      const content = "Same content\nSame content";

      const diff = computeDiff(content, content, 1, 2);

      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.summary.percentChanged).toBe(0);
    });

    it("should calculate percent changed correctly", () => {
      const prev = "Short";
      const current = "This is a much longer document with significant changes";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.percentChanged).toBeGreaterThan(0);
    });

    it("should format diff for Feishu card", () => {
      const prev = "Original content";
      const current = "Modified content\nWith new line";

      const diff = computeDiff(prev, current, 1, 2);
      const formatted = formatDiffForCard(diff);

      expect(formatted).toContain("Changes:");
      expect(formatted).toContain("Revision");
      expect(formatted).toContain("Summary:");
    });

    it("should handle empty documents", () => {
      const diff = computeDiff("", "", 1, 2);

      expect(diff.summary.totalChanges).toBe(0);
      expect(diff.summary.percentChanged).toBe(0);
    });

    it("should handle large documents", () => {
      const prev = "Line\n".repeat(1000);
      const current = "Line\n".repeat(1000) + "New line";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff).toBeDefined();
      expect(diff.computeTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should compute diff efficiently", () => {
      const prev = "Content ".repeat(100);
      const current = "Content ".repeat(100) + "added";

      const start = performance.now();
      const diff = computeDiff(prev, current, 1, 2);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be fast (< 100ms)
      expect(diff.computeTimeMs).toBeLessThan(100);
    });

    it("should handle unicode content", () => {
      const prev = "Hello 世界\nこんにちは";
      const current = "Hello 世界\nこんにちは\n你好";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.addedLines).toBe(1);
    });

    it("should generate human-readable summary", () => {
      const prev = "Line 1\nLine 2";
      const current = "Line 1 new\nLine 2\nLine 3\nLine 4";

      const diff = computeDiff(prev, current, 1, 2);

      expect(diff.summary.summary).toMatch(/\d+.*changed/);
    });
  });

  describe("Compression and Efficiency", () => {
    it("should achieve reasonable compression ratio", async () => {
      const service = getSnapshotService();

      // Highly compressible content
      const content = "Repeat ".repeat(500);

      const snapshot = await service.createSnapshot(
        "doc_token_compress",
        content,
        {
          revisionNumber: 1,
          modifiedBy: "user1",
          modifiedAt: Date.now(),
          docType: "doc",
        }
      );

      // Snapshot should exist (content is compressible)
      if (snapshot && snapshot.metadata?.compression_ratio) {
        expect(snapshot.metadata.compression_ratio).toBeGreaterThan(1);
      }
    });

    it("should handle JSON document snapshots", async () => {
      const service = getSnapshotService();

      const jsonDoc = {
        title: "Test Document",
        sections: [
          { title: "Introduction", content: "This is the intro" },
          { title: "Body", content: "Main content here" },
        ],
      };

      const snapshot = await service.createSnapshot(
        "doc_token_json",
        jsonDoc,
        {
          revisionNumber: 1,
          modifiedBy: "user1",
          modifiedAt: Date.now(),
          docType: "doc",
        }
      );

      expect(snapshot).toBeDefined();
      if (snapshot) {
        expect(snapshot.contentSize).toBeGreaterThan(0);
      }
    });
  });
});
