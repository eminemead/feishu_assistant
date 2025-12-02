# TypeScript Code Style Guide

## File Organization

- **Agents**: `lib/agents/` - Agent implementations
- **Tools**: `lib/tools/` - Reusable utilities and tool definitions
- **Memory**: `lib/memory.ts` - Conversation history management
- **Server**: `server.ts` - Hono-based HTTP server
- **Database**: Supabase (PostgreSQL) for memory/auth, DuckDB/StarRocks for metrics

## Code Conventions

### Imports
- Group imports: external, internal, types
- Use absolute paths when available

### Naming
- **Files**: kebab-case (e.g., `manager-agent.ts`)
- **Types/Interfaces**: PascalCase (e.g., `ConversationContext`)
- **Functions/Variables**: camelCase (e.g., `processMessage`)

### Comments
- Comment "why", not "what"
- Include API references for external integrations
- Document non-obvious decisions

### Async/Await
- Prefer async/await over promises
- Handle errors explicitly with try-catch

## TypeScript Configuration

- Target: ES2020+
- Strict mode enabled
- Resolve module aliases via `tsconfig.json`

## Integration Guidelines

### Vercel AI SDK v5
- Use unified provider access (Claude, GPT, etc.)
- Leverage `@ai-sdk-tools` for agents and memory

### Feishu SDK
- Handle webhook events in server middleware
- Document required permissions for bot

### Supabase
- Use RLS for conversation isolation
- Type-safe queries with TypeScript
- See `docs/MEMORY_IMPLEMENTATION.md` for patterns

## Testing

- Test files: `test/**/*.test.ts`
- Use Bun's native test runner
- Coverage required for critical paths
