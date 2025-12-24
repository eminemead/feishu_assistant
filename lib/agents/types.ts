/**
 * Type definitions for agent architecture.
 * 
 * Note: We're using @ai-sdk-tools/agents Agent class directly,
 * so these types are mainly for reference/documentation.
 */

export type AgentName = 
  | "okr_reviewer"
  | "alignment_agent"
  | "pnl_agent"
  | "dpa_mom"
  | "Manager";

// Re-export Agent type from @ai-sdk-tools/agents for convenience
export type { Agent } from "@ai-sdk-tools/agents";
