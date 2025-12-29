/**
 * AgentFS Utility Module
 *
 * Provides singleton and per-user access to AgentFS instances.
 * AgentFS is a SQLite-backed virtual filesystem for AI agents.
 *
 * Usage:
 *   import { getAgentFS, getAgentFSForUser } from './infra/agentfs';
 *
 *   // Shared dev instance
 *   const agentfs = await getAgentFS();
 *   await agentfs.fs.writeFile('/workspace/query.sql', 'SELECT 1');
 *
 *   // Per-user isolation
 *   const userFs = await getAgentFSForUser('user-123');
 *
 * @see https://github.com/tursodatabase/agentfs
 */

import { AgentFS } from "agentfs-sdk";

let sharedInstance: AgentFS | null = null;
const userInstances = new Map<string, AgentFS>();

/**
 * Get the shared AgentFS instance (singleton).
 * Uses AGENTFS_ID env var or defaults to 'feishu-assistant-dev'.
 * Creates storage at `.agentfs/{id}.db`
 */
export async function getAgentFS(): Promise<AgentFS> {
  if (!sharedInstance) {
    const id = process.env.AGENTFS_ID || "feishu-assistant-dev";
    sharedInstance = await AgentFS.open({ id });
  }
  return sharedInstance;
}

/**
 * Get a per-user AgentFS instance for multi-tenant isolation.
 * Each user gets their own SQLite database.
 *
 * @param userId - Feishu user ID or other unique identifier
 * @returns AgentFS instance scoped to this user
 */
export async function getAgentFSForUser(userId: string): Promise<AgentFS> {
  const existing = userInstances.get(userId);
  if (existing) {
    return existing;
  }

  const id = `feishu-user-${userId}`;
  const instance = await AgentFS.open({ id });
  userInstances.set(userId, instance);
  return instance;
}

/**
 * Get an AgentFS instance for a specific conversation/run.
 * Useful for session-scoped workspaces.
 *
 * @param conversationId - Conversation or run identifier
 * @returns AgentFS instance scoped to this conversation
 */
export async function getAgentFSForConversation(
  conversationId: string
): Promise<AgentFS> {
  const id = `feishu-conv-${conversationId}`;
  return await AgentFS.open({ id });
}

/**
 * Close the shared AgentFS instance.
 * Call this during server shutdown for graceful cleanup.
 */
export async function closeAgentFS(): Promise<void> {
  if (sharedInstance) {
    await sharedInstance.close();
    sharedInstance = null;
  }
}

/**
 * Close all user-scoped AgentFS instances.
 * Call this during server shutdown for graceful cleanup.
 */
export async function closeAllUserAgentFS(): Promise<void> {
  const closePromises = Array.from(userInstances.values()).map((instance) =>
    instance.close()
  );
  await Promise.all(closePromises);
  userInstances.clear();
}

/**
 * Close all AgentFS instances (shared + user-scoped).
 * Call this during server shutdown.
 */
export async function closeAllAgentFS(): Promise<void> {
  await Promise.all([closeAgentFS(), closeAllUserAgentFS()]);
}

/**
 * Check if AgentFS is available (shared instance exists).
 */
export function hasAgentFS(): boolean {
  return sharedInstance !== null;
}

/**
 * Get count of active user AgentFS instances.
 * Useful for monitoring/debugging.
 */
export function getUserAgentFSCount(): number {
  return userInstances.size;
}
