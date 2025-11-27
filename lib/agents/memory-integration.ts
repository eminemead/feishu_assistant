/**
 * Memory Integration for Mastra Agents
 * 
 * Provides a unified interface for Mastra agents to access conversation memory
 * backed by Supabase. This wrapper keeps the existing RLS security model intact
 * while integrating with Mastra's agent streaming.
 * 
 * Architecture:
 * - Agents compute: conversationId, userScopeId
 * - This wrapper handles: memory loading, message saving, context retrieval
 * - Storage: Supabase (no changes needed)
 * - RLS: Enforced at database level (user scoping)
 */

import { CoreMessage } from "ai";
import type { MemoryProvider } from "@ai-sdk-tools/memory";
import {
  memoryProvider,
  getConversationId,
  getUserScopeId,
  createMemoryProvider,
} from "../memory";

/**
 * Memory context for an agent interaction
 */
export interface AgentMemoryContext {
  conversationId: string;
  userScopeId: string;
  chatId?: string;
  rootId?: string;
  userId?: string;
  provider: MemoryProvider;
}

/**
 * Initialize memory context for an agent
 * 
 * This sets up memory scoping and loads the provider.
 * 
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID (for RLS)
 * @returns Memory context with provider
 */
export async function initializeAgentMemoryContext(
  chatId?: string,
  rootId?: string,
  userId?: string
): Promise<AgentMemoryContext> {
  // Compute scoping IDs
  const conversationId = getConversationId(chatId || "unknown", rootId || "unknown");
  const userScopeId = getUserScopeId(userId || chatId || "unknown");

  // Get memory provider (with user context for RLS)
  // In test environments without Supabase, memoryProvider will be InMemoryProvider
  let provider = memoryProvider;
  if (userId && process.env.SUPABASE_DATABASE_URL) {
    try {
      provider = await createMemoryProvider(userId);
    } catch (error) {
      console.warn(
        `⚠️ [Memory] Failed to create user-scoped provider for ${userId}, using default`,
        error
      );
      // Fall back to default provider
      provider = memoryProvider;
    }
  }

  return {
    conversationId,
    userScopeId,
    chatId,
    rootId,
    userId,
    provider,
  };
}

/**
 * Load conversation history from memory
 * 
 * Retrieves all previous messages in a conversation thread.
 * 
 * @param context - Memory context from initializeAgentMemoryContext
 * @param maxMessages - Maximum number of messages to load (default: 10)
 * @returns Array of CoreMessage from conversation history
 */
export async function loadConversationHistory(
  context: AgentMemoryContext,
  maxMessages: number = 10
): Promise<CoreMessage[]> {
  if (!context.provider || !context.provider.getMessages) {
    console.warn("[Memory] No memory provider or getMessages method configured, returning empty history");
    return [];
  }

  try {
    // Query memory for past messages
    // The provider returns messages filtered by chat scope
    const messages = await context.provider.getMessages({
      chatId: context.conversationId,
      limit: maxMessages,
    });

    if (!messages || messages.length === 0) {
      console.log(`[Memory] No previous messages for conversation: ${context.conversationId}`);
      return [];
    }

    console.log(
      `[Memory] Loaded ${messages.length} messages for conversation: ${context.conversationId}`
    );

    // Convert to CoreMessage format if needed
    // The @ai-sdk-tools/memory provider returns CoreMessage compatible format
    return messages as CoreMessage[];
  } catch (error) {
    console.error(
      `[Memory] Error loading conversation history for ${context.conversationId}:`,
      error
    );
    // Graceful fallback - continue without history
    return [];
  }
}

/**
 * Save a message to conversation memory
 * 
 * Records user and agent messages for future context retrieval.
 * 
 * @param context - Memory context
 * @param message - Message to save
 * @param role - 'user' or 'assistant'
 */
export async function saveMessageToMemory(
  context: AgentMemoryContext,
  message: string,
  role: "user" | "assistant"
): Promise<void> {
  if (!context.provider || !context.provider.saveMessage) {
    console.warn("[Memory] No memory provider or saveMessage method configured, skipping save");
    return;
  }

  try {
    // Save via memory provider
    // The provider API expects ConversationMessage format with chatId, role, content, timestamp
    await context.provider.saveMessage({
      chatId: context.conversationId,
      userId: context.userId,
      role,
      content: message,
      timestamp: new Date(),
    });

    console.log(
      `[Memory] Saved ${role} message to conversation: ${context.conversationId}`
    );
  } catch (error) {
    console.error(
      `[Memory] Error saving message to ${context.conversationId}:`,
      error
    );
    // Don't throw - continue operation even if memory save fails
  }
}

/**
 * Update working memory for a conversation
 * 
 * Working memory stores structured information about the user, preferences,
 * learned facts, etc. that should persist across conversations.
 * 
 * @param context - Memory context
 * @param workingMemory - Structured working memory data
 */
export async function updateWorkingMemory(
  context: AgentMemoryContext,
  workingMemory: Record<string, unknown>
): Promise<void> {
  if (!context.provider || !context.provider.updateWorkingMemory) {
    console.warn("[Memory] No memory provider or updateWorkingMemory method configured, skipping update");
    return;
  }

  try {
    // Serialize working memory to JSON
    const workingMemoryText = JSON.stringify(workingMemory, null, 2);

    // Save as working memory (structured context)
    // The provider stores this separately from messages
    await context.provider.updateWorkingMemory({
      chatId: context.conversationId,
      userId: context.userId,
      scope: "chat",
      content: workingMemoryText,
    });

    console.log(
      `[Memory] Updated working memory for conversation: ${context.conversationId}`
    );
  } catch (error) {
    console.error(
      `[Memory] Error updating working memory for ${context.conversationId}:`,
      error
    );
    // Don't throw - continue operation
  }
}

/**
 * Get working memory for a conversation
 * 
 * Retrieves previously saved structured context.
 * 
 * @param context - Memory context
 * @returns Parsed working memory object or null if not found
 */
export async function getWorkingMemory(
  context: AgentMemoryContext
): Promise<Record<string, unknown> | null> {
  if (!context.provider || !context.provider.getWorkingMemory) {
    console.warn("[Memory] No memory provider or getWorkingMemory method configured, returning null");
    return null;
  }

  try {
    // Get working memory for this conversation
    const workingMemoryData = await context.provider.getWorkingMemory({
      chatId: context.conversationId,
      userId: context.userId,
      scope: "chat",
    });

    if (!workingMemoryData || !workingMemoryData.content) {
      return null;
    }

    // Parse JSON
    const workingMemory = JSON.parse(workingMemoryData.content);
    console.log(
      `[Memory] Retrieved working memory for conversation: ${context.conversationId}`
    );
    return workingMemory;
  } catch (error) {
    console.error(
      `[Memory] Error retrieving working memory for ${context.conversationId}:`,
      error
    );
    return null;
  }
}

/**
 * Clear memory for a conversation
 * 
 * Removes all working memory for a chat.
 * Note: Message history deletion is not part of the standard API.
 * 
 * @param context - Memory context
 */
export async function clearConversationMemory(
  context: AgentMemoryContext
): Promise<void> {
  if (!context.provider || !context.provider.updateWorkingMemory) {
    console.warn("[Memory] No memory provider or updateWorkingMemory method configured, skipping clear");
    return;
  }

  try {
    // Clear working memory
    await context.provider.updateWorkingMemory({
      chatId: context.conversationId,
      userId: context.userId,
      scope: "chat",
      content: "{}",
    });

    console.log(
      `[Memory] Cleared conversation memory: ${context.conversationId}`
    );
  } catch (error) {
    console.error(
      `[Memory] Error clearing conversation memory for ${context.conversationId}:`,
      error
    );
    // Don't throw
  }
}

/**
 * Helper function to build agent prompt with memory context
 * 
 * Incorporates loaded conversation history and working memory into
 * the system message for the agent.
 * 
 * @param baseSystemMessage - Base system message
 * @param conversationHistory - Previous messages
 * @param workingMemory - Structured context
 * @returns Enhanced system message with context
 */
export function buildSystemMessageWithMemory(
  baseSystemMessage: string,
  conversationHistory: CoreMessage[] = [],
  workingMemory: Record<string, unknown> | null = null
): string {
  let enhancedMessage = baseSystemMessage;

  // Add working memory context if available
  if (workingMemory && Object.keys(workingMemory).length > 0) {
    enhancedMessage += "\n\n## User Context\n";
    for (const [key, value] of Object.entries(workingMemory)) {
      enhancedMessage += `- **${key}**: ${JSON.stringify(value)}\n`;
    }
  }

  // Add conversation history context if available
  if (conversationHistory.length > 0) {
    enhancedMessage += "\n## Recent Conversation\n";
    for (const msg of conversationHistory.slice(-5)) {
      // Show last 5 messages
      if (msg.role === "user") {
        enhancedMessage += `- User: ${msg.content}\n`;
      } else if (msg.role === "assistant") {
        enhancedMessage += `- Assistant: ${msg.content}\n`;
      }
    }
  }

  return enhancedMessage;
}
