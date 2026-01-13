/**
 * Runtime request context (AsyncLocalStorage)
 *
 * Used to provide per-request identifiers (user/chat/thread) to tools that
 * don't include those fields in their input schema (e.g., bash-tool tools).
 *
 * Also stores shared Bash environment for the request to avoid race conditions
 * between multiple tool calls in the same agent turn.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Bash } from "just-bash";

export interface RequestContext {
  userId?: string; // Feishu user id (open_id/user_id)
  chatId?: string;
  rootId?: string;
  memoryRootId?: string; // stable root id for non-thread chats
}

/**
 * Extended context that includes mutable runtime state (Bash env).
 * The bash env is lazily initialized on first tool call.
 */
export interface RequestContextInternal extends RequestContext {
  /** Shared Bash env for this request (lazily set by bash toolkit) */
  bashEnv?: Bash;
  /** Version loaded from DB when bashEnv was initialized */
  bashEnvVersion?: number;
  /** Whether persistence is possible for this request */
  bashEnvCanPersist?: boolean;
  /** Thread ID for persistence */
  bashEnvThreadId?: string;
  /** User ID for persistence */
  bashEnvUserId?: string;
  /** Dirty flag - set when any write operation occurs */
  bashEnvDirty?: boolean;
}

const als = new AsyncLocalStorage<RequestContextInternal>();

export function getRequestContext(): RequestContextInternal | undefined {
  return als.getStore();
}

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  // Create internal context (extends user-provided context)
  const internal: RequestContextInternal = { ...ctx };
  return als.run(internal, fn);
}

/**
 * Mark the bash environment as dirty (needs persistence).
 * Called after any write operation.
 */
export function markBashEnvDirty(): void {
  const ctx = als.getStore();
  if (ctx) {
    ctx.bashEnvDirty = true;
  }
}

/**
 * Check if bash env is dirty.
 */
export function isBashEnvDirty(): boolean {
  const ctx = als.getStore();
  return ctx?.bashEnvDirty ?? false;
}
