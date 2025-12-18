import { CoreMessage } from "ai";
import { managerAgent } from "./agents/manager-agent-mastra";

/**
 * Generate response using the manager agent architecture
 * The manager agent orchestrates specialist agents (okr_reviewer, alignment_agent, etc.)
 * and routes queries to the appropriate specialist based on keywords or semantic meaning
 * 
 * @param messages - Conversation messages
 * @param updateStatus - Optional callback for streaming status updates
 * @param chatId - Feishu chat ID for memory scoping
 * @param rootId - Feishu root message ID (thread identifier) for conversation context
 * @param userId - Feishu user ID (open_id/user_id) for authentication and RLS
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
) => {
  return await managerAgent(messages, updateStatus, chatId, rootId, userId);
};
