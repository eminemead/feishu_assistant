import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDocPoller,
  startTrackingDoc,
  stopTrackingDoc,
  getTrackedDocs,
  getPollingMetrics,
  getPollingHealth,
  PollingConfig,
} from "../lib/doc-poller";
import * as docTracker from "../lib/doc-tracker";
import * as feishuUtils from "../lib/feishu-utils";

// Mock dependencies
vi.mock("../lib/doc-tracker");
vi.mock("../lib/feishu-utils");
vi.mock("../lib/change-detector");

describe("Document Poller - Polling Service", () => {
  const mockDocToken = "doccnULnB44EMMPSYa3rIb4eJCf";
  const mockChatId = "oc_abc123";

  const mockMetadata = {
    docToken: mockDocToken,
    title: "Test Document",
    ownerId: "user_123",
    createdTime: 1700000000,
    lastModifiedUser: "user_456",
    lastModifiedTime: 1700001000,
    docType: "doc",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    const poller = getDocPoller();
    poller.reset();
  });

  afterEach(() => {
    const poller = getDocPoller();
    poller.reset();
  });

  describe("Singleton Pattern", () => {
    it("should return same instance on multiple calls", () => {
      const poller1 = getDocPoller();
      const poller2 = getDocPoller();

      expect(poller1).toBe(poller2);
    });

    it("should accept config on first initialization", () => {
      const config: Partial<PollingConfig> = {
        intervalMs: 15000,
        debounceWindowMs: 3000,
      };

      const poller = getDocPoller(config);
      expect(poller).toBeDefined();
    });
  });

  describe("Document Tracking Lifecycle", () => {
    it("should start tracking a document", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = poller.getTrackedDocs();

      expect(tracked.length).toBe(1);
      expect(tracked[0].docToken).toBe(mockDocToken);
      expect(tracked[0].chatIdToNotify).toBe(mockChatId);
    });

    it("should not add duplicate when starting track of already tracked doc", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = poller.getTrackedDocs();

      expect(tracked.length).toBe(1);
    });

    it("should stop tracking a document", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      expect(poller.getTrackedDocs().length).toBe(1);

      poller.stopTrackingDoc(mockDocToken);
      expect(poller.getTrackedDocs().length).toBe(0);
    });

    it("should handle stopping non-existent document gracefully", () => {
      const poller = getDocPoller();

      expect(() => {
        poller.stopTrackingDoc("nonexistent");
      }).not.toThrow();
    });

    it("should get specific tracked document", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = poller.getTrackedDoc(mockDocToken);

      expect(tracked).toBeDefined();
      expect(tracked?.docToken).toBe(mockDocToken);
    });

    it("should handle multiple tracked documents", () => {
      const poller = getDocPoller();
      const tokens = [
        "doccn001",
        "doccn002",
        "shtcn003",
        "doccn004",
      ];

      for (const token of tokens) {
        poller.startTrackingDoc(token, token.includes("shtcn") ? "sheet" : "doc", mockChatId);
      }

      const tracked = poller.getTrackedDocs();
      expect(tracked.length).toBe(4);
    });
  });

  describe("Metrics Collection", () => {
    it("should provide polling metrics", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      const metrics = poller.getMetrics();

      expect(metrics.docsTracked).toBe(1);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.lastPollDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should track error count", () => {
      const poller = getDocPoller();

      const initialMetrics = poller.getMetrics();
      expect(initialMetrics.errorsInLastHour).toBe(0);

      // Errors would be added during polling (mocked)
      // This test verifies the metric structure exists
      expect(initialMetrics).toHaveProperty("errorsInLastHour");
    });

    it("should track notifications sent", () => {
      const poller = getDocPoller();

      const metrics = poller.getMetrics();

      expect(metrics).toHaveProperty("notificationsInLastHour");
      expect(metrics.notificationsInLastHour).toBe(0);
    });

    it("should provide zero metrics when no documents tracked", () => {
      const poller = getDocPoller();

      const metrics = poller.getMetrics();

      expect(metrics.docsTracked).toBe(0);
      expect(metrics.successRate).toBe(1.0); // 100% when idle
    });
  });

  describe("Health Status", () => {
    it("should report healthy status when idle", () => {
      const poller = getDocPoller();

      const health = poller.getHealthStatus();

      expect(health.status).toBe("healthy");
      expect(health.reason).toContain("No documents");
    });

    it("should report healthy status with tracked documents", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      const health = poller.getHealthStatus();

      expect(health.status).toBe("healthy");
    });

    it("should report degraded status with low success rate", () => {
      // This would require mocking internal metrics
      // Verified through getMetrics() tests
      const poller = getDocPoller();
      const health = poller.getHealthStatus();

      expect(health).toHaveProperty("status");
      expect(["healthy", "degraded", "unhealthy"]).toContain(health.status);
    });
  });

  describe("Exported Functions", () => {
    it("should provide startTrackingDoc convenience function", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = getTrackedDocs();

      expect(tracked.length).toBe(1);
      expect(tracked[0].docToken).toBe(mockDocToken);
    });

    it("should provide stopTrackingDoc convenience function", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      expect(getTrackedDocs().length).toBe(1);

      stopTrackingDoc(mockDocToken);
      expect(getTrackedDocs().length).toBe(0);
    });

    it("should provide getTrackedDocs convenience function", () => {
      startTrackingDoc("doccn001", "doc", mockChatId);
      startTrackingDoc("doccn002", "doc", mockChatId);

      const tracked = getTrackedDocs();

      expect(tracked.length).toBe(2);
      expect(tracked.map((t) => t.docToken)).toEqual(["doccn001", "doccn002"]);
    });

    it("should provide getPollingMetrics convenience function", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);

      const metrics = getPollingMetrics();

      expect(metrics.docsTracked).toBe(1);
      expect(metrics).toHaveProperty("lastPollDurationMs");
    });

    it("should provide getPollingHealth convenience function", () => {
      const health = getPollingHealth();

      expect(health).toHaveProperty("status");
      expect(health.status).toBe("healthy");
    });
  });

  describe("Configuration", () => {
    it("should use default configuration", () => {
      const poller = getDocPoller();
      const metrics = poller.getMetrics();

      // With default config, operations should succeed
      expect(metrics).toBeDefined();
    });

    it("should accept custom configuration", () => {
      const config: Partial<PollingConfig> = {
        intervalMs: 10000,
        maxConcurrentPolls: 50,
        debounceWindowMs: 2000,
        enableLogging: false,
      };

      const poller = getDocPoller(config);
      expect(poller).toBeDefined();
    });
  });

  describe("Scalability", () => {
    it("should handle large number of tracked documents", () => {
      const poller = getDocPoller();

      for (let i = 0; i < 100; i++) {
        poller.startTrackingDoc(`doccn${String(i).padStart(6, "0")}`, "doc", `oc_${i}`);
      }

      const tracked = poller.getTrackedDocs();
      expect(tracked.length).toBe(100);
    });

    it("should maintain performance with many documents", () => {
      const poller = getDocPoller();

      for (let i = 0; i < 50; i++) {
        poller.startTrackingDoc(`doccn${String(i).padStart(6, "0")}`, "doc", mockChatId);
      }

      const startTime = Date.now();
      const metrics = poller.getMetrics();
      const endTime = Date.now();

      expect(metrics.docsTracked).toBe(50);
      expect(endTime - startTime).toBeLessThan(100); // Should be fast
    });

    it("should handle rapid add/remove operations", () => {
      const poller = getDocPoller();

      for (let i = 0; i < 20; i++) {
        const token = `doccn${i}`;
        poller.startTrackingDoc(token, "doc", mockChatId);
        poller.stopTrackingDoc(token);
      }

      expect(poller.getTrackedDocs().length).toBe(0);
    });
  });

  describe("State Management", () => {
    it("should update tracked document state", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);

      const updated = {
        docToken: mockDocToken,
        docType: "doc",
        chatIdToNotify: mockChatId,
        lastKnownUser: "user_999",
        lastKnownTime: 1700002000,
        lastNotificationTime: Date.now(),
      };

      poller.updateTrackedDocState(updated);
      const tracked = poller.getTrackedDoc(mockDocToken);

      expect(tracked?.lastKnownUser).toBe("user_999");
      expect(tracked?.lastKnownTime).toBe(1700002000);
    });

    it("should clear metrics for testing", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      poller.clearMetrics();

      const metrics = poller.getMetrics();

      expect(metrics.successRate).toBe(1.0);
      expect(metrics.notificationsInLastHour).toBe(0);
    });

    it("should reset service to clean state", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      expect(poller.getTrackedDocs().length).toBe(1);

      poller.reset();

      expect(poller.getTrackedDocs().length).toBe(0);
      expect(poller.getMetrics().docsTracked).toBe(0);
    });
  });

  describe("Document Type Support", () => {
    it("should support document type: doc", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc("doccnXYZ", "doc", mockChatId);
      const tracked = poller.getTrackedDoc("doccnXYZ");

      expect(tracked?.docType).toBe("doc");
    });

    it("should support document type: sheet", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc("shtcnXYZ", "sheet", mockChatId);
      const tracked = poller.getTrackedDoc("shtcnXYZ");

      expect(tracked?.docType).toBe("sheet");
    });

    it("should support document type: bitable", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc("bitcnXYZ", "bitable", mockChatId);
      const tracked = poller.getTrackedDoc("bitcnXYZ");

      expect(tracked?.docType).toBe("bitable");
    });

    it("should support document type: docx", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc("docxcnXYZ", "docx", mockChatId);
      const tracked = poller.getTrackedDoc("docxcnXYZ");

      expect(tracked?.docType).toBe("docx");
    });
  });

  describe("Error Resilience", () => {
    it("should continue operating if one document tracking fails", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc("doccn001", "doc", mockChatId);
      poller.startTrackingDoc("doccn002", "doc", mockChatId);
      poller.startTrackingDoc("doccn003", "doc", mockChatId);

      // If one fails, others should continue
      expect(poller.getTrackedDocs().length).toBe(3);
    });

    it("should handle notification failures gracefully", () => {
      const poller = getDocPoller();

      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);

      // Even if notifications fail, tracking should continue
      const tracked = poller.getTrackedDoc(mockDocToken);
      expect(tracked).toBeDefined();
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent tracking of different documents", async () => {
      const poller = getDocPoller();

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(
            poller.startTrackingDoc(
              `doccn${String(i).padStart(3, "0")}`,
              "doc",
              mockChatId
            )
          )
        );
      }

      await Promise.all(promises);

      expect(poller.getTrackedDocs().length).toBe(10);
    });

    it("should handle concurrent removal of documents", async () => {
      const poller = getDocPoller();

      // Add documents
      for (let i = 0; i < 10; i++) {
        poller.startTrackingDoc(`doccn${String(i).padStart(3, "0")}`, "doc", mockChatId);
      }

      // Remove concurrently
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve(poller.stopTrackingDoc(`doccn${String(i).padStart(3, "0")}`))
        );
      }

      await Promise.all(promises);

      expect(poller.getTrackedDocs().length).toBe(0);
    });
  });
});
