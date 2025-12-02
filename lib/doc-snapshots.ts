import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "fs";
import { gzip } from "zlib";
import { promisify } from "util";
import { createHash } from "crypto";

const gzipAsync = promisify(gzip);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Document snapshot metadata
 */
export interface DocumentSnapshot {
  id: string;
  userId: string;
  docToken: string;
  revisionNumber: number;
  contentHash: string;
  contentSize: number;
  modifiedBy: string;
  modifiedAt: number;
  storedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Snapshot configuration
 */
export interface SnapshotConfig {
  maxDocSizeBytes: number; // Skip docs larger than this (default: 10MB)
  minCompressionRatio: number; // Skip if compression ratio below this (default: 1.5)
  retentionDays: number; // Auto-archive snapshots older than this (default: 90)
  snapshotOnChange: boolean; // Whether to snapshot on every detected change (default: true)
  includeDocTypes: string[]; // Which doc types to snapshot (default: doc, sheet, bitable)
}

const DEFAULT_CONFIG: SnapshotConfig = {
  maxDocSizeBytes: 10 * 1024 * 1024, // 10MB
  minCompressionRatio: 1.5,
  retentionDays: 90,
  snapshotOnChange: true,
  includeDocTypes: ["doc", "sheet", "bitable"],
};

/**
 * Document Snapshot Service
 *
 * Manages storage and retrieval of document content snapshots for diff analysis.
 *
 * Features:
 * - Download and compress document content
 * - Store snapshots in Supabase with gzip compression
 * - Track compression metrics
 * - Query snapshot history
 * - Auto-archival of old snapshots
 * - Support for multiple document types
 */
class DocumentSnapshotService {
  private userId: string | null = null;
  private config: SnapshotConfig;

  constructor(config?: Partial<SnapshotConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the current user ID for RLS filtering
   */
  setUserId(userId: string): void {
    this.userId = userId;
    console.log(`✅ [DocSnapshots] User ID set to ${userId}`);
  }

  /**
   * Get the current user ID
   */
  private getUserId(): string {
    if (!this.userId) {
      throw new Error(
        "User ID not set. Call setUserId() before snapshot operations."
      );
    }
    return this.userId;
  }

  /**
   * Check if document type is supported for snapshotting
   */
  isSupportedDocType(docType: string): boolean {
    return this.config.includeDocTypes.includes(docType);
  }

  /**
   * Check if document size is within limits
   */
  isWithinSizeLimit(sizeBytes: number): boolean {
    return sizeBytes <= this.config.maxDocSizeBytes;
  }

  /**
   * Create a snapshot of document content
   *
   * Downloads content from Feishu, compresses it, and stores in Supabase
   */
  async createSnapshot(
    docToken: string,
    docContent: string | object,
    metadata: {
      revisionNumber: number;
      modifiedBy: string;
      modifiedAt: number;
      docType: string;
    }
  ): Promise<DocumentSnapshot | null> {
    const userId = this.getUserId();

    try {
      // Validate document type
      if (!this.isSupportedDocType(metadata.docType)) {
        console.warn(
          `⚠️  [DocSnapshots] Document type '${metadata.docType}' not in supported list, skipping snapshot`
        );
        return null;
      }

      // Convert content to JSON string
      const contentJson =
        typeof docContent === "string"
          ? docContent
          : JSON.stringify(docContent);
      const contentBytes = Buffer.from(contentJson, "utf-8");

      // Check size limit
      if (!this.isWithinSizeLimit(contentBytes.length)) {
        console.warn(
          `⚠️  [DocSnapshots] Document ${docToken} is ${contentBytes.length} bytes, exceeds limit of ${this.config.maxDocSizeBytes}, skipping snapshot`
        );
        return null;
      }

      // Compute content hash
      const contentHash = createHash("sha256")
        .update(contentJson)
        .digest("hex");

      // Compress content
      const compressedContent = await gzipAsync(contentJson);
      const compressionRatio =
        contentBytes.length / compressedContent.length;

      // Check compression ratio
      if (compressionRatio < this.config.minCompressionRatio) {
        console.warn(
          `⚠️  [DocSnapshots] Compression ratio ${compressionRatio.toFixed(2)}x below threshold ${this.config.minCompressionRatio}, skipping snapshot`
        );
        return null;
      }

      // Store in Supabase
      const { data, error } = await supabase
        .from("document_snapshots")
        .insert({
          user_id: userId,
          doc_token: docToken,
          revision_number: metadata.revisionNumber,
          content_hash: contentHash,
          content_size: contentBytes.length,
          modified_by: metadata.modifiedBy,
          modified_at: metadata.modifiedAt,
          content_compressed: compressedContent,
          metadata: {
            compression_ratio: compressionRatio,
            original_size: contentBytes.length,
            compressed_size: compressedContent.length,
          },
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to store snapshot: ${error.message}`);
      }

      console.log(
        `✅ [DocSnapshots] Stored snapshot for ${docToken} (rev ${metadata.revisionNumber}, compressed ${compressionRatio.toFixed(2)}x)`
      );

      return this.mapDbRowToSnapshot(data);
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to create snapshot for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get snapshot by revision number
   */
  async getSnapshot(
    docToken: string,
    revisionNumber: number
  ): Promise<DocumentSnapshot | null> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_snapshots")
        .select("*")
        .match({
          user_id: userId,
          doc_token: docToken,
          revision_number: revisionNumber,
        })
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found
        throw new Error(`Failed to fetch snapshot: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return this.mapDbRowToSnapshot(data);
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to fetch snapshot for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get decompressed content of a snapshot
   */
  async getSnapshotContent(
    docToken: string,
    revisionNumber: number
  ): Promise<string | null> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_snapshots")
        .select("content_compressed")
        .match({
          user_id: userId,
          doc_token: docToken,
          revision_number: revisionNumber,
        })
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch snapshot content: ${error.message}`);
      }

      if (!data || !data.content_compressed) {
        return null;
      }

      // Decompress content
      const decompressed = await promisify(require("zlib").gunzip)(
        Buffer.from(data.content_compressed)
      );
      return decompressed.toString("utf-8");
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to get snapshot content for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get snapshot history (latest N snapshots)
   */
  async getSnapshotHistory(
    docToken: string,
    limit: number = 20
  ): Promise<DocumentSnapshot[]> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_snapshots")
        .select("*")
        .match({ user_id: userId, doc_token: docToken })
        .order("revision_number", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch snapshot history: ${error.message}`);
      }

      console.log(
        `✅ [DocSnapshots] Retrieved ${data?.length || 0} snapshots for ${docToken}`
      );

      return (data || []).map((row) => this.mapDbRowToSnapshot(row));
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to fetch snapshot history for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get snapshot statistics
   */
  async getSnapshotStats(docToken: string): Promise<{
    totalSnapshots: number;
    totalCompressedSize: number;
    totalOriginalSize: number;
    averageCompressionRatio: number;
    oldestSnapshot: Date | null;
    newestSnapshot: Date | null;
  }> {
    const userId = this.getUserId();

    try {
      const { data, error } = await supabase
        .from("document_snapshots")
        .select("*")
        .match({ user_id: userId, doc_token: docToken });

      if (error) {
        throw new Error(`Failed to fetch snapshot stats: ${error.message}`);
      }

      const snapshots = data || [];

      if (snapshots.length === 0) {
        return {
          totalSnapshots: 0,
          totalCompressedSize: 0,
          totalOriginalSize: 0,
          averageCompressionRatio: 0,
          oldestSnapshot: null,
          newestSnapshot: null,
        };
      }

      let totalCompressed = 0;
      let totalOriginal = 0;

      snapshots.forEach((s: any) => {
        if (s.metadata?.compressed_size) {
          totalCompressed += s.metadata.compressed_size;
        }
        if (s.metadata?.original_size) {
          totalOriginal += s.metadata.original_size;
        }
      });

      const avgRatio =
        totalOriginal > 0 ? totalOriginal / totalCompressed : 0;

      const timestamps = snapshots
        .map((s: any) => new Date(s.stored_at).getTime())
        .sort((a, b) => a - b);

      return {
        totalSnapshots: snapshots.length,
        totalCompressedSize: totalCompressed,
        totalOriginalSize: totalOriginal,
        averageCompressionRatio: avgRatio,
        oldestSnapshot: timestamps.length > 0 ? new Date(timestamps[0]) : null,
        newestSnapshot:
          timestamps.length > 0
            ? new Date(timestamps[timestamps.length - 1])
            : null,
      };
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to fetch snapshot stats for ${docToken}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Delete old snapshots beyond retention window
   */
  async pruneOldSnapshots(docToken?: string): Promise<number> {
    const userId = this.getUserId();
    const cutoffDate = new Date();
    cutoffDate.setDate(
      cutoffDate.getDate() - this.config.retentionDays
    );

    try {
      let query = supabase
        .from("document_snapshots")
        .delete()
        .match({ user_id: userId })
        .lt("stored_at", cutoffDate.toISOString());

      if (docToken) {
        query = query.eq("doc_token", docToken);
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(
          `Failed to prune old snapshots: ${error.message}`
        );
      }

      console.log(
        `✅ [DocSnapshots] Pruned ${count || 0} old snapshots (older than ${this.config.retentionDays} days)`
      );

      return count || 0;
    } catch (error) {
      console.error(
        `❌ [DocSnapshots] Failed to prune old snapshots:`,
        error
      );
      throw error;
    }
  }

  /**
   * Health check - verify database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("document_snapshots")
        .select("COUNT(*)")
        .limit(1);

      if (error) {
        console.error(`❌ [DocSnapshots] Health check failed:`, error);
        return false;
      }

      console.log(`✅ [DocSnapshots] Health check passed`);
      return true;
    } catch (error) {
      console.error(`❌ [DocSnapshots] Health check error:`, error);
      return false;
    }
  }

  // Helper methods

  private mapDbRowToSnapshot(row: any): DocumentSnapshot {
    return {
      id: row.id,
      userId: row.user_id,
      docToken: row.doc_token,
      revisionNumber: row.revision_number,
      contentHash: row.content_hash,
      contentSize: row.content_size,
      modifiedBy: row.modified_by,
      modifiedAt: row.modified_at,
      storedAt: new Date(row.stored_at),
      metadata: row.metadata,
    };
  }
}

// Singleton instance
let snapshotService: DocumentSnapshotService | null = null;

/**
 * Get snapshot service instance
 */
export function getSnapshotService(
  config?: Partial<SnapshotConfig>
): DocumentSnapshotService {
  if (!snapshotService) {
    snapshotService = new DocumentSnapshotService(config);
  }
  return snapshotService;
}

/**
 * Set user ID for RLS-based operations
 */
export function setSnapshotUserId(userId: string): void {
  getSnapshotService().setUserId(userId);
}
