# Mastra Migration - Comprehensive Plan

## Executive Summary

Migrate the Feishu Assistant from `@ai-sdk-tools/agents` to Mastra framework (`@mastra/core`) to:
1. **Simplify agent implementation** - Native model fallback arrays vs dual agents
2. **Improve observability** - AI Tracing designed for LLM ops (vs custom devtools)
3. **Unify memory system** - Mastra memory + PostgreSQL (vs ai-sdk-tools' DrizzleProvider)
4. **Modernize tech stack** - Mastra is actively developed, ai-sdk-tools is maintenance mode
5. **Reduce code complexity** - Remove dual-agent pattern, custom handoff logic

## Current State

### Agent Framework: AI SDK Tools
- **Files**: `lib/agents/*.ts` (manager, okr-reviewer, alignment, pnl, dpa-pm)
- **Pattern**: Dual agents (primary + fallback) for model fallback
- **Memory**: `@ai-sdk-tools/memory` + DrizzleProvider + Supabase
- **Observability**: Custom `devtools-integration.ts` (browser UI)
- **Tools**: Shared tools with caching (@ai-sdk-tools/cache)

### Parallel Implementation: Mastra
- **Files**: `lib/agents/*-mastra.ts` (validated but not production)
- **Pattern**: Single agent with model array fallback
- **Memory**: `lib/memory-mastra.ts` (@mastra/memory + @mastra/pg + PostgreSQL)
- **Observability**: Native AI Tracing (Langfuse, Braintrust, OTEL)
- **Tests**: Mastra validation tests exist but not run in CI

## Detailed Migration Breakdown

### PHASE 1: Setup & Infrastructure (foundation for everything else)
1. **Add Mastra observability config**
   - PinoLogger for structured logging
   - AI Tracing with configurable exporters (Langfuse/Braintrust/OTEL)
   - Update server.ts to initialize Mastra observability

2. **Verify Mastra memory system**
   - PostgreSQL schema for Mastra memory (already in memory-mastra.ts)
   - Connection pooling and transaction handling
   - User scoping via RLS (row-level security)

### PHASE 2: Agent Migration (replace implementations one by one)
1. **Migrate Manager Agent** (orchestrator, highest impact)
   - Replace ai-sdk-tools Agent with Mastra Agent
   - Simplify model fallback from dual agents to array
   - Remove custom handoff routing, use native Mastra flow
   - Update memory loading/saving to use Mastra memory

2. **Migrate Specialist Agents** (OKR, Alignment, P&L, DPA-PM)
   - Same pattern as Manager Agent
   - Simplify tool registration
   - Update memory calls

3. **Consolidate tools**
   - Tools are already compatible with both frameworks
   - No changes needed (already use `tool()` from ai package)

### PHASE 3: Memory & State Migration
1. **Transition from ai-sdk-tools memory to Mastra memory**
   - Both can coexist initially
   - Gradual migration of conversation history
   - Verify RLS (row-level security) still works

2. **Update memory references**
   - generate-response.ts → use Mastra memory
   - Agent initialization → load from Mastra memory
   - Message saving → save to Mastra memory

### PHASE 4: Observability Upgrade
1. **Replace custom devtools with Mastra AI Tracing**
   - Configure Langfuse exporter (recommended for LLM-specific analytics)
   - Set up real-time tracing in development
   - Retire custom devtools-integration.ts (after validation)

2. **Structured logging**
   - PinoLogger instead of console.log
   - Centralized log queries and filtering

### PHASE 5: Testing & Validation
1. **Unit tests** - Verify each migrated agent works
2. **Integration tests** - Multi-turn conversations, memory persistence
3. **End-to-end tests** - Full Feishu workflow (mention → button → response)
4. **Performance testing** - No regression in response times

### PHASE 6: Cleanup & Optimization
1. **Remove ai-sdk-tools dependencies** (after full migration)
2. **Retire custom implementations**
   - devtools-integration.ts → use Mastra AI Tracing
   - Dual agent pattern → consolidated
3. **Update documentation**
   - Agent architecture docs
   - Setup instructions
   - Observability guides

## Files to Touch / Create

### Core Migration
- `lib/agents/manager-agent.ts` - Replace with Mastra version
- `lib/agents/okr-reviewer-agent.ts` - Replace with Mastra version
- `lib/agents/alignment-agent.ts` - Replace with Mastra version
- `lib/agents/pnl-agent.ts` - Replace with Mastra version
- `lib/agents/dpa-pm-agent.ts` - Replace with Mastra version
- `lib/memory.ts` - Potentially phase out (keep wrapper for compatibility)
- `lib/generate-response.ts` - Update imports (minor)
- `server.ts` - Add Mastra observability initialization

### Support Files
- `lib/agents/memory-integration.ts` - Update to use Mastra memory
- `lib/agents/types.ts` - Update Agent type export
- `lib/shared/model-fallback.ts` - Simplify (model array replaces dual agent logic)

### Observability
- `lib/devtools-integration.ts` - Mark for deprecation (use Mastra AI Tracing)
- `lib/devtools-page.html` - Retire (Mastra Cloud dashboard replaces it)

### Testing
- `test/agents/manager-agent.test.ts` - Update to test Mastra version
- `test/agents/*.test.ts` - Update specialist agent tests
- `test/integration/*.test.ts` - Validate multi-turn conversations
- Retire `lib/agents/*-mastra.test.ts` (merge into main tests)

### Configuration & Docs
- `.env.example` - Add Mastra config (LANGFUSE_* keys, etc.)
- `docs/setup/mastra-observability.md` - New guide
- `docs/architecture/agent-framework.md` - Update architecture
- `AGENTS.md` - Update code conventions (if needed)

## Key Considerations

### Risk Mitigation
1. **Keep both frameworks initially** - Run tests against both until confident
2. **Gradual migration** - Migrate agents one by one, not all at once
3. **Memory coexistence** - Support both memory systems during transition
4. **Rollback plan** - Keep ai-sdk-tools in package.json until fully validated

### Performance
1. **No regression expected** - Mastra is faster (simpler model fallback)
2. **Observability overhead** - AI Tracing has minimal overhead compared to custom devtools
3. **Memory queries** - PostgreSQL with proper indexing should be faster than Supabase+Drizzle

### Developer Experience
1. **Simpler code** - Fewer lines, clearer intent (model array vs dual agents)
2. **Better debugging** - AI Tracing shows only relevant spans vs all framework noise
3. **Cloud dashboard** - Mastra Cloud provides better observability than custom HTML page

## Dependencies (Task Order)
```
PHASE 1 (Setup)
├── Mastra config in server.ts
├── PostgreSQL setup for Mastra memory
└── Observability configuration

PHASE 2 (Agents) - START AFTER PHASE 1
├── Manager Agent migration
├── Specialist Agents migration
└── Tool consolidation (parallel, no deps)

PHASE 3 (Memory) - START AFTER PHASE 2
├── Memory system transition
└── RLS verification

PHASE 4 (Observability) - PARALLEL WITH PHASE 3
├── Langfuse integration
└── Devtools retirement

PHASE 5 (Testing) - START AFTER PHASE 2, 3, 4
├── Unit tests
├── Integration tests
└── E2E tests

PHASE 6 (Cleanup) - LAST
├── Remove ai-sdk-tools
├── Documentation update
└── Performance analysis
```

## Success Criteria
1. ✅ All 5 agents migrated and tested
2. ✅ Memory system fully transitioned
3. ✅ Observability provides better insights than custom devtools
4. ✅ No regression in response times
5. ✅ All tests passing in CI
6. ✅ Code review approval from team
7. ✅ Deployed to production with monitoring
8. ✅ ai-sdk-tools removed from dependencies (if not used elsewhere)

## Rollback Plan
If issues arise during migration:
1. Revert agent implementations (keep both -mastra.ts and .ts files)
2. Switch generate-response.ts back to ai-sdk-tools agents
3. Keep Mastra memory system if stable, revert to ai-sdk-tools memory if issues
4. Keep observability improvements (even if using ai-sdk-tools agents)

## Timeline Estimate
- **Phase 1**: 1-2 days (config setup)
- **Phase 2**: 2-3 days (agent migration + testing)
- **Phase 3**: 1 day (memory transition)
- **Phase 4**: 1 day (observability setup)
- **Phase 5**: 2-3 days (comprehensive testing)
- **Phase 6**: 1 day (cleanup)
- **Total**: ~8-13 days (with buffer for issues)
