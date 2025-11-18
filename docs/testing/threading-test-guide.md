# Threading Feature - Quick Test Guide

## Build & Run

```bash
# Build the project
bun run build

# Start the server (port 3000)
bun dist/server.js
```

Watch the logs for:
- ✅ "WebSocket connection established successfully" - Bot is ready
- 📨 "Bot mention detected via mentions array" - Bot saw the mention

## Test Flow

### 1. Open Feishu Group Chat
- Have your bot app in a group chat
- Admin panel should show "Subscription Mode: Connected"

### 2. Test Case: Mention Bot in Group Chat
```
You: @bot 什么是 OKR？
Bot response: Should appear in a NEW THREAD (not in group chat)
```

**Check for:**
- Response appears under your mention with a thread badge
- Card shows streaming/typing effect
- No message in main group chat

**Server Log Indicators:**
```
🔍 [WebSocket] Found X mention(s) in group message
✅ [WebSocket] Bot mention detected via mentions array
👥 [WebSocket] Processing group mention: "@bot 什么是..."
✅ Reply card message sent in thread
```

### 3. Test Case: Follow-up in Same Thread
```
You: (in the thread) 再解释一下
Bot response: Appears in same thread with context from original question
```

**Server Log:**
```
🧵 [WebSocket] Processing thread reply: "再解释一下"
```

### 4. Test Case: Direct Message (P2P) Still Works
```
You: (direct chat) 你好，what is a KPI?
Bot response: Direct message (no thread)
```

**Server Log:**
```
💬 [WebSocket] Processing direct message:
```

## Expected Behavior

| Scenario | Result |
|----------|--------|
| Mention in group | Response in NEW THREAD ✅ |
| Reply in thread | Response in SAME THREAD ✅ |
| Direct message | Direct response (no thread) ✅ |
| Card streaming | Typing effect visible ✅ |
| Memory context | Knows previous messages ✅ |

## Monitoring Real-Time

Open in browser while testing:
```
http://localhost:3000/devtools
```

See:
- All incoming events in real-time
- User who mentioned the bot
- Message content and mentions array
- Timestamps and latencies

## Troubleshooting

### "Bot mention not detected"
- Check: Does Feishu admin show "Subscription Mode: Connected"?
- Check: Is bot in the group chat?
- Check: Verify `mentions` array in devtools event

### "Response in group chat instead of thread"
- Check: `reply_in_thread: true` parameter
- Check: Does Feishu API return `thread_id` in response?
- Review: `lib/feishu-utils.ts` line 422-452

### "Server won't start"
```bash
# Check dependencies
bun install

# Try building first
bun run build

# Then run
bun dist/server.js
```

## Key Files

- **Implementation**: `lib/feishu-utils.ts` → `replyCardMessageInThread()` (line 422)
- **Handler**: `lib/handle-app-mention.ts` (line 18)
- **Webhook**: `server.ts` (line 130-141)
- **Full Docs**: `docs/testing/threading-feature-test.md`

## Success Criteria

- [ ] Mention in group → Response in thread ✅
- [ ] Thread reply works ✅
- [ ] Direct message unaffected ✅
- [ ] Card streams in thread ✅
- [ ] Memory context maintained ✅
- [ ] Server logs show correct flow ✅
