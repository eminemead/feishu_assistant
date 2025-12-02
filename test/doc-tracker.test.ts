import { describe, it, expect, beforeEach, vi } from "vitest";
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

// Mock the Feishu SDK client
vi.mock("../lib/feishu-utils", () => {
  const mockRequest = vi.fn();
  return {
    client: {
      request: mockRequest,
    },
  };
});

import { client } from "../lib/feishu-utils";

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

  describe("getDocMetadata()", () => {
    it("should fetch document metadata successfully", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType);

      expect(result).toEqual(mockMetadata);
      expect(client.request).toHaveBeenCalledWith({
        method: "POST",
        url: "/open-apis/suite/docs-api/meta",
        data: {
          request_docs: [
            {
              docs_token: mockDocToken,
              docs_type: mockDocType,
            },
          ],
        },
      });
    });

    it("should use cached result on second call", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      // First call
      const result1 = await getDocMetadata(mockDocToken, mockDocType);
      expect(result1).toEqual(mockMetadata);
      expect(client.request).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await getDocMetadata(mockDocToken, mockDocType, true);
      expect(result2).toEqual(mockMetadata);
      expect(client.request).toHaveBeenCalledTimes(1); // No additional call
    });

    it("should bypass cache when useCache is false", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      // First call
      const result1 = await getDocMetadata(mockDocToken, mockDocType);
      expect(result1).toEqual(mockMetadata);

      // Second call with useCache=false should make new request
      const result2 = await getDocMetadata(mockDocToken, mockDocType, false);
      expect(result2).toEqual(mockMetadata);
      expect(client.request).toHaveBeenCalledTimes(2);
    });

    it("should handle response with success() function", async () => {
      const mockResponse = {
        success: vi.fn(() => true),
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType);

      expect(result).toEqual(mockMetadata);
      expect(mockResponse.success).toHaveBeenCalled();
    });

    it("should retry on transient failure (500 error)", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request)
        .mockRejectedValueOnce(new Error("Server error"))
        .mockResolvedValueOnce(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toEqual(mockMetadata);
      expect(client.request).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });

    it("should return null after max retries exceeded", async () => {
      vi.mocked(client.request).mockRejectedValue(
        new Error("Network error")
      );

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toBeNull();
      expect(client.request).toHaveBeenCalledTimes(3); // 3 attempts
    });

    it("should handle 404 error (document not found)", async () => {
      const mockResponse = {
        code: 404,
        msg: "Document not found",
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toBeNull();
    });

    it("should handle 403 error (permission denied)", async () => {
      const mockResponse = {
        code: 403,
        msg: "Access denied",
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toBeNull();
    });

    it("should handle missing metadata in response", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [], // Empty response
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toBeNull();
    });

    it("should handle different document types", async () => {
      const docTypes = ["doc", "sheet", "bitable", "docx"];

      for (const docType of docTypes) {
        clearMetadataCache();
        vi.clearAllMocks();

        const mockResponse = {
          code: 0,
          data: {
            docs_metas: [
              {
                docs_token: mockDocToken,
                title: `Test ${docType}`,
                owner_id: "user_123",
                create_time: 1700000000,
                latest_modify_user: "user_456",
                latest_modify_time: 1700001000,
                docs_type: docType,
              },
            ],
          },
        };

        vi.mocked(client.request).mockResolvedValue(mockResponse);

        const result = await getDocMetadata(mockDocToken, docType, false);

        expect(result?.docType).toBe(docType);
        expect(client.request).toHaveBeenCalledWith({
          method: "POST",
          url: "/open-apis/suite/docs-api/meta",
          data: {
            request_docs: [
              {
                docs_token: mockDocToken,
                docs_type: docType,
              },
            ],
          },
        });
      }
    });

    it("should handle missing optional fields in response", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              // Minimal response with only required fields
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      const result = await getDocMetadata(mockDocToken, mockDocType, false);

      expect(result).toEqual({
        docToken: mockDocToken,
        title: "Unknown",
        ownerId: "unknown",
        createdTime: 0,
        lastModifiedUser: "unknown",
        lastModifiedTime: 0,
        docType: mockDocType,
      });
    });
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

      expect(formatted).toEqual({
        docToken: mockDocToken,
        title: "Test Document",
        docType: "doc",
        ownerId: "user_123",
        createdAt: "2023-11-15T03:46:40.000Z", // ISO format
        lastModifiedBy: "user_456",
        lastModifiedAt: "2023-11-15T03:50:00.000Z", // ISO format
      });
    });

    it("should convert unix timestamps to ISO format", () => {
      const formatted = formatDocMetadataForJSON(mockMetadata);

      expect(formatted.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(formatted.lastModifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe("clearMetadataCache()", () => {
    it("should clear cache and allow fresh fetches", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      // Prime cache
      await getDocMetadata(mockDocToken, mockDocType);
      expect(client.request).toHaveBeenCalledTimes(1);

      // Clear cache
      clearMetadataCache();

      // Next call should make new API request
      await getDocMetadata(mockDocToken, mockDocType);
      expect(client.request).toHaveBeenCalledTimes(2);
    });
  });

  describe("getMetadataCacheStats()", () => {
    it("should return cache statistics", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "Test Document",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      // Add item to cache
      await getDocMetadata(mockDocToken, mockDocType);

      const stats = getMetadataCacheStats();

      expect(stats.size).toBeGreaterThan(0);
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

  describe("Integration tests", () => {
    it("should handle polling cycle: fetch -> check -> notify", async () => {
      const mockResponse = {
        code: 0,
        data: {
          docs_metas: [
            {
              docs_token: mockDocToken,
              title: "OKR Q1",
              owner_id: "user_123",
              create_time: 1700000000,
              latest_modify_user: "user_456",
              latest_modify_time: 1700001000,
              docs_type: "doc",
            },
          ],
        },
      };

      vi.mocked(client.request).mockResolvedValue(mockResponse);

      // Step 1: Fetch metadata
      const metadata = await getDocMetadata(mockDocToken, mockDocType, false);
      expect(metadata).not.toBeNull();

      // Step 2: Check if changed (first time)
      const hasChanged = hasDocChanged(metadata!);
      expect(hasChanged).toBe(true);

      // Step 3: Format for notification
      const formatted = formatDocChange(metadata!);
      expect(formatted).toContain("OKR Q1");

      // Step 4: Update tracked state
      const updatedTracked: TrackedDoc = {
        docToken: mockDocToken,
        docType: "doc",
        chatIdToNotify: "oc_abc123",
        lastKnownUser: metadata!.lastModifiedUser,
        lastKnownTime: metadata!.lastModifiedTime,
        lastNotificationTime: Date.now() / 1000,
      };

      // Step 5: Next poll should not detect change
      const nextMetadata = await getDocMetadata(
        mockDocToken,
        mockDocType,
        false
      );
      const nextHasChanged = hasDocChanged(nextMetadata!, updatedTracked);
      expect(nextHasChanged).toBe(false);
    });

    it("should handle sequential changes correctly", async () => {
      const responses = [
        {
          code: 0,
          data: {
            docs_metas: [
              {
                docs_token: mockDocToken,
                title: "OKR Q1",
                owner_id: "user_123",
                create_time: 1700000000,
                latest_modify_user: "user_456",
                latest_modify_time: 1700001000,
                docs_type: "doc",
              },
            ],
          },
        },
        {
          code: 0,
          data: {
            docs_metas: [
              {
                docs_token: mockDocToken,
                title: "OKR Q1",
                owner_id: "user_123",
                create_time: 1700000000,
                latest_modify_user: "user_789", // Different user
                latest_modify_time: 1700002000,
                docs_type: "doc",
              },
            ],
          },
        },
      ];

      vi.mocked(client.request)
        .mockResolvedValueOnce(responses[0])
        .mockResolvedValueOnce(responses[1]);

      // First fetch
      clearMetadataCache();
      const first = await getDocMetadata(mockDocToken, mockDocType, false);
      const firstTracked: TrackedDoc = {
        docToken: mockDocToken,
        docType: "doc",
        chatIdToNotify: "oc_abc123",
        lastKnownUser: first!.lastModifiedUser,
        lastKnownTime: first!.lastModifiedTime,
        lastNotificationTime: Date.now() / 1000,
      };

      // Second fetch - should detect change
      const second = await getDocMetadata(mockDocToken, mockDocType, false);
      const secondHasChanged = hasDocChanged(second!, firstTracked);
      expect(secondHasChanged).toBe(true);
      expect(second!.lastModifiedUser).toBe("user_789");
    });
  });
});
