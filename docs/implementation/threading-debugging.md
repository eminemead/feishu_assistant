# Threading Feature Debugging Guide

## Current Status

**Server**: Running on port 3000 with devtools enabled
**WebSocket**: Connected to Feishu ✅
**Devtools UI**: http://localhost:3000/devtools

## Recent Fixes Applied

### 1. User ID Extraction Bug (FIXED)
- **Issue**: `extractFeishuUserId()` returned object `{open_id, union_id, user_id}` instead of string
- **Fix**: Now correctly extracts `sender_id.open_id` as string value
- **File**: `lib/auth/extract-feishu-user-id.ts`
- **Impact**: User identification for memory context and RLS now works correctly

### 2. Stream Error Logging (FIXED)
- **Issue**: AI stream returning 0 chunks with no error messages (silent failure)
- **Fix**: Added try-catch blocks around stream creation and iteration
- **File**: `lib/agents/manager-agent.ts` (lines 157-168, 218-250)
- **Impact**: Stream errors will now be logged for debugging

### 3. Rate-Limited Models (FIXED)
- **Issue**: All agents using `kwaipilot/kat-coder-pro:free` which gets 429 rate limits
- **Fix**: Updated all agents to use `google/gemini-2.5-flash-lite` via OpenRouter
- **Files Modified**:
  - `lib/agents/manager-agent.ts`
  - `lib/agents/okr-reviewer-agent.ts`
  - `lib/agents/alignment-agent.ts`
  - `lib/agents/pnl-agent.ts`
  - `lib/agents/dpa-pm-agent.ts`

## How to Test

### Quick Test: Mention Bot in Group Chat

1. **Go to Feishu** → Open group chat with bot
2. **Mention the bot**: `@bot 什么是 OKR？`
3. **Watch logs**: Run this command in another terminal:
   ```bash
   tail -f /tmp/feishu-server.log | grep -E "(WebSocket|Manager|Stream|Card|Error|❌|✅)"
   ```

### What to Look For in Logs

**Expected sequence**:
```
📨 [WebSocket] Event received: im.message.receive_v1
🤖 [WebSocket] Bot User ID: <bot-id>
👤 [Auth] Extracted user ID: <user-id>    <- Should be a string like "ou_xxx" (FIXED)
👥 [WebSocket] Processing group mention
Handling app mention
📤 [Card] Creating and sending streaming card
✅ [Card] Created streaming card
✅ [Card] Card sent successfully
[Manager] Received query: "..."
[Manager] Stream created, starting to read textStream...
[Manager] Finished reading textStream. Total chunks: N
[Manager] Returning final text (length=X)
```

**If you see this instead**:
```
[Manager] Finished reading textStream. Total chunks: 0, Final text length: 0
```

→ Stream is not generating output. Check for errors above this line.

## Debugging Checklist

### ✅ Confirm Server State
- [ ] Server logs show "✅ WebSocket connection established successfully"
- [ ] Devtools UI accessible at http://localhost:3000/devtools
- [ ] No initialization errors in logs

### 🧪 Test Mention Flow
- [ ] Mention bot in Feishu: `@bot 测试`
- [ ] Check logs for: `👥 [WebSocket] Processing group mention`
- [ ] Check that user ID is extracted as string (not `[object Object]`)
- [ ] Check card creation succeeds: `✅ [Card] Card sent successfully`

### 📊 Check AI Stream
- [ ] Monitor logs for: `[Manager] Stream created, starting to read textStream...`
- [ ] If stream has 0 chunks, look for error in logs above
- [ ] Check for `Error during stream iteration:` messages

### 🎯 If Stream Returns 0 Chunks
**Check these in order**:

1. **OpenRouter API Key**: Is `OPENROUTER_API_KEY` set?
   ```bash
   echo $OPENROUTER_API_KEY
   ```

2. **Model Availability**: Is `google/gemini-2.5-flash-lite` working?
   - Check OpenRouter status page
   - Try a simpler query: just `hello`

3. **Agent Instructions**: Are instructions too complex?
   - Check manager-agent.ts line 33-61
   - Try reducing instruction length

4. **Memory Context**: Is memory causing issues?
   - Check `executionContext` setup in manager-agent.ts
   - Try without memory context

5. **Tool Availability**: Are tools defined but failing?
   - Manager agent has `searchWeb` tool
   - Check if tool definition is correct

### 🔍 Deep Debugging

**Enable verbose logging**:
```bash
# Edit lib/agents/manager-agent.ts and add more console.log statements
# Or check the actual error by looking at result object
```

**Check OpenRouter directly**:
```bash
curl -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.5-flash-lite",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

## Key Files

| File | Purpose | Recent Changes |
|------|---------|-----------------|
| `lib/handle-app-mention.ts` | Entry point for mentions | Added devtools tracking |
| `lib/feishu-utils.ts` | Feishu API calls | Retry logic for getThread() |
| `lib/agents/manager-agent.ts` | Main agent logic | Stream error logging, model update |
| `lib/auth/extract-feishu-user-id.ts` | User extraction | Fixed sender_id parsing |
| `server.ts` | WebSocket handler | Event detection and routing |

## Known Issues & Workarounds

### Issue: Socket Connection Reset in getThread()
- **Cause**: Feishu API occasionally closes connections
- **Workaround**: Retry logic with 500ms delays (already implemented)
- **Fallback**: If thread fetch fails, use current message only

### Issue: Empty Messages Array
- **Cause**: Thread history fetch returns empty
- **Workaround**: Default to current message if thread is empty (already implemented)

### Issue: AI Stream Returns 0 Chunks
- **Cause**: TBD - needs investigation with new error logging
- **Current Theory**: OpenRouter rate limiting or model unavailability
- **Investigation**: Check logs for `Error during stream iteration:` messages

## Next Steps

1. **Trigger a mention** in Feishu
2. **Check logs** for stream errors
3. **Document the error** from logs
4. **Fix root cause** based on error type
5. **Re-test** to confirm fix

## Monitoring Commands

**Real-time log monitoring**:
```bash
tail -f /tmp/feishu-server.log | grep -E "(Manager|Stream|Error|✅|❌)"
```

**Check devtools events**:
```bash
curl http://localhost:3000/devtools/api/events | jq '.events[-5:]'
```

**Watch for rate limits**:
```bash
grep -i "429\|rate\|limit" /tmp/feishu-server.log
```

