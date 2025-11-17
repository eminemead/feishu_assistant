import { Agent } from "@ai-sdk-tools/agents";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const pnlAgent = new Agent({
  name: "pnl_agent",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant specialized in Profit & Loss (P&L) analysis.
- Do not tag users.
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the P&L specialist agent.
- This feature is currently under development. Please check back later for profit and loss analysis features.`,
  matchOn: ["pnl", "profit", "loss", "损益", "利润", "亏损"],
});
