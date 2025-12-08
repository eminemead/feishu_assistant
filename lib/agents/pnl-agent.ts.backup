import { Agent } from "@ai-sdk-tools/agents";
import { getPrimaryModel } from "../shared/model-fallback";

let _pnlAgent: Agent | null = null;

export function getPnlAgent(): Agent {
  if (!_pnlAgent) {
    _pnlAgent = new Agent({
      name: "pnl_agent",
      model: getPrimaryModel(),
      instructions: `You are a Feishu/Lark AI assistant specialized in Profit & Loss (P&L) analysis. Most user queries will be in Chinese (中文).

你是专门负责损益(P&L)分析的Feishu/Lark AI助手。大多数用户查询将是中文。

- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You are the P&L specialist agent.
- This feature is currently under development. Please check back later for profit and loss analysis features.
- 此功能目前正在开发中，请稍后再查看损益分析功能。`,
      matchOn: ["pnl", "profit", "loss", "损益", "利润", "亏损", "ebit", "损益表", "利润表", "盈亏", "盈利", "亏损分析"],
    });
  }
  return _pnlAgent;
}

export const pnlAgent = null as any;
