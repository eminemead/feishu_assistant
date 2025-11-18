/**
 * Memory Configuration for AI Agents
 * 
 * Uses @ai-sdk-tools/memory to provide persistent memory for agents.
 * 
 * Benefits:
 * - Working memory: Store user preferences, learned facts, and context
 * - Conversation history: Access past messages for context
 * - Chat persistence: Auto-generated titles and session tracking
 * 
 * @see https://ai-sdk-tools.dev/memory
 */

import { InMemoryProvider } from '@ai-sdk-tools/memory/in-memory';
import type { MemoryProvider } from '@ai-sdk-tools/memory';

/**
 * Environment-aware memory provider configuration
 * 
 * - Production: Uses Upstash Redis if UPSTASH_REDIS_REST_URL is set (persistent, distributed)
 * - Development: Uses InMemory provider (zero config, resets on restart)
 */
export const memoryProvider: MemoryProvider = process.env.UPSTASH_REDIS_REST_URL
  ? (() => {
      // Production: Upstash Redis (persistent, distributed)
      try {
        // Try Upstash Redis first (common in production)
        const { UpstashProvider } = require('@ai-sdk-tools/memory/upstash');
        const { Redis } = require('@upstash/redis');
        return new UpstashProvider(Redis.fromEnv());
      } catch (e) {
        // Fallback to InMemory if Upstash not available
        console.warn('Upstash Redis not available for memory, falling back to InMemory provider');
        return new InMemoryProvider();
      }
    })()
  : new InMemoryProvider(); // Development: InMemory (zero config)

/**
 * Get a unique conversation ID from Feishu chat context
 * 
 * Uses chatId + rootId to create a unique identifier for each conversation thread.
 * This allows memory to persist across messages in the same thread.
 * 
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu root message ID (thread identifier)
 * @returns Unique conversation ID for memory scope
 */
export function getConversationId(chatId: string, rootId: string): string {
  return `feishu:${chatId}:${rootId}`;
}

/**
 * Get a user-scoped ID for working memory
 * 
 * Uses chatId as the user identifier. In group chats, this represents the chat context.
 * For per-user memory, you could use the actual user ID from Feishu.
 * 
 * @param chatId - Feishu chat ID (or user ID for per-user memory)
 * @returns User-scoped ID for working memory
 */
export function getUserScopeId(chatId: string): string {
  return `user:${chatId}`;
}

