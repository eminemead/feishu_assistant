/**
 * Search Web Tool Factory
 * 
 * Creates the search web tool used by the Manager Agent.
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 * 
 * The "sharing" here is between production code and development tools (dspyground),
 * NOT between different agents.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exa } from "../utils";
import { cached } from "../cache";
import { devtoolsTracker } from "../devtools-integration";

/**
 * Search result type
 */
interface SearchResult {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

/**
 * Core search execution logic
 */
async function executeSearch(
  exaClient: NonNullable<typeof exa>,
  query: string,
  specificDomain: string | null
): Promise<SearchResult> {
  const { results } = await exaClient.searchAndContents(query, {
    livecrawl: "always",
    numResults: 3,
    includeDomains: specificDomain ? [specificDomain] : undefined,
  });

  return {
    results: results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.text.slice(0, 1000),
    })),
  };
}

/**
 * Creates the search web tool
 * 
 * Used by:
 * - Manager Agent (production): With caching and devtools tracking
 * - DSPyground config (development): Without caching or devtools
 * 
 * @param enableCaching - Whether to enable caching (default: true)
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured search web tool instance
 */
export function createSearchWebTool(
  enableCaching: boolean = true,
  enableDevtoolsTracking: boolean = true
) {
  if (!exa) {
    throw new Error("EXA client not configured");
  }
  const exaClient = exa;

  const searchWebToolBase = createTool({
    id: "search_web",
    description: "Use this to search the web for information",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      specificDomain: z
        .string()
        .nullable()
        .describe(
          "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol",
        ),
    }),
execute: async (inputData, context) => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { results: [] };
      }
      
      const { query, specificDomain } = inputData;
      const startTime = Date.now();
      
      const result = await executeSearch(exaClient, query, specificDomain);
      
      if (enableDevtoolsTracking) {
        devtoolsTracker.trackToolCall("search_web", { query, specificDomain }, startTime);
      }
      
      return result;
    },
  });

  // Return cached or uncached version
  return enableCaching ? cached(searchWebToolBase) : searchWebToolBase;
}

