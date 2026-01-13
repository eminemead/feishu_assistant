import { CoreMessage } from "ai";
import { dpaMomAgent, DpaMomResult } from "./agents/dpa-mom-agent";

/**
 * Linked GitLab issue info for thread-to-issue mapping
 */
export interface LinkedIssueInfo {
  chatId: string;
  rootId: string;
  project: string;
  issueIid: number;
  issueUrl: string;
  createdBy: string;
}

/**
 * Response from generateResponse.
 *
 * NOTE: This is always structured (no plain string path).
 */
export type GenerateResponseResult = DpaMomResult;

/**
 * Generate response using DPA Mom agent
 * 
 * Single agent with all tools - handles tool selection itself.
 * Uses execute_workflow tool for deterministic multi-step operations.
 * 
 * @param messages - Conversation messages
 * @param updateStatus - Optional callback for streaming status updates
 * @param chatId - Feishu chat ID for memory scoping
 * @param rootId - Feishu root message ID (thread identifier) for conversation context
 * @param userId - Feishu user ID (open_id/user_id) for authentication and RLS
 * @returns Response text or structured result with confirmation data
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
  memoryRootId?: string,
): Promise<GenerateResponseResult> => {
  return await dpaMomAgent(messages, updateStatus, chatId, rootId, userId, memoryRootId);
};
