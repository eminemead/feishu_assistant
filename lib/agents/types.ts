/**
 * Type definitions for agent architecture.
 * 
 * ARCHITECTURE: Single-agent design
 * - dpa_mom is the only production agent
 * - All capabilities are tools on the unified agent
 * - No multi-agent routing or specialist agents
 */

export type AgentName = "dpa_mom";

// Re-export Agent type from Mastra for convenience
export type { Agent } from "@mastra/core/agent";
