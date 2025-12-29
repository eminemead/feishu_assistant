# Semantic Layer

This directory contains the **semantic layer** for the Feishu AI Assistant. It exposes our data model as files that agents can explore using bash commands (`ls`, `grep`, `cat`, etc.).

## Purpose

Following Vercel's approach of "filesystem as the agent's interface", this semantic layer enables:
- **Self-documenting schemas**: Agents read YAML files to understand tables and metrics
- **Example-driven learning**: SQL examples teach agents the correct query patterns
- **Discoverability**: Index files and consistent naming for efficient exploration
- **Security**: Agents only see what's mounted in their AgentFS workspace

## Directory Structure

```
semantic-layer/
├── metrics/              # Business metric definitions
│   ├── _index.yaml       # Quick reference of all metrics
│   ├── has_metric_pct.yaml
│   └── ...
├── entities/             # Table/view schemas
│   ├── _index.yaml       # Quick reference of all entities
│   ├── okr_metrics.yaml
│   └── ...
├── joins/                # Standard join patterns
│   └── standard_joins.yaml
├── views/                # Pre-built SQL views
│   └── ...
├── okr/                  # OKR-specific resources
│   └── examples/         # Example SQL queries
├── pnl/                  # P&L-specific resources
│   └── examples/         # Example SQL queries
└── docs/                 # Business glossary & guides
    └── glossary/
```

## How Agents Use This

1. **Explore available metrics**:
   ```bash
   ls /semantic-layer/metrics/
   cat /semantic-layer/metrics/_index.yaml
   ```

2. **Find relevant definitions**:
   ```bash
   grep -r "revenue" /semantic-layer/
   cat /semantic-layer/metrics/revenue.yaml
   ```

3. **Check example queries**:
   ```bash
   cat /semantic-layer/okr/examples/coverage_by_city.sql
   ```

4. **Understand business terms**:
   ```bash
   cat /semantic-layer/docs/glossary/okr_terms.md
   ```

## File Formats

### Metric YAML Schema
```yaml
name: metric_name
description: What this metric measures
sql_expression: |
  SQL expression to calculate this metric
grain: The level of detail (e.g., okr_id, transaction_id)
aggregation: How to aggregate (sum, avg, count, percentage)
dimensions:
  - list of dimensions this metric can be grouped by
source_table: The primary table
database: starrocks | duckdb
examples:
  - question: Natural language question
    sql: |
      Example SQL query
```

### Entity YAML Schema
```yaml
name: table_name
description: What this table contains
database: starrocks | duckdb
schema: schema_name
columns:
  - name: column_name
    type: DATA_TYPE
    description: What this column contains
    primary_key: true | false
common_filters:
  - Example WHERE clauses
sample_queries:
  - description: Query description
    sql: Example SQL
```

## Maintenance

- **Update when schema changes**: Keep entity YAML files in sync with actual tables
- **Add examples**: More examples = better agent performance
- **Keep files small**: < 500 lines per file for fast reads
- **Use index files**: Precompute `_index.yaml` for quick lookups
