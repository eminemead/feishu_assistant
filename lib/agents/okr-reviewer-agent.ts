import { Agent } from "@ai-sdk-tools/agents";
import * as duckdb from "duckdb";
import { okrVisualizationTool } from "./okr-visualization-tool";
import { getPrimaryModel } from "../shared/model-fallback";
import { createOkrReviewTool } from "../tools";
import { chartGenerationTool } from "../tools/chart-generation-tool";
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
    // Build query with optional user filtering
    let accountFilter = '';
    const queryParams: any[] = [period];
    
    if (userDataScope && userDataScope.allowedAccounts.length > 0) {
      // Filter by allowed accounts (project_code from RLS)
      // StarRocks uses ? for parameters
      const accountPlaceholders = userDataScope.allowedAccounts.map(() => '?').join(', ');
      accountFilter = `AND e.fellow_ad_account IN (${accountPlaceholders})`;
      queryParams.push(...userDataScope.allowedAccounts);
    }

    const query = `
      WITH base AS (
        SELECT COALESCE(e.fellow_city_company_name, 'Unknown') AS company_name,
               m.metric_type,
               m.value
        FROM ${STARROCKS_OKR_METRICS_TABLE} m
        LEFT JOIN ${STARROCKS_EMPLOYEE_FELLOW_TABLE} e
          ON m.owner = e.fellow_ad_account
        WHERE m.period = ?
          AND e.fellow_workday_cn_title IN ('乐道代理战队长', '乐道区域副总经理', '乐道区域总经理', '乐道区域行销负责人', '乐道战队长', '乐道战队长（兼个人销售）', '乐道片区总', '乐道行销大区负责人', '乐道销售部负责人')
          ${accountFilter}
      )
      SELECT company_name, metric_type,
             COUNT(*) AS total,
             SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
             100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) AS null_pct
      FROM base
      WHERE company_name != 'Unknown'
      GROUP BY company_name, metric_type
    `;

    console.log(`[OKR] Querying StarRocks for period: "${period}"`);
    const rows = await queryStarrocks<any>(query, queryParams);
    
    console.log(`[OKR] StarRocks query returned ${rows.length} rows for period "${period}"`);

    // Process results (same logic as DuckDB version)
    const processed = rows.map((row: any) => ({
      company_name: row.company_name,
      metric_type: row.metric_type,
      total: Number(row.total) || 0,
      nulls: Number(row.nulls) || 0,
      null_pct: parseFloat(row.null_pct) || 0,
      has_metric_pct: 100.0 - (parseFloat(row.null_pct) || 0),
    }));

    // Group by company and calculate summary
    const byCompany: Record<string, any[]> = {};
    processed.forEach((row) => {
      if (!byCompany[row.company_name]) {
        byCompany[row.company_name] = [];
      }
      byCompany[row.company_name].push(row);
    });

    // Generate summary
    const summary = Object.entries(byCompany).map(([company, metrics]) => {
      const avgHasMetric = metrics.reduce((sum, m) => sum + m.has_metric_pct, 0) / metrics.length;
      return {
        company,
        average_has_metric_percentage: Math.round(avgHasMetric * 100) / 100,
        metrics: metrics.map((m) => ({
          metric_type: m.metric_type,
          has_metric_percentage: Math.round(m.has_metric_pct * 100) / 100,
          total: m.total,
          nulls: m.nulls,
        })),
      };
    });

    // Sort by average has_metric_percentage descending
    summary.sort((a, b) => b.average_has_metric_percentage - a.average_has_metric_percentage);

    return {
      period,
      table_used: STARROCKS_OKR_METRICS_TABLE,
      summary,
      total_companies: summary.length,
      overall_average: summary.length > 0
        ? Math.round(
            (summary.reduce((sum, s) => sum + s.average_has_metric_percentage, 0) /
              summary.length) *
            100
          ) / 100
        : 0,
      filtered_by_user: userId ? true : false,
      user_allowed_accounts_count: userDataScope?.allowedAccounts.length || 0,
      data_source: 'starrocks'
    };
  } catch (error: any) {
    console.error(`❌ [OKR] StarRocks query error for period "${period}":`, error);
    throw error;
  }
}

/**
 * DuckDB implementation for analyzing OKR metrics
 * Used as fallback when StarRocks is unavailable
 */
async function analyzeHasMetricPercentageDuckDB(period: string, userId?: string): Promise<any> {
  return new Promise(async (resolve, reject) => {
    // Get user's data scope if userId is provided
    let userDataScope: { allowedAccounts: string[] } | null = null;
    if (userId) {
      try {
        const scope = await getUserDataScope(userId);
        userDataScope = { allowedAccounts: scope.allowedAccounts };
        
        // If user has no allowed accounts, return empty result (fail-secure)
        if (scope.allowedAccounts.length === 0) {
          console.warn(`⚠️ [OKR] User ${userId} has no allowed accounts, returning empty result`);
          resolve({
            period,
            table_used: null,
            summary: [],
            total_companies: 0,
            overall_average: 0,
            filtered_by_user: true
          });
          return;
        }
      } catch (error) {
        console.error(`❌ [OKR] Error getting user data scope:`, error);
        // Fail-secure: return empty result on error
        resolve({
          period,
          table_used: null,
          summary: [],
          total_companies: 0,
          overall_average: 0,
          filtered_by_user: true,
          error: 'Failed to get user permissions'
        });
        return;
      }
    }

    const db = new duckdb.Database(OKR_DB_PATH, { access_mode: "READ_ONLY" });
    const con = db.connect();

    getLatestMetricsTable(con)
      .then((tableName) => {
        if (!tableName) {
          con.close();
          db.close();
          reject(new Error("No timestamped okr_metrics table found"));
          return;
        }

        console.log(`[OKR] Analyzing period: "${period}" from table: ${tableName}`);

        // Build query with optional user filtering
        let accountFilter = '';
        const queryParams: any[] = [period];
        
        if (userDataScope && userDataScope.allowedAccounts.length > 0) {
          // Filter by allowed accounts
          // DuckDB uses ? for parameters, so we need to build the IN clause with placeholders
          const accountPlaceholders = userDataScope.allowedAccounts.map(() => '?').join(', ');
          accountFilter = `AND e.fellow_ad_account IN (${accountPlaceholders})`;
          queryParams.push(...userDataScope.allowedAccounts);
        }

        // Use parameterized query with proper escaping
        // DuckDB uses ? for positional parameters
        const query = `
          WITH base AS (
            SELECT COALESCE(e.fellow_city_company_name, 'Unknown') AS company_name,
                   m.metric_type,
                   m.value
            FROM ${tableName} m
            LEFT JOIN employee_fellow e
              ON m.owner = e.fellow_ad_account
            WHERE m.period = ?
              AND e.fellow_workday_cn_title IN ('乐道代理战队长', '乐道区域副总经理', '乐道区域总经理', '乐道区域行销负责人', '乐道战队长', '乐道战队长（兼个人销售）', '乐道片区总', '乐道行销大区负责人', '乐道销售部负责人')
              ${accountFilter}
          )
          SELECT company_name, metric_type,
                 COUNT(*) AS total,
                 SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
                 100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) AS null_pct
          FROM base
          WHERE company_name != 'Unknown'
          GROUP BY company_name, metric_type
        `;

        con.all(query, queryParams, (err: Error | null, result: any[]) => {
          con.close();
          db.close();

          if (err) {
            console.error(`[OKR] Query error for period "${period}":`, err);
            reject(err);
            return;
          }
          
          console.log(`[OKR] Query returned ${result.length} rows for period "${period}"`);

          // Calculate has_metric percentage
          const processed = result.map((row: any) => ({
            company_name: row.company_name,
            metric_type: row.metric_type,
            total: row.total,
            nulls: row.nulls,
            null_pct: parseFloat(row.null_pct) || 0,
            has_metric_pct: 100.0 - (parseFloat(row.null_pct) || 0),
          }));
          // Group by company and calculate summary
          const byCompany: Record<string, any[]> = {};
          processed.forEach((row) => {
            if (!byCompany[row.company_name]) {
              byCompany[row.company_name] = [];
            }
            byCompany[row.company_name].push(row);
          });

          // Generate summary
          const summary = Object.entries(byCompany).map(([company, metrics]) => {
            const avgHasMetric = metrics.reduce((sum, m) => sum + m.has_metric_pct, 0) / metrics.length;
            return {
              company,
              average_has_metric_percentage: Math.round(avgHasMetric * 100) / 100,
              metrics: metrics.map((m) => ({
                metric_type: m.metric_type,
                has_metric_percentage: Math.round(m.has_metric_pct * 100) / 100,
                total: m.total,
                nulls: m.nulls,
              })),
            };
          });

          // Sort by average has_metric_percentage descending
          summary.sort((a, b) => b.average_has_metric_percentage - a.average_has_metric_percentage);

          resolve({
            period,
            table_used: tableName,
            summary,
            total_companies: summary.length,
            overall_average: summary.length > 0
              ? Math.round(
                  (summary.reduce((sum, s) => sum + s.average_has_metric_percentage, 0) /
                    summary.length) *
                  100
                ) / 100
              : 0,
            filtered_by_user: userId ? true : false,
            user_allowed_accounts_count: userDataScope?.allowedAccounts.length || 0
          });
        });
      })
      .catch((err) => {
        con.close();
        db.close();
        reject(err);
      });
  });
}

// Create OKR review tool with caching (1 hour TTL) and devtools tracking
// DuckDB queries can be slow, so caching is important
// Same period = instant response from cache
const mgrOkrReviewTool = createOkrReviewTool(
  true,  // enableCaching
  true,  // enableDevtoolsTracking
  60 * 60 * 1000  // cacheTTL: 1 hour (OKR data doesn't change frequently)
);

/**
 * Main entry point for analyzing OKR metrics
 * 
 * Tries StarRocks first (if configured), falls back to DuckDB on error
 * Ensures graceful degradation when backend is unavailable
 * 
 * @param period - Period to analyze (e.g., '10 月', '11 月')
 * @param userId - Optional Feishu user ID for data filtering (RLS)
 */
export function analyzeHasMetricPercentage(period: string, userId?: string): Promise<any> {
  // Use StarRocks if configured, otherwise fall back to DuckDB
  if (hasStarrocksConfig()) {
    // Try StarRocks first, but fall back to DuckDB on error
    return analyzeHasMetricPercentageStarrocks(period, userId).catch((error: any) => {
      console.warn(`⚠️ [OKR] StarRocks query failed, falling back to DuckDB: ${error.message}`);
      // Fall through to DuckDB implementation
      return analyzeHasMetricPercentageDuckDB(period, userId);
    });
  }
  
  // Use DuckDB directly if StarRocks not configured
  return analyzeHasMetricPercentageDuckDB(period, userId);
}

// Lazy initialization
let _okrReviewerAgent: Agent | null = null;

export function getOkrReviewerAgent(): Agent {
  if (!_okrReviewerAgent) {
    _okrReviewerAgent = new Agent({
  name: "okr_reviewer",
  model: getPrimaryModel(),
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
      tools: {
        mgr_okr_review: mgrOkrReviewTool,
        okr_visualization: okrVisualizationTool as any, // Type assertion to avoid type issues
        chart_generation: chartGenerationTool,
      },
      matchOn: [
        "okr",
        "objective",
        "key result",
        "manager review",
        "has_metric",
        "覆盖率",
        "指标覆盖率",
        "经理评审",
        "目标",
        "关键结果",
        "okr指标",
        "指标",
        "okr分析",
        "分析",
        "图表",
        "可视化",
        "visualization",
        "chart",
        "analysis",
      ],
    });
  }
  return _okrReviewerAgent;
}

// Placeholder export for imports
export const okrReviewerAgent = null as any;
