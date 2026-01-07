import * as lark from "@larksuiteoapi/node-sdk";
import { client } from "./feishu-utils";

/**
 * Document metadata structure returned from Feishu
 * Contains who modified, when modified, and basic document info
 */
export interface DocMetadata {
  docToken: string;
  title: string;
  ownerId: string;
  createdTime: number; // Unix timestamp in seconds
  lastModifiedUser: string; // User ID who last modified
  lastModifiedTime: number; // Unix timestamp in seconds
  docType: "doc" | "sheet" | "bitable" | "docx" | string;
}

/**
 * State of a tracked document
 * Persists the last known state to detect changes
 */
export interface TrackedDoc {
  docToken: string;
  docType: string;
  chatIdToNotify: string; // Group chat ID where notifications go
  lastKnownUser: string; // Last known modifier user ID
  lastKnownTime: number; // Last known modification time
  lastNotificationTime: number; // Last time we sent a notification (for debouncing)
}

/**
 * Cache for document metadata to minimize API calls
 * Entries expire after TTL milliseconds
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class MetadataCache {
  private cache = new Map<string, CacheEntry<DocMetadata>>();
  private readonly ttlMs = 30000; // 30 second cache TTL

  get(key: string): DocMetadata | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: DocMetadata): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const metadataCache = new MetadataCache();

/**
 * Retry configuration for transient failures
 */
interface RetryConfig {
  maxAttempts: number;
  backoffMs: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: [100, 500, 2000],
};

/**
 * Get document metadata including modification info from Feishu
 *
 * Handles:
 * - Raw HTTP request to legacy docs-api/meta endpoint (not exposed in SDK)
 * - Type-safe response parsing
 * - Error handling with retry logic
 * - Response caching to minimize API calls
 * - Permission and token validation
 *
 * @param docToken Document token (e.g., 'doccnULnB44EMMPSYa3rIb4eJCf')
 * @param docType Document type: 'doc', 'sheet', 'bitable', 'docx' (default: 'doc')
 * @param useCache Whether to use cached results (default: true)
 * @returns Document metadata or null on failure
 *
 * @example
 * ```typescript
 * const meta = await getDocMetadata('doccnULnB44EMMPSYa3rIb4eJCf', 'doc');
 * if (meta) {
 *   console.log(`Doc: ${meta.title}`);
 *   console.log(`Last modified by: ${meta.lastModifiedUser}`);
 *   console.log(`Last modified at: ${new Date(meta.lastModifiedTime * 1000).toISOString()}`);
 * }
 * ```
 */
export async function getDocMetadata(
  docToken: string,
  docType: string = "doc",
  useCache: boolean = true
): Promise<DocMetadata | null> {
  // Check cache first
  if (useCache) {
    const cached = metadataCache.get(docToken);
    if (cached) {
      console.log(`✅ [DocMetadata] Cache hit for ${docToken}`);
      return cached;
    }
  }

  // Retry logic for transient failures
  const config = DEFAULT_RETRY_CONFIG;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = config.backoffMs[attempt - 1];
        console.log(
          `⚠️  [DocMetadata] Retry attempt ${attempt + 1}/${config.maxAttempts} for ${docToken} (after ${delayMs}ms)`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // For docx documents, try drive API first; fall back to legacy docs-api for other types
      let resp: any;
      
      try {
        // Use legacy docs-api for all document types (most reliable)
        console.log(`📄 [DocMetadata] Fetching metadata for ${docType}: ${docToken}`);
        resp = await client.request({
          method: "POST",
          url: "/open-apis/suite/docs-api/meta",
          data: {
            request_docs: [
              {
                docs_token: docToken,
                docs_type: docType,
              },
            ],
          },
        });
        console.log(`📄 [DocMetadata] Response received for ${docToken}`);
      } catch (apiError) {
        console.error(`❌ [DocMetadata] API call failed for ${docToken}:`, apiError);
        throw apiError;
      }

      // Check response success
      const isSuccess =
        typeof resp?.success === "function" ? resp.code === 0 || resp.code === undefined : resp?.code === 0;

      if (!isSuccess) {
        throw new Error(
          `API error: ${resp?.msg || resp?.error?.message || "unknown error"}`
        );
      }

      // Parse response
      const meta = resp.data?.docs_metas?.[0];
      if (!meta) {
        throw new Error("No metadata in response (document may not exist)");
      }

      // Build result with type-safe parsing
      const result: DocMetadata = {
        docToken: meta.docs_token || docToken,
        title: meta.title || "Unknown",
        ownerId: meta.owner_id || "unknown",
        createdTime: meta.create_time || 0,
        lastModifiedUser: meta.latest_modify_user || "unknown",
        lastModifiedTime: meta.latest_modify_time || 0,
        docType: meta.docs_type || docType,
      };

      // Cache the result
      metadataCache.set(docToken, result);

      console.log(
        `✅ [DocMetadata] Retrieved metadata for ${docToken}: "${result.title}"`
      );
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMsg = lastError.message;

      if (attempt === config.maxAttempts - 1) {
        // Last attempt - log and return null
        console.error(
          `❌ [DocMetadata] Failed to get metadata for ${docToken} after ${config.maxAttempts} attempts:`,
          errorMsg
        );
      } else {
        // Intermediate failure - log warning and continue
        console.warn(
          `⚠️  [DocMetadata] Attempt ${attempt + 1} failed for ${docToken}:`,
          errorMsg
        );
      }
    }
  }

  return null;
}

/**
 * Check if document has been modified since last known state
 *
 * Detects changes by comparing:
 * 1. Modification time changed
 * 2. Different user modified
 * 3. New document (no previous state)
 *
 * @param current Current metadata from Feishu
 * @param previous Previous tracked state (if any)
 * @returns true if any change detected
 *
 * @example
 * ```typescript
 * const current = await getDocMetadata(docToken);
 * const previous = trackedDocs.get(docToken);
 * if (current && hasDocChanged(current, previous)) {
 *   console.log('Document changed!');
 * }
 * ```
 */
export function hasDocChanged(
  current: DocMetadata,
  previous?: TrackedDoc
): boolean {
  // First time tracking this document
  if (!previous) {
    return true;
  }

  // Check if modification time changed
  if (current.lastModifiedTime !== previous.lastKnownTime) {
    return true;
  }

  // Check if different user modified (even within same second)
  if (current.lastModifiedUser !== previous.lastKnownUser) {
    return true;
  }

  return false;
}

/**
 * Format document metadata for display in notifications
 *
 * Returns markdown formatted string suitable for Feishu card messages
 *
 * @param metadata Document metadata
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const formatted = formatDocChange(metadata);
 * // Output: "📝 **My Document**\nModified by: user123\nTime: 2025-12-02 14:30:00"
 * ```
 */
export function formatDocChange(metadata: DocMetadata): string {
  const modTime = new Date(metadata.lastModifiedTime * 1000).toLocaleString();
  return `📝 **${metadata.title}**
Modified by: ${metadata.lastModifiedUser}
Time: ${modTime}`;
}

/**
 * Format metadata for JSON output or logging
 *
 * @param metadata Document metadata
 * @returns Formatted object
 */
export function formatDocMetadataForJSON(metadata: DocMetadata): object {
  return {
    docToken: metadata.docToken,
    title: metadata.title,
    docType: metadata.docType,
    ownerId: metadata.ownerId,
    createdAt: new Date(metadata.createdTime * 1000).toISOString(),
    lastModifiedBy: metadata.lastModifiedUser,
    lastModifiedAt: new Date(metadata.lastModifiedTime * 1000).toISOString(),
  };
}

/**
 * Clear the metadata cache
 * Useful for testing or forcing fresh API calls
 */
export function clearMetadataCache(): void {
  metadataCache.clear();
  console.log("✅ [DocMetadata] Cache cleared");
}

/**
 * Get cache statistics for monitoring
 */
export function getMetadataCacheStats(): {
  size: number;
  ttlMs: number;
} {
  return {
    size: (metadataCache as any).cache.size,
    ttlMs: (metadataCache as any).ttlMs,
  };
}

/**
 * Validate document token format
 * Feishu doc tokens are typically 20+ character alphanumeric strings
 *
 * @param docToken Token to validate
 * @returns true if token appears valid
 */
export function isValidDocToken(docToken: string): boolean {
  // Basic validation: should be alphanumeric, 10+ chars
  return /^[a-zA-Z0-9]{10,}$/.test(docToken);
}

/**
 * Validate document type
 *
 * @param docType Type to validate
 * @returns true if docType is supported
 */
export function isValidDocType(
  docType: string
): docType is "doc" | "sheet" | "bitable" | "docx" {
  return ["doc", "sheet", "bitable", "docx"].includes(docType);
}
