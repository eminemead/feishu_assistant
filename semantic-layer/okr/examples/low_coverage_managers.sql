-- Low Coverage Managers
-- Identifies managers with lowest OKR metric coverage
-- Useful for targeted improvement initiatives

SELECT 
    manager_id,
    city_company,
    COUNT(*) as total_okrs,
    SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) as with_metric,
    ROUND(
        SUM(CASE WHEN has_metric = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        2
    ) as coverage_pct
FROM okr_metrics
WHERE quarter = '2024-Q4'
GROUP BY manager_id, city_company
HAVING COUNT(*) >= 5  -- Only managers with at least 5 OKRs
ORDER BY coverage_pct ASC
LIMIT 20;
