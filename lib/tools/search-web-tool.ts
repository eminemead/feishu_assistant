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

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { exa } from "../utils";
import { cached } from "../cache";
import { trackToolCall } from "../devtools-integration";

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
  // Execute function with optional devtools tracking
  const executeFn = enableDevtoolsTracking
    ? trackToolCall(
        "searchWeb",
        async ({ query, specificDomain }: { query: string; specificDomain: string | null }) => {
          const { results } = await exa.searchAndContents(query, {
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
      )
    : async ({ query, specificDomain }: { query: string; specificDomain: string | null }) => {
        const { results } = await exa.searchAndContents(query, {
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
      };

  // Base tool definition
  // @ts-ignore - Type instantiation depth issue
  const searchWebToolBase = tool({
    description: "Use this to search the web for information",
    // @ts-ignore
    parameters: zodSchema(
      z.object({
        query: z.string(),
        specificDomain: z
          .string()
          .nullable()
          .describe(
            "a domain to search if the user specifies e.g. bbc.com. Should be only the domain name without the protocol"
          ),
      })
    ),
    execute: executeFn,
  });

  // Return cached or uncached version
  return enableCaching ? cached(searchWebToolBase as any) : searchWebToolBase;
}

