/**
 * Memory Helpers - Mastra Integration
 * 
 * PHASE 2 CLEANUP: This file now only contains helper functions for memory scoping.
 * The actual memory creation is handled by lib/memory-factory.ts
 * 
 * @deprecated Most functions moved to memory-factory.ts
 * @see lib/memory-factory.ts for the new approach
 */

import { getMemoryThreadId, getMemoryResourceId } from './memory-factory';

/**
 * Get conversation memory scope
 * Used to isolate memory per conversation thread
 * 
 * @deprecated Use getMemoryThreadId from memory-factory.ts
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread ID (root message)
 * @returns Thread-scoped memory identifier
 */
export function getMemoryThread(chatId: string, rootId: string): string {
  return getMemoryThreadId(chatId, rootId);
}

/**
 * Get user memory scope
 * Used for resource-scoped memory (shared across conversations)
 * 
 * @deprecated Use getMemoryResourceId from memory-factory.ts
 * @param feishuUserId - Feishu user ID
 * @returns User-scoped memory identifier
 */
export function getMemoryResource(feishuUserId: string): string {
  return getMemoryResourceId(feishuUserId);
}

/**
 * @deprecated Use createAgentMemory from memory-factory.ts
 * This function is kept for backward compatibility only.
 */
export async function createMastraMemory(_feishuUserId: string): Promise<null> {
  console.warn('[Memory] createMastraMemory is deprecated - use createAgentMemory from memory-factory.ts');
  console.warn('[Memory] Agents should use Mastra native memory pattern: agent.stream(messages, { memory: { resource, thread } })');
  return null;
}

/**
 * @deprecated No longer needed - Mastra handles initialization automatically
 */
export async function initializeMastraMemory(): Promise<void> {
  console.log('✅ [Memory] Using Mastra native memory pattern (no manual initialization needed)');
}
