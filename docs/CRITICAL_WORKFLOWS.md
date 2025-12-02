# Critical Workflows

## Memory Persistence (Supabase)

Conversation history is stored in Supabase with Row-Level Security for user isolation.

```bash
# Key concepts:
# - RLS policies isolate user conversations
# - Conversation context loaded before agent routing
# - Memory persisted after each interaction
```

**See**: `docs/MEMORY_IMPLEMENTATION.md` for detailed implementation

**Key Files**:
- `lib/memory.ts` - Memory management
- Supabase schema in `supabase/migrations/`

## Beads Issue Tracking

We dogfood our own issue tracker for all work.

```bash
# Find unblocked work
bd ready --json

# Create new issue with discovered-from link
bd create "title" -p 1 --deps discovered-from:bd-X --json

# Update status
bd update bd-X --status in_progress --json

# Complete work
bd close bd-X --reason "Done" --json

# CRITICAL: Force sync at end of session
bd sync
```

**Key Points**:
- Use `bd ready --json` to find unblocked work
- Link discovered issues with `discovered-from` to maintain context
- Run `bd sync` at end of session (flushes changes immediately)
- Never use markdown TODOs

**See**: beads documentation with `bd info --whats-new`

## Local Development Debugging

Enable devtools to monitor agent behavior in real-time.

```bash
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev
# Monitor at http://localhost:3000/devtools
```

**See**: `docs/DEVTOOLS.md` for API endpoints and monitoring strategies

## Architecture Overview

**Core Components**:
- **Manager Agent** (`lib/agents/manager-agent.ts`) - Routes queries to specialists
- **Specialist Agents** - Domain-specific agents (OKR, P&L, DPA, etc.)
- **Tools** (`lib/tools/`) - Reusable utilities (web search, OKR viz, etc.)
- **Memory** - Supabase-backed conversation history with RLS
- **Server** - Hono-based HTTP server for Feishu webhooks

**See**: `docs/ARCHITECTURE.md` for design decisions and component details

## Development Workflow

1. **Setup**: `bun install && cp .env.example .env && bun run dev`
2. **Check work**: `bd ready --json`
3. **Develop**: Make changes with instant reload
4. **Test**: `bun test`
5. **Type-check**: `bun run typecheck`
6. **Track work**: `bd update <id> --status in_progress`
7. **Wrap up**: Create discovered issues, close work, run `bd sync`

## Environment Setup

- Copy `.env.example` to `.env`
- Set Feishu bot credentials
- Set Supabase project credentials
- Set LLM provider key (Claude, GPT, etc.)
- Optional: Enable devtools with `ENABLE_DEVTOOLS=true`

**See**: `docs/setup/` directory for detailed environment configuration
