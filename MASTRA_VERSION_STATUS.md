# Mastra Version & Server Adapter Status

## Current Status

### Mastra Versions in Use (Beta)

| Package | Current | Latest | Status |
|---------|---------|--------|--------|
| `@mastra/core` | `1.0.0-beta.8` | `1.0.0-beta.14` | **3 versions behind** |
| `@mastra/memory` | `1.0.0-beta.4` | `1.0.0-beta.4` | ✅ Current |
| `@mastra/observability` | `1.0.0-beta.4` | `1.0.0-beta.4` | ✅ Current |
| `@mastra/pg` | `1.0.0-beta.5` | `1.0.0-beta.5` | ✅ Current |
| `@mastra/arize` | `1.0.0-beta.5` | `1.0.0-beta.5` | ✅ Current |
| `@mastra/rag` | `2.0.0-beta.3` | `2.0.0-beta.3` | ✅ Current |

### Missing: Hono Server Adapter

**Status**: ❌ **Not installed**

Mastra DOES provide `@mastra/hono` (available on npm), but it's **not in package.json**.

```bash
# Available but not installed:
@mastra/hono (latest: 0.0.0-trace-timeline-update-...)
```

## Impact Analysis

### What's Missing (Hono Adapter)

The Hono adapter would provide:
- Built-in routes for agent execution (`/agents`, `/workflows`, etc.)
- Automatic request/response handling
- Observability middleware integration
- Standard API patterns for agent invocation

**Current Workaround**: Manually routing agent calls through Hono middleware (see `server.ts` lines 500-700).

### Beta Version Gap (@mastra/core)

Running **1.0.0-beta.8** while latest is **1.0.0-beta.14**:
- 6 beta releases behind (3 months of development)
- Potential bug fixes in beta.9-14
- Possible API improvements or deprecations

**Check**: Recent beta releases for breaking changes or improvements

## What To Do

### Option 1: Add Hono Adapter (Recommended if stable)

```bash
bun add @mastra/hono@latest
```

Then refactor server routes to use adapter:

```typescript
import { MastraHonoAdapter } from "@mastra/hono";

const adapter = new MastraHonoAdapter(mastra, app);

// Routes automatically created:
// POST /agents/{agentName}/run
// POST /workflows/{workflowName}/run
// GET /agents
// GET /workflows
```

**Pros:**
- Standardized agent execution API
- Built-in observability middleware
- Follows Mastra conventions
- Easier maintenance

**Cons:**
- May require refactoring current routes
- API compatibility depends on current Hono adapter version

### Option 2: Update @mastra/core to latest beta

```bash
bun add "@mastra/core@1.0.0-beta.14" --exact
```

**Then test:**
```bash
bun run build
bun run test
```

Check for breaking changes in beta release notes.

### Option 3: Full Migration (Core + Hono)

1. Update `@mastra/core` to beta.14
2. Add `@mastra/hono` adapter
3. Refactor `server.ts` to use adapter routes
4. Remove manual route handling (lines 500-700)

**Effort**: Moderate, but cleaner architecture

## Version Upgrade Path

### Recommended Timeline

**Phase 1 (This Session)**: Check Mastra release notes
- What changed in beta.9-14?
- Are there breaking changes?
- Any security fixes?

**Phase 2**: Test upgrade in isolation
```bash
git checkout -b mastra-upgrade
bun add "@mastra/core@1.0.0-beta.14"
bun run build
bun run test
```

**Phase 3**: Optional - Add Hono adapter
- Decide if standardized routes benefit the project
- Refactor if beneficial
- Test thoroughly

## Files to Check

- **server.ts**: Manual agent routing (lines 200-300, 500-700)
- **lib/agents/*.ts**: Agent definitions (using Mastra Agent API)
- **lib/observability-config.ts**: Uses ArizeExporter from latest API
- **lib/memory-mastra.ts**: Uses Memory API from Mastra

## Current Architecture

```
┌─ Hono Server (Hono 4.5.0)
│  ├─ Manual routes: POST /api/agent (custom)
│  └─ Mastra integration: Direct Agent calls in handlers
│
├─ Mastra Agents (beta.8)
│  └─ No server adapter (routes manually wired)
│
└─ Observability (Arize Phoenix)
   └─ Works fine with current setup
```

## Next Steps

1. **Check release notes**: `@mastra/core` beta.9-14 changes
2. **Assess upgrade risk**: Breaking changes?
3. **Decide**: Upgrade core only, or add Hono adapter too?
4. **Test**: Full suite after upgrade
5. **Document**: Any API changes in AGENTS.md

---

**Recommendation**: Upgrade `@mastra/core` to beta.14 (low risk, likely bug fixes). Investigate Hono adapter separately (medium effort, potential architecture improvement).
