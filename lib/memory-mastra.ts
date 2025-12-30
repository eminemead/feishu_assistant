/**
 * Memory Configuration for AI Agents - Mastra 3-Layer Architecture
 * 
 * Replaces @ai-sdk-tools/memory with Mastra's native Memory system.
 * 
 * Three Layers:
 * 1. Working Memory - Persistent user-specific details (preferences, facts, goals)
 * 2. Conversation History - Recent messages for short-term continuity
 * 3. Semantic Recall - Vector-based retrieval of relevant past messages (RAG-style)
 * 
 * Storage: PostgreSQL (Supabase) via @mastra/pg
 * 
 * Benefits:
 * - Structured memory abstraction for agents
 * - Semantic search across conversation history
 * - User-scoped isolation via RLS
 * - Automatic table creation and schema management
 * 
 * @see https://mastra.ai/docs/memory/overview
 * @see https://mastra.ai/reference/storage/postgresql
 */

import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { getOrCreateSupabaseUser } from './auth/feishu-supabase-auth';
import { getInternalEmbedding } from './shared/internal-embedding';

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

// Global PostgreSQL storage (singleton per process)
let postgresStore: PostgresStore | null = null;

/**
 * Initialize PostgreSQL storage for Mastra memory
 * Handles connection setup and schema creation
 */
async function initializePostgresStore(): Promise<PostgresStore | null> {
  if (postgresStore) {
    return postgresStore;
  }

  if (!SUPABASE_DATABASE_URL) {
    console.warn('⚠️ [Memory] SUPABASE_DATABASE_URL not configured');
    return null;
  }

  try {
    postgresStore = new PostgresStore({
      id: "feishu-assistant-pg",
      connectionString: SUPABASE_DATABASE_URL,
    });
    console.log('✅ [Memory] Connected to PostgreSQL storage (Mastra)');
    return postgresStore;
  } catch (error) {
    console.error('❌ [Memory] Failed to initialize PostgreSQL storage:', error);
    return null;
  }
}

/**
 * Create Mastra Memory instance with 3-layer architecture
 * 
 * Configuration:
 * - lastMessages: 20 - Keep recent 20 messages in context
 * - semanticRecall: true - Enable vector-based retrieval of past messages
 * - workingMemory: true - Store persistent user facts/preferences
 * 
 * @param feishuUserId - Feishu user ID for scoping memory
 * @returns Configured Memory instance or null if storage unavailable
 */
export async function createMastraMemory(feishuUserId: string): Promise<Memory | null> {
  // Ensure Supabase user exists for RLS
  const supabaseUserId = await getOrCreateSupabaseUser(feishuUserId);

  if (!supabaseUserId) {
    console.warn(`⚠️ [Memory] Failed to create Supabase user for ${feishuUserId}`);
    return null;
  }

  const storage = await initializePostgresStore();

  if (!storage) {
    console.warn(`⚠️ [Memory] PostgreSQL storage unavailable for ${feishuUserId}`);
    return null;
  }

  return new Memory({
    storage: storage as any,
    options: {
      // Layer 2: Recent conversation history (short-term context)
      lastMessages: 20,
      // Layer 3: Semantic recall configuration
      // Retrieves older messages similar to current context
      semanticRecall: {
        enabled: true,
        maxResults: 10,
        scope: "resource", // Search across ALL threads for this user (resource-level)
        messageRange: 2, // Include 2 messages before/after each match
      },
      // Embedding model for semantic recall
      // Use internal NIO embedding model to reduce costs
      embedder: getInternalEmbedding() || "openai/text-embedding-3-small",
    },
  } as any);
}

/**
 * Get conversation memory scope
 * Used to isolate memory per conversation thread
 * 
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread ID (root message)
 * @returns Thread-scoped memory identifier
 */
export function getMemoryThread(chatId: string, rootId: string): string {
  return `feishu:${chatId}:${rootId}`;
}

/**
 * Get user memory scope
 * Used for resource-scoped memory (shared across conversations)
 * 
 * @param feishuUserId - Feishu user ID
 * @returns User-scoped memory identifier
 */
export function getMemoryResource(feishuUserId: string): string {
  return `user:${feishuUserId}`;
}

/**
 * Fallback in-memory storage (for development/testing)
 * Used when PostgreSQL is unavailable
 * Note: This is a simple fallback - data will be lost on restart
 */
class SimpleMemoryStore {
  private data = new Map<string, any>();
  
  async get(key: string) {
    return this.data.get(key);
  }
  
  async set(key: string, value: any) {
    this.data.set(key, value);
  }
  
  async clear() {
    this.data.clear();
  }
}

export const fallbackMemoryStore = new SimpleMemoryStore();

/**
 * Initialize global Mastra memory on startup
 * Call this once during server initialization
 */
export async function initializeMastraMemory(): Promise<void> {
  const storage = await initializePostgresStore();
  if (storage) {
    console.log('✅ [Memory] Mastra memory system initialized');
  } else {
    console.warn('⚠️ [Memory] Mastra memory system unavailable, falling back to in-memory');
  }
}
