import { CoreMessage } from "ai";
import { managerAgent } from "./agents/manager-agent";

/**
 * Generate response using the manager agent architecture
 * The manager agent orchestrates specialist agents (okr_reviewer, alignment_agent, etc.)
 * and routes queries to the appropriate specialist based on keywords or semantic meaning
 * 
 * @param messages - Conversation messages
 * @param updateStatus - Optional callback for streaming status updates
 * @param chatId - Feishu chat ID for memory scoping
 * @param rootId - Feishu root message ID (thread identifier) for conversation context
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
) => {
  return await managerAgent(messages, updateStatus, chatId, rootId);
};
