import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  detectChange,
  shouldNotifyAgain,
  getTimeSinceLastNotification,
  formatDetectionResult,
  createUpdatedTrackedState,
  analyzeChangePattern,
  ChangeDetectionResult,
} from "../lib/change-detector";
import { DocMetadata, TrackedDoc } from "../lib/doc-tracker";

describe("Change Detector - Change Detection Algorithm", () => {
  const mockDocToken = "doccnULnB44EMMPSYa3rIb4eJCf";

  const mockMetadata: DocMetadata = {
    docToken: mockDocToken,
    title: "Test Document",
    ownerId: "user_123",
    createdTime: 1700000000,
    lastModifiedUser: "user_456",
    lastModifiedTime: 1700001000,
    docType: "doc",
  };

  const mockTrackedDoc: TrackedDoc = {
    docToken: mockDocToken,
    docType: "doc",
    chatIdToNotify: "oc_abc123",
    lastKnownUser: "user_456",
    lastKnownTime: 1700001000,
    lastNotificationTime: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectChange()", () => {
    it("should detect new document (first time tracking)", () => {
      const result = detectChange(mockMetadata, undefined);

      expect(result.hasChanged).toBe(true);
      expect(result.changeType).toBe("new_document");
      expect(result.debounced).toBe(false);
      expect(result.reason).toContain("First time");
    });

    it("should detect time change", () => {
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = mockTrackedDoc;

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(true);
      expect(result.changeType).toBe("time_updated");
      expect(result.debounced).toBe(false);
    });

    it("should detect user change", () => {
      const current = { ...mockMetadata, lastModifiedUser: "user_789" };
      const previous = mockTrackedDoc;

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(true);
      expect(result.changeType).toBe("user_changed");
      expect(result.debounced).toBe(false);
    });

    it("should not detect change when nothing changed", () => {
      const current = mockMetadata;
      const previous = mockTrackedDoc;

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(false);
      expect(result.debounced).toBe(false);
      expect(result.reason).toContain("No metadata change");
    });

    it("should debounce rapid successive changes", () => {
      const now = Date.now();
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = {
        ...mockTrackedDoc,
        lastNotificationTime: now - 2000, // Notified 2 seconds ago
      };

      const result = detectChange(current, previous, {
        debounceWindowMs: 5000,
        enableLogging: false,
      });

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(true);
      expect(result.reason).toContain("Debounced");
    });

    it("should not debounce if enough time passed", () => {
      const now = Date.now();
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = {
        ...mockTrackedDoc,
        lastNotificationTime: now - 6000, // Notified 6 seconds ago
      };

      const result = detectChange(current, previous, {
        debounceWindowMs: 5000,
        enableLogging: false,
      });

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(false);
    });

    it("should handle simultaneous multi-user edits", () => {
      const current = {
        ...mockMetadata,
        lastModifiedTime: 1700002000,
        lastModifiedUser: "user_789",
      };
      const previous = {
        ...mockTrackedDoc,
        lastNotificationTime: Date.now() - 10000, // Notified 10s ago
      };

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(false);
      expect(result.previousUser).toBe("user_456");
      expect(result.currentUser).toBe("user_789");
    });

    it("should handle clock skew", () => {
      // Time went backward (clock skew)
      const current = { ...mockMetadata, lastModifiedTime: 1700000500 };
      const previous = mockTrackedDoc;

      const result = detectChange(current, previous);

      // Should not detect change if time went backward
      expect(result.hasChanged).toBe(false);
    });

    it("should include detailed information in result", () => {
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = mockTrackedDoc;

      const result = detectChange(current, previous);

      expect(result.previousUser).toBe("user_456");
      expect(result.previousTime).toBe(1700001000);
      expect(result.currentUser).toBe("user_456");
      expect(result.currentTime).toBe(1700002000);
      expect(result.changedAt).toBeInstanceOf(Date);
    });
  });

  describe("shouldNotifyAgain()", () => {
    it("should allow notification after interval has passed", () => {
      const lastTime = Date.now() - 6000; // 6 seconds ago
      const result = shouldNotifyAgain(lastTime, 5000); // 5 second minimum

      expect(result).toBe(true);
    });

    it("should block notification before interval has passed", () => {
      const lastTime = Date.now() - 3000; // 3 seconds ago
      const result = shouldNotifyAgain(lastTime, 5000); // 5 second minimum

      expect(result).toBe(false);
    });

    it("should use default 5 second interval", () => {
      const lastTime = Date.now() - 6000;
      const result = shouldNotifyAgain(lastTime);

      expect(result).toBe(true);
    });

    it("should handle edge case at exact boundary", () => {
      const now = Date.now();
      const lastTime = now - 5000; // Exactly 5 seconds ago
      const result = shouldNotifyAgain(lastTime, 5000);

      expect(result).toBe(true); // >= not <
    });
  });

  describe("getTimeSinceLastNotification()", () => {
    it("should calculate time since last notification", () => {
      const lastTime = Date.now() - 3000;
      const result = getTimeSinceLastNotification(lastTime);

      expect(result).toBe(3); // Should be 3 seconds (rounded)
    });

    it("should return 0 for very recent notification", () => {
      const lastTime = Date.now() - 100; // 100ms ago
      const result = getTimeSinceLastNotification(lastTime);

      expect(result).toBe(0);
    });

    it("should handle old timestamps", () => {
      const lastTime = Date.now() - 3600000; // 1 hour ago
      const result = getTimeSinceLastNotification(lastTime);

      expect(result).toBe(3600);
    });
  });

  describe("formatDetectionResult()", () => {
    it("should format detected change", () => {
      const result: ChangeDetectionResult = {
        hasChanged: true,
        debounced: false,
        currentUser: "user_456",
        currentTime: 1700002000,
        changedAt: new Date(),
        reason: "Document updated by user_456",
      };

      const formatted = formatDetectionResult(result);

      expect(formatted).toContain("✅ DETECTED");
      expect(formatted).toContain("Document updated");
    });

    it("should format debounced change", () => {
      const result: ChangeDetectionResult = {
        hasChanged: true,
        debounced: true,
        currentUser: "user_456",
        currentTime: 1700002000,
        changedAt: new Date(),
        reason: "Debounced: change within 5000ms",
      };

      const formatted = formatDetectionResult(result);

      expect(formatted).toContain("⏸️  DEBOUNCED");
    });

    it("should format no change", () => {
      const result: ChangeDetectionResult = {
        hasChanged: false,
        debounced: false,
        currentUser: "user_456",
        currentTime: 1700001000,
        changedAt: new Date(),
        reason: "No metadata change",
      };

      const formatted = formatDetectionResult(result);

      expect(formatted).toContain("⊘ NO CHANGE");
    });
  });

  describe("createUpdatedTrackedState()", () => {
    it("should create updated state with current metadata", () => {
      const beforeTime = Date.now();
      const updated = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        "oc_abc123",
        mockMetadata
      );
      const afterTime = Date.now();

      expect(updated.docToken).toBe(mockDocToken);
      expect(updated.docType).toBe("doc");
      expect(updated.chatIdToNotify).toBe("oc_abc123");
      expect(updated.lastKnownUser).toBe("user_456");
      expect(updated.lastKnownTime).toBe(1700001000);
      expect(updated.lastNotificationTime).toBeGreaterThanOrEqual(beforeTime);
      expect(updated.lastNotificationTime).toBeLessThanOrEqual(afterTime);
    });

    it("should update notification time to current", () => {
      const beforeTime = Date.now();
      const updated = createUpdatedTrackedState(
        mockDocToken,
        "doc",
        "oc_abc123",
        mockMetadata
      );

      expect(updated.lastNotificationTime).toBeGreaterThanOrEqual(beforeTime);
      expect(updated.lastNotificationTime).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("analyzeChangePattern()", () => {
    it("should analyze change patterns", () => {
      const results: ChangeDetectionResult[] = [
        {
          hasChanged: true,
          debounced: false,
          changeType: "time_updated",
          currentUser: "user_456",
          currentTime: 1700001000,
          changedAt: new Date(Date.now() - 10000),
          reason: "Change 1",
        },
        {
          hasChanged: true,
          debounced: false,
          changeType: "user_changed",
          currentUser: "user_789",
          currentTime: 1700002000,
          changedAt: new Date(Date.now() - 5000),
          reason: "Change 2",
        },
        {
          hasChanged: true,
          debounced: true,
          currentUser: "user_123",
          currentTime: 1700003000,
          changedAt: new Date(Date.now()),
          reason: "Change 3 (debounced)",
        },
      ];

      const analysis = analyzeChangePattern(results);

      expect(analysis.totalChanges).toBe(3);
      expect(analysis.totalDebounced).toBe(1);
      expect(analysis.uniqueUsers.has("user_456")).toBe(true);
      expect(analysis.uniqueUsers.has("user_789")).toBe(true);
      expect(analysis.uniqueUsers.has("user_123")).toBe(false); // Debounced, not counted
      expect(analysis.averageChangeInterval).toBeGreaterThan(0);
    });

    it("should handle single change", () => {
      const results: ChangeDetectionResult[] = [
        {
          hasChanged: true,
          debounced: false,
          changeType: "new_document",
          currentUser: "user_456",
          currentTime: 1700001000,
          changedAt: new Date(),
          reason: "New document",
        },
      ];

      const analysis = analyzeChangePattern(results);

      expect(analysis.totalChanges).toBe(1);
      expect(analysis.totalDebounced).toBe(0);
      expect(analysis.uniqueUsers.size).toBe(1);
      expect(analysis.averageChangeInterval).toBe(0); // Single change
    });

    it("should identify all unique users in changes", () => {
      const results: ChangeDetectionResult[] = [
        {
          hasChanged: true,
          debounced: false,
          currentUser: "alice",
          currentTime: 1700001000,
          changedAt: new Date(),
        } as ChangeDetectionResult,
        {
          hasChanged: true,
          debounced: false,
          currentUser: "bob",
          currentTime: 1700002000,
          changedAt: new Date(),
        } as ChangeDetectionResult,
        {
          hasChanged: true,
          debounced: false,
          currentUser: "charlie",
          currentTime: 1700003000,
          changedAt: new Date(),
        } as ChangeDetectionResult,
      ];

      const analysis = analyzeChangePattern(results);

      expect(analysis.uniqueUsers.size).toBe(3);
      expect(analysis.uniqueUsers.has("alice")).toBe(true);
      expect(analysis.uniqueUsers.has("bob")).toBe(true);
      expect(analysis.uniqueUsers.has("charlie")).toBe(true);
    });
  });

  describe("Edge cases and robustness", () => {
    it("should handle very old notifications (time overflow)", () => {
      const veryOldTime = 1000000000; // Timestamp from 2001
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = {
        ...mockTrackedDoc,
        lastNotificationTime: veryOldTime,
      };

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(true);
      expect(result.debounced).toBe(false);
    });

    it("should handle timestamp at Unix epoch boundary", () => {
      const current = mockMetadata;
      const previous = {
        ...mockTrackedDoc,
        lastKnownTime: 0, // Epoch
      };

      const result = detectChange(current, previous);

      expect(result.hasChanged).toBe(true);
    });

    it("should handle rapid changes from same user", () => {
      const now = Date.now();
      const baseTime = 1700000000;

      // First iteration: initial change detection (no debounce)
      const current1 = {
        ...mockMetadata,
        lastModifiedTime: baseTime + 100,
      };
      const previous1 = {
        ...mockTrackedDoc,
        lastKnownTime: baseTime,
        lastNotificationTime: 0, // No previous notification
      };

      const result1 = detectChange(current1, previous1, {
        debounceWindowMs: 5000,
        enableLogging: false,
      });
      expect(result1.debounced).toBe(false); // First change not debounced

      // Second iteration: change within debounce window
      const current2 = {
        ...mockMetadata,
        lastModifiedTime: baseTime + 200,
      };
      const previous2 = {
        ...mockTrackedDoc,
        lastKnownTime: baseTime + 100,
        lastNotificationTime: now - 2000, // Notified 2 seconds ago (within 5s window)
      };

      const result2 = detectChange(current2, previous2, {
        debounceWindowMs: 5000,
        enableLogging: false,
      });
      expect(result2.debounced).toBe(true); // Second change debounced

      // Third iteration: change after debounce window expires
      const current3 = {
        ...mockMetadata,
        lastModifiedTime: baseTime + 300,
      };
      const previous3 = {
        ...mockTrackedDoc,
        lastKnownTime: baseTime + 200,
        lastNotificationTime: now - 6000, // Notified 6 seconds ago (outside 5s window)
      };

      const result3 = detectChange(current3, previous3, {
        debounceWindowMs: 5000,
        enableLogging: false,
      });
      expect(result3.debounced).toBe(false); // Third change not debounced
    });
  });
});
