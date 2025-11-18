/**
 * Cache Configuration for AI Tools
 * 
 * Uses @ai-sdk-tools/cache to cache expensive tool operations.
 * 
 * Benefits:
 * - 10x faster responses for repeated requests
 * - 80% cost reduction by avoiding duplicate API calls
 * - Works with streaming tools and artifacts
 * 
 * @see https://ai-sdk-tools.dev/cache
 */

import { createCached } from '@ai-sdk-tools/cache';

/**
 * Environment-aware cache configuration
 * 
 * - Production: Uses Redis if UPSTASH_REDIS_REST_URL is set (distributed cache)
 * - Development: Uses LRU cache (in-memory, zero config)
 */
export const cached = process.env.UPSTASH_REDIS_REST_URL
  ? (() => {
      // Production: Redis cache (distributed, persistent)
      try {
        // Try Upstash Redis first (common in production)
        const { Redis } = require('@upstash/redis');
        return createCached({
          cache: Redis.fromEnv(),
          keyPrefix: 'feishu-agent:',
          ttl: 60 * 60 * 1000, // 1 hour default TTL
          debug: process.env.NODE_ENV === 'development',
        });
      } catch (e) {
        // Fallback to standard Redis if Upstash not available
        console.warn('Upstash Redis not available, falling back to LRU cache');
        return createCached({
          ttl: 30 * 60 * 1000, // 30 minutes
          debug: true,
        });
      }
    })()
  : createCached({
      // Development: LRU cache (in-memory, fast)
      ttl: 15 * 60 * 1000, // 15 minutes
      debug: true,
    });

/**
 * Cache with custom TTL for specific use cases
 */
export function createCachedWithTTL(ttlMs: number) {
  return process.env.UPSTASH_REDIS_REST_URL
    ? (() => {
        try {
          const { Redis } = require('@upstash/redis');
          return createCached({
            cache: Redis.fromEnv(),
            keyPrefix: 'feishu-agent:',
            ttl: ttlMs,
            debug: process.env.NODE_ENV === 'development',
          });
        } catch (e) {
          return createCached({ ttl: ttlMs, debug: true });
        }
      })()
    : createCached({ ttl: ttlMs, debug: true });
}

