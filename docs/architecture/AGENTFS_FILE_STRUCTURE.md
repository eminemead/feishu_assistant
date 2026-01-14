# AgentFS File Structure Design

This document defines the canonical directory layout for the AgentFS semantic layer.

## Design Philosophy

Following Vercel's insight: *"If your data layer is well-documented as files, generic filesystem + bash beats elaborate hand-crafted tools."*

**Core principle**: `/semantic-layer` is the stable map and canon; `/workspace` is the scratchpad; `/state` is durable per-thread notes; live data comes from `execute_sql`, not from bloating the semantic layer with big dumps.

| Directory | Purpose | Lifecycle | Git-tracked |
|-----------|---------|-----------|-------------|
| `/semantic-layer` | Source of truth: schemas, metrics, canonical SQL | Stable, versioned | ✅ Yes |
| `/workspace` | Transient scratch: query results, temp files | Ephemeral per task | ❌ No |
| `/state` | Durable notes: per-thread artifacts that persist | Per-thread, survives turns | ❌ No |

## What Belongs Where

### ✅ `/semantic-layer` (read-only, git-tracked)

| Content | Examples |
|---------|----------|
| **Schemas** | Table/column definitions, RLS notes, join paths, PK/FK |
| **Metrics** | YAML definitions with owner, caveats, freshness |
| **Views/snippets** | Canonical SQL templates, example queries, common filters |
| **Glossary/playbooks** | Business terms, OKR definitions, P&L definitions, how-to |
| **Small reference data** | Tiny CSVs/JSON for lookups (<1K rows, <100KB) — BU codes, region mappings |
| **Test fixtures** | Minimal sample rows to show shape, not production-scale |

### ✅ `/workspace` (ephemeral scratchpad)

| Content | Examples |
|---------|----------|
| **Query results** | `result.csv` from `execute_sql` |
| **Temp SQL** | `query.sql` being iterated on |
| **Intermediate files** | Derived CSVs, JSON extracts for bash processing |

**Lifecycle**: Cleared between conversations. Agent should assume it can be wiped anytime.

### ✅ `/state` (durable per-thread)

| Content | Examples |
|---------|----------|
| **Analysis notes** | Findings that should survive across turns |
| **Derived artifacts** | Summaries, insights worth keeping |
| **Thread context** | Per-conversation state beyond Mastra memory |

**Structure**: `/state/{thread_id}/notes.md` or JSON blobs.

### ❌ What NOT to Put in `/semantic-layer`

| Don't store | Why | Alternative |
|-------------|-----|-------------|
| Per-user memory/notes | Mastra mem handles this | Use Mastra memory API |
| Large fact tables | Stale, bloats repo | `execute_sql` → `/workspace/result.csv` |
| Frequently changing data | Out of date immediately | Query live via `execute_sql` |
| Secrets/PII | Security risk | Environment variables, Supabase RLS |
| Production-scale data | Wrong place for big data | StarRocks via `execute_sql` |

**Rule of thumb**: If it's >1K rows or changes more than weekly, it belongs in the database, not the semantic layer.

## Data Workflow Pattern

When agent needs to analyze data:

```
1. UNDERSTAND: Read /semantic-layer/entities/<table>.md 
               and /semantic-layer/views/*.sql
               → learn shape, joins, metrics

2. QUERY:      Formulate narrow SQL via execute_sql (with RLS)
               → write output to /workspace/result.csv

3. EXPLORE:    Use bash (head/tail/grep/awk/jq) on workspace file
               → summarize, derive follow-up queries

4. PERSIST:    Write derived artifacts to /state/... if needed
               → keeps transient scratch vs meaningful notes separate

5. ITERATE:    Adjust SQL, refresh /workspace/result.csv, repeat
```

**Example**:
```bash
# 1. Understand the schema
cat /semantic-layer/entities/okr_metrics.yaml

# 2. Query live data (agent calls execute_sql tool)
# → writes to /workspace/okr_coverage.csv

# 3. Explore results
head -20 /workspace/okr_coverage.csv
awk -F',' '{sum+=$3} END {print sum/NR}' /workspace/okr_coverage.csv

# 4. Persist insight
echo "Average coverage: 67%" >> /state/thread-123/findings.md

# 5. Iterate with refined query
```

## Directory Layout

```
/
├── semantic-layer/           # Source of truth (git-tracked)
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
│   ├── reference/            # Small lookup data (<100KB each)
│   │   ├── bu_codes.csv      # Business unit mappings
│   │   └── region_map.json   # Region → country lookups
│   │
│   └── docs/                 # Business glossary & guides
│       └── glossary/
│           └── okr_terms.md
│
├── workspace/                # Ephemeral scratch (gitignored)
│   ├── query.sql             # Agent-generated SQL
│   └── result.csv            # Query results
│
└── state/                    # Durable per-thread (gitignored)
    └── {thread_id}/
        └── notes.md          # Persistent findings

## File Categories

### 1. Static Files (`/semantic-layer/` — git-tracked)
Source of truth, version controlled, team-shared.

| Type | Format | Purpose |
|------|--------|---------|
| Metrics | YAML | How to calculate business metrics |
| Entities | YAML | Table schemas, columns, relationships |
| Examples | SQL | Correct query patterns |
| Glossary | Markdown | Business term definitions |
| Reference | CSV/JSON | Small lookup tables (<100KB) |

### 2. Ephemeral Files (`/workspace/` — gitignored)
Created during agent execution, cleared between tasks.

| Type | Purpose |
|------|---------|
| `query.sql` | SQL being iterated on |
| `result.csv` | Output from `execute_sql` |
| `*.tmp` | Any intermediate processing files |

### 3. Durable State (`/state/` — gitignored)
Per-thread artifacts that persist across turns but not git-tracked.

| Type | Purpose |
|------|---------|
| `{thread_id}/notes.md` | Analysis findings |
| `{thread_id}/context.json` | Thread-specific context |

### 4. User Memory (Mastra)
Handled by Mastra memory API, not filesystem.

- Per-user preferences
- Conversation history
- User-specific notes

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
