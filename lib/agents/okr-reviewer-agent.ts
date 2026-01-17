/**
 * OKR Data Analysis Functions
 * 
 * Provides OKR metrics analysis via StarRocks (primary) or DuckDB (fallback).
 * Used by the mgr_okr_review tool attached to dpa_mom agent.
 * 
 * ARCHITECTURE: Single-agent design
 * - All OKR analysis goes through dpa_mom agent
 * - This file provides data functions, NOT a separate agent
 * - Tools are defined in lib/tools/okr-review-tool.ts
 */

import * as duckdb from "duckdb";
import { getUserDataScope } from "../auth/user-data-scope";
import { queryStarrocks, hasStarrocksConfig } from "../starrocks/client";

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
        console.warn(`⚠️ [OKR] User ${userId} has no allowed accounts (permissions not configured), returning empty result`);
        return {
          period,
          table_used: STARROCKS_OKR_METRICS_TABLE,
          summary: [],
          total_companies: 0,
          overall_average: 0,
          filtered_by_user: true,
          error: `User "${userId}" has no data permissions configured. Contact admin to set up access.`,
          data_source: 'starrocks'
        };
      }
      console.log(`✅ [OKR] User ${userId} has ${scope.allowedAccounts.length} allowed accounts`);
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

    console.log(`[OKR] StarRocks query returned ${result.length} rows for period "${period}"${userDataScope ? ` (filtered by ${userDataScope.allowedAccounts.length} accounts)` : ''}`);
    
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
 * Analyzes has_metric_percentage for managers by city company
 * Tries StarRocks first, falls back to DuckDB if unavailable
 * 
 * @param period - Period to analyze (e.g., '10 月', '11 月')
 * @param userId - Optional Feishu user ID for data filtering (RLS)
 */
export async function analyzeHasMetricPercentage(period: string, userId?: string): Promise<any> {
  // Try StarRocks first if available
  if (hasStarrocksConfig()) {
    try {
      return await analyzeHasMetricPercentageStarrocks(period, userId);
    } catch (error) {
      console.warn(`[OKR] StarRocks query failed, falling back to DuckDB:`, error);
      return await analyzeHasMetricPercentageDuckdb(period);
    }
  }
  
  // Fall back to DuckDB
  return await analyzeHasMetricPercentageDuckdb(period);
}

/**
 * OKR analysis instructions (used in dpa_mom system prompt and tests)
 * 
 * This is kept for reference and testing - the actual agent uses these
 * instructions as part of dpa_mom's unified system prompt.
 */
export function getOkrReviewerAgentInstructions(now: Date = new Date()): string {
  return `You are a Feishu/Lark AI assistant specialized in OKR (Objectives and Key Results) review and analysis. Most user queries will be in Chinese (中文).

你是专门负责OKR（目标和关键结果）评审和分析的Feishu/Lark AI助手。大多数用户查询将是中文。

CRITICAL INSTRUCTIONS:
- Do not tag users. 不要@用户。
- Current date is: ${now.toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.

ANALYSIS WORKFLOW:
1. Extract the period from user query (e.g., "11月" → "11 月", "10月" → "10 月")
2. Call mgr_okr_review tool with the extracted period (CRITICAL: use exact format "X 月")
3. When users ask for OKR analysis (分析), ALWAYS generate charts/visualizations alongside text analysis
4. Use visualization tool to create visual representations (bar charts for company performance, pie charts for metrics distribution)
5. Combine data insights with visualizations for comprehensive reports
6. For each OKR analysis request, generate at least one chart visualization

IMPORTANT PERIOD FORMATS:
- User says "10月" → pass "10 月" to mgr_okr_review
- User says "11月" → pass "11 月" to mgr_okr_review
- User says "九月" → pass "9 月" to mgr_okr_review
- Always include the space: "月" must be preceded by a space

TOOLS:
- mgr_okr_review: Fetches has_metric_percentage per city company. ALWAYS use for OKR analysis to get raw data.
- visualization: Generates charts (bar/pie/line/heatmap/table) from data or CSV/JSON text. Use this for Feishu-friendly visualizations.

IMPORTANT: Every OKR analysis response should include:
1. Text analysis with insights
2. At least ONE chart/visualization generated via visualization tool
3. Summary with key findings and recommendations

提醒：
- 使用mgr_okr_review工具获取OKR指标数据。
- 使用visualization工具生成可视化（条形图、饼图）展示数据。
- 每个OKR分析响应必须包含：文本分析 + 至少一个图表可视化 + 总结。
- 当用户要求"OKR分析"、"图表"或"可视化"时，优先使用visualization工具。`;
}
