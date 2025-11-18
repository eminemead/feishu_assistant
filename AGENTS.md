# Agent Configuration Guide

## Build & Test Commands

```bash
# Development (Recommended - no build step needed)
bun run dev

# Production build (esbuild)
bun run build          # Fast transpile with esbuild (~150ms)

# Build alternatives
bun run build:transpile  # Fast transpilation only
bun run build:watch    # Incremental TypeScript compilation (watch mode)
bun run build:clean    # Clean rebuild

# Type checking (separate from build)
bun run typecheck      # Type checking only (catches type errors)

# Alternative full tsc build (slower, higher memory)
bun run build:tsc      # Full TypeScript compilation (slower, requires 8GB heap)

# Testing
bun test              # Run all tests

bun test --watch      # Run tests in watch mode

bun test test/agents/manager-agent.test.ts  # Run single test file

bun test --match "*manager-agent*"  # Run tests matching pattern
```

### Build Notes
- **Development**: Use `bun run dev` - no build needed, instant TypeScript transpilation
- **Production**: Use `bun run build` - esbuild transpilation only (~150ms, 2.6MB output)
- **Why esbuild?**: tsc OOMs due to complex type dependencies in @larksuiteoapi/node-sdk and @ai-sdk-tools; esbuild just transpiles without type checking
- **Type safety**: Run `bun run typecheck` separately if you need type verification (slow but thorough)
- **Watch mode**: `bun run build:watch` for incremental compilation during development

### Server Startup

**Environment Setup:**
- Set `NODE_ENV=development` and `ENABLE_DEVTOOLS=true` in `.env` to enable developer tools
- These are enabled by default in `.env.example` for easy testing
- Enhanced Devtools UI available at `http://localhost:3000/devtools` with:
  - Real-time event monitoring and filtering
  - Token usage tracking and cost estimation
  - Multi-step tool session grouping
  - Agent routing metadata and decision visualization
  - Advanced search and filtering (by agent, tool, type, custom queries)

**Running the Server:**
- **Startup time**: 5-8 seconds in Subscription Mode (WebSocket connects to Feishu)
- **Not a hang**: Server appears unresponsive during startup but is actually initializing the persistent WebSocket connection
- **Background mode recommended**: Always run with `nohup` or PM2 to avoid perceived hangs in foreground
- **Startup flow**: HTTP server starts immediately on port 3000, then WebSocket initialization completes asynchronously
- **Health check**: Use `curl http://localhost:3000/health` to verify server is running and connected
- **PM2**: Pre-configured in `ecosystem.config.js` for production deployments with auto-restart and memory limits

### Devtools API Endpoints

**Real-time Monitoring:**
- `GET /devtools/api/events` - Get events with filtering
  - `?limit=100` - Limit number of events
  - `?type=agent_call` - Filter by event type
  - `?agent=Manager` - Filter by agent name
  - `?tool=mgr_okr_review` - Filter by tool name
  - `?search=query` - Search event data

- `GET /devtools/api/sessions` - Get tool call sessions
  - `?tool=mgr_okr_visualization` - Get sessions for specific tool

- `GET /devtools/api/stats` - Get aggregated statistics
  - Total events, events by type/tool/agent
  - Unique agents and tools
  - Time range of events

- `POST /devtools/api/clear` - Clear all events (development only)

**Features:**
- Token usage tracking (input, output, total)
- Cost estimation per event
- Multi-step tool session grouping
- Agent routing metadata (strategy, match score, alternatives)
- Event search and advanced filtering
- Real-time stats dashboard

## Architecture & Structure

**Core Components:**
- **Manager Agent** (`lib/agents/manager-agent.ts`): Routes queries to specialist agents (OKR Reviewer, Alignment, P&L, DPA PM)
- **Specialist Agents**: Domain-specific agents with dedicated tools in `lib/agents/`
- **Tools** (`lib/tools/`): Reusable utilities like weather lookup, web search (Exa), OKR visualization
- **Memory** (`lib/memory.ts`): Supabase-backed conversation history with RLS for user isolation
- **Server**: Hono-based HTTP server handling Feishu webhook events
- **Database**: DuckDB for OKR metrics, PostgreSQL (Supabase) for memory and auth

**Key Subprojects:**
- Feishu SDK integration with event subscription handling
- Vercel AI SDK v5 for unified LLM provider access
- @ai-sdk-tools for agents, memory, caching, and artifacts

## Code Style & Conventions

**TypeScript Setup:**
- Strict mode enabled, CommonJS modules, targets ESNext
- Files in `lib/` and `server.ts` are compiled to `dist/`
- Exclude: `test/`, `.dspyground/`, test files (`*.test.ts`, `*.spec.ts`)

**Naming & Structure:**
- camelCase for files and functions; kebab-case for filenames with multiple words
- Interfaces/types use PascalCase
- Utility functions grouped in `lib/` modules by domain (agents, tools, auth, shared)

**Comments & Documentation:**
- JSDoc comments for exported functions with params and return types
- Detailed block comments explaining complex logic or design decisions
- File headers with purpose and references to related docs

**Imports & Exports:**
- Explicit imports from `ai` SDK (CoreMessage, tool, etc.)
- Organize imports: external deps, local modules, then types
- Export individual functions/types, not default exports when possible

**Error Handling:**
- Try-catch with console.error logging (prefix with emoji: ❌, ✅, ⚠️)
- Graceful fallbacks (e.g., InMemory provider if Supabase unavailable)
- Type-safe Zod schemas for tool inputs
- Error messages indicate context (e.g., "[Memory]", "[Feishu]")

**Async/Await:**
- All async operations use async/await, not .then()
- Status callbacks (`updateStatus?: (status: string) => void`) for streaming updates
- Memory scoped by `chatId + rootId` for conversation context

## Documentation Organization

**Location**: All implementation docs must be in `/docs/` folder, organized by category.

**Directory Structure**:
```
docs/
├── architecture/        # System design, architecture decisions
├── implementation/      # Feature implementations, technical details
├── setup/              # Setup instructions, environment config
├── testing/            # Testing guides, test strategies
├── verification/       # Verification procedures, checklists
├── ORGANIZATION.md     # Documentation structure reference
└── README.md           # Documentation index
```

**Implementation Docs Convention**:
- Feature implementations go in `docs/implementation/`
- Use kebab-case filenames (e.g., `thread-reply-implementation.md`)
- Include:
  - Problem/motivation at top
  - Solution overview
  - Code changes with file paths
  - Official API references (with URLs)
  - Testing checklist
  - Backward compatibility notes

**Root-Level Docs**:
- Only keep `AGENTS.md` (code conventions & structure) at root
- Move feature docs and guides to `/docs/` subdirectories
- Temporary implementation notes (e.g., `.md` files created during development) should be moved to `/docs/implementation/` before merge
