import { Agent } from "@ai-sdk-tools/agents";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const dpaPmAgent = new Agent({
  name: "dpa_pm",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant specialized in DPA PM (Product Management) tasks.
- Do not tag users.
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the DPA PM specialist agent.
- This feature is currently under development. Please check back later for product management features.`,
  matchOn: ["dpa", "pm", "product management", "产品管理"],
});
