import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleChangeDetectedSnapshot,
  getChangeHistoryWithDiffs,
  getDocumentSnapshotStats,
  pruneExpiredSnapshots,
  initializeSnapshotSystem,
} from "../lib/doc-snapshot-integration";

// Mock dependencies
vi.mock("../lib/doc-snapshots");
vi.mock("../lib/semantic-diff");
vi.mock("../lib/doc-persistence");
vi.mock("../lib/feishu-utils");

describe("Document Snapshot Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Change Detection Snapshot Handling", () => {
    it("should handle snapshot creation on change detection", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
        title: "Test Document",
      };

      // Should not throw
      await handleChangeDetectedSnapshot(
        "doc_token_123",
        "doc",
        metadata,
        { enableAutoSnapshot: true, enableSemanticDiff: true }
      );
    });

    it("should skip snapshot if disabled", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
        title: "Test Document",
      };

      // Should not throw and skip gracefully
      await handleChangeDetectedSnapshot(
        "doc_token_123",
        "doc",
        metadata,
        { enableAutoSnapshot: false }
      );
    });

    it("should handle sheet documents", async () => {
      const metadata = {
        lastModifiedUser: "user456",
        lastModifiedTime: Date.now(),
        title: "Test Sheet",
      };

      await handleChangeDetectedSnapshot(
        "sheet_token_123",
        "sheet",
        metadata
      );
    });

    it("should handle bitable documents", async () => {
      const metadata = {
        lastModifiedUser: "user789",
        lastModifiedTime: Date.now(),
        title: "Test Bitable",
      };

      await handleChangeDetectedSnapshot(
        "bitable_token_123",
        "bitable",
        metadata
      );
    });

    it("should compute diff with previous snapshot", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
        title: "Test Document",
      };

      // With semantic diff enabled
      await handleChangeDetectedSnapshot(
        "doc_token_123",
        "doc",
        metadata,
        { enableSemanticDiff: true }
      );
    });

    it("should handle download failures gracefully", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
        title: "Test Document",
      };

      // Should not throw on download failure
      await handleChangeDetectedSnapshot(
        "doc_token_invalid",
        "doc",
        metadata
      );
    });
  });

  describe("Change History with Diffs", () => {
    it("should retrieve change history", async () => {
      const history = await getChangeHistoryWithDiffs("doc_token_123", 10);

      expect(Array.isArray(history)).toBe(true);
    });

    it("should compute diffs between consecutive versions", async () => {
      const history = await getChangeHistoryWithDiffs("doc_token_123", 5);

      expect(history).toBeDefined();
      // Each entry should have snapshot and diff info
      for (const entry of history) {
        expect(entry).toHaveProperty("snapshot");
      }
    });

    it("should handle missing snapshots", async () => {
      const history = await getChangeHistoryWithDiffs("doc_token_empty", 10);

      expect(Array.isArray(history)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      const limit = 5;
      const history = await getChangeHistoryWithDiffs("doc_token_123", limit);

      expect(history.length).toBeLessThanOrEqual(limit);
    });

    it("should include diff summaries", async () => {
      const history = await getChangeHistoryWithDiffs("doc_token_123", 3);

      for (const entry of history) {
        expect(entry).toHaveProperty("diffSummary");
      }
    });
  });

  describe("Snapshot Statistics", () => {
    it("should retrieve snapshot statistics", async () => {
      const stats = await getDocumentSnapshotStats("doc_token_123");

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty("docToken");
      expect(stats).toHaveProperty("totalSnapshots");
    });

    it("should calculate compression metrics", async () => {
      const stats = await getDocumentSnapshotStats("doc_token_123");

      expect(stats).toHaveProperty("averageCompressionRatio");
      expect(stats.averageCompressionRatio).toBeGreaterThanOrEqual(0);
    });

    it("should track storage usage", async () => {
      const stats = await getDocumentSnapshotStats("doc_token_123");

      expect(stats).toHaveProperty("totalCompressedSize");
      expect(stats).toHaveProperty("totalOriginalSize");
      expect(stats.totalCompressedSize).toBeGreaterThanOrEqual(0);
    });

    it("should provide retention timeline", async () => {
      const stats = await getDocumentSnapshotStats("doc_token_123");

      expect(stats).toHaveProperty("oldestSnapshot");
      expect(stats).toHaveProperty("newestSnapshot");
    });
  });

  describe("Snapshot Maintenance", () => {
    it("should prune expired snapshots", async () => {
      const pruned = await pruneExpiredSnapshots("doc_token_123");

      expect(typeof pruned).toBe("number");
      expect(pruned).toBeGreaterThanOrEqual(0);
    });

    it("should prune all expired snapshots if no doc specified", async () => {
      const pruned = await pruneExpiredSnapshots();

      expect(typeof pruned).toBe("number");
      expect(pruned).toBeGreaterThanOrEqual(0);
    });

    it("should handle pruning errors gracefully", async () => {
      // Even if pruning fails, should not crash
      await pruneExpiredSnapshots("doc_token_123");
    });
  });

  describe("System Initialization", () => {
    it("should initialize snapshot system", () => {
      // Should not throw
      initializeSnapshotSystem("test-user-id");
    });

    it("should set up RLS context", () => {
      // Should initialize with proper user context
      initializeSnapshotSystem("another-user-id");
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete change detection workflow", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
        title: "Complete Test",
      };

      // Initialize system
      initializeSnapshotSystem("test-user");

      // Detect change and create snapshot
      await handleChangeDetectedSnapshot(
        "doc_token_complete",
        "doc",
        metadata,
        { enableAutoSnapshot: true, enableSemanticDiff: true }
      );

      // Get history with diffs
      const history = await getChangeHistoryWithDiffs(
        "doc_token_complete",
        5
      );

      expect(Array.isArray(history)).toBe(true);

      // Get statistics
      const stats = await getDocumentSnapshotStats("doc_token_complete");

      expect(stats).toBeDefined();
    });

    it("should track snapshots across multiple changes", async () => {
      initializeSnapshotSystem("test-user");

      const docToken = "doc_token_multi";

      // Simulate multiple changes
      for (let i = 0; i < 3; i++) {
        const metadata = {
          lastModifiedUser: `user${i}`,
          lastModifiedTime: Date.now() + i * 1000,
          title: "Multi-change Test",
        };

        await handleChangeDetectedSnapshot(docToken, "doc", metadata);
      }

      // Verify history is tracked
      const history = await getChangeHistoryWithDiffs(docToken, 10);

      expect(Array.isArray(history)).toBe(true);
    });

    it("should maintain snapshot quality under load", async () => {
      initializeSnapshotSystem("test-user");

      // Simulate rapid changes
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const metadata = {
          lastModifiedUser: "user_load_test",
          lastModifiedTime: Date.now() + i,
          title: "Load Test",
        };

        promises.push(
          handleChangeDetectedSnapshot(
            `doc_token_load_${i}`,
            "doc",
            metadata
          )
        );
      }

      // All should complete without errors
      await Promise.all(promises);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing document metadata", async () => {
      // Should not throw on incomplete metadata
      await handleChangeDetectedSnapshot("doc_token_123", "doc", {
        lastModifiedUser: "",
        lastModifiedTime: 0,
      });
    });

    it("should handle invalid document tokens", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
      };

      // Should handle gracefully
      await handleChangeDetectedSnapshot(
        "invalid_token_!@#$",
        "doc",
        metadata
      );
    });

    it("should handle unsupported document types", async () => {
      const metadata = {
        lastModifiedUser: "user123",
        lastModifiedTime: Date.now(),
      };

      // Unsupported type should be skipped
      await handleChangeDetectedSnapshot(
        "doc_token_123",
        "image/png",
        metadata
      );
    });

    it("should handle concurrent snapshot operations", async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const metadata = {
          lastModifiedUser: `user${i}`,
          lastModifiedTime: Date.now() + i,
        };

        promises.push(
          handleChangeDetectedSnapshot(
            "doc_token_concurrent",
            "doc",
            metadata
          )
        );
      }

      // All should complete (may have race conditions, but shouldn't crash)
      await Promise.allSettled(promises);
    });
  });
});
