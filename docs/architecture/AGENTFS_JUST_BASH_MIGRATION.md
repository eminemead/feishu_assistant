# AgentFS + Just-Bash Migration Plan

## Executive Summary

This document captures the architectural migration from our current multi-tool agent setup to a simplified **filesystem + bash** approach inspired by [Vercel's blog post](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools).

### Why This Change?

Vercel removed 80% of their agent's tools and achieved:
- **3.5x faster responses**
- **37% fewer tokens**
- **100% success rate** on their text-to-SQL benchmark

Their insight: **if your data layer is well-documented as files, generic filesystem + bash is often better than elaborate hand-crafted tools.**

### Core Architectural Shift

| Before (Current) | After (Target) |
|------------------|----------------|
| Many specialized tools per agent | Two generic tools: `bash_exec` + `execute_sql` |
| Heavy prompt engineering for each tool | Model reasons directly over files |
| Implicit routing logic | Explicit file-based context |
| Fragile, high-latency | Simpler, faster, more debuggable |

---

## Key Components

### 1. AgentFS (Semantic Layer as Files)

**What**: SQLite-based virtual filesystem that exposes everything the agent needs as files.

**Repository**: https://github.com/tursodatabase/agentfs

**Why AgentFS over plain filesystem**:
- Portable per-run/per-user workspaces (single `.db` file)
- Built-in audit trail of file operations
- Designed for agents, not humans
- Alpha but well-designed for our use case

### 2. Just-Bash (Generic Exploration Tool)

**What**: Sandboxed bash execution with in-memory virtual filesystem.

**Repository**: https://github.com/vercel-labs/just-bash

**Key properties**:
- In-memory virtual filesystem (no real disk access)
- No network by default (optional URL allowlist for `curl`)
- Cannot run binaries (safe containment)
- Supports: `ls`, `grep`, `cat`, `head`, `tail`, `find`, `awk`, `sed`, etc.

### 3. Execute SQL (Narrow Bridge)

**What**: Single specialized tool that runs SQL against StarRocks/DuckDB.

**Why keep this separate**:
- just-bash cannot run database clients
- Need controlled execution with RLS/permissions
- Can expose via HTTP for `curl` within bash if desired

---

## AgentFS Directory Layout

```
/
├── semantic-layer/
│   ├── metrics/
│   │   ├── revenue.yaml           # Metric: revenue calculation
│   │   ├── gross_profit.yaml      # Metric: gross profit
│   │   ├── has_metric_pct.yaml    # Metric: OKR coverage %
│   │   └── ...
│   ├── entities/
│   │   ├── okr_metrics.yaml       # Table: okr_metrics schema
│   │   ├── pnl_summary.yaml       # Table: P&L summary schema
│   │   └── ...
│   ├── joins/
│   │   └── standard_joins.yaml    # Common join patterns
│   └── views/
│       ├── pnl_by_bu.sql          # Pre-built view: P&L by BU
│       └── okr_by_manager.sql     # Pre-built view: OKR by manager
│
├── okr/
│   ├── 2024/
│   │   └── Q4/
│   │       ├── company.md         # Company-level OKRs
│   │       └── teams/
│   │           └── dpa.md         # DPA team OKRs
│   └── 2025/
│       └── Q1/
│           └── draft/             # Draft OKRs
│
├── pnl/
│   ├── examples/
│   │   ├── quarterly_comparison.sql
│   │   └── variance_analysis.sql
│   └── templates/
│       └── variance_report.md
│
├── docs/
│   ├── glossary/
│   │   ├── financial_terms.md
│   │   └── okr_terms.md
│   └── guides/
│       └── how_to_query_pnl.md
│
├── memory/
│   └── users/
│       └── {feishu_user_id}.md    # Per-user long-term notes
│
└── workspace/                     # Scratch space for agent work
    ├── query.sql                  # Agent-generated SQL
    └── result.csv                 # Query results
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Install dependencies (`agentfs-sdk`, `just-bash`)
- Create AgentFS utility module
- Design initial semantic layer structure
- Implement file-map builder (Supabase → AgentFS layout)

### Phase 2: Integration (Week 1-2)
- Implement `bash_exec` as Mastra tool
- Implement `execute_sql` as Mastra tool
- Wire up to one specialist agent (P&L or OKR)
- Create agent prompts teaching fs+bash patterns

### Phase 3: Migration (Week 2-3)
- Migrate remaining agents to use bash+sql
- Deprecate old specialized tools
- Update routing to simplified model
- Add observability/logging

### Phase 4: Validation (Week 3-4)
- Test against existing use cases
- Measure latency/token improvements
- Compare accuracy vs current system
- Production rollout decision

---

## Security Considerations

### Per-User Isolation
- Build per-user AgentFS views respecting Supabase RLS
- Only mount directories user is allowed to see
- `execute_sql` runs with user-scoped identity

### just-bash Sandboxing
- No network access (or strict URL allowlist)
- CPU/time/step limits in Mastra
- Output size limits before sending to Feishu
- No binary execution (only shell builtins)

### Data Classification
- AgentFS contains derived/cache data only
- Supabase remains source of truth
- No PII stored in AgentFS workspace

---

## Success Criteria

1. **Latency**: Response time ≤ current system (ideally faster)
2. **Token usage**: ≤ current token consumption
3. **Accuracy**: ≥ current accuracy on P&L/OKR queries
4. **Debuggability**: Can replay any agent session from AgentFS logs
5. **Simplicity**: Fewer tools, simpler agent prompts

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| AgentFS is alpha | Use for derived data only, Supabase is SoT |
| Semantic layer quality | Invest in curating clean YAML/SQL definitions |
| just-bash limitations | Keep `execute_sql` as separate tool |
| Large file trees | Keep tree small, precompute index files |
| Team confusion (two storage systems) | Clear documentation on when to use which |

---

## References

- [Vercel Blog: We Removed 80% of Our Agent's Tools](https://vercel.com/blog/we-removed-80-percent-of-our-agents-tools)
- [AgentFS GitHub](https://github.com/tursodatabase/agentfs)
- [Just-Bash GitHub](https://github.com/vercel-labs/just-bash)
- [Mastra Research Assistant Example](https://github.com/tursodatabase/agentfs/tree/main/examples/mastra/research-assistant)

---

## Thread Reference

This migration was planned in Amp thread: https://ampcode.com/threads/T-019b6991-7ef2-730f-9e66-c9b0bcde119c
