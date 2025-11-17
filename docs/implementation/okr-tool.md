# OKR Reviewer Agent Tool Implementation

## Overview

The OKR Reviewer Agent has one tool: `mgr_okr_review` that analyzes manager OKR metrics by checking `has_metric_percentage` per city company.

## Tool Definition

The tool is defined using the AI SDK's `tool()` function:

```typescript
const mgrOkrReviewTool = tool({
  description: "Analyze manager OKR metrics by checking has_metric_percentage per city company...",
  parameters: zodSchema(z.object({
    period: z.string().describe("The period to analyze (e.g., '10 月', '11 月', '9 月')...")
  })),
  execute: async ({ period }: { period: string }) => {
    // Tool execution logic
  }
});
```

## Architecture

### 1. **Tool Registration** (Lines 144-167)

The tool is created using the `tool()` function from the AI SDK:
- **Description**: Explains what the tool does to the LLM
- **Parameters**: Uses Zod schema for type-safe parameter validation
- **Execute**: Async function that performs the actual work

### 2. **Database Connection** (Lines 7, 42-43)

- **Database Path**: `/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db`
- **Access Mode**: `READ_ONLY` for safety
- **Connection**: Creates a new DuckDB connection for each query

### 3. **Helper Functions**

#### `getLatestMetricsTable()` (Lines 16-35)
- **Purpose**: Finds the most recent timestamped `okr_metrics_*` table
- **Query**: Searches `information_schema.tables` for tables matching `okr_metrics_%`
- **Returns**: The latest table name or `null`

#### `analyzeHasMetricPercentage()` (Lines 40-142)
- **Purpose**: Performs the main analysis logic
- **Steps**:
  1. Opens DuckDB connection
  2. Gets latest metrics table
  3. Executes complex SQL query
  4. Processes results
  5. Returns structured analysis

## SQL Query Breakdown

The core SQL query (lines 55-73) does the following:

### Step 1: Base CTE (Lines 56-64)
```sql
WITH base AS (
  SELECT COALESCE(e.fellow_city_company_name, 'Unknown') AS company_name,
         m.metric_type,
         m.value
  FROM ${tableName} m
  LEFT JOIN employee_fellow e ON m.owner = e.fellow_ad_account
  WHERE m.period = ?
    AND e.fellow_workday_cn_title IN ('乐道代理战队长', '乐道区域副总经理', ...)
)
```

**What it does**:
- Joins `okr_metrics_*` table with `employee_fellow` table
- Filters for specific manager titles (战队长, 区域总经理, etc.)
- Extracts company name, metric type, and value
- Filters by period (parameterized query)

### Step 2: Aggregation (Lines 66-72)
```sql
SELECT company_name, metric_type,
       COUNT(*) AS total,
       SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) AS nulls,
       100.0 * SUM(CASE WHEN value IS NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0) AS null_pct
FROM base
WHERE company_name != 'Unknown'
GROUP BY company_name, metric_type
```

**What it does**:
- Groups by company and metric type
- Counts total metrics
- Counts null values
- Calculates null percentage (which becomes the inverse of `has_metric_percentage`)

## Data Processing

### 1. **Calculate has_metric_percentage** (Lines 85-92)
```typescript
const processed = result.map((row: any) => ({
  company_name: row.company_name,
  metric_type: row.metric_type,
  total: row.total,
  nulls: row.nulls,
  null_pct: parseFloat(row.null_pct) || 0,
  has_metric_pct: 100.0 - (parseFloat(row.null_pct) || 0), // Inverse of null_pct
}));
```

**Formula**: `has_metric_pct = 100 - null_pct`
- If 20% are null → 80% have metrics
- If 0% are null → 100% have metrics

### 2. **Group by Company** (Lines 95-101)
Groups metrics by company for summary calculation

### 3. **Calculate Summary** (Lines 104-116)
For each company:
- Calculates average `has_metric_percentage` across all metric types
- Includes detailed breakdown by metric type
- Rounds to 2 decimal places

### 4. **Sort Results** (Line 119)
Sorts companies by average `has_metric_percentage` (descending)
- Companies with higher coverage appear first

## Return Structure

The tool returns a structured object:

```typescript
{
  period: string,              // The analyzed period (e.g., "10 月")
  table_used: string,          // The DuckDB table name used
  summary: [                   // Array of company summaries
    {
      company: string,
      average_has_metric_percentage: number,
      metrics: [
        {
          metric_type: string,
          has_metric_percentage: number,
          total: number,
          nulls: number
        }
      ]
    }
  ],
  total_companies: number,     // Number of companies analyzed
  overall_average: number       // Overall average across all companies
}
```

## Error Handling

The tool includes error handling (lines 160-165):
- Catches database errors
- Returns error object instead of throwing
- Preserves period information for debugging

## Tool Registration with Agent

The tool is registered with the agent (lines 183-185):

```typescript
export const okrReviewerAgent = new Agent({
  // ...
  tools: {
    mgr_okr_review: mgrOkrReviewTool,
  },
});
```

This makes the tool available **only** to the OKR Reviewer Agent - other agents cannot access it.

## Usage Flow

1. **User Query**: "显示10月的OKR指标覆盖率"
2. **Agent Routing**: Manager agent routes to OKR Reviewer (matches "OKR", "指标覆盖率")
3. **Tool Invocation**: OKR Reviewer agent calls `mgr_okr_review` with `period: "10 月"`
4. **Database Query**: Tool queries DuckDB for the period
5. **Analysis**: Calculates has_metric_percentage by company
6. **Response**: Agent formats the results and returns to user

## Key Design Decisions

1. **Dynamic Table Selection**: Uses latest timestamped table (handles data updates)
2. **Parameterized Queries**: Prevents SQL injection (uses `?` placeholder)
3. **Read-Only Access**: Database opened in READ_ONLY mode for safety
4. **Connection Management**: Opens/closes connection per query (simple but could be optimized)
5. **Error Handling**: Returns error object instead of throwing (better UX)
6. **Scoped Tools**: Tool only available to OKR Reviewer agent (security)

## Potential Improvements

1. **Connection Pooling**: Reuse database connections instead of creating new ones
2. **Caching**: Cache results for frequently queried periods
3. **Async/Await**: Convert Promise-based DuckDB API to async/await for cleaner code
4. **Type Safety**: Add TypeScript interfaces for return types
5. **Validation**: Add period format validation (e.g., must match "X 月" pattern)

