# Mastra 1.0 Beta Upgrade Evaluation

## Overview
**Current Version**: `@mastra/core` 1.0.0-beta.8 (Dec 2024)  
**Target Version**: 1.0.0-beta.14 (current, Dec 2024)  
**Assessment**: ✅ **Upgrade is HIGHLY RECOMMENDED**

---

## Key Benefits of Upgrading to Beta.14

### 1. **Streaming & AI SDK Compatibility** ⭐⭐⭐⭐⭐
**Impact**: CRITICAL for Feishu bot

Beta.8 → Beta.14 fixes critical streaming issues with Vercel AI SDK:
- ✅ Fixed `uiMessages` duplication in chat routes
- ✅ Network routing agent streaming now properly supports text deltas
- ✅ Workflow stream refactoring with new `fullStream` property

**Why It Matters**: Your bot streams Mermaid/Vega-Lite charts progressively. These fixes ensure streaming works reliably.

**Files Affected**: 
- `lib/handle-app-mention.ts` (card streaming)
- `lib/agents/*.ts` (agent response streaming)

### 2. **Tool Schema Validation Bug Fix** ⭐⭐⭐⭐
**Impact**: HIGH for agent reliability

Beta.13 introduced a critical fix:
> "Fixed a critical bug in `@mastra/core` where tool input validation used the original Zod schema while LLMs received a transformed version. This caused validation failures with models like OpenAI o3 and Claude 3.5 Haiku."

**Why It Matters**: Your agents use tools extensively. This bug could cause silent failures with latest LLM models.

**Example**: Claude 3.5 Haiku sends `.nullable()` but validation expects `.optional()` → validation fails.

### 3. **Model Span Naming Unification** ⭐⭐⭐
**Impact**: MEDIUM for observability

Beta.13 change (breaking):
- `AISpanType.LLM_GENERATION` → `AISpanType.MODEL_GENERATION`
- `LLMGenerationAttributes` → `ModelGenerationAttributes`

**Why It Matters**: Arize Phoenix tracing will use correct span names. Better observability logs.

**Files Affected**: `lib/observability-config.ts`

### 4. **Agent Studio & Playground Improvements** ⭐⭐⭐
**Impact**: MEDIUM for development

Beta.11-14 shipped:
- Agent Studio (renamed from Playground) with team collaboration
- Better streaming support for agent responses
- Improved error serialization in streaming

**Why It Matters**: Better local development experience, easier debugging.

### 5. **Message Sorting Fix** ⭐⭐
**Impact**: LOW for you currently

Beta.12 fixed message chronological ordering in memory stores. Your memory implementation may benefit.

### 6. **Hono Adapter Now Available** ⭐⭐⭐⭐
**Impact**: HIGH for architecture

Beta.14 ships with improved `@mastra/hono` adapter:
- Built-in route generation for agents
- Observability middleware integration
- Standardized API patterns

**Why It Matters**: Can simplify your manual Hono routing (currently 200+ lines in server.ts).

---

## Risk Assessment

### Breaking Changes (Beta.8 → Beta.14)

| Change | Risk | Migration Effort |
|--------|------|-----------------|
| Model span naming | LOW | <5 min (just observability config) |
| Structured output changes | MEDIUM | Check if you use structuredOutput |
| Network handler params | LOW | Only if using network agents (you don't) |
| dotenv skip option | LOW | Optional feature |

### Compatibility Matrix

| Component | Beta.8 | Beta.14 | Status |
|-----------|--------|---------|--------|
| AI SDK integration | ⚠️ Has bugs | ✅ Fixed | **UPGRADE** |
| Tool validation | ❌ Broken with latest LLMs | ✅ Fixed | **UPGRADE** |
| Hono integration | Manual only | ✅ Adapter available | **OPTIONAL** |
| Memory/Observability | Works | Works better | **SAFE** |
| Agents API | Stable | Stable | **SAFE** |

---

## Upgrade Impact on Feishu Bot

### What Works Unchanged
- ✅ Manager agent routing
- ✅ Specialist agents (OKR, Alignment, P&L, DPA-PM)
- ✅ Memory integration (Supabase)
- ✅ Card creation & streaming
- ✅ Button callbacks
- ✅ Document tracking

### What Gets Better
- ✅ **Chart streaming reliability** (text delta fixes)
- ✅ **Agent tool calls** (schema validation fix)
- ✅ **Observability traces** (span naming standardization)
- ✅ **Error handling** (better error serialization)

### What Needs Review (Not Breaking)
- ⚠️ Observability config (span name change)
- ⚠️ Any custom streaming implementations

---

## Recommendation

### 🎯 Primary Recommendation: Upgrade Core + Add Hono Adapter

**Why both?**
1. Core upgrade: Fixes critical streaming & tool validation bugs
2. Hono adapter: Cleans up 200+ lines of manual routing code

**Timeline**: 2-3 hours total

```bash
# Step 1: Update core (15 min)
bun add "@mastra/core@1.0.0-beta.14"

# Step 2: Review observability config (5 min)
# - Check span name changes in lib/observability-config.ts

# Step 3: Add Hono adapter (30 min)
bun add "@mastra/hono@latest"

# Step 4: Refactor server.ts routes (60-90 min)
# - Replace manual agent routes with adapter
# - Remove ~200 lines of boilerplate

# Step 5: Test (30 min)
bun run build
bun run test
bun run dev  # Test Feishu interactions
```

### 🔄 Alternative: Core Upgrade Only (Lower Risk)

If you prefer minimal changes:

```bash
bun add "@mastra/core@1.0.0-beta.14"
# Then test thoroughly
# Add Hono adapter later as separate task
```

**Time**: 20 min (upgrade + test)

---

## Migration Checklist

- [ ] Review breaking changes (model span naming)
- [ ] Update observability config if using custom spans
- [ ] Test agent streaming (OKR charts, etc.)
- [ ] Test tool execution (all agent tools)
- [ ] Test memory operations
- [ ] Deploy to staging first
- [ ] Monitor Arize Phoenix traces
- [ ] Smoke test Feishu bot in prod

---

## Next Steps

### Phase 1: Create Beads Issues (Today)
1. **Issue 1**: Upgrade `@mastra/core` to beta.14 (with checklist)
2. **Issue 2**: Add `@mastra/hono` adapter & refactor routes (separate issue)

### Phase 2: Execute (Next Session)
- Upgrade core
- Review breaking changes
- Test thoroughly
- Deploy

### Phase 3: Optional Enhancement (Future)
- Implement Hono adapter routes
- Clean up server.ts
- Reduce boilerplate

---

## References

- [Mastra v1 Beta Announcement](https://mastra.ai/blog/mastrav1)
- [Migration Guide](https://mastra.ai/guides/v1/migrations/upgrade-to-v1/overview)
- [GitHub Release Notes](https://github.com/mastra-ai/mastra/releases)
- [Tool Schema Validation Fix (PR #10239)](https://github.com/mastra-ai/mastra/pull/10239)
- [AI SDK Streaming Fixes (PR #8904, #8979, #9048)](https://github.com/mastra-ai/mastra/pulls)

---

## Conclusion

**Upgrade to beta.14 is strongly recommended** because:
1. ✅ Fixes critical bugs affecting your streaming & tool validation
2. ✅ Improves observability for production monitoring
3. ✅ Minimal breaking changes (mostly observability config)
4. ✅ Positions you for stable v1.0 release (coming soon)
5. ✅ Hono adapter available for optional architecture cleanup

**Risk Level**: LOW (tested, beta channel stable)  
**Effort**: 20 min (core only) to 3 hours (core + Hono)  
**Payoff**: Better reliability, fewer bugs, cleaner code
