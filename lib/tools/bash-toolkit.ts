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
import { getRequestContext } from "../runtime-context";
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
    } catch {
      // ignore
    }
  }
  return out;
}

async function createEnvForCurrentRequest(): Promise<{
  env: Bash;
  canPersist: boolean;
  feishuUserId?: string;
  threadId?: string;
  snapshotVersion: number;
}> {
  const ctx = getRequestContext() || {};
  const feishuUserId = ctx.userId;
  const root = effectiveRootId(ctx.rootId, ctx.memoryRootId);
  const threadId = buildThreadId(ctx.chatId, root);
  const canPersist = !!(feishuUserId && threadId);

  let snapshotVersion = 0;
  let persisted: VfsFileMap = {};
  if (canPersist) {
    const loaded = await loadVfsSnapshot({
      feishuUserId: feishuUserId!,
      threadId: threadId!,
    });
    snapshotVersion = loaded.version;
    persisted = loaded.files || {};
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

  return { env, canPersist, feishuUserId, threadId: threadId || undefined, snapshotVersion };
}

async function persistIfNeeded(params: {
  env: Bash;
  canPersist: boolean;
  feishuUserId?: string;
  threadId?: string;
  expectedVersion: number;
}): Promise<void> {
  const { env, canPersist, feishuUserId, threadId, expectedVersion } = params;
  if (!canPersist || !feishuUserId || !threadId) return;

  let files = await exportPersistedFiles(env);

  // Fail-soft size control: if too big, keep only /state.
  if (Object.keys(files).length > MAX_PERSIST_FILES || estimateBytes(files) > MAX_PERSIST_BYTES) {
    const reduced: VfsFileMap = {};
    for (const [k, v] of Object.entries(files)) {
      if (k.startsWith("/state/")) reduced[k] = v;
    }
    files = reduced;
  }

  await saveVfsSnapshot({
    feishuUserId,
    threadId,
    files,
    expectedVersion,
  });
}

function createDynamicSandbox(enableDevtoolsTracking: boolean): Sandbox {
  return {
    executeCommand: enableDevtoolsTracking
      ? trackToolCall("bash", async (command: string): Promise<CommandResult> => {
          const { env, canPersist, feishuUserId, threadId, snapshotVersion } =
            await createEnvForCurrentRequest();
          const result = await env.exec(command, { cwd: "/" });
          await persistIfNeeded({
            env,
            canPersist,
            feishuUserId,
            threadId,
            expectedVersion: snapshotVersion,
          });
          return { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode };
        })
      : async (command: string): Promise<CommandResult> => {
          const { env, canPersist, feishuUserId, threadId, snapshotVersion } =
            await createEnvForCurrentRequest();
          const result = await env.exec(command, { cwd: "/" });
          await persistIfNeeded({
            env,
            canPersist,
            feishuUserId,
            threadId,
            expectedVersion: snapshotVersion,
          });
          return { stdout: result.stdout || "", stderr: result.stderr || "", exitCode: result.exitCode };
        },

    readFile: enableDevtoolsTracking
      ? trackToolCall("readFile", async (path: string): Promise<string> => {
          const { env } = await createEnvForCurrentRequest();
          return await env.fs.readFile(path, "utf8");
        })
      : async (path: string): Promise<string> => {
          const { env } = await createEnvForCurrentRequest();
          return await env.fs.readFile(path, "utf8");
        },

    writeFiles: enableDevtoolsTracking
      ? trackToolCall(
          "writeFile",
          async (files: Array<{ path: string; content: string | Buffer }>): Promise<void> => {
            const { env, canPersist, feishuUserId, threadId, snapshotVersion } =
              await createEnvForCurrentRequest();
            for (const f of files) {
              const dir = nodePath.posix.dirname(f.path);
              try {
                await env.fs.mkdir(dir, { recursive: true });
              } catch {
                // ignore
              }
              await env.fs.writeFile(f.path, f.content as any);
            }
            await persistIfNeeded({
              env,
              canPersist,
              feishuUserId,
              threadId,
              expectedVersion: snapshotVersion,
            });
          },
        )
      : async (files: Array<{ path: string; content: string | Buffer }>): Promise<void> => {
          const { env, canPersist, feishuUserId, threadId, snapshotVersion } =
            await createEnvForCurrentRequest();
          for (const f of files) {
            const dir = nodePath.posix.dirname(f.path);
            try {
              await env.fs.mkdir(dir, { recursive: true });
            } catch {
              // ignore
            }
            await env.fs.writeFile(f.path, f.content as any);
          }
          await persistIfNeeded({
            env,
            canPersist,
            feishuUserId,
            threadId,
            expectedVersion: snapshotVersion,
          });
        },
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

