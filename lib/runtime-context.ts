/**
 * Runtime request context (AsyncLocalStorage)
 *
 * Used to provide per-request identifiers (user/chat/thread) to tools that
 * don't include those fields in their input schema (e.g., bash-tool tools).
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId?: string; // Feishu user id (open_id/user_id)
  chatId?: string;
  rootId?: string;
  memoryRootId?: string; // stable root id for non-thread chats
}

const als = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(ctx, fn);
}

