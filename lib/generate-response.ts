import { CoreMessage } from "ai";
import { managerAgent } from "./agents/manager-agent";

/**
 * Generate response using the manager agent architecture
 * The manager agent orchestrates specialist agents (okr_reviewer, alignment_agent, etc.)
 * and routes queries to the appropriate specialist based on keywords or semantic meaning
 */
export const generateResponse = async (
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
) => {
  return await managerAgent(messages, updateStatus);
};
