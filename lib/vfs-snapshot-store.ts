/**
 * VFS Snapshot Store (Supabase-backed)
 *
 * Persists just-bash virtual filesystem state for replayable artifacts + exploration.
 *
 * Storage model:
 * - Keyed by (feishuUserId, threadId)
 * - Stores gzip-compressed JSON: Record<string, string> where key = absolute path
 * - Intended for trusted backend access (service role key) to avoid RLS/JWT plumbing
 */

import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { promisify } from "util";
import { gzip, gunzip } from "zlib";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SUPABASE_URL = process.env.SUPABASE_URL || "";
// Prefer service role key. Fall back to legacy env var names used elsewhere in repo.
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "";

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)."
    );
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type VfsFileMap = Record<string, string>;

export interface VfsSnapshot {
  feishuUserId: string;
  threadId: string;
  version: number;
  files: VfsFileMap;
  fileCount: number;
  filesSizeBytes: number;
  filesSha256: string;
  updatedAt?: string;
}

export interface LoadVfsSnapshotResult {
  found: boolean;
  version: number;
  files: VfsFileMap;
}

function stableJsonStringify(obj: unknown): string {
  // Deterministic JSON for stable hashing.
  // Note: file maps are flat (path -> string). We still sort keys for stability.
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const stable: Record<string, unknown> = {};
  for (const k of keys) stable[k] = record[k];
  return JSON.stringify(stable);
}

function computeStats(files: VfsFileMap): {
  fileCount: number;
  filesSizeBytes: number;
  filesSha256: string;
} {
  const keys = Object.keys(files);
  let bytes = 0;
  for (const k of keys) {
    const v = files[k] ?? "";
    bytes += Buffer.byteLength(k, "utf8") + Buffer.byteLength(v, "utf8");
  }
  const json = stableJsonStringify(files);
  const sha256 = createHash("sha256").update(json).digest("hex");
  return { fileCount: keys.length, filesSizeBytes: bytes, filesSha256: sha256 };
}

export async function loadVfsSnapshot(params: {
  feishuUserId: string;
  threadId: string;
}): Promise<LoadVfsSnapshotResult> {
  const supabase = getSupabaseAdmin();
  const { feishuUserId, threadId } = params;

  const { data, error } = await supabase
    .from("agent_vfs_snapshots")
    .select("version, files_gzip")
    .eq("feishu_user_id", feishuUserId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load VFS snapshot: ${error.message}`);
  }

  if (!data) {
    return { found: false, version: 0, files: {} };
  }

  const gz = (data as any).files_gzip as Uint8Array;
  const json = (await gunzipAsync(Buffer.from(gz))).toString("utf8");
  const files = (JSON.parse(json) || {}) as VfsFileMap;

  return {
    found: true,
    version: (data as any).version ?? 1,
    files,
  };
}

export async function saveVfsSnapshot(params: {
  feishuUserId: string;
  threadId: string;
  files: VfsFileMap;
  expectedVersion?: number; // optimistic concurrency
}): Promise<{ version: number }> {
  const supabase = getSupabaseAdmin();
  const { feishuUserId, threadId, files, expectedVersion } = params;

  const { fileCount, filesSizeBytes, filesSha256 } = computeStats(files);
  const json = stableJsonStringify(files);
  const gz = await gzipAsync(Buffer.from(json, "utf8"));

  // If caller provides expectedVersion, enforce optimistic concurrency.
  if (expectedVersion !== undefined) {
    // Try update first.
    const nextVersion = expectedVersion + 1;
    const { data: updated, error: updateError } = await supabase
      .from("agent_vfs_snapshots")
      .update({
        version: nextVersion,
        file_count: fileCount,
        files_size_bytes: filesSizeBytes,
        files_sha256: filesSha256,
        files_gzip: gz,
      })
      .eq("feishu_user_id", feishuUserId)
      .eq("thread_id", threadId)
      .eq("version", expectedVersion)
      .select("version")
      .maybeSingle();

    if (updateError) {
      throw new Error(`Failed to update VFS snapshot: ${updateError.message}`);
    }

    if (updated) {
      return { version: (updated as any).version ?? nextVersion };
    }

    // No rows updated -> either missing row or version conflict.
    // Attempt insert if missing (expectedVersion should be 0 in that case).
    if (expectedVersion === 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("agent_vfs_snapshots")
        .insert({
          feishu_user_id: feishuUserId,
          thread_id: threadId,
          version: 1,
          file_count: fileCount,
          files_size_bytes: filesSizeBytes,
          files_sha256: filesSha256,
          files_gzip: gz,
        })
        .select("version")
        .single();

      if (insertError) {
        throw new Error(`Failed to insert VFS snapshot: ${insertError.message}`);
      }
      return { version: (inserted as any).version ?? 1 };
    }

    throw new Error(
      `VFS snapshot version conflict (expected=${expectedVersion}). Reload and retry.`
    );
  }

  // No expectedVersion: upsert (last write wins).
  const { data, error } = await supabase
    .from("agent_vfs_snapshots")
    .upsert(
      {
        feishu_user_id: feishuUserId,
        thread_id: threadId,
        // Keep version semantics simple for LWW mode: bump via COALESCE not supported here.
        // We'll set version=1 for inserts; updates keep existing version unless overwritten by db.
        file_count: fileCount,
        files_size_bytes: filesSizeBytes,
        files_sha256: filesSha256,
        files_gzip: gz,
      } as any,
      { onConflict: "feishu_user_id,thread_id" }
    )
    .select("version")
    .single();

  if (error) {
    throw new Error(`Failed to upsert VFS snapshot: ${error.message}`);
  }

  return { version: (data as any).version ?? 1 };
}

