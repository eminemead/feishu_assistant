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

bv is a fast terminal UI for Beads projects (.beads/beads.jsonl). It renders lists/details and precomputes dependency metrics (PageRank, critical path, cycles, etc.) so you instantly see blockers and execution order. For agents, it’s a graph sidecar: instead of parsing JSONL or risking hallucinated traversal, call the robot flags to get deterministic, dependency-aware outputs.

*IMPORTANT: As an agent, you must ONLY use bv with the robot flags, otherwise you'll get stuck in the interactive TUI that's intended for human usage only!*

- bv --robot-help — shows all AI-facing commands.
- bv --robot-insights — JSON graph metrics (PageRank, betweenness, HITS, critical path, cycles) with top-N summaries for quick triage.
- bv --robot-plan — JSON execution plan: parallel tracks, items per track, and unblocks lists showing what each item frees up.
- bv --robot-priority — JSON priority recommendations with reasoning and confidence.
- bv --robot-recipes — list recipes (default, actionable, blocked, etc.); apply via bv --recipe <name> to pre-filter/sort before other flags.
- bv --robot-diff --diff-since <commit|date> — JSON diff of issue changes, new/closed items, and cycles introduced/resolved.

Use these commands instead of hand-rolling graph logic; bv already computes the hard parts so agents can act safely and quickly.