/**
 * Manager Agent - Legacy Re-export
 * 
 * This file is DEPRECATED. The active implementation is in manager-agent-mastra.ts.
 * This file exists only for backward compatibility with existing imports.
 * 
 * @deprecated Import from manager-agent-mastra.ts instead
 */

// Re-export everything from the mastra implementation
export { managerAgent, getManagerAgent } from "./manager-agent-mastra";
export type { ManagerAgentResult } from "./manager-agent-mastra";

// For test compatibility - expose the instance getter
import { getManagerAgent as _getManagerAgent } from "./manager-agent-mastra";

/**
 * @deprecated Use getManagerAgent() instead
 */
export const managerAgentInstance = {
  get current() {
    console.warn('[manager-agent] managerAgentInstance is deprecated - use getManagerAgent()');
    return _getManagerAgent();
  }
};
