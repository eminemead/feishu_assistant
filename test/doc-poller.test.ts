import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDocPoller,
  startTrackingDoc,
  stopTrackingDoc,
  getTrackedDocs,
  getPollingMetrics,
  getPollingHealth,
  PollingConfig,
} from "../lib/doc-poller";

describe("Document Poller - Polling Service", () => {
  const mockDocToken = "doccnULnB44EMMPSYa3rIb4eJCf";
  const mockChatId = "oc_abc123";

  let poller: ReturnType<typeof getDocPoller>;

  beforeEach(() => {
    // Get fresh instance for each test
    poller = getDocPoller();
    poller.reset();
  });

  afterEach(() => {
    poller.reset();
  });

  describe("Service Initialization", () => {
    it("should initialize with default config", () => {
      expect(poller).toBeDefined();
    });

    it("should return singleton instance", () => {
      const poller1 = getDocPoller();
      const poller2 = getDocPoller();
      expect(poller1).toBe(poller2);
    });
  });

  describe("Document Tracking Lifecycle", () => {
    it("should start tracking a document", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(1);
      expect(tracked[0].docToken).toBe(mockDocToken);
    });

    it("should stop tracking a document", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      stopTrackingDoc(mockDocToken);
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(0);
    });

    it("should handle tracking multiple documents", () => {
      const docTokens = ["doc1", "doc2", "doc3"];
      
      for (const token of docTokens) {
        startTrackingDoc(token, "doc", mockChatId);
      }
      
      const tracked = getTrackedDocs();
      expect(tracked.length).toBe(3);
    });
  });

  describe("Error Handling", () => {
    it("should handle stopping non-tracked document gracefully", () => {
      stopTrackingDoc("nonexistent");
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(0);
    });

    it("should handle duplicate start tracking", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(1);
    });
  });

  describe("Polling State Management", () => {
    it("should return empty list when no documents tracked", () => {
      const tracked = getTrackedDocs();
      expect(tracked).toEqual([]);
    });

    it("should return correct tracked documents", () => {
      startTrackingDoc("doc1", "doc", "oc_1");
      startTrackingDoc("doc2", "sheet", "oc_2");
      
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(2);
      expect(tracked.map(d => d.docToken)).toContain("doc1");
      expect(tracked.map(d => d.docToken)).toContain("doc2");
    });

    it("should maintain consistency across operations", () => {
      startTrackingDoc("doc1", "doc", "oc_1");
      startTrackingDoc("doc2", "doc", "oc_2");
      startTrackingDoc("doc3", "doc", "oc_1");
      stopTrackingDoc("doc2");
      
      const tracked = getTrackedDocs();
      
      expect(tracked.length).toBe(2);
      expect(tracked.map(d => d.docToken)).not.toContain("doc2");
    });
  });

  describe("Polling Metrics", () => {
    it("should expose polling metrics", () => {
      startTrackingDoc(mockDocToken, "doc", mockChatId);
      const metrics = getPollingMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.docsTracked).toBeGreaterThan(0);
    });

    it("should update metrics when docs are tracked", () => {
      const metrics1 = getPollingMetrics();
      const count1 = metrics1.docsTracked;
      
      startTrackingDoc("doc1", "doc", mockChatId);
      startTrackingDoc("doc2", "doc", mockChatId);
      
      const metrics2 = getPollingMetrics();
      const count2 = metrics2.docsTracked;
      
      expect(count2).toBeGreaterThan(count1);
    });
  });

  describe("Service Reset", () => {
    it("should reset service state", () => {
      poller.startTrackingDoc(mockDocToken, "doc", mockChatId);
      expect(poller.getTrackedDocs().length).toBe(1);
      
      poller.reset();
      
      expect(poller.getTrackedDocs().length).toBe(0);
    });
  });
});
