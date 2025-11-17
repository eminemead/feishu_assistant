import { Agent } from "@ai-sdk-tools/agents";
import { tool, zodSchema } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { CoreMessage } from "ai";
import { z } from "zod";
import { okrReviewerAgent } from "./okr-reviewer-agent";
import { alignmentAgent } from "./alignment-agent";
import { pnlAgent } from "./pnl-agent";
import { dpaPmAgent } from "./dpa-pm-agent";
import { exa } from "../utils";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Create web search tool for fallback
const searchWebTool = tool({
  description: "Use this to search the web for information",
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
  execute: async ({ query, specificDomain }: { query: string; specificDomain: string | null }) => {
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
  },
});

// Manager agent that orchestrates specialist agents
export const managerAgentInstance = new Agent({
  name: "Manager",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant that routes queries to specialist agents.
- Do not tag users.
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- Route queries to specialist agents when appropriate.
- If no specialist agent matches, use web search or provide helpful guidance about available specialists.
- Available specialists:
  - OKR Reviewer: For OKR metrics, manager reviews, has_metric percentage analysis
  - Alignment Agent: For alignment tracking (under development)
  - P&L Agent: For profit & loss analysis (under development)
  - DPA PM Agent: For product management tasks (under development)`,
  handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent],
  tools: {
    searchWeb: searchWebTool,
  },
  onEvent: (event) => {
    if (event.type === "agent-handoff") {
      console.log(`[Manager] Handoff: ${event.from} → ${event.to}`);
    }
  },
});

/**
 * Manager agent function that handles user queries.
 * Uses the @ai-sdk-tools/agents Agent class for orchestration.
 */
export async function managerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
): Promise<string> {
  try {
    // Create a wrapper for status updates
    const result = await managerAgentInstance.generate({
      messages,
      onEvent: (event) => {
        if (event.type === "agent-handoff") {
          updateStatus?.(`Routing to ${event.to}...`);
          console.log(`[Manager] Handoff: ${event.from} → ${event.to}`);
        }
        // Call the original onEvent handler
        managerAgentInstance.onEvent?.(event);
      },
    });

    return result.text;
  } catch (error) {
    console.error("Error in manager agent:", error);
    return "Sorry, I encountered an error processing your request.";
  }
}
