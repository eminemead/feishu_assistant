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
import { PostgresStore, PgVector } from '@mastra/pg';
import { getInternalEmbedding } from './shared/internal-embedding';
import { openai } from '@ai-sdk/openai';
import { logger } from './logger';

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

let sharedStorage: PostgresStore | null = null;
let sharedVector: PgVector | null = null;

/**
 * Get or create the shared PostgresStore instance
 * This is used by both the Mastra instance and individual agents
 */
export function getSharedStorage(): PostgresStore | null {
  if (sharedStorage) {
    return sharedStorage;
  }

  if (!SUPABASE_DATABASE_URL) {
    logger.warn('[MemoryFactory] SUPABASE_DATABASE_URL not configured');
    return null;
  }

  try {
    sharedStorage = new PostgresStore({
      id: "feishu-assistant-pg",
      connectionString: SUPABASE_DATABASE_URL,
    });
    logger.success('MemoryFactory', 'Shared PostgresStore initialized');
    return sharedStorage;
  } catch (error) {
    logger.fail('MemoryFactory', 'Failed to initialize PostgresStore', error);
    return null;
  }
}

/**
 * Get or create the shared PgVector instance for semantic recall
 */
export function getSharedVector(): PgVector | null {
  if (sharedVector) {
    return sharedVector;
  }

  if (!SUPABASE_DATABASE_URL) {
    logger.warn('[MemoryFactory] SUPABASE_DATABASE_URL not configured for vector');
    return null;
  }

  try {
    sharedVector = new PgVector({
      id: "feishu-assistant-vector",
      connectionString: SUPABASE_DATABASE_URL,
    });
    logger.success('MemoryFactory', 'Shared PgVector initialized');
    return sharedVector;
  } catch (error) {
    logger.fail('MemoryFactory', 'Failed to initialize PgVector', error);
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
    logger.warn('[MemoryFactory] Cannot create memory - storage unavailable');
    return null;
  }

  const {
    lastMessages = 20,
    enableSemanticRecall = true, // Enabled by default with PgVector + NIO embedding
    enableWorkingMemory = true,
  } = options || {};

  try {
    // Build memory config based on options
    const memoryConfig: any = {
      storage: storage,
      options: {
        lastMessages,
        workingMemory: enableWorkingMemory ? { enabled: true } : undefined,
        semanticRecall: false, // disabled by default
      },
    };

    // Only configure semantic recall when explicitly enabled
    if (enableSemanticRecall) {
      const vector = getSharedVector();
      if (!vector) {
        logger.warn('[MemoryFactory] Semantic recall requested but PgVector unavailable, falling back to disabled');
      } else {
        // Get embedder - prefer internal, fallback to OpenAI
        const embedder = getInternalEmbedding() || openai.embedding("text-embedding-3-small");
        
        memoryConfig.vector = vector;
        memoryConfig.embedder = embedder;
        memoryConfig.options.semanticRecall = {
          topK: 10,
          messageRange: 5,
        };
        logger.success('MemoryFactory', 'Semantic recall enabled with PgVector');
      }
    }

    const memory = new Memory(memoryConfig);
    return memory;
  } catch (error) {
    logger.fail('MemoryFactory', 'Failed to create memory', error);
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
