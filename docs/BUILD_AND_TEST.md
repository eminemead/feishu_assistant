# Build and Test Guide

## Essential Commands

```bash
# Development (watches TS, auto-reload)
bun run dev

# Production esbuild
bun run build

# Type checking only
bun run typecheck

# Run test suite
bun test
```

## Quality Gates

Before committing code:

```bash
# Type checking
bun run typecheck

# Run tests (required for all PRs)
bun test

# Check linting/formatting (if configured)
bun run lint
```

## Testing Strategy

- Write tests for new features
- Run `bun test` before committing
- All tests must pass in CI

## Production Build

```bash
# Build TypeScript to JavaScript
bun run build

# Output: `dist/` directory ready for deployment
```

## Development Tips

- `bun run dev` provides instant reload (no manual rebuilds needed)
- Use `NODE_ENV=development` for enhanced debugging
- Check `docs/DEVTOOLS.md` for monitoring endpoints
