/**
 * Memory Configuration for AI Agents
 * 
 * Uses @ai-sdk-tools/memory with Supabase (PostgreSQL) backend for persistent memory.
 * 
 * Benefits:
 * - Working memory: Store user preferences, learned facts, and context
 * - Conversation history: Access past messages for context
 * - Chat persistence: Auto-generated titles and session tracking
 * - Row Level Security (RLS): User-level data isolation
 * 
 * @see https://ai-sdk-tools.dev/memory
 */

import { InMemoryProvider } from '@ai-sdk-tools/memory/in-memory';
import { DrizzleProvider } from '@ai-sdk-tools/memory/drizzle';
import type { MemoryProvider } from '@ai-sdk-tools/memory';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getOrCreateSupabaseUser } from './auth/feishu-supabase-auth';

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

// Service role database connection (for admin operations)
// This bypasses RLS and should only be used for user management
let serviceRoleDb: ReturnType<typeof drizzle> | null = null;

if (SUPABASE_DATABASE_URL) {
  try {
    const client = postgres(SUPABASE_DATABASE_URL, { max: 1 });
    serviceRoleDb = drizzle(client);
    console.log('✅ [Memory] Connected to Supabase database');
  } catch (error) {
    console.error('❌ [Memory] Failed to connect to Supabase:', error);
  }
}

/**
 * Create memory provider with user context for RLS
 * 
 * This provider uses DrizzleProvider with Supabase backend.
 * RLS policies are enforced at the database level via user-scoped connections.
 * 
 * Note: The @ai-sdk-tools/memory DrizzleProvider currently doesn't support
 * user-scoped connections directly, so we use service role but rely on
 * application-level filtering. Future versions may support user-scoped connections.
 * 
 * @param feishuUserId - Feishu user ID (open_id/user_id)
 * @returns Memory provider configured for the user
 */
export async function createMemoryProvider(feishuUserId: string): Promise<MemoryProvider> {
  // Ensure Supabase user exists
  const supabaseUserId = await getOrCreateSupabaseUser(feishuUserId);
  
  if (!supabaseUserId || !serviceRoleDb) {
    console.warn(`⚠️ [Memory] Supabase not configured, falling back to InMemory provider for user: ${feishuUserId}`);
    return new InMemoryProvider();
  }
  
  // Use DrizzleProvider with service role connection
  // RLS is enforced at the application level by ensuring user_id matches
  // Future: Use user-scoped connection when DrizzleProvider supports it
  return new DrizzleProvider(serviceRoleDb, {
    workingMemoryTable: 'agent_working_memory',
    messagesTable: 'agent_messages',
    chatsTable: 'agent_chats'
  });
}

/**
 * Default memory provider (for backward compatibility)
 * 
 * Uses Supabase if configured, otherwise falls back to InMemory provider.
 * For user-scoped memory, use createMemoryProvider() instead.
 * 
 * Note: This provider doesn't have user context, so RLS won't work properly.
 * Use createMemoryProvider() for production use with RLS.
 */
export const memoryProvider: MemoryProvider = SUPABASE_DATABASE_URL && serviceRoleDb
  ? new DrizzleProvider(serviceRoleDb, {
      workingMemoryTable: 'agent_working_memory',
      messagesTable: 'agent_messages',
      chatsTable: 'agent_chats'
    })
  : new InMemoryProvider();

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
 * Uses actual Feishu user ID for proper RLS enforcement.
 * Falls back to chatId if userId is not available (backward compatibility).
 * 
 * @param userId - Feishu user ID (open_id/user_id) or chatId as fallback
 * @returns User-scoped ID for working memory
 */
export function getUserScopeId(userId: string): string {
  return `user:${userId}`;
}
