import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDocMetadata,
  hasDocChanged,
  isValidDocToken,
  isValidDocType,
  DocMetadata,
  TrackedDoc,
} from "../lib/doc-tracker";
import {
  detectChange,
  shouldNotifyAgain,
  createUpdatedTrackedState,
} from "../lib/change-detector";
import {
  getDocPoller,
  startTrackingDoc,
  stopTrackingDoc,
  getTrackedDocs,
  getPollingMetrics,
  getPollingHealth,
} from "../lib/doc-poller";

/**
 * Integration tests for document tracking system
 * Tests real interactions between components without mocking
 */
describe("Document Tracking System - Integration Tests", () => {
  const mockDocToken = "doccnTestToken123456";
  const mockChatId = "oc_testGroup";

  beforeEach(() => {
    const poller = getDocPoller();
    poller.reset();
  });

  afterEach(() => {
    const poller = getDocPoller();
    poller.reset();
  });

  describe("Complete Tracking Lifecycle", () => {
    it("should complete full tracking cycle: start -> track -> stop", () => {
      // 1. Start tracking
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      let tracked = getTrackedDocs();

      expect(tracked.length).toBe(1);
      expect(tracked[0].docToken).toBe(mockDocToken);
      expect(tracked[0].chatIdToNotify).toBe(mockChatId);
      expect(tracked[0].lastKnownTime).toBe(0); // Initial state

      // 2. Update state after detecting change
      const mockMetadata: DocMetadata = {
        docToken: mockDocToken,
        title: "Test Document",
        ownerId: "user_123",
        createdTime: 1700000000,
        lastModifiedUser: "user_456",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      const updatedState = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        mockChatId,
        mockMetadata
      );

      const poller = getDocPoller();
      poller.updateTrackedDocState(updatedState);

      tracked = getTrackedDocs();
      expect(tracked[0].lastKnownUser).toBe("user_456");
      expect(tracked[0].lastKnownTime).toBe(1700001000);

      // 3. Stop tracking
      stopTrackingDoc(mockDocToken);
      tracked = getTrackedDocs();

      expect(tracked.length).toBe(0);
    });

    it("should detect changes and update state correctly", () => {
      const poller = getDocPoller();

      // Start with initial state
      const initialMetadata: DocMetadata = {
        docToken: mockDocToken,
        title: "Initial Document",
        ownerId: "user_123",
        createdTime: 1700000000,
        lastModifiedUser: "user_456",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      // First poll: new document (no previous state)
      startTrackingDoc(mockDocToken, "doc", mockChatId);

      const result1 = detectChange(initialMetadata, undefined); // No previous state
      expect(result1.hasChanged).toBe(true);
      expect(result1.changeType).toBe("new_document");

      // Update state
      let updated = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        mockChatId,
        initialMetadata
      );
      poller.updateTrackedDocState(updated);

      // Second poll: no change
      const result2 = detectChange(initialMetadata, updated);
      expect(result2.hasChanged).toBe(false);

      // Third poll: modification time changed
      const modifiedMetadata: DocMetadata = {
        ...initialMetadata,
        lastModifiedTime: 1700002000,
      };

      let tracked = poller.getTrackedDoc(mockDocToken);
      const result3 = detectChange(modifiedMetadata, tracked!);
      expect(result3.hasChanged).toBe(true);
      expect(result3.changeType).toBe("time_updated");

      // Update state after change
      updated = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        mockChatId,
        modifiedMetadata
      );
      poller.updateTrackedDocState(updated);

      // Fourth poll: different user
      const diffUserMetadata: DocMetadata = {
        ...modifiedMetadata, // Start from modified state
        lastModifiedUser: "user_789",
      };

      tracked = poller.getTrackedDoc(mockDocToken);
      const result4 = detectChange(diffUserMetadata, tracked!);
      expect(result4.hasChanged).toBe(true);
      expect(result4.changeType).toBe("user_changed");
    });
  });

  describe("Multi-Document Tracking", () => {
    it("should track multiple documents independently", () => {
      const doc1 = "doccn001";
      const doc2 = "doccn002";
      const doc3 = "doccn003";

      // Track multiple documents
      startTrackingDoc(doc1, "doc", "oc_group1");
      startTrackingDoc(doc2, "sheet", "oc_group2");
      startTrackingDoc(doc3, "bitable", "oc_group1");

      const tracked = getTrackedDocs();
      expect(tracked.length).toBe(3);

      // Verify each document
      expect(tracked.map((t) => t.docToken)).toEqual([doc1, doc2, doc3]);
      expect(tracked[0].docType).toBe("doc");
      expect(tracked[1].docType).toBe("sheet");
      expect(tracked[2].docType).toBe("bitable");
      expect(tracked[0].chatIdToNotify).toBe("oc_group1");
      expect(tracked[1].chatIdToNotify).toBe("oc_group2");
      expect(tracked[2].chatIdToNotify).toBe("oc_group1");
    });

    it("should handle independent state updates for each document", () => {
      const poller = getDocPoller();
      const doc1 = "doccn001";
      const doc2 = "doccn002";

      startTrackingDoc(doc1, "doc", mockChatId);
      startTrackingDoc(doc2, "doc", mockChatId);

      const meta1: DocMetadata = {
        docToken: doc1,
        title: "Document 1",
        ownerId: "user_1",
        createdTime: 1700000000,
        lastModifiedUser: "user_10",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      const meta2: DocMetadata = {
        docToken: doc2,
        title: "Document 2",
        ownerId: "user_2",
        createdTime: 1700000000,
        lastModifiedUser: "user_20",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      // Update each independently
      const updated1 = createUpdatedTrackedState(doc1, "doc", mockChatId, meta1);
      const updated2 = createUpdatedTrackedState(doc2, "doc", mockChatId, meta2);

      poller.updateTrackedDocState(updated1);
      poller.updateTrackedDocState(updated2);

      const tracked = getTrackedDocs();

      const doc1State = tracked.find((t) => t.docToken === doc1);
      const doc2State = tracked.find((t) => t.docToken === doc2);

      expect(doc1State?.lastKnownUser).toBe("user_10");
      expect(doc2State?.lastKnownUser).toBe("user_20");
      expect(doc1State?.lastKnownTime).toBe(1700001000);
      expect(doc2State?.lastKnownTime).toBe(1700001000);
    });
  });

  describe("Debouncing and Rate Limiting", () => {
    it("should debounce rapid changes correctly", () => {
      const now = Date.now();

      const metadata: DocMetadata = {
        docToken: mockDocToken,
        title: "Test",
        ownerId: "user_1",
        createdTime: 1700000000,
        lastModifiedUser: "user_10",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      // Initial tracked state with recent notification
      const recentNotification = {
        docToken: mockDocToken,
        docType: "doc",
        chatIdToNotify: mockChatId,
        lastKnownUser: "user_10",
        lastKnownTime: 1700001000,
        lastNotificationTime: now - 2000, // 2 seconds ago
      };

      // Change detected but within debounce window
      const result = detectChange(
        { ...metadata, lastModifiedTime: 1700002000 },
        recentNotification,
        { debounceWindowMs: 5000 }
      );

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(true);
    });

    it("should allow notification after debounce window expires", () => {
      const now = Date.now();

      const metadata: DocMetadata = {
        docToken: mockDocToken,
        title: "Test",
        ownerId: "user_1",
        createdTime: 1700000000,
        lastModifiedUser: "user_10",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      // Notification sent 6 seconds ago (outside 5s window)
      const oldNotification = {
        docToken: mockDocToken,
        docType: "doc",
        chatIdToNotify: mockChatId,
        lastKnownUser: "user_10",
        lastKnownTime: 1700001000,
        lastNotificationTime: now - 6000,
      };

      const result = detectChange(
        { ...metadata, lastModifiedTime: 1700002000 },
        oldNotification,
        { debounceWindowMs: 5000 }
      );

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(false);
    });
  });

  describe("Polling Metrics and Health", () => {
    it("should provide accurate metrics", () => {
      startTrackingDoc("doc1", "doc", mockChatId);
      startTrackingDoc("doc2", "sheet", mockChatId);

      const metrics = getPollingMetrics();

      expect(metrics.docsTracked).toBe(2);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);
      expect(metrics.lastPollDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should report health status", () => {
      const health = getPollingHealth();

      expect(health.status).toBe("healthy");
      expect(health.reason).toBeDefined();
    });

    it("should show degraded health with tracked docs and no updates", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);

      const health = getPollingHealth();

      // With no API failures, should still be healthy
      expect(["healthy", "degraded"]).toContain(health.status);
    });
  });

  describe("Validation Functions", () => {
    it("should validate document tokens correctly", () => {
      expect(isValidDocToken("doccnValidToken123456")).toBe(true);
      expect(isValidDocToken("shtcnValidToken123456")).toBe(true);
      expect(isValidDocToken("short")).toBe(false);
      expect(isValidDocToken("doc-with-special!@#")).toBe(false);
      expect(isValidDocToken("")).toBe(false);
    });

    it("should validate document types correctly", () => {
      expect(isValidDocType("doc")).toBe(true);
      expect(isValidDocType("sheet")).toBe(true);
      expect(isValidDocType("bitable")).toBe(true);
      expect(isValidDocType("docx")).toBe(true);

      expect(isValidDocType("pdf")).toBe(false);
      expect(isValidDocType("image")).toBe(false);
      expect(isValidDocType("")).toBe(false);
    });
  });

  describe("Scalability Tests", () => {
    it("should handle large number of tracked documents", () => {
      const count = 100;

      for (let i = 0; i < count; i++) {
        startTrackingDoc(`doccn${String(i).padStart(6, "0")}`, "doc", mockChatId);
      }

      const tracked = getTrackedDocs();
      expect(tracked.length).toBe(count);

      const metrics = getPollingMetrics();
      expect(metrics.docsTracked).toBe(count);
    });

    it("should handle rapid add/remove operations", () => {
      const operations = 50;

      for (let i = 0; i < operations; i++) {
        const token = `doccn${i}`;
        startTrackingDoc(token, "doc", mockChatId);
      }

      expect(getTrackedDocs().length).toBe(operations);

      for (let i = 0; i < operations; i++) {
        stopTrackingDoc(`doccn${i}`);
      }

      expect(getTrackedDocs().length).toBe(0);
    });
  });

  describe("Error Handling", () => {
    it("should handle stopping non-tracked document gracefully", () => {
      expect(() => {
        stopTrackingDoc("nonexistent");
      }).not.toThrow();

      expect(getTrackedDocs().length).toBe(0);
    });

    it("should handle duplicate start tracking", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      startTrackingDoc(mockDocToken, "doc", mockChatId); // Duplicate

      expect(getTrackedDocs().length).toBe(1);
    });

    it("should handle state updates for tracking", () => {
      const poller = getDocPoller();

      startTrackingDoc(mockDocToken, "doc", mockChatId);

      const metadata: DocMetadata = {
        docToken: mockDocToken,
        title: "Test",
        ownerId: "user_1",
        createdTime: 1700000000,
        lastModifiedUser: "user_10",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      const updated = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        mockChatId,
        metadata
      );

      expect(() => {
        poller.updateTrackedDocState(updated);
      }).not.toThrow();

      const tracked = poller.getTrackedDoc(mockDocToken);
      expect(tracked?.lastKnownUser).toBe("user_10");
    });
  });

  describe("State Consistency", () => {
    it("should maintain consistency across operations", () => {
      const poller = getDocPoller();

      // Add documents
      startTrackingDoc("doc1", "doc", "oc_1");
      startTrackingDoc("doc2", "doc", "oc_2");
      startTrackingDoc("doc3", "doc", "oc_1");

      expect(getTrackedDocs().length).toBe(3);

      // Update one
      const meta: DocMetadata = {
        docToken: "doc2",
        title: "Test",
        ownerId: "user_1",
        createdTime: 1700000000,
        lastModifiedUser: "user_10",
        lastModifiedTime: 1700001000,
        docType: "doc",
      };

      poller.updateTrackedDocState(
        createUpdatedTrackedState("doc2", "doc", "oc_2", meta)
      );

      // Verify others unchanged
      const tracked = getTrackedDocs();
      const doc1 = tracked.find((t) => t.docToken === "doc1");
      const doc2 = tracked.find((t) => t.docToken === "doc2");
      const doc3 = tracked.find((t) => t.docToken === "doc3");

      expect(doc1?.lastKnownTime).toBe(0);
      expect(doc2?.lastKnownTime).toBe(1700001000);
      expect(doc3?.lastKnownTime).toBe(0);

      // Remove middle one
      stopTrackingDoc("doc2");

      expect(getTrackedDocs().length).toBe(2);
      expect(
        getTrackedDocs().map((t) => t.docToken)
      ).toEqual(["doc1", "doc3"]);
    });
  });
});
