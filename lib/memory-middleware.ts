/**
 * Centralized Mastra Memory Middleware
 * 
 * Provides a unified interface for all agents to interact with Mastra Memory.
 * This replaces the legacy @ai-sdk-tools/memory system with a cleaner abstraction.
 * 
 * Features:
 * - Automatic thread management
 * - Message saving with proper format
 * - History loading with error handling
 * - User-scoped memory isolation
 */

import { Memory } from '@mastra/memory';
import { CoreMessage } from 'ai';
import { createMastraMemory, getMemoryThread, getMemoryResource } from './memory-mastra';

export interface MemoryContext {
  memory: Memory | null;
  threadId: string | undefined;
  resourceId: string | undefined;
  userId: string | undefined;
  chatId: string | undefined;
  rootId: string | undefined;
}

/**
 * Initialize memory context for an agent interaction
 * 
 * @param userId - Feishu user ID for scoping
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @returns Memory context object
 */
export async function initializeMemoryContext(
  userId?: string,
  chatId?: string,
  rootId?: string
): Promise<MemoryContext> {
  let memory: Memory | null = null;
  let threadId: string | undefined;
  let resourceId: string | undefined;

  try {
    if (userId) {
      memory = await createMastraMemory(userId);
      resourceId = getMemoryResource(userId);
      
      if (chatId && rootId) {
        threadId = getMemoryThread(chatId, rootId);
        
        // Ensure thread exists
        if (memory && threadId && resourceId) {
          try {
            const existingThread = await memory.getThreadById({ threadId });
            if (!existingThread) {
              // Create thread if it doesn't exist
              await memory.saveThread({
                thread: {
                  id: threadId,
                  resourceId,
                  title: `Feishu Chat ${chatId}`,
                  metadata: { chatId, rootId },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
              console.log(`[Memory] Created thread: ${threadId}`);
            }
          } catch (error) {
            console.warn(`[Memory] Failed to ensure thread exists:`, error);
          }
        }
      }
      
      if (memory) {
        console.log(`✅ [Memory] Initialized for user: ${userId}`);
        console.log(`   Resource: ${resourceId}, Thread: ${threadId || 'not set'}`);
      }
    }
  } catch (error) {
    console.warn(`⚠️ [Memory] Initialization failed:`, error);
  }

  return {
    memory,
    threadId,
    resourceId,
    userId,
    chatId,
    rootId,
  };
}

/**
 * Load conversation history from memory
 * 
 * @param context - Memory context from initializeMemoryContext
 * @returns Array of CoreMessage from conversation history
 */
export async function loadMemoryHistory(context: MemoryContext): Promise<CoreMessage[]> {
  if (!context.memory || !context.threadId || !context.resourceId) {
    return [];
  }

  try {
    let messages: any[] = [];
    
    // Try query() first, fallback to recall()
    if (typeof (context.memory as any).query === 'function') {
      const result = await (context.memory as any).query({
        threadId: context.threadId,
        resourceId: context.resourceId,
      });
      messages = result?.messages || [];
    } else if (typeof (context.memory as any).recall === 'function') {
      messages = await (context.memory as any).recall({
        threadId: context.threadId,
        resourceId: context.resourceId,
      });
    } else {
      console.warn(`[Memory] No query() or recall() method available`);
      return [];
    }
    
    if (messages && messages.length > 0) {
      console.log(`[Memory] Loaded ${messages.length} messages from thread: ${context.threadId}`);
      
      // Convert Mastra messages to CoreMessage format
      return messages.map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : msg.content?.text || JSON.stringify(msg.content),
      })) as CoreMessage[];
    }
    
    console.log(`[Memory] No messages found for thread: ${context.threadId}`);
    return [];
  } catch (error) {
    console.error(`[Memory] Error loading history:`, error);
    return [];
  }
}

/**
 * Save messages to memory
 * 
 * @param context - Memory context
 * @param userMessage - User message content
 * @param assistantMessage - Assistant message content
 */
export async function saveMessagesToMemory(
  context: MemoryContext,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  if (!context.memory || !context.threadId || !context.resourceId) {
    console.warn(`[Memory] Cannot save - missing context`);
    return;
  }

  try {
    const timestamp = new Date();
    const userMessageId = `msg-${context.threadId}-user-${timestamp.getTime()}`;
    const assistantMessageId = `msg-${context.threadId}-assistant-${timestamp.getTime() + 1}`;
    
    await context.memory.saveMessages({
      messages: [
        {
          id: userMessageId,
          threadId: context.threadId,
          resourceId: context.resourceId,
          role: "user",
          content: { content: userMessage } as any,
          createdAt: timestamp,
        },
        {
          id: assistantMessageId,
          threadId: context.threadId,
          resourceId: context.resourceId,
          role: "assistant",
          content: { content: assistantMessage } as any,
          createdAt: new Date(timestamp.getTime() + 1),
        },
      ],
    });
    
    console.log(`[Memory] Saved messages to thread: ${context.threadId}`);
  } catch (error) {
    console.error(`[Memory] Error saving messages:`, error);
  }
}

/**
 * Update working memory (structured context)
 * 
 * @param context - Memory context
 * @param workingMemory - Structured data to store
 */
export async function updateWorkingMemory(
  context: MemoryContext,
  workingMemory: Record<string, unknown>
): Promise<void> {
  // TODO: Implement working memory updates once Mastra supports it
  // For now, we can store this as a special message in the thread
  if (!context.memory || !context.threadId || !context.resourceId) {
    return;
  }

  try {
    const workingMemoryMessage = JSON.stringify(workingMemory);
    await context.memory.saveMessages({
      messages: [
        {
          id: `working-memory-${context.threadId}-${Date.now()}`,
          threadId: context.threadId,
          resourceId: context.resourceId,
          role: "system",
          content: { content: workingMemoryMessage } as any,
          createdAt: new Date(),
        },
      ],
    });
    
    console.log(`[Memory] Updated working memory for thread: ${context.threadId}`);
  } catch (error) {
    console.error(`[Memory] Error updating working memory:`, error);
  }
}

/**
 * Get working memory from thread
 * 
 * @param context - Memory context
 * @returns Parsed working memory object or null
 */
export async function getWorkingMemory(
  context: MemoryContext
): Promise<Record<string, unknown> | null> {
  if (!context.memory || !context.threadId) {
    return null;
  }

  try {
    let messages: any[] = [];
    
    // Get messages using query() or recall()
    if (typeof (context.memory as any).query === 'function') {
      const result = await (context.memory as any).query({
        threadId: context.threadId,
        resourceId: context.resourceId,
      });
      messages = result?.messages || [];
    } else if (typeof (context.memory as any).recall === 'function') {
      messages = await (context.memory as any).recall({
        threadId: context.threadId,
        resourceId: context.resourceId,
      });
    } else {
      return null;
    }
    
    // Look for system messages that contain working memory
    for (const msg of messages) {
      if (msg.role === 'system' && msg.content) {
        try {
          const content = typeof msg.content === 'string' 
            ? msg.content 
            : msg.content?.text || '';
          
          if (content.startsWith('{')) {
            return JSON.parse(content);
          }
        } catch {
          // Not JSON, continue
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`[Memory] Error getting working memory:`, error);
    return null;
  }
}

/**
 * Helper to build system message with memory context
 * 
 * @param baseMessage - Base system message
 * @param workingMemory - Structured context
 * @returns Enhanced system message
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
