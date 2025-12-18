# OpenRouter Free Models Enforcement Fix

## Problem Found

**Your code was allowing OpenRouter to select ANY model, including paid models like Perplexity Sonar.**

### What Was Happening
- `lib/shared/model-fallback.ts` defined a `FREE_MODELS` array with 7 approved free models
- But the `getAutoRouterModel()` function called `openrouter("openrouter/auto")` **WITHOUT** passing the models whitelist
- OpenRouter's `/auto` endpoint by default routes to ANY model in their catalog
- This allowed Perplexity Sonar (and other paid models) to be selected, causing unexpected charges to your OpenRouter API key

## Solution Implemented

### Code Change Location
`lib/shared/model-fallback.ts` - `getAutoRouterModel()` function (lines 108-221)

### What Changed
1. **Models are now MANDATORY** - The `FREE_MODELS` array is always passed to OpenRouter
2. **Wrapper with enforcement** - Created a wrapper around `openrouter("openrouter/auto")` that injects the `models` parameter into every request
3. **Three method overrides**:
   - `call()` - for standard API calls
   - `doStream()` - for streaming responses  
   - `doGenerate()` - for non-streaming text generation

4. **All paths pass models restriction** - Via `providerOptions.openrouter.models`

## Approved Free Models (MANDATORY WHITELIST)

These are the ONLY models allowed to be selected by the auto router:

| # | Model | Supports Tools | Context |
|---|-------|---|---------|
| 1 | `nvidia/nemotron-3-nano-30b-a3b:free` | ✅ Yes | 30B params, 1M context |
| 2 | `qwen/qwen3-235b-a22b:free` | ✅ Yes | 262K context |
| 3 | `mistralai/devstral-small-2505:free` | ✅ Yes | Coding-focused |
| 4 | `kwaipilot/kat-coder-pro:free` | ✅ Yes | Coding-focused |
| 5 | `z-ai/glm-4.5-air:free` | ⚠️ Maybe | Unknown |
| 6 | `qwen/qwen3-coder:free` | ✅ Yes | Coding-focused |
| 7 | `moonshotai/kimi-k2:free` | ⚠️ Maybe | Unknown |

## How It Works

```typescript
// Example: Non-tool request
getAutoRouterModel(requireTools: false)
  → wraps openrouter("openrouter/auto")
  → injects models: [all 7 free models above]
  → OpenRouter can only select from these 7
  → ✅ No Perplexity Sonar possible

// Example: Tool-using request  
getAutoRouterModel(requireTools: true)
  → bypasses auto router
  → uses specific model: nvidia/nemotron-3-nano-30b-a3b:free
  → guaranteed tool support
  → ✅ No auto-routing to incompatible models
```

## Verification

To verify the fix is active:
1. Check logs for: `🤖 [Model] Using OpenRouter auto router with 7 free models`
2. Check logs for: `📋 [Model] Models pool: nvidia/nemotron-3-nano-30b-a3b:free, qwen/qwen3-235b-a22b:free, mistralai/devstral-small-2505:free...`

## Impact

- ✅ **Prevents Perplexity Sonar charges** - OpenRouter cannot select it
- ✅ **Maintains auto-routing intelligence** - NotDiamond still optimizes model selection
- ✅ **Cost control** - Only free models used (within OpenRouter free tier)
- ✅ **No code change needed in agents** - All agents use `getAutoRouterModel()` transparently

## Files Modified

- `lib/shared/model-fallback.ts` - Added models whitelist enforcement wrapper

## Testing

After this change, monitor your OpenRouter dashboard:
- Should see charges ONLY from the 7 free models listed above
- Should NOT see charges from Perplexity, paid Grok, paid OpenAI, or any other paid models
