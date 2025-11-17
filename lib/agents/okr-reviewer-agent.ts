import { Agent } from "@ai-sdk-tools/agents";
import { tool, zodSchema } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import * as duckdb from "duckdb";

const OKR_DB_PATH = "/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

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
 * Analyzes has_metric_percentage for managers by city company
 */
async function analyzeHasMetricPercentage(period: string): Promise<any> {
  return new Promise((resolve, reject) => {
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

        // Use parameterized query with proper escaping
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
          )
          SELECT company_name, metric_type,
                 COUNT(*) AS total,
                 SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
                 100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) AS null_pct
          FROM base
          WHERE company_name != 'Unknown'
          GROUP BY company_name, metric_type
        `;

        con.all(query, [period], (err: Error | null, result: any[]) => {
          con.close();
          db.close();

          if (err) {
            reject(err);
            return;
          }

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

const mgrOkrReviewTool = tool({
  description:
    "Analyze manager OKR metrics by checking has_metric_percentage per city company. This tool queries DuckDB to analyze if management criteria are met by managers of different levels across different city companies.",
  parameters: zodSchema(
    z.object({
      period: z
        .string()
        .describe(
          "The period to analyze (e.g., '10 月', '11 月', '9 月'). Defaults to current month if not specified."
        ),
    })
  ),
  execute: async ({ period }: { period: string }) => {
    try {
      const analysis = await analyzeHasMetricPercentage(period);
      return analysis;
    } catch (error: any) {
      return {
        error: error.message || "Failed to analyze OKR metrics",
        period,
      };
    }
  },
});

export const okrReviewerAgent = new Agent({
  name: "okr_reviewer",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `You are a Feishu/Lark AI assistant specialized in OKR (Objectives and Key Results) review and analysis.
- Do not tag users.
- Current date is: ${new Date().toISOString().split("T")[0]}
- Format your responses using Markdown syntax (Lark Markdown format), which will be rendered in Feishu cards.
- You analyze OKR metrics and manager performance using the mgr_okr_review tool.
- The mgr_okr_review tool checks has_metric_percentage per city company to evaluate if management criteria are met.`,
  tools: {
    mgr_okr_review: mgrOkrReviewTool,
  },
  matchOn: [
    "okr",
    "objective",
    "key result",
    "metrics",
    "manager review",
    "has_metric",
    "覆盖率",
    "指标",
  ],
});
