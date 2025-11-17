import { Agent } from "@ai-sdk-tools/agents";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const alignmentAgent = new Agent({
  name: "alignment_agent",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant specialized in alignment tracking.
- Do not tag users.
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the Alignment specialist agent.
- This feature is currently under development. Please check back later for alignment tracking features.`,
  matchOn: ["alignment", "对齐", "目标对齐"],
});
