# Semantic Layer

This directory is the **source of truth** for data definitions. Read-only, git-tracked, team-shared.

> **Full architecture**: See [docs/architecture/AGENTFS_FILE_STRUCTURE.md](../docs/architecture/AGENTFS_FILE_STRUCTURE.md)

## What Belongs Here

| Content | Examples |
|---------|----------|
| **Schemas** | Table/column definitions, RLS notes, join paths, PK/FK |
| **Metrics** | YAML definitions with owner, caveats, freshness |
| **Views/snippets** | Canonical SQL templates, example queries |
| **Glossary** | Business terms, OKR/P&L definitions |
| **Small reference data** | Tiny CSVs/JSON (<1K rows, <100KB) for lookups |
| **Test fixtures** | Minimal sample rows to show shape |

## What Does NOT Belong Here

- ❌ Per-user memory (use Mastra memory)
- ❌ Large fact tables (use `execute_sql` → `/workspace/`)
- ❌ Frequently changing data (query live)
- ❌ Secrets/PII

## Directory Structure

```
semantic-layer/
├── metrics/              # Business metric definitions
│   ├── _index.yaml       # Quick reference of all metrics
│   └── has_metric_pct.yaml
├── entities/             # Table/view schemas
│   ├── _index.yaml       # Quick reference of all entities
│   ├── okr_metrics.yaml
│   └── evidence_rls.yaml
├── joins/                # Standard join patterns
│   └── standard_joins.yaml
├── views/                # Pre-built SQL views
├── reference/            # Small lookup data (<100KB each)
│   ├── bu_codes.csv
│   └── region_map.json
├── okr/                  # OKR domain resources
│   └── examples/         # Example SQL queries
├── pnl/                  # P&L domain resources
│   └── examples/
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
