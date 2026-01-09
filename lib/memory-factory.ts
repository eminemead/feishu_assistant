/**
 * Mastra Memory Factory - Native Memory Integration
 * 
 * Creates Memory instances for agents using Mastra's native pattern.
 * Uses Supabase PostgreSQL for persistence.
 * 
 * @see https://mastra.ai/docs/memory/overview
 */

import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { getInternalEmbedding } from './shared/internal-embedding';
import { openai } from '@ai-sdk/openai';
import { logger } from './logger';

// Working memory template - LLM fills this in based on user interactions
const WORKING_MEMORY_TEMPLATE = `
# 用户信息 (User Profile)

## 基本信息 (Basic Info)
- **姓名/Name**:
- **语言偏好/Language**: (zh-CN / en)
- **部门/Department**:
- **角色/Role**:

## 偏好设置 (Preferences)
- **报告格式/Report Format**: (表格/table | 图表/chart | 摘要/summary)
- **默认时间范围/Default Period**: (如 "Q4 2025", "12月")
- **关注的公司/Focus Companies**:
- **沟通风格/Communication Style**:

## OKR 上下文 (OKR Context)
- **关注的指标/Key Metrics**:
- **近期分析/Recent Analysis**:
- **对比基准/Comparison Baseline**:

## 会话状态 (Session State)
- **当前讨论主题/Current Topic**:
- **待办事项/Pending Actions**:
- **未解决问题/Open Questions**:
`;

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
    const memoryConfig: any = {
      storage,
      options: {
        lastMessages,
        workingMemory: enableWorkingMemory ? {
          enabled: true,
          scope: "resource",
          template: WORKING_MEMORY_TEMPLATE,
        } : undefined,
        semanticRecall: false,
        threads: { generateTitle: true },
      },
    };

    if (enableSemanticRecall) {
      const vector = getSharedVector();
      if (!vector) {
        logger.warn('[MemoryFactory] Semantic recall requested but PgVector unavailable');
      } else {
        const embedder = getInternalEmbedding() || openai.embedding("text-embedding-3-small");
        memoryConfig.vector = vector;
        memoryConfig.embedder = embedder;
        memoryConfig.options.semanticRecall = {
          topK: 5,
          messageRange: { before: 3, after: 1 },
          scope: "resource",
          threshold: 0.65,
        };
        logger.success('MemoryFactory', 'Semantic recall enabled');
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
