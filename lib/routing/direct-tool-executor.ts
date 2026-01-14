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
    command: z.string().describe("glab command to execute (WITHOUT 'glab' prefix, WITHOUT -R)"),
    args: z.string().optional().describe("Additional flags (optional)"),
  }),
  feishu_docs: z.object({
    docUrl: z.string().optional().describe("Feishu document URL"),
    docToken: z.string().optional().describe("Document token if URL not provided"),
    action: z.enum(["read", "metadata"]).default("read"),
    docType: z.enum(["doc", "sheet", "bitable"]).optional(),
  }),
  feishu_chat_history: z.object({
    // chatId usually comes from context; make optional to avoid extraction failures
    chatId: z.string().optional().describe("Chat ID to fetch history from"),
    limit: z.number().default(20).describe("Number of messages to retrieve"),
    startTime: z.string().optional().describe("Start time (unix seconds)"),
    endTime: z.string().optional().describe("End time (unix seconds)"),
    senderId: z.string().optional().describe("Filter by sender open_id/user_id"),
  }),
  mgr_okr_review: z.object({
    period: z.string().optional().describe("Time period (e.g., '11 月', 'Q4')"),
  }),
  chart_generation: z.object({
    chartType: z.enum(["bar", "line", "pie", "heatmap"]).describe("Chart type"),
    data: z.any().optional().describe("Data for the chart"),
    title: z.string().optional().describe("Chart title"),
    description: z.string().optional().describe("Chart description"),
  }),
};

// Tool-specific prompt templates for parameter extraction
const TOOL_PROMPTS: Record<string, string> = {
  gitlab_cli: `Extract the glab CLI command from the user query.
Examples:
- "列出我的issues" → command: "issue list --assignee=@me"
- "show open issues" → command: "issue list --state opened"
- "查看issue #123" → command: "issue view 123"

IMPORTANT:
- DO NOT include "glab" prefix.
- DO NOT include -R/--repo (repo is enforced by tool guardrails).`,

  feishu_docs: `Extract document reference from the user query.
Look for Feishu document URLs or document tokens.
Choose action:
- "read" for reading content
- "metadata" for basic document info`,

  feishu_chat_history: `Extract chat history fetch parameters from the query.
The chatId will be provided from context.
Extract optional filters like start/end time or sender if explicitly mentioned.`,

  mgr_okr_review: `Extract OKR query parameters.
- Period: Look for month (11月, 12月) or quarter (Q4, Q3)
Return period in the format "11 月" (space before 月) when month is provided.`,

  chart_generation: `Extract chart generation parameters.
- chartType: bar, line, pie, or heatmap
- title: Any title mentioned
- description: Explain what the chart represents
Data may be omitted if the user didn't provide it.`,
};

function normalizeGlabCommand(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^glab\s+/i, "").trim();
}

function isMutatingGlabCommand(command: string): boolean {
  const c = command.toLowerCase();
  return (
    /\b(issue|mr)\s+(create|close|reopen|edit|update|delete|note|comment)\b/.test(c) ||
    /\brelease\s+create\b/.test(c) ||
    /\blabel\s+(create|delete|edit)\b/.test(c) ||
    /\bmilestone\s+(create|delete|edit)\b/.test(c) ||
    /\bapi\b/.test(c)
  );
}

function getDefaultOkrPeriod(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  return `${month} 月`;
}

function inferOkrPeriodFromQuery(query: string): string | undefined {
  const m = query.match(/(\d{1,2})\s*月/);
  if (m) return `${Number(m[1])} 月`;
  const q = query.match(/\bQ([1-4])\b/i);
  if (q) return `Q${q[1]}`;
  return undefined;
}

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
      const rawCommand = (params.command as string) || (params.query as string) || "";
      const command = normalizeGlabCommand(rawCommand);
      const args = (params.args as string) || undefined;
      if (!command) throw new Error("No GitLab command provided");
      if (isMutatingGlabCommand(command)) {
        throw new Error(
          `Refusing to run mutating GitLab command via direct tool (${command}). ` +
          `Use the GitLab workflow (/创建, /create, etc.) so it can request confirmation.`
        );
      }
      if (!tool.execute) throw new Error("gitlab_cli tool has no execute method");
      return await tool.execute({ command, args }, {});
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
      if (!chatId) throw new Error("No chatId provided for chat history");
      return await tool.execute({
        chatId,
        limit: (params.limit as number) || 20,
        startTime: (params.startTime as string) || undefined,
        endTime: (params.endTime as string) || undefined,
        senderId: (params.senderId as string) || undefined,
      }, {});
    }

    case "mgr_okr_review": {
      const tool = tools.createOkrReviewTool(true, true);
      if (!tool.execute) throw new Error("mgr_okr_review tool has no execute method");
      const period =
        (params.period as string) ||
        inferOkrPeriodFromQuery((params.query as string) || "") ||
        getDefaultOkrPeriod();
      return await tool.execute({
        period,
      }, {});
    }

    case "chart_generation": {
      const chartTool = tools.chartGenerationTool;
      if (!chartTool.execute) throw new Error("chart_generation tool has no execute method");
      // If user asked for a chart without providing data, don't hard-fail.
      // Ask for minimal required data so the conversation can continue.
      if (params.data === undefined) {
        const requested = (params.chartType as string) || "chart";
        return (
          `I can generate a **${requested}** chart, but I need the **data**.\n\n` +
          `Please provide either:\n` +
          `- A JSON array of records (recommended), or\n` +
          `- A small table (rows/columns) pasted in the message.\n\n` +
          `Example:\n` +
          `[\n  { "label": "A", "value": 10 },\n  { "label": "B", "value": 20 }\n]`
        );
      }
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
