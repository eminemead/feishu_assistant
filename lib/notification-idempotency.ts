// Simple in-memory idempotency cache for the notification API.
//
// v1 design:
// - Scoped to a single process (no cross-instance coordination).
// - Uses caller-supplied idempotencyKey as the cache key.
// - Stores successful NotificationSuccessResponse objects with a TTL.
//
// This is enough to protect against accidental client retries in the common
// case (e.g. Cursor script re-sending the same request on network flake).

import type { NotificationSuccessResponse } from "./notification-types";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  response: NotificationSuccessResponse;
  createdAt: number;
}

const cache = new Map<string, CacheEntry>();

export function getCachedNotificationResponse(
  idempotencyKey: string,
): NotificationSuccessResponse | null {
  const entry = cache.get(idempotencyKey);
  if (!entry) return null;

  const age = Date.now() - entry.createdAt;
  if (age > IDEMPOTENCY_TTL_MS) {
    cache.delete(idempotencyKey);
    return null;
  }

  return entry.response;
}

export function storeNotificationResponse(
  idempotencyKey: string,
  response: NotificationSuccessResponse,
): void {
  cache.set(idempotencyKey, {
    response,
    createdAt: Date.now(),
  });

  // Simple pruning: if the cache grows too large, drop oldest entries.
  const MAX_ENTRIES = 1000;
  if (cache.size > MAX_ENTRIES) {
    const keys = Array.from(cache.keys());
    const excess = cache.size - MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
      cache.delete(keys[i]);
    }
  }
}

