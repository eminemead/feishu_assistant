# AGENTS.md: Quick Reference

## Conciseness Rule (via Matt Pocock)
In all interactions, plans, and commit messages, be extremely concise and sacrifice grammar for the sake of concision，without losing clarity. Prioritizes actionability over polish.


## Project: Feishu Assistant

**WHY**: Build Feishu AI agent handling OKR review, P&L analysis, and document tracking etc.

**WHAT**: TypeScript bot with Manager Agent routing to specialists (OKR Reviewer, Meeting Alignment, P&L Analysis, Doc Tracking, etc), using Vercel AI SDK v5, Supabase memory, and Feishu SDK.

**TECH**: TypeScript, Hono, Vercel AI SDK v5, Mastra, Supabase (memory/auth), StarRocks/DuckDB (metrics), Feishu SDK

## Getting Started

### First Time Setup
```bash
bun install
cp .env.example .env
bun run dev              # Instant reload, no build needed
```

### Essential Commands
```bash
bun run dev              # Development (watches TS, auto-reload)
bun run build            # Production esbuild
bun run typecheck        # Type checking only
bun test                 # Run test suite
```

### Key Workflows for This Project

**Memory Persistence** — Conversation history stored in Supabase with RLS  
→ See: `docs/MEMORY_IMPLEMENTATION.md`

**Beads Issue Tracking** — We dogfood our own issue tracker  
→ `bd ready` (find work) • `bd sync` (force immediate export/commit/push)  
→ See: `bd info --whats-new` or beads project docs

**Local Development Debugging** — Enable devtools monitoring  
```bash
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev
# Monitor at http://localhost:3000/devtools
```
→ See: `docs/DEVTOOLS.md` for API endpoints

## When You Need More Details

- **Architecture & design decisions** → `docs/ARCHITECTURE.md`
- **Build, test, & quality gates** → `docs/BUILD_AND_TEST.md`
- **TypeScript code style** → `docs/CODE_STYLE.md`
- **Critical workflows (memory, beads, etc)** → `docs/CRITICAL_WORKFLOWS.md`
- **Docs organization** → `docs/ORGANIZATION.md`

## Critical Reminders

- ✅ Use `bd` for ALL issue tracking (not Markdown TODOs)
- ✅ Always run `bd sync` at end of session
- ✅ Use `--json` flags for programmatic use with beads
- ✅ Link discovered issues with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ✅ Store AI-generated planning docs in `history/` directory
- ❌ Do NOT create markdown TODO lists or use external trackers

## Pro Tips for Agents

- `bd ready --json` — Unblocked issues ready for work
- `bd create "title" -p 1 --deps discovered-from:bd-X --json` — File discovered work
- `bd sync` — Force immediate flush/commit/push (don't wait 30s debounce)
- Chain multiple beads changes (they batch in 30s window) before syncing
- Use `BEADS_DB=/tmp/test.db` for isolated testing without polluting main DB
- `bd dep tree <id>` — Visualize complex dependencies

## Questions or Ideas?

- Check for ready work: `bd ready --json`
- Search recent issues: `bd list --json`
- Create a task: `bd create "Question: ..." -t task -p 2`


## Using bv as an AI sidecar

bv is a fast terminal UI for Beads projects (.beads/beads.jsonl). It renders lists/details and precomputes dependency metrics (PageRank, critical path, cycles, etc.) so you instantly see blockers and execution order. For agents, it's a graph sidecar: instead of parsing JSONL or risking hallucinated traversal, call the robot flags to get deterministic, dependency-aware outputs.

*IMPORTANT: As an agent, you must ONLY use bv with the robot flags, otherwise you'll get stuck in the interactive TUI that's intended for human usage only!*

### Core Commands
- `bv --robot-help` — shows all AI-facing commands
- `bv --robot-triage` — **THE MEGA-COMMAND**: unified triage with priorities, quick wins, blockers, health metrics
- `bv --robot-next` — single top recommendation with claim command (minimal output)

### Graph Analysis
- `bv --robot-insights` — JSON graph metrics (PageRank, betweenness, HITS, k-core, articulation points, slack)
- `bv --robot-plan` — parallel execution tracks with unblocks lists
- `bv --robot-priority` — priority recommendations with confidence + reasoning

### File & Code Correlation
- `bv --robot-history` — bead-to-commit correlations, cycle time stats
- `bv --robot-file-beads <path>` — beads that touched a file (open + closed)
- `bv --robot-file-hotspots` — files touched by most beads (conflict zones)
- `bv --robot-impact <files>` — risk analysis before modifying files
- `bv --robot-file-relations <path>` — files that frequently co-change
- `bv --robot-related <bead-id>` — beads related via file/commit/dependency overlap

### Labels & Health
- `bv --robot-label-health` — per-label health metrics (velocity, flow, criticality)
- `bv --robot-label-flow` — cross-label dependency matrix
- `bv --robot-label-attention` — attention-ranked labels needing focus
- `bv --robot-alerts` — drift + proactive warnings (staleness, cascades, cycles)

### Sprint & Forecasting
- `bv --robot-sprint-list` — all sprints as JSON
- `bv --robot-burndown <id|current>` — sprint burndown data
- `bv --robot-forecast <id|all>` — ETA predictions per issue
- `bv --robot-capacity [--agents=N]` — team capacity simulation

### Utilities
- `bv --robot-recipes` — list available recipes; use `bv --recipe <name>` to filter
- `bv --robot-diff --diff-since <commit|date>` — JSON diff of changes
- `bv --robot-graph [--graph-format=json|dot|mermaid]` — export dependency graph
- `bv --robot-suggest` — hygiene suggestions (deps/dupes/labels/cycles)
- `bv --search "query" --robot-search` — semantic vector search with hybrid ranking
- `bv --emit-script [--script-limit=N]` — generate shell script for top recommendations

### Filters (work with most robot commands)
- `--robot-min-confidence 0.6` — filter by minimum confidence
- `--robot-max-results 5` — limit results
- `--robot-by-label <label>` — filter by label
- `--label <label>` — scope analysis to label's subgraph
- `--as-of <commit|date>` — time-travel to historical state

Use these commands instead of hand-rolling graph logic; bv already computes the hard parts so agents can act safely and quickly.

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
