/**
 * Cache wrapper for Mastra tools (and plain async functions).
 *
 * Why this exists:
 * - The codebase is migrating from Vercel AI SDK `tool()` to Mastra `createTool()`.
 * - @ai-sdk-tools/cache wraps Vercel tool objects; Mastra tools are different objects.
 *
 * This module provides a minimal TTL cache that wraps:
 * - a tool-like object with an `execute(input, context?)` method
 * - or a plain async function `(input) => Promise<output>`
 *
 * Implementation notes:
 * - In-memory TTL cache by default.
 * - Optional Upstash Redis if present (best-effort; falls back silently).
 * - Dedupes concurrent identical calls by caching the in-flight Promise.
 */

import crypto from "node:crypto";

type AnyAsyncFn = (...args: any[]) => Promise<any>;

export interface CacheOptions {
  ttlMs: number;
  keyPrefix?: string;
  debug?: boolean;
}

type CacheEntry =
  | { expiresAt: number; promise: Promise<any> };

const DEFAULT_KEY_PREFIX = "feishu-agent:";

const inMemoryCache = new Map<string, CacheEntry>();

function debugLog(enabled: boolean | undefined, ...args: any[]) {
  if (!enabled) return;
  // Keep it lightweight; avoid dumping large payloads.
  console.log("[cache]", ...args);
}

function stableKey(input: unknown): string {
  // JSON stringify is sufficient for our tool input objects (zod outputs stable key order in practice).
  // Hash to keep keys short.
  const raw = JSON.stringify(input ?? null);
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function tryGetUpstashRedis() {
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;
  try {
    // Optional dependency; many envs won't have it installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Redis } = require("@upstash/redis");
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

async function getCachedOrCompute(
  cacheKey: string,
  opts: CacheOptions,
  compute: () => Promise<any>,
): Promise<any> {
  const now = Date.now();

  // Fast path: in-memory hit
  const existing = inMemoryCache.get(cacheKey);
  if (existing && existing.expiresAt > now) {
    debugLog(opts.debug, "hit", cacheKey);
    return existing.promise;
  }

  // Try Redis (best effort)
  const redis = await tryGetUpstashRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null && cached !== undefined) {
        debugLog(opts.debug, "hit(redis)", cacheKey);
        return cached;
      }
    } catch (e) {
      debugLog(opts.debug, "redis get failed; fallback to memory", cacheKey);
    }
  }

  // Miss: compute and store in-memory promise immediately to dedupe.
  debugLog(opts.debug, "miss", cacheKey);
  const promise = (async () => {
    const value = await compute();
    if (redis) {
      try {
        // Upstash JSON serialization: store raw value (must be JSON-serializable).
        await redis.set(cacheKey, value, { px: opts.ttlMs });
      } catch (e) {
        debugLog(opts.debug, "redis set failed; ignoring", cacheKey);
      }
    }
    return value;
  })();

  inMemoryCache.set(cacheKey, { expiresAt: now + opts.ttlMs, promise });

  try {
    return await promise;
  } catch (err) {
    // Don't pin failures.
    inMemoryCache.delete(cacheKey);
    throw err;
  }
}

/**
 * Wrap a plain async function with caching.
 */
export function withCache<T extends AnyAsyncFn>(
  fn: T,
  opts: CacheOptions,
): T {
  const keyPrefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
  return (async (...args: any[]) => {
    const input = args.length <= 1 ? args[0] : args;
    const cacheKey = `${keyPrefix}fn:${stableKey(input)}`;
    return await getCachedOrCompute(cacheKey, opts, () => fn(...args));
  }) as T;
}

/**
 * Wrap a tool-like object (Mastra Tool) by caching its execute().
 * Returns a new object to avoid mutation side effects.
 */
export function cacheTool<TTool extends { id?: string; execute?: AnyAsyncFn }>(
  tool: TTool,
  opts: CacheOptions,
): TTool {
  if (!tool.execute) return tool;

  const keyPrefix = opts.keyPrefix ?? DEFAULT_KEY_PREFIX;
  const toolId = tool.id ?? "unknown_tool";
  const original = tool.execute.bind(tool) as AnyAsyncFn;

  const cachedExecute = (async (...args: any[]) => {
    const input = args.length <= 1 ? args[0] : args;
    const cacheKey = `${keyPrefix}tool:${toolId}:${stableKey(input)}`;
    return await getCachedOrCompute(cacheKey, opts, () => original(...args));
  }) as AnyAsyncFn;

  // Return new object to avoid mutation
  return { ...tool, execute: cachedExecute };
}

/**
 * Default cache wrapper (15m dev, 1h prod-ish).
 *
 * Backwards-compatible name used throughout the repo.
 */
export const cached = (toolOrFn: any) => {
  const ttlMs =
    process.env.UPSTASH_REDIS_REST_URL ? 60 * 60 * 1000 : 15 * 60 * 1000;
  const debug = process.env.NODE_ENV === "development";

  if (typeof toolOrFn === "function") {
    return withCache(toolOrFn, { ttlMs, debug });
  }
  return cacheTool(toolOrFn, { ttlMs, debug });
};

/**
 * Cache with custom TTL for specific use cases.
 *
 * Backwards-compatible API: `createCachedWithTTL(ttl)(toolOrFn)`
 */
export function createCachedWithTTL(ttlMs: number) {
  const debug = process.env.NODE_ENV === "development";
  return (toolOrFn: any) => {
    if (typeof toolOrFn === "function") {
      return withCache(toolOrFn, { ttlMs, debug });
    }
    return cacheTool(toolOrFn, { ttlMs, debug });
  };
}

