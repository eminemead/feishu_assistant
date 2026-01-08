import { CoreMessage } from "ai";
import { managerAgent, ManagerAgentResult } from "./agents/manager-agent-mastra";

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
 * Response from generate response, may include confirmation data and reasoning
 */
export interface GenerateResponseResult {
  text: string;
  needsConfirmation?: boolean;
  confirmationData?: string;
  reasoning?: string; // Thinking traces from reasoning models
  showFollowups?: boolean; // Controls whether to show follow-up buttons
  linkedIssue?: LinkedIssueInfo; // Linked GitLab issue if thread has one
}

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
 * @returns Response text or structured result with confirmation data
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<string | GenerateResponseResult> => {
  return await managerAgent(messages, updateStatus, chatId, rootId, userId);
};
