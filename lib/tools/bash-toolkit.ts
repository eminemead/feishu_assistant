/**
 * Bash toolkit tools (bash-tool + just-bash + Supabase persistence)
 *
 * Exposes Vercel's bash-tool surface:
 * - bash
 * - readFile
 * - writeFile
 *
 * Persistence:
 * - Per (userId, chatId, effectiveRootId) snapshot in Supabase
 * - Only /state and /workspace are persisted
 * - Shared Bash env per request to avoid race conditions between tool calls
 *
 * Mounts:
 * - /semantic-layer (from repo checked-in files) is mounted on every call
 */

import nodePath from "node:path";
import { createBashTool } from "bash-tool";
import type { CommandResult, Sandbox } from "bash-tool";
import { Bash } from "just-bash";
import { trackToolCall } from "../devtools-integration";
import { getSemanticLayerFileMap } from "../semantic-layer-filemap";
import {
  getRequestContext,
  markBashEnvDirty,
  type RequestContextInternal,
} from "../runtime-context";
import { loadVfsSnapshot, saveVfsSnapshot, type VfsFileMap } from "../vfs-snapshot-store";

const DESTINATION = "/workspace";

const MAX_PERSIST_FILES = 2000;
const MAX_PERSIST_BYTES = 2 * 1024 * 1024; // 2MB pre-compress

function effectiveRootId(rootId?: string, memoryRootId?: string): string | undefined {
  return memoryRootId || rootId;
}

function buildThreadId(chatId?: string, rootId?: string): string | null {
  if (!chatId || !rootId) return null;
  return `feishu:${chatId}:${rootId}`;
}

function shouldPersistPath(p: string): boolean {
  return p.startsWith("/state/") || p.startsWith("/workspace/");
}

function estimateBytes(files: VfsFileMap): number {
  let bytes = 0;
  for (const [k, v] of Object.entries(files)) {
    bytes += Buffer.byteLength(k, "utf8");
    bytes += Buffer.byteLength(v ?? "", "utf8");
  }
  return bytes;
}

async function exportPersistedFiles(env: Bash): Promise<VfsFileMap> {
  const paths = env.fs.getAllPaths() || [];
  const out: VfsFileMap = {};

  for (const p of paths) {
    if (!shouldPersistPath(p)) continue;
    try {
      const st = await env.fs.stat(p);
      if (!st.isFile) continue;
      out[p] = await env.fs.readFile(p, "utf8");
    } catch (err) {
      // Log but continue - file may have been deleted or is unreadable
      console.debug(`[bash-toolkit] Failed to export file ${p}:`, err);
    }
  }
  return out;
}

/**
 * Get or create the shared Bash environment for the current request.
 * Stores the env in AsyncLocalStorage so all tool calls share it.
 */
async function getOrCreateBashEnv(): Promise<{
  env: Bash;
  canPersist: boolean;
  feishuUserId?: string;
  threadId?: string;
  snapshotVersion: number;
}> {
  const ctx = getRequestContext();

  // If we already have a bash env for this request, return it
  if (ctx?.bashEnv) {
    return {
      env: ctx.bashEnv,
      canPersist: ctx.bashEnvCanPersist ?? false,
      feishuUserId: ctx.bashEnvUserId,
      threadId: ctx.bashEnvThreadId,
      snapshotVersion: ctx.bashEnvVersion ?? 0,
    };
  }

  // Create new env
  const feishuUserId = ctx?.userId;
  const root = effectiveRootId(ctx?.rootId, ctx?.memoryRootId);
  const threadId = buildThreadId(ctx?.chatId, root);
  const canPersist = !!(feishuUserId && threadId);

  let snapshotVersion = 0;
  let persisted: VfsFileMap = {};
  if (canPersist) {
    try {
      const loaded = await loadVfsSnapshot({
        feishuUserId: feishuUserId!,
        threadId: threadId!,
      });
      snapshotVersion = loaded.version;
      persisted = loaded.files || {};
    } catch (err) {
      console.warn(`[bash-toolkit] Failed to load VFS snapshot, starting fresh:`, err);
    }
  }

  const semanticFiles = await getSemanticLayerFileMap();
  const baseFiles: VfsFileMap = {
    "/workspace/.keep": "",
    "/state/.keep": "",
  };

  const initialFiles: VfsFileMap = {
    ...semanticFiles,
    ...baseFiles,
    ...persisted,
  };

  const env = new Bash({
    files: initialFiles,
    cwd: DESTINATION,
    env: { HOME: DESTINATION },
    executionLimits: {
      maxCallDepth: 50,
      maxCommandCount: 500,
      maxLoopIterations: 50_000,
    },
  });

  // Store in context for reuse by subsequent tool calls
  if (ctx) {
    ctx.bashEnv = env;
    ctx.bashEnvVersion = snapshotVersion;
    ctx.bashEnvCanPersist = canPersist;
    ctx.bashEnvThreadId = threadId || undefined;
    ctx.bashEnvUserId = feishuUserId;
    ctx.bashEnvDirty = false;
  }

  return { env, canPersist, feishuUserId, threadId: threadId || undefined, snapshotVersion };
}

/**
 * Persist the current bash env state to Supabase.
 * Uses last-write-wins to avoid race conditions between parallel tool calls.
 */
async function persistBashEnv(): Promise<void> {
  const ctx = getRequestContext();
  if (!ctx?.bashEnv || !ctx.bashEnvCanPersist || !ctx.bashEnvUserId || !ctx.bashEnvThreadId) {
    return;
  }

  let files = await exportPersistedFiles(ctx.bashEnv);

  // Fail-soft size control: if too big, keep only /state.
  if (Object.keys(files).length > MAX_PERSIST_FILES || estimateBytes(files) > MAX_PERSIST_BYTES) {
    console.warn(`[bash-toolkit] VFS too large (${Object.keys(files).length} files), keeping only /state`);
    const reduced: VfsFileMap = {};
    for (const [k, v] of Object.entries(files)) {
      if (k.startsWith("/state/")) reduced[k] = v;
    }
    files = reduced;
  }

  try {
    // Use last-write-wins mode (no expectedVersion) to avoid race conditions
    // between parallel tool calls within the same request
    await saveVfsSnapshot({
      feishuUserId: ctx.bashEnvUserId,
      threadId: ctx.bashEnvThreadId,
      files,
      // Omit expectedVersion for LWW mode
    });
    ctx.bashEnvDirty = false;
  } catch (err) {
    console.error(`[bash-toolkit] Failed to persist VFS snapshot:`, err);
    // Don't throw - persistence failure shouldn't break the tool
  }
}

/**
 * Execute a bash command in the shared environment.
 */
async function executeCommandImpl(command: string): Promise<CommandResult> {
  const { env } = await getOrCreateBashEnv();
  const result = await env.exec(command, { cwd: "/" });
  markBashEnvDirty();
  await persistBashEnv();
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Read a file from the shared environment.
 */
async function readFileImpl(path: string): Promise<string> {
  const { env } = await getOrCreateBashEnv();
  return await env.fs.readFile(path, "utf8");
}

/**
 * Write files to the shared environment.
 */
async function writeFilesImpl(
  files: Array<{ path: string; content: string | Buffer }>,
): Promise<void> {
  const { env } = await getOrCreateBashEnv();
  for (const f of files) {
    const dir = nodePath.posix.dirname(f.path);
    try {
      await env.fs.mkdir(dir, { recursive: true });
    } catch (err) {
      console.debug(`[bash-toolkit] mkdir ${dir} failed (may already exist):`, err);
    }
    await env.fs.writeFile(f.path, f.content as any);
  }
  markBashEnvDirty();
  await persistBashEnv();
}

function createDynamicSandbox(enableDevtoolsTracking: boolean): Sandbox {
  // Wrap implementations with optional devtools tracking
  const wrapFn = <T extends (...args: any[]) => any>(name: string, fn: T): T => {
    return (enableDevtoolsTracking ? trackToolCall(name, fn) : fn) as T;
  };

  return {
    executeCommand: wrapFn("bash", executeCommandImpl),
    readFile: wrapFn("readFile", readFileImpl),
    writeFiles: wrapFn("writeFile", writeFilesImpl),
  };
}

const TOOL_PROMPT = [
  "Filesystem conventions:",
  "- /semantic-layer/**: read-only semantic layer (schemas, metrics, examples). Use grep/cat/find.",
  "- /workspace/**: scratch space (persisted per thread).",
  "- /state/**: durable per-thread notes/artifacts (persisted).",
  "",
  "Tip: prefer writeFile/readFile for simple edits; use bash for bulk ops (grep/find/sed).",
].join("\n");

/**
 * Create bash-tool compatible tools backed by Supabase persistence.
 *
 * IMPORTANT: must be created inside an async init (agent factory is async).
 */
export async function createBashToolkitTools(enableDevtoolsTracking: boolean = true): Promise<{
  bash: any;
  readFile: any;
  writeFile: any;
}> {
  const sandbox = createDynamicSandbox(enableDevtoolsTracking);

  const toolkit = await createBashTool({
    sandbox,
    destination: DESTINATION,
    promptOptions: { toolPrompt: TOOL_PROMPT },
    // Keep output caps on the bash tool itself (bash-tool default is 30k).
    maxOutputLength: 50_000,
  });

  return toolkit.tools;
}
