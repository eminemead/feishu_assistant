-- OKR Coverage Quarterly Trend
-- Compare coverage across quarters
-- Shows improvement or decline over time

SELECT 
    quarter,
    COUNT(*) as total_okrs,
    SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) as with_metric,
    ROUND(
        SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        2
    ) as coverage_pct
FROM okr_metrics
WHERE quarter IN ('2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4')
GROUP BY quarter
ORDER BY quarter;
