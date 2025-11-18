# Threading Feature - Fix Summary & Test Plan

## 🎯 Current Objective

The threading feature allows the bot to respond to mentions in group chats by creating separate threads, keeping conversations organized. Currently debugging why AI stream returns 0 chunks.

## 🔧 Fixes Applied (Session: Tue Nov 18 2025)

### Fix 1: User ID Extraction Bug ✅

**File**: `lib/auth/extract-feishu-user-id.ts`

**Problem**:
- Feishu subscription mode sends user ID as nested object: `sender_id: {open_id, union_id, user_id}`
- Code was returning entire `sender_id` object instead of extracting the string value
- Result: Logs showed `[object Object]` instead of user ID like `ou_xxx`

**Before**:
```typescript
if (message.sender.sender_id) {
  return message.sender.sender_id;  // Returns object!
}
```

**After**:
```typescript
if (message.sender.sender_id?.open_id) {
  return message.sender.sender_id.open_id;  // Returns string
}
```

**Impact**: User identification, memory context scoping, and RLS now work correctly.

---

### Fix 2: Silent Stream Failures ✅

**File**: `lib/agents/manager-agent.ts`

**Problem**:
- AI stream returning 0 chunks with no error messages
- Silent failure made debugging impossible
- Code just logged "Total chunks: 0, Final text length: 0" with no context

**Before**:
```typescript
const result = (managerAgentInstance.stream as any)({
  messages,
  executionContext,
});
// No error handling
```

**After**:
```typescript
let result;
try {
  result = (managerAgentInstance.stream as any)({
    messages,
    executionContext,
  });
  console.log(`[Manager] Stream created, starting to read textStream...`);
} catch (streamError) {
  console.error(`[Manager] Error creating stream:`, streamError);
  throw streamError;
}
```

**Additional logging** added in stream iteration:
```typescript
try {
  for await (const textDelta of result.textStream) {
    // ... stream processing
  }
} catch (streamIterationError) {
  console.error(`[Manager] Error during stream iteration:`, streamIterationError);
}
```

**Impact**: Stream errors now visible in logs for debugging.

---

### Fix 3: Rate-Limited Models ✅

**Files Modified**:
- `lib/agents/manager-agent.ts`
- `lib/agents/okr-reviewer-agent.ts`
- `lib/agents/alignment-agent.ts`
- `lib/agents/pnl-agent.ts`
- `lib/agents/dpa-pm-agent.ts`

**Problem**:
- All agents using `kwaipilot/kat-coder-pro:free` which hits OpenRouter rate limits
- When rate-limited, API returns 429, causing "No output generated" error
- Free tier model has unreliable availability

**Before**:
```typescript
model: openrouter("kwaipilot/kat-coder-pro:free"),
```

**After**:
```typescript
model: openrouter("google/gemini-2.5-flash-lite"),
```

**Impact**: All agents now using stable, reliable model with better rate limit handling.

---

### Fix 4: Enhanced Debug Logging ✅

**File**: `lib/agents/manager-agent.ts`

**Added**:
- Detailed logging when final result is received
- Error handling when awaiting final result
- Logs show accumulated text length vs final result length

```typescript
try {
  finalResult = await result;
  console.log(`[Manager] Final result received:`, {
    text: finalResult.text?.substring(0, 100) || 'N/A',
    textLength: finalResult.text?.length || 0,
    accumulatedLength: accumulatedText.length,
  });
} catch (finalError) {
  console.error(`[Manager] Error awaiting final result:`, finalError);
}
```

**Impact**: Can now identify exactly where stream processing fails.

---

## 📋 Current Status

| Component | Status | Details |
|-----------|--------|---------|
| **WebSocket Connection** | ✅ Connected | Feishu subscription mode active |
| **Event Detection** | ✅ Working | Bot mention detection via mentions array |
| **User ID Extraction** | ✅ Fixed | Now correctly extracts string value |
| **Card Creation** | ✅ Working | Streaming card created and sent |
| **Thread Reply** | ✅ Working | Response sent as thread reply |
| **AI Stream** | ❓ Unknown | Returns 0 chunks - debugging in progress |
| **Error Logging** | ✅ Enhanced | Stream errors now visible |

---

## 🧪 How to Test

### Prerequisites
- Server running: `ENABLE_DEVTOOLS=true bun dist/server.js`
- Port 3000 accessible
- Feishu bot in group chat
- Subscription Mode enabled in Feishu admin

### Test Command (Monitor Logs)
```bash
./test-mention-flow.sh
```

This will show colored logs for:
- 🟢 WebSocket events and success messages
- 🔵 Manager agent processing
- 🟡 Card operations and auth
- 🔴 Errors

### Test Flow
1. **In Feishu**: Mention bot in group chat
   ```
   @bot 什么是 OKR？
   ```

2. **Watch logs** in terminal running `test-mention-flow.sh`

3. **Expected sequence**:
   ```
   📨 [WebSocket] Event received: im.message.receive_v1
   👤 [Auth] Extracted user ID: ou_xxx          <- Should be string, not [object Object]
   ✅ [Card] Card sent successfully
   [Manager] Received query: "..."
   [Manager] Stream created...
   [Manager] Finished reading textStream. Total chunks: N
   [Manager] Final result received
   [Manager] Returning final text (length=X)
   ```

4. **If stream has 0 chunks**:
   - Check for `Error creating stream:` message
   - Check for `Error during stream iteration:` message
   - Check for `Error awaiting final result:` message

---

## 🔍 Debugging Checklist

### Quick Checks
- [ ] Server logs show "✅ WebSocket connection established successfully"
- [ ] No errors during server startup
- [ ] User ID extraction shows string value (not `[object Object]`)
- [ ] Card is created and sent successfully

### Stream Generation Issue
If stream returns 0 chunks:

- [ ] **Check API Key**: Is `OPENROUTER_API_KEY` set?
  ```bash
  echo $OPENROUTER_API_KEY | head -c 10
  ```

- [ ] **Check Model Availability**: Try curl test
  ```bash
  curl -X POST "https://openrouter.ai/api/v1/chat/completions" \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model": "google/gemini-2.5-flash-lite", "messages": [{"role": "user", "content": "Hi"}]}'
  ```

- [ ] **Check Logs**: Look for error messages in stream processing
  ```bash
  tail -50 /tmp/feishu-server.log | grep -i "error\|❌"
  ```

- [ ] **Check Memory Context**: Try disabling memory
  - Comment out memory setup in manager-agent.ts
  - Restart and test

---

## 📊 Files Modified

| File | Changes | Reason |
|------|---------|--------|
| `lib/auth/extract-feishu-user-id.ts` | Fixed sender_id parsing | User ID extraction returning object |
| `lib/agents/manager-agent.ts` | Added error logging, updated model | Stream error visibility, rate limit fix |
| `lib/agents/okr-reviewer-agent.ts` | Updated model | Rate limit fix |
| `lib/agents/alignment-agent.ts` | Updated model | Rate limit fix |
| `lib/agents/pnl-agent.ts` | Updated model | Rate limit fix |
| `lib/agents/dpa-pm-agent.ts` | Updated model | Rate limit fix |

---

## 🚀 Next Steps

1. **Trigger mention** in Feishu bot group chat
2. **Monitor logs** using `./test-mention-flow.sh`
3. **Identify error** if stream still returns 0 chunks
4. **Document error** from logs
5. **Fix root cause** based on error type
6. **Re-test** to confirm resolution

---

## 📞 Support Resources

- **Debugging Guide**: `DEBUGGING_THREADING.md`
- **Quick Start**: `THREADING_TEST_QUICK_START.md`
- **Full Test Guide**: `docs/testing/threading-feature-test.md`
- **Server Logs**: `/tmp/feishu-server.log`
- **Devtools UI**: http://localhost:3000/devtools

---

## 🎓 Key Learnings

### Feishu Event Structure (Subscription Mode)
```json
{
  "message": {
    "chat_type": "group",
    "mentions": [{"id": {"open_id": "ou_xxx"}}],
    "sender": {
      "sender_id": {
        "open_id": "ou_yyy",
        "union_id": "on_zzz",
        "user_id": ""
      }
    }
  },
  "sender": {
    "sender_id": {
      "open_id": "ou_yyy"
    }
  }
}
```

### Agent Stream API (@ai-sdk-tools/agents)
```typescript
const result = agent.stream({
  messages,
  executionContext
});

// Two parallel streams:
result.textStream        // Text chunks
result.fullStream        // Events (handoffs, etc.)

// Final result
await result;            // Wait for completion
```

### Threading Implementation
- **Thread detection**: `rootId !== messageId` = continuation
- **New thread**: `rootId === messageId` = new mention
- **Reply API**: `replyCardMessageInThread(messageId, cardEntityId, true)`
- **Memory scoping**: `chatId + rootId` = conversation context

