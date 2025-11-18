# Model Usage - Quick Reference Card

## 🎯 Common Scenarios

### Development (Cost-Optimized)
```bash
bun run dev
```
→ Uses primary model (free)

### Testing Threading Feature
```bash
ENABLE_DEVTOOLS=true bun dist/server.js
```
→ Monitor at http://localhost:3000/devtools
→ Uses primary model (free)

### If Getting Rate Limits
```bash
AI_MODEL_TIER=fallback bun dist/server.js
```
→ Switches to reliable model
→ Slightly higher cost but no rate limits

### Monitoring
```bash
./test-mention-flow.sh
```
→ Colored log output
→ Shows WebSocket events, Manager agent, Cards, Errors

### Check Which Model is Active
```bash
grep "\[Model\]" /tmp/feishu-server.log | head -1
```

---

## 📋 Model Comparison

| Aspect | Primary | Fallback |
|--------|---------|----------|
| **Model** | kwaipilot/kat-coder-pro:free | google/gemini-2.5-flash-lite |
| **Cost** | Free | ~$0.00001/1K tokens |
| **Speed** | Fast | Fast |
| **Rate Limits** | Yes (may hit 429) | No |
| **Reliability** | ~80-90% | 99%+ |
| **Default** | Yes ✅ | Fallback only |

---

## 🚀 Switch Models

### Command Line
```bash
# Use primary (free)
bun dist/server.js

# Use fallback (reliable)  
AI_MODEL_TIER=fallback bun dist/server.js
```

### Environment File (.env)
```bash
# Try primary first (default)
# AI_MODEL_TIER=primary

# Use fallback (uncomment this)
AI_MODEL_TIER=fallback
```

---

## ⚠️ Rate Limit Indicators

If you see this in logs:
```
⚠️ [Manager] Rate limit detected (429)
💡 [Manager] Suggestion: Switch to fallback model
```

→ Run: `AI_MODEL_TIER=fallback bun dist/server.js`

---

## 📊 Cost Estimation

**Usage**: 100 queries/day

| Scenario | Monthly Cost | Notes |
|----------|--------------|-------|
| Primary only | ~$0 | When available |
| Fallback only | ~$0.05 | Reliable |
| Primary + Fallback | ~$0.01-0.02 | Optimal |

---

## 🔧 Code Usage

If you need to check/change model in code:

```typescript
import { getPrimaryModel, getFallbackModel } from "lib/shared/model-fallback";

// Use primary (free, tries this first)
const model1 = getPrimaryModel();

// Use fallback (reliable)
const model2 = getFallbackModel();

// Check if error is rate limit
import { isRateLimitError } from "lib/shared/model-fallback";
if (isRateLimitError(error)) {
  console.log("Switch to fallback!");
}
```

---

## 📍 Location of Key Files

- **Model logic**: `lib/shared/model-fallback.ts`
- **Manager agent**: `lib/agents/manager-agent.ts`
- **All agents**: Use `getPrimaryModel()`
- **Configuration**: `.env` file or `AI_MODEL_TIER` env var
- **Docs**: `MODEL_FALLBACK_GUIDE.md`

---

## ✅ Verification

1. **Server started with primary model**:
   ```
   🤖 [Model] Using primary model: kwaipilot/kat-coder-pro
   ```

2. **Server started with fallback model**:
   ```
   🤖 [Model] Using fallback model: Google Gemini 2.5 Flash
   ```

3. **All agents initialized**:
   ```bash
   grep "\[Model\]" /tmp/feishu-server.log | wc -l
   # Should be 5 (Manager + 4 specialist agents)
   ```

