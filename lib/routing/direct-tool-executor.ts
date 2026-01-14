/**
 * Direct Tool Executor
 *
 * Executes single-shot tool calls without full LLM agent reasoning.
 * Uses a minimal LLM call just for parameter extraction when needed.
 *
 * This provides:
 * - Faster execution (no tool selection reasoning)
 * - Lower cost (smaller prompt, fewer tokens)
 * - Deterministic tool choice (already decided by router)
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getMastraModelSingle } from "../shared/model-router";

// Tool-specific parameter schemas
const TOOL_PARAM_SCHEMAS: Record<string, z.ZodSchema> = {
  gitlab_cli: z.object({
    command: z.string().describe("glab CLI command to execute"),
  }),
  feishu_docs: z.object({
    docUrl: z.string().optional().describe("Feishu document URL"),
    docToken: z.string().optional().describe("Document token if URL not provided"),
    action: z.enum(["read", "search"]).default("read"),
  }),
  feishu_chat_history: z.object({
    chatId: z.string().describe("Chat ID to search"),
    query: z.string().optional().describe("Search query"),
    limit: z.number().default(20).describe("Number of messages to retrieve"),
  }),
  mgr_okr_review: z.object({
    period: z.string().optional().describe("Time period (e.g., '11 月', 'Q4')"),
    cityCompany: z.string().optional().describe("City/company filter"),
  }),
  chart_generation: z.object({
    chartType: z.enum(["bar", "line", "pie", "heatmap"]).describe("Chart type"),
    data: z.any().describe("Data for the chart"),
    title: z.string().optional().describe("Chart title"),
  }),
};

// Tool-specific prompt templates for parameter extraction
const TOOL_PROMPTS: Record<string, string> = {
  gitlab_cli: `Extract the glab CLI command from the user query.
Examples:
- "列出我的issues" → command: "glab issue list --assignee=@me"
- "show open issues in dpa" → command: "glab issue list --group dpa --state opened"
- "查看issue #123" → command: "glab issue view 123 -R dpa/dagster"`,

  feishu_docs: `Extract document reference from the user query.
Look for Feishu document URLs or document tokens.`,

  feishu_chat_history: `Extract chat search parameters from the query.
The chatId will be provided from context. Extract search keywords if mentioned.`,

  mgr_okr_review: `Extract OKR query parameters.
- Period: Look for month (11月, 12月) or quarter (Q4, Q3)
- CityCompany: Look for city names (上海, 北京) or company codes (SH, BJ)`,

  chart_generation: `Extract chart generation parameters.
- chartType: bar, line, pie, or heatmap
- title: Any title mentioned
- data: Will be provided separately`,
};

export interface DirectToolResult {
  success: boolean;
  toolId: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Extract parameters for a tool using minimal LLM call
 */
async function extractToolParams(
  toolId: string,
  query: string,
  context: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const schema = TOOL_PARAM_SCHEMAS[toolId];
  const prompt = TOOL_PROMPTS[toolId];

  if (!schema || !prompt) {
    console.log(`[DirectToolExecutor] No schema/prompt for ${toolId}, using raw query`);
    return { query, ...context };
  }

  try {
    const model = getMastraModelSingle(false); // Don't require tools for param extraction
    
    const { object } = await generateObject({
      model,
      schema,
      prompt: `${prompt}\n\nUser query: "${query}"\n\nContext: ${JSON.stringify(context)}`,
    });

    return { ...object, ...context };
  } catch (error) {
    console.error(`[DirectToolExecutor] Param extraction failed for ${toolId}:`, error);
    // Fallback to raw query
    return { query, ...context };
  }
}

/**
 * Execute a tool directly without agent routing
 */
export async function executeDirectTool(
  toolId: string,
  query: string,
  context: {
    chatId?: string;
    rootId?: string;
    userId?: string;
  } = {}
): Promise<DirectToolResult> {
  const startTime = Date.now();
  console.log(`[DirectToolExecutor] Executing ${toolId} for: "${query.substring(0, 50)}..."`);

  try {
    // Extract parameters using minimal LLM
    const params = await extractToolParams(toolId, query, context);
    console.log(`[DirectToolExecutor] Extracted params:`, JSON.stringify(params).substring(0, 200));

    // Get tool instance and execute
    const result = await executeToolById(toolId, params);

    return {
      success: true,
      toolId,
      result,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[DirectToolExecutor] Error executing ${toolId}:`, errorMsg);

    return {
      success: false,
      toolId,
      error: errorMsg,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute tool by ID with params
 */
async function executeToolById(
  toolId: string,
  params: Record<string, unknown>
): Promise<unknown> {
  // Dynamic import to avoid circular dependencies
  const tools = await import("../tools");

  switch (toolId) {
    case "gitlab_cli": {
      const tool = tools.createGitLabCliTool(true);
      const command = (params.command as string) || (params.query as string) || "";
      if (!tool.execute) throw new Error("gitlab_cli tool has no execute method");
      return await tool.execute({ command }, {});
    }

    case "feishu_docs": {
      const tool = tools.createFeishuDocsTool(true);
      if (!tool.execute) throw new Error("feishu_docs tool has no execute method");
      // docToken is required - use docUrl, docToken, or extract from query
      const docToken = (params.docToken as string) || (params.docUrl as string) || (params.query as string) || "";
      if (!docToken) throw new Error("No document token or URL provided");
      return await tool.execute({
        docToken,
        docType: (params.docType as "doc" | "sheet" | "bitable") || undefined,
        action: (params.action as "read" | "metadata") || undefined,
      }, {});
    }

    case "feishu_chat_history": {
      const tool = tools.createFeishuChatHistoryTool(true);
      if (!tool.execute) throw new Error("feishu_chat_history tool has no execute method");
      const chatId = (params.chatId as string) || "";
      return await tool.execute({
        chatId,
        limit: (params.limit as number) || 20,
      }, {});
    }

    case "mgr_okr_review": {
      const tool = tools.createOkrReviewTool(true, true);
      if (!tool.execute) throw new Error("mgr_okr_review tool has no execute method");
      return await tool.execute({
        period: (params.period as string) || undefined,
        cityCompany: (params.cityCompany as string) || undefined,
      }, {});
    }

    case "chart_generation": {
      const chartTool = tools.chartGenerationTool;
      if (!chartTool.execute) throw new Error("chart_generation tool has no execute method");
      // Map to valid chart types - chart_generation has complex schema
      const rawType = (params.chartType as string) || "bar";
      const subType = rawType as "bar" | "line" | "pie" | "heatmap" | "flowchart";
      const chartType = ["bar", "line", "area", "scatter", "heatmap", "histogram", "boxplot", "waterfall", "bubble"].includes(subType) 
        ? "vega-lite" as const
        : "mermaid" as const;
      return await chartTool.execute({
        chartType,
        subType,
        data: params.data,
        title: (params.title as string) || "Chart",
        description: (params.description as string) || "Generated chart",
      }, {});
    }

    default:
      throw new Error(`Unknown tool: ${toolId}`);
  }
}

/**
 * Format tool result for display
 */
export function formatToolResult(result: DirectToolResult): string {
  if (!result.success) {
    return `❌ Tool execution failed: ${result.error}`;
  }

  const data = result.result as Record<string, unknown>;
  
  // Handle different tool result formats
  if (typeof data === "string") {
    return data;
  }

  if (data?.output) {
    return String(data.output);
  }

  if (data?.result) {
    return typeof data.result === "string" 
      ? data.result 
      : JSON.stringify(data.result, null, 2);
  }

  // Fallback: stringify the result
  return JSON.stringify(data, null, 2);
}
