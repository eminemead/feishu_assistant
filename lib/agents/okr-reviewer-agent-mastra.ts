/**
 * OKR Reviewer Agent - Mastra Implementation
 * 
 * Replaces the AI SDK Tools implementation with Mastra framework.
 * Specialized in OKR (Objectives and Key Results) analysis.
 * 
 * KEY CHANGES FROM AI SDK TOOLS:
 * 1. Uses Mastra's Agent instead of @ai-sdk-tools/agents
 * 2. Native model fallback array instead of dual agents
 * 3. Tool definitions use Mastra's format
 * 4. Streaming API identical (textStream)
 * 5. Custom execution context via options (threadId, resourceId)
 */

import { Agent } from "@mastra/core/agent";
import { CoreMessage } from "ai";
import * as duckdb from "duckdb";
import { okrVisualizationTool } from "./okr-visualization-tool";
import { getMastraModel } from "../shared/model-router";
import { createOkrReviewTool } from "../tools";
import { chartGenerationTool } from "../tools/chart-generation-tool";
import { getUserDataScope } from "../auth/user-data-scope";
import { queryStarrocks, hasStarrocksConfig } from "../starrocks/client";
import { devtoolsTracker } from "../devtools-integration";
import { getSupabaseUserId } from "../auth/feishu-supabase-id";

const OKR_DB_PATH = "/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db";

// StarRocks table configuration (can be overridden via env vars)
const STARROCKS_OKR_METRICS_TABLE = process.env.STARROCKS_OKR_METRICS_TABLE || "okr_metrics";
const STARROCKS_EMPLOYEE_FELLOW_TABLE = process.env.STARROCKS_EMPLOYEE_FELLOW_TABLE || "employee_fellow";

/**
 * Queries DuckDB to get the latest timestamped okr_metrics table
 */
async function getLatestMetricsTable(con: duckdb.Connection): Promise<string | null> {
  return new Promise((resolve, reject) => {
    con.all(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema='main' AND table_name LIKE 'okr_metrics_%'
       ORDER BY table_name DESC LIMIT 1`,
      (err: Error | null, result: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        if (result && result.length > 0) {
          resolve(result[0].table_name);
        } else {
          resolve(null);
        }
      }
    );
  });
}

/**
 * Analyzes has_metric_percentage for managers by city company using StarRocks
 * 
 * @param period - Period to analyze (e.g., '10 月', '11 月')
 * @param userId - Optional Feishu user ID for data filtering (RLS)
 */
async function analyzeHasMetricPercentageStarrocks(period: string, userId?: string): Promise<any> {
  // Get user's data scope if userId is provided
  let userDataScope: { allowedAccounts: string[] } | null = null;
  if (userId) {
    try {
      const scope = await getUserDataScope(userId);
      userDataScope = { allowedAccounts: scope.allowedAccounts };
      
      // If user has no allowed accounts, return empty result (fail-secure)
      if (scope.allowedAccounts.length === 0) {
        console.warn(`⚠️ [OKR] User ${userId} has no allowed accounts, returning empty result`);
        return {
          period,
          table_used: STARROCKS_OKR_METRICS_TABLE,
          summary: [],
          total_companies: 0,
          overall_average: 0,
          filtered_by_user: true,
          data_source: 'starrocks'
        };
      }
    } catch (error) {
      console.error(`❌ [OKR] Error getting user data scope:`, error);
      return {
        period,
        table_used: STARROCKS_OKR_METRICS_TABLE,
        summary: [],
        total_companies: 0,
        overall_average: 0,
        filtered_by_user: true,
        error: 'Failed to get user permissions',
        data_source: 'starrocks'
      };
    }
  }

  try {
    const result = await queryStarrocks(`
      WITH base AS (
        SELECT COALESCE(e.fellow_city_company_name, 'Unknown') AS company_name,
               m.metric_type,
               m.value
        FROM ${STARROCKS_OKR_METRICS_TABLE} m
        LEFT JOIN ${STARROCKS_EMPLOYEE_FELLOW_TABLE} e
          ON m.owner = e.fellow_ad_account
        WHERE m.period = '${period}'
          AND e.fellow_workday_cn_title IN ('乐道代理战队长', '乐道区域副总经理', '乐道区域总经理', '乐道区域行销负责人', '乐道战队长', '乐道战队长（兼个人销售）', '乐道片区总', '乐道行销大区负责人', '乐道销售部负责人')
          ${userDataScope ? `AND e.fellow_ad_account IN (${userDataScope.allowedAccounts.map(a => `'${a}'`).join(',')})` : ''}
      )
      SELECT company_name, metric_type,
             COUNT(*) AS total,
             SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
             100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) AS null_pct
      FROM base
      WHERE company_name != 'Unknown'
      GROUP BY company_name, metric_type
    `);

    return {
      period,
      table_used: STARROCKS_OKR_METRICS_TABLE,
      summary: result,
      total_companies: result.length,
      overall_average: result.length > 0 
        ? (result.reduce((sum: number, r: any) => sum + r.null_pct, 0) / result.length).toFixed(2)
        : 0,
      filtered_by_user: !!userDataScope,
      data_source: 'starrocks'
    };
  } catch (error) {
    console.error(`❌ [OKR] StarRocks query error for period "${period}":`, error);
    return {
      period,
      table_used: STARROCKS_OKR_METRICS_TABLE,
      summary: [],
      total_companies: 0,
      overall_average: 0,
      filtered_by_user: !!userDataScope,
      error: error instanceof Error ? error.message : String(error),
      data_source: 'starrocks'
    };
  }
}

/**
 * Analyzes has_metric_percentage for managers by city company using DuckDB
 * Fallback when StarRocks is unavailable
 * 
 * @param period - Period to analyze (e.g., '10 月', '11 月')
 */
async function analyzeHasMetricPercentageDuckdb(period: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const con = new duckdb.Database(OKR_DB_PATH).connect();

    // First get latest table name
    (con as any).all(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema='main' AND table_name LIKE 'okr_metrics_%'
       ORDER BY table_name DESC LIMIT 1`,
      (err: Error | null, result: any[]) => {
        if (err) {
          con.close((err: any) => {
            console.error(`❌ [OKR] DuckDB error:`, err);
            reject(err);
          });
          return;
        }

        const tableName = result?.[0]?.table_name || "okr_metrics";
        const query = `
          SELECT company_name, metric_type,
                 COUNT(*) AS total,
                 SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
                 100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / COUNT(*) AS null_pct
          FROM ${tableName}
          WHERE period = '${period}'
          GROUP BY company_name, metric_type
          ORDER BY company_name, metric_type
        `;

        (con as any).all(query, (err: Error | null, result: any[]) => {
          con.close((err: any) => {
            if (err) {
              console.error(`❌ [OKR] DuckDB query error:`, err);
              reject(err);
              return;
            }

            resolve({
              period,
              table_used: tableName,
              summary: result || [],
              total_companies: (result || []).length,
              overall_average: result && result.length > 0
                ? (result.reduce((sum, r) => sum + r.null_pct, 0) / result.length).toFixed(2)
                : 0,
              data_source: 'duckdb'
            });
          });
        });
      }
    );
  });
}

/**
 * Get query text from messages
 */
function getQueryText(messages: CoreMessage[]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && lastMessage.role === "user" && typeof lastMessage.content === "string") {
    return lastMessage.content;
  }
  return "";
}

// Create tools
const mgrOkrReviewTool = createOkrReviewTool(
  true,  // enableCaching
  true,  // enableDevtoolsTracking
  60 * 60 * 1000  // cacheTTL: 1 hour (OKR data doesn't change frequently)
);

// Lazy-initialized agent
let okrReviewerAgentInstance: Agent | null = null;
let isInitializing = false;

/**
 * Initialize the OKR reviewer agent (lazy - called on first request)
 */
function initializeAgent(): void {
  if (okrReviewerAgentInstance || isInitializing) {
    return;
  }

  isInitializing = true;

  // Create agent with Mastra framework
  okrReviewerAgentInstance = new Agent({
    name: "okr_reviewer",
    instructions: `You are a Feishu/Lark AI assistant specialized in OKR (Objectives and Key Results) review and analysis. Most user queries will be in Chinese (中文).

你是专门负责OKR（目标和关键结果）评审和分析的Feishu/Lark AI助手。大多数用户查询将是中文。

CRITICAL INSTRUCTIONS:
- Do not tag users. 不要@用户。
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.

ANALYSIS WORKFLOW:
1. Extract the period from user query (e.g., "11月" → "11 月", "10月" → "10 月")
2. Call mgr_okr_review tool with the extracted period (CRITICAL: use exact format "X 月")
3. When users ask for OKR analysis (分析), ALWAYS generate charts/visualizations alongside text analysis
4. Use chart_generation tool to create visual representations (bar charts for company performance, pie charts for metrics distribution)
5. Combine data insights with visualizations for comprehensive reports
6. For each OKR analysis request, generate at least one chart visualization

IMPORTANT PERIOD FORMATS:
- User says "10月" → pass "10 月" to mgr_okr_review
- User says "11月" → pass "11 月" to mgr_okr_review
- User says "九月" → pass "9 月" to mgr_okr_review
- Always include the space: "月" must be preceded by a space

TOOLS:
- mgr_okr_review: Fetches has_metric_percentage per city company. ALWAYS use for OKR analysis to get raw data.
- chart_generation: Creates Mermaid/Vega-Lite charts. USE THIS TO VISUALIZE DATA (bar charts, pie charts, heatmaps).
- okr_visualization: Generates heatmap visualizations when needed.

IMPORTANT: Every OKR analysis response should include:
1. Text analysis with insights
2. At least ONE chart/visualization generated via chart_generation tool
3. Summary with key findings and recommendations

提醒：
- 使用mgr_okr_review工具获取OKR指标数据。
- 使用chart_generation工具生成可视化（条形图、饼图）展示数据。
- 每个OKR分析响应必须包含：文本分析 + 至少一个图表可视化 + 总结。`,
    model: getMastraModel(true), // requireTools=true (has tools)
    tools: {
      mgr_okr_review: mgrOkrReviewTool,
      okr_visualization: okrVisualizationTool as any,
      chart_generation: chartGenerationTool,
    },
  });

  isInitializing = false;
}

/**
 * Main OKR Reviewer Agent function - Mastra implementation
 * 
 * @param messages - Conversation history
 * @param updateStatus - Optional callback for streaming updates
 * @param chatId - Feishu chat ID
 * @param rootId - Feishu thread root ID
 * @param userId - Feishu user ID
 * @returns Promise<string> - Agent response text
 */
export async function okrReviewerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<string> {
  // Lazy initialize agent
  initializeAgent();

  const query = getQueryText(messages);
  const startTime = Date.now();
  console.log(`[OKR] Received query: "${query}"`);

  // Set up memory scoping
  const conversationId = getConversationId(chatId, rootId);
  const userScopeId = getUserScopeId(userId);

  console.log(
    `[OKR] Memory context: conversationId=${conversationId}, userId=${userScopeId}`
  );

  // Batch updates to avoid spamming Feishu
  const BATCH_DELAY_MS = 1000; // Batch every 1 second for better performance
  const MIN_CHARS_PER_UPDATE = 50; // Minimum characters to trigger update

  const accumulatedText: string[] = [];
  let pendingTimeout: NodeJS.Timeout | null = null;
  let lastUpdateLength = 0;

  const updateCardBatched = async (text: string): Promise<void> => {
    if (!updateStatus) {
      return;
    }

    // Clear pending update
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }

    const newChars = text.length - lastUpdateLength;

    // If we have enough new text, update immediately
    if (newChars >= MIN_CHARS_PER_UPDATE) {
      updateStatus(text);
      lastUpdateLength = text.length;
    } else {
      // Otherwise, batch the update
      pendingTimeout = setTimeout(() => {
        if (updateStatus) {
          updateStatus(text);
        }
        lastUpdateLength = text.length;
        pendingTimeout = null;
      }, BATCH_DELAY_MS);
    }
  };

  try {
     // Track agent call for devtools monitoring
     devtoolsTracker.trackAgentCall("okr_reviewer", query);

     // MASTRA STREAMING: Call OKR reviewer agent with streaming
     const stream = await okrReviewerAgentInstance!.stream(messages);

    let text = "";
    for await (const chunk of stream.textStream) {
      text += chunk;
      accumulatedText.push(chunk);
      await updateCardBatched(text);
    }

    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("okr_reviewer", text, duration);

    console.log(
      `[OKR] Response complete (length=${text.length}, duration=${duration}ms)`
    );
    return text;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[OKR] Error during streaming:`, errorMsg);

    devtoolsTracker.trackError(
      "OKR Reviewer",
      error instanceof Error ? error : new Error(errorMsg)
    );
    throw error;
  }
}

/**
 * Export helper to get OKR reviewer agent (for internal use)
 */
export function getOkrReviewerAgentMastra(): Agent {
  initializeAgent();
  return okrReviewerAgentInstance!;
}
