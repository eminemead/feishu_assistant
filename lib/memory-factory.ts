/**
 * Mastra Memory Factory - Native Memory Integration
 * 
 * Creates Memory instances for agents using Mastra's native pattern.
 * Uses Supabase PostgreSQL for continuity with existing infrastructure.
 * 
 * Phase 1: Attach memory to agents so Studio can see it.
 * Phase 2: Will consolidate all memory operations through this pattern.
 * 
 * @see https://mastra.ai/docs/memory/overview
 */

import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { getInternalEmbedding } from './shared/internal-embedding';

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

let sharedStorage: PostgresStore | null = null;

/**
 * Get or create the shared PostgresStore instance
 * This is used by both the Mastra instance and individual agents
 */
export function getSharedStorage(): PostgresStore | null {
  if (sharedStorage) {
    return sharedStorage;
  }

  if (!SUPABASE_DATABASE_URL) {
    console.warn('⚠️ [MemoryFactory] SUPABASE_DATABASE_URL not configured');
    return null;
  }

  try {
    sharedStorage = new PostgresStore({
      id: "feishu-assistant-pg",
      connectionString: SUPABASE_DATABASE_URL,
    });
    console.log('✅ [MemoryFactory] Shared PostgresStore initialized');
    return sharedStorage;
  } catch (error) {
    console.error('❌ [MemoryFactory] Failed to initialize PostgresStore:', error);
    return null;
  }
}

/**
 * Create a Memory instance for an agent
 * 
 * This is the Mastra-native way to attach memory to agents.
 * The Memory instance handles:
 * - Working memory (Layer 1): Persistent user facts
 * - Conversation history (Layer 2): Recent messages
 * - Semantic recall (Layer 3): Vector-based retrieval (when enabled)
 * 
 * @param options - Optional configuration overrides
 * @returns Memory instance or null if storage unavailable
 */
export function createAgentMemory(options?: {
  lastMessages?: number;
  enableSemanticRecall?: boolean;
  enableWorkingMemory?: boolean;
}): Memory | null {
  const storage = getSharedStorage();
  
  if (!storage) {
    console.warn('⚠️ [MemoryFactory] Cannot create memory - storage unavailable');
    return null;
  }

  const {
    lastMessages = 20,
    enableSemanticRecall = false, // Disabled until PgVector is configured
    enableWorkingMemory = true,
  } = options || {};

  try {
    const memory = new Memory({
      storage: storage as any,
      options: {
        lastMessages,
        workingMemory: enableWorkingMemory ? {
          enabled: true,
        } : undefined,
        semanticRecall: enableSemanticRecall ? {
          enabled: true,
          maxResults: 10,
          scope: "resource",
          messageRange: 2,
        } : {
          enabled: false,
        },
        embedder: enableSemanticRecall 
          ? (getInternalEmbedding() || "openai/text-embedding-3-small")
          : undefined,
      },
    } as any);

    return memory;
  } catch (error) {
    console.error('❌ [MemoryFactory] Failed to create memory:', error);
    return null;
  }
}

/**
 * Get memory thread identifier from Feishu context
 * Consistent with existing getMemoryThread in memory-mastra.ts
 */
export function getMemoryThreadId(chatId: string, rootId: string): string {
  return `feishu:${chatId}:${rootId}`;
}

/**
 * Get memory resource identifier from Feishu user
 * Consistent with existing getMemoryResource in memory-mastra.ts
 */
export function getMemoryResourceId(feishuUserId: string): string {
  return `user:${feishuUserId}`;
}
