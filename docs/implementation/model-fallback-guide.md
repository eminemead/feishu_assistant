# AI Model Fallback System

## Overview

The threading feature now uses a flexible **model fallback strategy** that tries a cheaper model first, then falls back to a reliable model if rate-limited.

**Goal**: Optimize costs while maintaining reliability.

---

## Model Tiers

### Primary Model (Default) ✨
- **Name**: kwaipilot/kat-coder-pro:free
- **Cost**: Free tier
- **Pros**: No cost, decent quality
- **Cons**: May hit rate limits (429 errors)

### Fallback Model (Backup) 🛡️
- **Name**: google/gemini-2.5-flash-lite  
- **Cost**: Paid via OpenRouter
- **Pros**: Reliable, no rate limits, fast
- **Cons**: Costs money (~$0.00001/1K tokens)

---

## How It Works

### Default Behavior

```
1. Initialize agents with primary model
   ↓
2. User query arrives
   ↓
3. Try streaming with primary model
   ↓
4a. Success? → Return response ✅
4b. 429 Rate Limit? → Log warning + track in devtools ⚠️
```

### When to Switch Models

You can switch to fallback model in these scenarios:

1. **If primary model gets rate-limited**:
   - Logs will show: `⚠️ [Manager] Rate limit detected (429)`
   - Set env var: `AI_MODEL_TIER=fallback`
   - Restart server

2. **For testing/development**:
   ```bash
   AI_MODEL_TIER=fallback bun dist/server.js
   ```

3. **For production reliability**:
   ```bash
   AI_MODEL_TIER=fallback bun dist/server.js
   ```

---

## Configuration

### Environment Variables

```bash
# Use primary model (default, free but may rate-limit)
AI_MODEL_TIER=primary

# Use fallback model (paid but reliable)
AI_MODEL_TIER=fallback

# Not set = automatically uses primary (tries free model first)
```

### .env File

```bash
# Add to your .env file
AI_MODEL_TIER=primary    # Free model
# AI_MODEL_TIER=fallback # Reliable model (uncomment to enable)
```

### Command Line

```bash
# Use primary (free)
bun dist/server.js

# Use fallback (reliable)
AI_MODEL_TIER=fallback bun dist/server.js

# With devtools enabled
AI_MODEL_TIER=fallback ENABLE_DEVTOOLS=true bun dist/server.js
```

---

## Error Detection & Logging

### Rate Limit Warnings

When primary model hits rate limit, you'll see:

```
🤖 [Model] Using primary model: kwaipilot/kat-coder-pro:free
⚠️ [Manager] Rate limit detected (429). Consider switching to fallback model.
```

### Fallback Model Indicators

When using fallback model:

```
🤖 [Model] Using fallback model: Google Gemini 2.5 Flash
[Model query processes successfully...]
```

### Stream Iteration Errors

```
❌ [Manager] Error during stream iteration: ...
⚠️ [Manager] Rate limit detected during streaming (429).
💡 [Manager] Suggestion: Switch to fallback model for future requests to avoid rate limits
```

---

## Cost Comparison

| Model | Cost | Availability | Use Case |
|-------|------|--------------|----------|
| kwaipilot/kat-coder-pro:free | $0 | ~80-90% uptime | Cost optimization, high volume |
| google/gemini-2.5-flash-lite | ~$0.00001 per 1K tokens | 99%+ uptime | Production, mission-critical |

**Rough monthly estimate** (at ~100 queries/day):
- Primary only: ~$0 (when available)
- Fallback only: ~$0.03-0.05
- Primary + Fallback: ~$0.01-0.02 (optimal)

---

## Recommended Strategies

### Development Environment
```bash
# Use primary (free) to minimize costs during development
bun run dev
```

### Staging/Testing
```bash
# Mix both - start with primary, catch rate limits
bun dist/server.js
```

### Production (High Reliability)
```bash
# Use fallback (paid but reliable) for critical deployments
AI_MODEL_TIER=fallback bun dist/server.js
```

### Production (Cost-Optimized)
```bash
# Use primary with monitoring to catch rate limits
bun dist/server.js
# Monitor logs for 429 errors and switch if needed
```

---

## Monitoring & Debugging

### Check Current Model

Server startup logs show which model is active:

```bash
grep "Using.*model:" /tmp/feishu-server.log | head -1
```

### Watch for Rate Limits

```bash
tail -f /tmp/feishu-server.log | grep -i "rate limit\|429"
```

### Devtools Tracking

Rate limit errors are tracked in devtools with context:

```bash
curl http://localhost:3000/devtools/api/events | jq '.events[] | select(.error | contains("429"))'
```

### Check Available Models

The utility logs all available models on startup:

```bash
# In code, call listAvailableModels()
# Or check logs for the model initialization
```

---

## Implementation Details

### Code Location

- **Model selection**: `lib/shared/model-fallback.ts`
- **Manager agent**: `lib/agents/manager-agent.ts` (handles rate limit errors)
- **Specialist agents**: Use `getPrimaryModel()` from model-fallback

### Key Functions

```typescript
// Get primary model (cheaper)
getPrimaryModel(): LanguageModel

// Get fallback model (reliable)
getFallbackModel(): LanguageModel

// Get recommended model (with env var support)
getRecommendedModel(forceModelTier?: "primary" | "fallback"): LanguageModel

// Detect rate limit errors
isRateLimitError(error: any): boolean

// List all models
listAvailableModels(): void
```

### Rate Limit Detection

Automatically detects:
- HTTP 429 status code
- "Too Many Requests" messages
- "rate limit" keywords (case-insensitive)

---

## Troubleshooting

### Problem: Getting 429 errors

**Solution 1**: Switch to fallback
```bash
AI_MODEL_TIER=fallback bun dist/server.js
```

**Solution 2**: Increase request delays between queries
- Add rate limiting in front-end or API gateway
- Implement backoff logic

**Solution 3**: Contact OpenRouter support
- Check API status at https://openrouter.ai/
- Verify API key is valid

### Problem: Fallback model not being used

**Check logs**:
```bash
grep "\[Model\]" /tmp/feishu-server.log
```

**Verify env var**:
```bash
echo $AI_MODEL_TIER
```

**Restart with explicit var**:
```bash
AI_MODEL_TIER=fallback bun dist/server.js
```

### Problem: Inconsistent model usage across agents

**Issue**: Some agents use primary, others use fallback

**Solution**: All agents now use `getPrimaryModel()`, which respects `AI_MODEL_TIER` env var

**Verify**:
```bash
grep "Using primary model\|Using fallback model" /tmp/feishu-server.log | sort | uniq -c
```

---

## Future Improvements

Potential enhancements:

1. **Automatic Fallback**: Detect 429 errors and automatically switch to fallback mid-session
2. **Rate Limit Pool**: Distribute queries across multiple API keys
3. **Model Benchmarking**: Compare cost vs quality of different models
4. **Dynamic Selection**: Choose model based on query complexity
5. **Cost Tracking**: Monitor and report on actual usage costs

---

## Related Files

- `lib/shared/model-fallback.ts` - Core fallback logic
- `lib/agents/manager-agent.ts` - Rate limit error handling
- `.env.example` - Configuration examples
- `DEBUGGING_THREADING.md` - Debugging guide with model issues

