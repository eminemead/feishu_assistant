# Critical Fix: OpenRouter Whitelist Enforcement

**Date**: 2025-12-30  
**Status**: ✅ **FIXED**  
**Issue**: Mistral Nemo & Opus (paid models) being called despite FREE_MODELS whitelist

## Root Cause

**Problem**: Several agents were using `getPrimaryModel()` which calls `getAutoRouterModel()`, which uses `openrouter("openrouter/auto")` with a wrapper that tries to inject whitelist via `providerOptions`. This approach is **unreliable** and OpenRouter's auto-router can still select ANY model, including paid ones.

**Evidence**: OpenRouter admin dashboard showed:
- ❌ Mistral Nemo (paid) being called
- ❌ Mistral Opus (paid) being called
- ✅ NOT the configured free models

## The Fix

**Solution**: Replace all `getPrimaryModel()` calls with `getMastraModel()` which uses **explicit free model IDs** instead of auto-router.

### Changed Files

1. **lib/agents/manager-agent-mastra.ts**
   - Before: `model: getPrimaryModel()`
   - After: `model: getMastraModel(true)` (for future tool support)

2. **lib/agents/okr-reviewer-agent-mastra.ts**
   - Before: `model: getPrimaryModel(), fallbackModel: getFallbackModel()`
   - After: `model: getMastraModel(true)` (has tools)

3. **lib/agents/pnl-agent-mastra.ts**
   - Before: `model: getPrimaryModel()`
   - After: `model: getMastraModel(false)` (no tools)

4. **lib/agents/alignment-agent-mastra.ts**
   - Before: `model: getPrimaryModel()`
   - After: `model: getMastraModel(false)` (no tools)

5. **lib/agents/dpa-mom-agent-mastra.ts**
   - Before: `model: getPrimaryModel(), fallbackModel: getFallbackModel()`
   - After: `model: getMastraModel(true)` (has tools)

## Why This Works

**getMastraModel()** returns explicit free model IDs:
```typescript
// Returns array of explicit free model objects
const models = getMastraModel(true);
// Result: [openrouter("nvidia/nemotron-3-nano-30b-a3b:free"), ...]
```

**Key Difference**:
- ❌ `openrouter("openrouter/auto")` → OpenRouter can select ANY model
- ✅ `openrouter("nvidia/nemotron-3-nano-30b-a3b:free")` → ONLY this specific free model

## Whitelisted Models

All agents now use models from `FREE_MODELS` or `FREE_MODELS_WITH_TOOLS`:

### FREE_MODELS (7 models)
1. `nvidia/nemotron-3-nano-30b-a3b:free` ⭐ Primary
2. `qwen/qwen3-235b-a22b:free`
3. `mistralai/devstral-small-2505:free`
4. `kwaipilot/kat-coder-pro:free`
5. `z-ai/glm-4.5-air:free`
6. `qwen/qwen3-coder:free`
7. `moonshotai/kimi-k2:free`

### FREE_MODELS_WITH_TOOLS (5 models)
Subset that support tool calling - used by agents with tools.

## Verification

After restarting the server:
1. ✅ Check server logs - should see: `🔐 [Model Router] Whitelist: X free models ONLY`
2. ✅ Check OpenRouter admin - should ONLY see whitelisted free models
3. ✅ No more Mistral Nemo/Opus calls

## Next Steps

1. **Restart server** to apply changes
2. **Monitor OpenRouter admin** for next 24 hours
3. **Verify** only free models appear in activity logs
4. **Confirm** no paid model charges

