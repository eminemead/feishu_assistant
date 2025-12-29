# AgentFS File Structure Design

This document defines the canonical directory layout for the AgentFS semantic layer.

## Design Philosophy

Following Vercel's insight: *"If your data layer is well-documented as files, generic filesystem + bash beats elaborate hand-crafted tools."*

The semantic layer exposes our data model as files that agents explore using standard bash commands (`ls`, `grep`, `cat`, `find`).

## Directory Layout

```
/
├── semantic-layer/           # Core data definitions (version-controlled)
│   ├── metrics/              # Business metric definitions
│   │   ├── _index.yaml       # Quick reference of all metrics
│   │   ├── has_metric_pct.yaml
│   │   └── [future metrics]
│   │
│   ├── entities/             # Table/view schemas
│   │   ├── _index.yaml       # Quick reference of all entities
│   │   ├── okr_metrics.yaml
│   │   ├── evidence_rls.yaml
│   │   └── [future tables]
│   │
│   ├── joins/                # Standard join patterns
│   │   └── standard_joins.yaml
│   │
│   ├── views/                # Pre-built SQL views
│   │   └── [future views]
│   │
│   ├── okr/                  # OKR domain resources
│   │   └── examples/         # Example SQL queries
│   │       ├── coverage_by_city.sql
│   │       ├── low_coverage_managers.sql
│   │       └── quarterly_trend.sql
│   │
│   ├── pnl/                  # P&L domain resources
│   │   └── examples/         # Example SQL queries
│   │
│   └── docs/                 # Business glossary & guides
│       └── glossary/
│           └── okr_terms.md
│
├── memory/                   # Per-user context (dynamic)
│   └── users/
│       └── {feishu_user_id}.md
│
└── workspace/                # Agent scratch space (ephemeral)
    ├── query.sql             # Agent-generated SQL
    └── result.csv            # Query results
```

## File Categories

### 1. Static Files (Version Controlled)
Located in `/semantic-layer/`. These are checked into Git and loaded from the repo.

- **Metrics**: YAML files defining how to calculate business metrics
- **Entities**: YAML files describing table schemas
- **Examples**: SQL files showing correct query patterns
- **Glossary**: Markdown files explaining business terms

### 2. Dynamic Files (Runtime Generated)
Generated per-user or per-conversation:

- **Memory**: User-specific notes and context from Supabase
- **Schema**: Dynamically generated from StarRocks INFORMATION_SCHEMA

### 3. Ephemeral Files (Agent Workspace)
Created during agent execution:

- **workspace/**: Scratch space for agent to write files
- Cleared between conversations or on demand

## YAML Schema Standards

### Metric Definition
```yaml
name: metric_name
description: Multi-line description with business context
sql_expression: |
  SQL fragment to calculate this metric
grain: Level of detail (e.g., okr_id)
aggregation: sum | avg | count | percentage
dimensions: [list of groupable columns]
source_table: primary_table_name
database: starrocks | duckdb
examples:
  - question: Natural language question
    chinese: 中文问题
    sql: |
      Complete example SQL
```

### Entity Definition
```yaml
name: table_name
description: Multi-line description
database: starrocks | duckdb
schema: schema_name
columns:
  - name: column_name
    type: DATA_TYPE
    description: What this column contains
    primary_key: true | false
    nullable: true | false
common_filters: [Example WHERE clauses]
sample_queries:
  - description: Query description
    sql: SQL query
```

## Agent Exploration Patterns

### 1. Discovery
```bash
ls /semantic-layer/metrics/
ls /semantic-layer/entities/
```

### 2. Search
```bash
grep -r "revenue" /semantic-layer/
grep -l "city_company" /semantic-layer/entities/
```

### 3. Read Definition
```bash
cat /semantic-layer/metrics/has_metric_pct.yaml
```

### 4. Check Examples
```bash
cat /semantic-layer/okr/examples/coverage_by_city.sql
```

### 5. Write Query
```bash
cat > /workspace/query.sql << 'EOF'
SELECT ...
FROM ...
EOF
```

## Security Considerations

### RLS Integration
- User-specific memory files are filtered by Supabase RLS
- `execute_sql` tool applies RLS filters before execution
- Agents never see raw RLS configuration

### Data Classification
- **Public**: Metric definitions, entity schemas, examples
- **User-scoped**: Memory files, query results
- **Internal-only**: RLS tables, credentials

## Maintenance Guidelines

1. **Keep files small**: < 500 lines per file
2. **Update indexes**: Regenerate `_index.yaml` when adding files
3. **Add examples**: More examples = better agent accuracy
4. **Test SQL**: Validate all example queries against actual database
5. **Use consistent naming**: `snake_case` for files, clear prefixes

## Related Files
- [semantic-layer/README.md](../../semantic-layer/README.md)
- [lib/infra/agentfs.ts](../../lib/infra/agentfs.ts)
- [lib/infra/agentfs-builder.ts](../../lib/infra/agentfs-builder.ts) (to be created)
