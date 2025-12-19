# Native Mastra Model Router Migration

## Summary

Successfully refactored model routing layer to use **native Mastra string-based model format** instead of the OpenRouter SDK wrapper layer. This simplifies the architecture and removes an unnecessary dependency layer.

**Changes:** 3 layers → 1 layer  
**Complexity:** Reduced ✅  
**FREE_MODELS whitelist:** Maintained ✅

---

## What Changed

### Before (3 layers)
```
OpenRouter SDK → Vercel AI SDK → Mastra agents
custom model wrapping → injects FREE_MODELS whitelist
```

### After (1 layer)
```
Mastra agents → native "openrouter/..." string routing
FREE_MODELS array → validated via provider options
```

---

## Files Modified

### 1. Created: `lib/shared/model-router.ts` (NEW)
Native Mastra model routing layer with FREE_MODELS whitelist enforcement:

```typescript
// Get array of "openrouter/model" strings
getMastraModel(requireTools?: boolean): string | string[]

// Get single model string
getMastraModelSingle(requireTools?: boolean): string

// Provider options for request-time model restriction
getModelProviderOptions(requireTools?: boolean): any

// Validate models against whitelist
isWhitelistedModel(modelString: string): boolean
```

### 2. Updated Agent Files (6 agents)
Replaced `import { getAutoRouterModel }` with `import { getMastraModel }`:

- `lib/agents/manager-agent.ts`
- `lib/agents/okr-reviewer-agent.ts`
- `lib/agents/alignment-agent.ts`
- `lib/agents/pnl-agent.ts`
- `lib/agents/dpa-pm-agent.ts`
- `lib/agents/document-tracking-agent.ts`

All agents now use:
```typescript
model: getMastraModel()           // for non-tool agents
model: getMastraModel(true)       // for agents with tools
```

### 3. Deprecated (but kept for backward compat)
- `lib/shared/config.ts` - `createOpenRouter` still exported but unused
- `lib/shared/model-fallback.ts` - `getAutoRouterModel()` still works but calls getMastraModel internally

---

## FREE_MODELS Whitelist Enforcement

The whitelist is maintained through:

1. **Array of allowed models** in `model-fallback.ts`:
   - `FREE_MODELS`: 7 general-purpose free models
   - `FREE_MODELS_WITH_TOOLS`: 5 models with tool-calling support

2. **Mastra's native array support**: Pass array to `model: [...]` for automatic fallback

3. **Provider options** (if needed): `getModelProviderOptions()` can inject `models` restriction via OpenRouter API parameter

---

## Testing

All tests pass ✅

```bash
bun test lib/shared/model-router.test.ts
```

Tests validate:
- ✅ Model strings have `openrouter/` prefix
- ✅ Tool-calling models filtered correctly
- ✅ Whitelist validation works
- ✅ Provider options generated correctly
- ✅ Specific free models included

---

## Benefits

1. **Fewer abstractions**: Removed OpenRouter SDK wrapper
2. **Cleaner code**: Direct Mastra string format `"openrouter/model"`
3. **Better maintainability**: One source of truth for model lists
4. **Same safety guarantees**: FREE_MODELS whitelist still enforced
5. **Future-proof**: Aligns with Mastra's native patterns

---

## Backward Compatibility

✅ **Fully compatible** - existing code paths still work:
- `getAutoRouterModel()` still works (internally calls `getMastraModel`)
- Rate limit tracking/fallback logic unchanged
- Memory integration unchanged
- All agents work without modification to calling code

---

## Next Steps

1. ✅ Verify in development environment
2. ✅ Run full test suite
3. ✅ Deploy and monitor for any issues
4. Eventually: Remove `@openrouter/ai-sdk-provider` from `package.json` (after verification period)

---

## Architecture Diagram

```
BEFORE:
┌──────────────────┐
│ User Agents (6)  │
└─────────┬────────┘
          │
     model: getAutoRouterModel()
          │
┌─────────▼────────────────────────┐
│ lib/shared/model-fallback.ts     │
│ - createOpenRouter SDK wrapper   │ ← Extra layer
│ - Custom model injection logic   │
└─────────┬────────────────────────┘
          │
┌─────────▼────────────────────────┐
│ @openrouter/ai-sdk-provider      │
│ + Vercel AI SDK                  │
└─────────┬────────────────────────┘
          │
┌─────────▼────────────────────────┐
│ Mastra Agent.model config        │
└──────────────────────────────────┘

AFTER:
┌──────────────────┐
│ User Agents (6)  │
└─────────┬────────┘
          │
     model: getMastraModel()
          │
┌─────────▼────────────────────────┐
│ lib/shared/model-router.ts       │
│ - "openrouter/..." strings       │
│ - FREE_MODELS validation         │
└─────────┬────────────────────────┘
          │
┌─────────▼────────────────────────┐
│ Mastra Agent.model config        │
│ (native string-based routing)    │
└──────────────────────────────────┘
```

---

## Related Issue

- `feishu_assistant-9yq5`: Refactor - Use native Mastra model router (CLOSED)
