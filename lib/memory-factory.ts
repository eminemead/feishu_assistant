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
// Structured for DPA team's OKR analysis, team coordination, and data operations
const WORKING_MEMORY_TEMPLATE = `
# 用户画像 (User Profile)

## 身份信息 (Identity)
- **姓名/Name**:
- **语言偏好/Language**: (zh-CN / en / auto)
- **角色/Role**: (团队成员/lead/管理者)
- **职责范围/Scope**: (如 "负责NIO品牌OKR", "数据平台")

## 分析偏好 (Analysis Preferences)
- **首选呈现方式/Format**: (表格/table | 图表/chart | 摘要/summary | 详细/detailed)
- **默认对比周期/Default Comparison**: (月环比/MoM | 周同比/WoW | 自定义)
- **图表类型偏好/Chart Preference**: (heatmap | bar | line | auto)
- **详细程度/Detail Level**: (简洁/concise | 标准/standard | 深度/deep)

## OKR 关注点 (OKR Focus)
- **关注的品牌/Focus Brands**: (如 NIO, ALPS, Firefly)
- **核心指标/Key Metrics**: (如 has_metric_percentage, completion_rate)
- **关注的BU或团队/Focus Teams**:
- **常用对比基准/Baselines**: (如 "上月同期", "Q4目标")
- **最近分析的周期/Recent Periods**:

## 团队协作 (Team Collaboration)
- **常用GitLab项目/GitLab Projects**:
- **常关注的群聊/Key Chats**:
- **跟踪的文档/Tracked Docs**:

## 当前上下文 (Current Context)
- **进行中的任务/Active Tasks**:
- **未解决问题/Open Questions**:
- **重要备注/Important Notes**:
`;

const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

let sharedStorage: PostgresStore | null = null;
let sharedVector: PgVector | null = null;
let storageInitialized = false;
let vectorInitialized = false;

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
    logger.success('MemoryFactory', 'Shared PostgresStore created');
    return sharedStorage;
  } catch (error) {
    logger.fail('MemoryFactory', 'Failed to create PostgresStore', error);
    return null;
  }
}

/**
 * Initialize storage tables (call once at startup)
 * Required when using PostgresStore directly outside of Mastra core
 */
export async function initializeStorage(): Promise<boolean> {
  if (storageInitialized) return true;
  
  const storage = getSharedStorage();
  if (!storage) return false;
  
  try {
    await storage.init();
    storageInitialized = true;
    logger.success('MemoryFactory', 'PostgresStore tables initialized');
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.fail('MemoryFactory', `Failed to init PostgresStore: ${errMsg}`);
    return false;
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
    logger.success('MemoryFactory', 'Shared PgVector created');
    return sharedVector;
  } catch (error) {
    logger.fail('MemoryFactory', 'Failed to create PgVector', error);
    return null;
  }
}

/**
 * Initialize vector tables (call once at startup)
 */
export async function initializeVector(): Promise<boolean> {
  if (vectorInitialized) return true;
  
  const vector = getSharedVector();
  if (!vector) return false;
  
  try {
    await vector.init();
    vectorInitialized = true;
    logger.success('MemoryFactory', 'PgVector tables initialized');
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.fail('MemoryFactory', `Failed to init PgVector: ${errMsg}`);
    return false;
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
    logger.success('MemoryFactory', 'Memory instance created successfully');
    return memory;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.fail('MemoryFactory', `Failed to create memory: ${errMsg}`);
    if (errStack) console.error('[MemoryFactory] Stack:', errStack);
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

// ============================================================
// WORKING MEMORY AUTO-POPULATION
// ============================================================

import { getUserDepartmentInfoCached, type UserDepartmentInfo } from './feishu-user-info';

// Track initialized users to avoid repeated lookups (in-memory, resets on restart)
const initializedUsers = new Set<string>();

/**
 * Generate initial working memory from Feishu user info
 */
function generateInitialWorkingMemory(userInfo: UserDepartmentInfo): string {
  const lines: string[] = [
    '# 用户画像 (User Profile)',
    '',
    '## 身份信息 (Identity)',
    `- **姓名/Name**: ${userInfo.name}`,
    '- **语言偏好/Language**: auto',
    `- **角色/Role**: ${userInfo.job_title || '团队成员'}`,
    '- **职责范围/Scope**:',
    '',
    '## 分析偏好 (Analysis Preferences)',
    '- **首选呈现方式/Format**: auto',
    '- **默认对比周期/Default Comparison**: MoM',
    '- **图表类型偏好/Chart Preference**: auto',
    '- **详细程度/Detail Level**: standard',
    '',
    '## OKR 关注点 (OKR Focus)',
    '- **关注的品牌/Focus Brands**:',
    '- **核心指标/Key Metrics**:',
    '- **关注的BU或团队/Focus Teams**:',
    '- **常用对比基准/Baselines**:',
    '- **最近分析的周期/Recent Periods**:',
    '',
    '## 团队协作 (Team Collaboration)',
    '- **常用GitLab项目/GitLab Projects**:',
    '- **常关注的群聊/Key Chats**:',
    '- **跟踪的文档/Tracked Docs**:',
    '',
    '## 当前上下文 (Current Context)',
    '- **进行中的任务/Active Tasks**:',
    '- **未解决问题/Open Questions**:',
    '- **重要备注/Important Notes**:',
  ];
  
  return lines.join('\n');
}

/**
 * Ensure working memory is initialized for a user
 * 
 * On first interaction:
 * 1. Fetches user info from Feishu API (cached)
 * 2. Pre-populates working memory with name/role
 * 3. Subsequent calls are no-ops (tracked in memory)
 * 
 * Call this in the request handler before agent.stream()
 * 
 * @param feishuUserId - User's open_id
 * @param memory - Memory instance from createAgentMemory()
 * @param threadId - Thread ID for the conversation
 * @returns true if initialized (first time), false if already done
 */
export async function ensureWorkingMemoryInitialized(
  feishuUserId: string,
  memory: Memory | null,
  threadId: string,
): Promise<boolean> {
  if (!memory) return false;
  
  const resourceId = getMemoryResourceId(feishuUserId);
  
  // Skip if already initialized this session
  if (initializedUsers.has(resourceId)) {
    return false;
  }
  
  try {
    // Check if working memory already has content (not just template)
    // We do this by checking thread metadata - if user has interacted before,
    // the LLM would have updated working memory
    const threads = await memory.getThreadsByResourceId({ resourceId });
    const hasExistingThreads = threads && threads.length > 0;
    
    if (hasExistingThreads) {
      // User has history, mark as initialized and skip
      initializedUsers.add(resourceId);
      logger.info('MemoryFactory', `User ${feishuUserId} has existing threads, skipping auto-populate`);
      return false;
    }
    
    // First-time user: fetch info from Feishu and pre-populate
    logger.info('MemoryFactory', `First interaction for ${feishuUserId}, fetching Feishu profile...`);
    
    const userInfo = await getUserDepartmentInfoCached(feishuUserId);
    if (!userInfo) {
      logger.warn('MemoryFactory', `Could not fetch Feishu user info for ${feishuUserId}`);
      initializedUsers.add(resourceId); // Don't retry
      return false;
    }
    
    // Generate and set initial working memory
    const initialMemory = generateInitialWorkingMemory(userInfo);
    
    await memory.updateWorkingMemory({
      threadId,
      resourceId,
      workingMemory: initialMemory,
    });
    
    initializedUsers.add(resourceId);
    logger.success('MemoryFactory', `Auto-populated working memory for ${userInfo.name} (${feishuUserId})`);
    return true;
  } catch (error) {
    logger.fail('MemoryFactory', `Failed to auto-populate working memory for ${feishuUserId}`, error);
    initializedUsers.add(resourceId); // Don't retry on error
    return false;
  }
}

/**
 * Clear the initialized users cache (for testing)
 */
export function clearInitializedUsersCache(): void {
  initializedUsers.clear();
  logger.info('MemoryFactory', 'Cleared initialized users cache');
}
