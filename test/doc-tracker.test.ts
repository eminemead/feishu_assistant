import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMocks } from "./test-utils";

// Import real implementations (these tests are unit tests with manual mocks, not vi.mock)
import {
  getDocMetadata,
  hasDocChanged,
  formatDocChange,
  formatDocMetadataForJSON,
  clearMetadataCache,
  getMetadataCacheStats,
  isValidDocToken,
  isValidDocType,
  DocMetadata,
  TrackedDoc,
} from "../lib/doc-tracker";

describe("Doc Tracker - Document Metadata Functions", () => {
  const mockDocToken = "doccnULnB44EMMPSYa3rIb4eJCf";
  const mockDocType = "doc";

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
    lastNotificationTime: 1700000900,
  };

  beforeEach(() => {
    clearMetadataCache();
    vi.clearAllMocks();
  });

  describe("hasDocChanged()", () => {
    it("should detect change when modification time changes", () => {
      const current = { ...mockMetadata, lastModifiedTime: 1700002000 };
      const previous = mockTrackedDoc;

      const hasChanged = hasDocChanged(current, previous);

      expect(hasChanged).toBe(true);
    });

    it("should detect change when different user modifies", () => {
      const current = { ...mockMetadata, lastModifiedUser: "user_789" };
      const previous = mockTrackedDoc;

      const hasChanged = hasDocChanged(current, previous);

      expect(hasChanged).toBe(true);
    });

    it("should not detect change when nothing changed", () => {
      const current = mockMetadata;
      const previous = mockTrackedDoc;

      const hasChanged = hasDocChanged(current, previous);

      expect(hasChanged).toBe(false);
    });

    it("should detect change when tracking document for first time (no previous)", () => {
      const current = mockMetadata;

      const hasChanged = hasDocChanged(current);

      expect(hasChanged).toBe(true);
    });

    it("should detect change when same user makes another edit", () => {
      const current = {
        ...mockMetadata,
        lastModifiedTime: 1700002000,
        lastModifiedUser: "user_456",
      };
      const previous = mockTrackedDoc;

      const hasChanged = hasDocChanged(current, previous);

      expect(hasChanged).toBe(true);
    });

    it("should detect simultaneous multi-user changes", () => {
      const current = {
        ...mockMetadata,
        lastModifiedUser: "user_999", // Different editor
      };
      const previous = mockTrackedDoc;

      const hasChanged = hasDocChanged(current, previous);

      expect(hasChanged).toBe(true);
    });
  });

  describe("formatDocChange()", () => {
    it("should format document change for display", () => {
      const formatted = formatDocChange(mockMetadata);

      expect(formatted).toContain("📝");
      expect(formatted).toContain("Test Document");
      expect(formatted).toContain("user_456");
    });

    it("should include modification timestamp", () => {
      const formatted = formatDocChange(mockMetadata);

      // Should contain ISO date or localized date
      expect(formatted).toMatch(/\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/);
    });

    it("should handle special characters in document title", () => {
      const metadata = {
        ...mockMetadata,
        title: "OKR Q1 2025 - 目标 & KPI [DRAFT]",
      };

      const formatted = formatDocChange(metadata);

      expect(formatted).toContain("OKR Q1 2025 - 目标 & KPI [DRAFT]");
    });
  });

  describe("formatDocMetadataForJSON()", () => {
    it("should format metadata for JSON output", () => {
      const formatted = formatDocMetadataForJSON(mockMetadata);

      // Verify structure without hardcoded timestamps (which vary by timezone)
      expect(formatted).toHaveProperty("docToken", mockDocToken);
      expect(formatted).toHaveProperty("title", "Test Document");
      expect(formatted).toHaveProperty("docType", "doc");
      expect(formatted).toHaveProperty("ownerId", "user_123");
      expect(formatted).toHaveProperty("lastModifiedBy", "user_456");
      expect(formatted).toHaveProperty("createdAt");
      expect(formatted).toHaveProperty("lastModifiedAt");
    });

    it("should convert unix timestamps to ISO format", () => {
      const formatted = formatDocMetadataForJSON(mockMetadata);

      expect(formatted.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(formatted.lastModifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("clearMetadataCache()", () => {
    it("should clear cache without errors", () => {
      clearMetadataCache();
      const stats = getMetadataCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe("getMetadataCacheStats()", () => {
    it("should return cache statistics", () => {
      const stats = getMetadataCacheStats();

      expect(stats.size).toBeDefined();
      expect(stats.ttlMs).toBe(30000); // 30 seconds
    });
  });

  describe("isValidDocToken()", () => {
    it("should validate correct document tokens", () => {
      expect(isValidDocToken("doccnULnB44EMMPSYa3rIb4eJCf")).toBe(true);
      expect(isValidDocToken("docabcdef1234567890")).toBe(true);
    });

    it("should reject short tokens", () => {
      expect(isValidDocToken("short")).toBe(false);
    });

    it("should reject tokens with special characters", () => {
      expect(isValidDocToken("doc-cn-123!@#")).toBe(false);
    });

    it("should reject empty tokens", () => {
      expect(isValidDocToken("")).toBe(false);
    });
  });

  describe("isValidDocType()", () => {
    it("should validate supported document types", () => {
      expect(isValidDocType("doc")).toBe(true);
      expect(isValidDocType("sheet")).toBe(true);
      expect(isValidDocType("bitable")).toBe(true);
      expect(isValidDocType("docx")).toBe(true);
    });

    it("should reject unsupported document types", () => {
      expect(isValidDocType("pdf")).toBe(false);
      expect(isValidDocType("image")).toBe(false);
      expect(isValidDocType("")).toBe(false);
    });
  });
});
