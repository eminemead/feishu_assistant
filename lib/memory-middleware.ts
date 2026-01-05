/**
 * Memory Middleware - DEPRECATED
 * 
 * This module is deprecated in favor of Mastra's native memory pattern.
 * 
 * Phase 2 Migration:
 * - Agents now use `memory: { resource, thread }` at call time
 * - Mastra handles message saving/loading automatically
 * - This file remains for backward compatibility during transition
 * 
 * @deprecated Use Mastra native memory pattern instead
 * @see lib/memory-factory.ts for the new approach
 */

import { CoreMessage } from 'ai';
import { getMemoryThreadId, getMemoryResourceId } from './memory-factory';

export interface MemoryContext {
  threadId: string | undefined;
  resourceId: string | undefined;
  userId: string | undefined;
  chatId: string | undefined;
  rootId: string | undefined;
}

/**
 * @deprecated Use Mastra native memory pattern with memoryConfig at agent call time
 */
export async function initializeMemoryContext(
  userId?: string,
  chatId?: string,
  rootId?: string
): Promise<MemoryContext> {
  const resourceId = userId ? getMemoryResourceId(userId) : undefined;
  const threadId = chatId && rootId ? getMemoryThreadId(chatId, rootId) : undefined;

  return {
    threadId,
    resourceId,
    userId,
    chatId,
    rootId,
  };
}

/**
 * @deprecated Mastra handles history loading automatically when memory config is passed
 */
export async function loadMemoryHistory(_context: MemoryContext): Promise<CoreMessage[]> {
  console.warn('[Memory] loadMemoryHistory is deprecated - Mastra handles this automatically');
  return [];
}

/**
 * @deprecated Mastra handles message saving automatically when memory config is passed
 */
export async function saveMessagesToMemory(
  _context: MemoryContext,
  _userMessage: string,
  _assistantMessage: string
): Promise<void> {
  console.warn('[Memory] saveMessagesToMemory is deprecated - Mastra handles this automatically');
}

/**
 * @deprecated Use Mastra's native working memory when enabled on the agent
 */
export async function updateWorkingMemory(
  _context: MemoryContext,
  _workingMemory: Record<string, unknown>
): Promise<void> {
  console.warn('[Memory] updateWorkingMemory is deprecated - use Mastra native working memory');
}

/**
 * @deprecated Use Mastra's native working memory when enabled on the agent
 */
export async function getWorkingMemory(
  _context: MemoryContext
): Promise<Record<string, unknown> | null> {
  console.warn('[Memory] getWorkingMemory is deprecated - use Mastra native working memory');
  return null;
}

/**
 * Helper to build system message with memory context
 * This can still be used for injecting context into messages
 */
export function buildSystemMessageWithMemory(
  baseMessage: string,
  workingMemory?: Record<string, unknown> | null
): string {
  let enhancedMessage = baseMessage;

  if (workingMemory && Object.keys(workingMemory).length > 0) {
    enhancedMessage += "\n\n## User Context\n";
    for (const [key, value] of Object.entries(workingMemory)) {
      enhancedMessage += `- **${key}**: ${JSON.stringify(value)}\n`;
    }
  }

  return enhancedMessage;
}
