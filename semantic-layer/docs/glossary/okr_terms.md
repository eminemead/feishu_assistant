# OKR Terms Glossary

## OKR (Objectives and Key Results)
A goal-setting framework used to define measurable goals and track outcomes.
- **Objective**: A qualitative goal describing what you want to achieve
- **Key Result**: A quantitative measure of progress toward the objective

中文：目标与关键结果，一种目标管理框架

## has_metric / 指标覆盖
A flag (0 or 1) indicating whether an OKR has an associated quantitative metric.
- `has_metric = 1`: OKR has a measurable metric attached
- `has_metric = 0`: OKR lacks a measurable metric

Higher coverage indicates better OKR quality.

## has_metric_percentage / 指标覆盖率
The percentage of OKRs that have associated metrics.

**Formula**:
```
has_metric_pct = (OKRs with metric / Total OKRs) × 100
```

**Target**: >80% coverage is considered good.

## city_company / 城市公司
A code representing the city or company entity. Common values:
- **SH**: Shanghai (上海)
- **BJ**: Beijing (北京)
- **GZ**: Guangzhou (广州)
- **SZ**: Shenzhen (深圳)

## quarter / 季度
Time period in format `YYYY-Q#`:
- `2024-Q1`: January - March 2024
- `2024-Q2`: April - June 2024
- `2024-Q3`: July - September 2024
- `2024-Q4`: October - December 2024

## manager_id / 经理ID
Unique identifier for the manager who owns or is responsible for the OKR.

## Coverage Analysis / 覆盖率分析
Analysis of has_metric_percentage across different dimensions:
- By city: Which cities have best/worst coverage?
- By manager: Which managers need improvement?
- By quarter: Is coverage trending up or down?

## Common Query Patterns

### Overall Coverage
```sql
SELECT ROUND(SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as pct
FROM okr_metrics
```

### Coverage by Dimension
```sql
SELECT dimension, ROUND(SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as pct
FROM okr_metrics
GROUP BY dimension
```
