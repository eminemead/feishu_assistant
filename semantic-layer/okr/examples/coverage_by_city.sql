-- OKR Coverage by City
-- Shows has_metric_percentage for each city company
-- Usage: Modify quarter filter as needed

SELECT 
    city_company,
    COUNT(*) as total_okrs,
    SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) as with_metric,
    ROUND(
        SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        2
    ) as has_metric_pct
FROM okr_metrics
WHERE quarter = '2024-Q4'
GROUP BY city_company
ORDER BY has_metric_pct DESC;
