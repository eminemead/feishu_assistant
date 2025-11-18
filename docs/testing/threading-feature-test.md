# Threading Feature Test Guide

## Overview

This guide walks through testing the new threading feature that creates separate threads when the bot is mentioned in group chats. The feature uses Feishu's official Reply API with `reply_in_thread: true`.

## Setup

### Prerequisites

1. **Build the Project**:
   ```bash
   # Build the TypeScript code (dev mode may have import issues)
   bun run build
   
   # Or use esbuild directly
   bunx esbuild server.ts --platform=node --target=es2020 --outdir=dist --bundle --format=cjs
   ```

2. **Environment Variables** (in `.env`):
   ```env
   # Feishu Configuration (REQUIRED)
   FEISHU_APP_ID=your-app-id
   FEISHU_APP_SECRET=your-app-secret
   FEISHU_SUBSCRIPTION_MODE=true
   
   # AI Provider (REQUIRED for bot responses)
   OPENROUTER_API_KEY=your-openrouter-key
   
   # Supabase (OPTIONAL - uses in-memory if not set)
   # SUPABASE_URL=your-supabase-url
   # SUPABASE_ANON_KEY=your-supabase-key
   
   # Database (OPTIONAL - uses DuckDB by default)
   # DATABASE_URL=file:okr.db
   
   # Optional
   # EXA_API_KEY=your-exa-key (for web search)
   # PORT=3000
   ```

3. **Run the Server**:
   ```bash
   # Option A: Run the built version
   bun dist/server.js
   
   # Option B: Build and run together
   bun run build && bun dist/server.js
   ```
   
   Server will start on port 3000 and establish WebSocket connection to Feishu.

4. **Feishu Bot Configuration**:
   - In Feishu admin panel, ensure:
     - **Subscription Mode** (WebSocket) is **enabled**
     - These permissions are granted:
       - `im:message:read` - Read messages
       - `im:message:read_private` - Read private messages
       - `im:message:create` - Send messages (for card creation)
       - `im:message.message_reply` - Reply to messages (for threading)
     - WebSocket connection status shows "Connected" (not "Pending")

### Monitoring

Open devtools while testing to see real-time events:
```
http://localhost:3000/devtools
```

Check server logs in terminal:
```
tail -f /path/to/server.log
```

Or monitor live with:
```bash
bun run dev 2>&1 | grep -E "(✅|❌|📨|🧵|👥)"
```

---

## Manual Testing Checklist

### Test 1: First Mention Creates New Thread ✅

**Steps**:
1. Open a Feishu group chat
2. Mention the bot: `@bot 什么是 OKR？`
3. Wait for the bot to process

**Expected Behavior**:
- ✅ Response appears as a **new thread** under the mention message (not in group chat)
- ✅ Thread shows bot's card response with streaming/typing effect
- ✅ Original mention message shows a thread badge/indicator
- ✅ Server logs show: `👥 [WebSocket] Processing group mention`
- ✅ Devtools shows: `im.message.receive_v1` event with `mentions` array

**Response Details**:
- Card title: "Evidence-总参"
- Initial content: "我琢么琢么..."
- Content streams in with typing effect

---

### Test 2: Follow-up Message in Existing Thread ✅

**Steps**:
1. In the thread created from Test 1, reply to the bot: `再解释一下`
2. Wait for response

**Expected Behavior**:
- ✅ Response appears in the same thread
- ✅ Memory context includes the original mention question + all follow-ups
- ✅ Server logs show: `🧵 [WebSocket] Processing thread reply`
- ✅ Conversation history flows naturally with context

**Technical Detail**:
- `rootId` differs from `messageId` → Continuation in existing thread
- Memory query: `getThread(chatId, rootId, botUserId)`

---

### Test 3: Direct Message (P2P) Still Works ✅

**Steps**:
1. Open a direct chat with the bot (1-on-1)
2. Send: `你好，what is a KPI?`
3. Wait for response

**Expected Behavior**:
- ✅ Response sent directly to chat (not as a thread)
- ✅ No thread creation
- ✅ Server logs show: `💬 [WebSocket] Processing direct message`
- ✅ `chat_type: "p2p"` in event logs

---

### Test 4: Multiple Concurrent Mentions ✅

**Steps**:
1. In the same group chat, have multiple users mention the bot:
   - User A: `@bot OKR 评审流程是什么？`
   - User B: `@bot 项目风险评估怎么做？`
2. Wait for both responses

**Expected Behavior**:
- ✅ Each mention creates its own thread
- ✅ Threads are independent (different memory contexts)
- ✅ Both responses stream simultaneously in their threads
- ✅ No cross-contamination of context

---

### Test 5: Streaming/Typing Effect in Thread ✅

**Steps**:
1. Mention bot with a longer question: `@bot 详细解释一下如何进行 OKR 目标制定和执行`
2. Watch the response

**Expected Behavior**:
- ✅ Card elements appear progressively (typing effect)
- ✅ Not all text appears at once
- ✅ Card updates smoothly with `updateCardElement()` calls
- ✅ Final card is complete and formatted properly

**Server Indicators**:
- `updateCardElement()` calls appear in logs
- Each card section updates incrementally

---

### Test 6: Thread Title/Context ✅

**Steps**:
1. Mention the bot in a group chat
2. Look at the thread that's created
3. Check the thread title

**Expected Behavior**:
- ✅ Thread shows the original mention message as context
- ✅ Can read the question that started the thread
- ✅ Thread header shows participant info

---

### Test 7: Images/Attachments in Thread ✅

**Steps**:
1. If your response generates images or attachments:
   - Mention bot: `@bot 可以给我看一个 OKR 的示意图吗？`
2. Check if images display in thread

**Expected Behavior**:
- ✅ Images render properly in the thread
- ✅ No display issues
- ✅ Cards with image elements work correctly

---

### Test 8: Error Handling - Bot Offline ✅

**Steps**:
1. Stop the dev server: `Ctrl+C`
2. Mention the bot in Feishu: `@bot test message`
3. Restart server: `bun run dev`

**Expected Behavior**:
- ✅ Server offline: Feishu shows mention but bot doesn't respond
- ✅ Server online: Bot catches up and responds
- ✅ No duplicate responses (deduplication via `event_id`)

---

### Test 9: Mention in Large Group ✅

**Steps**:
1. Mention bot in a group chat with 10+ participants
2. Have other users post messages while bot is responding

**Expected Behavior**:
- ✅ Bot response appears in thread (not cluttering group chat)
- ✅ Other group messages don't interfere with thread
- ✅ Thread stays organized

---

### Test 10: Backward Compatibility ✅

**Steps**:
1. Test existing features still work:
   - Direct message conversation
   - Existing thread replies (if any)
   - Card updates

**Expected Behavior**:
- ✅ All existing features unchanged
- ✅ No regression in functionality
- ✅ Memory context still works

---

## Expected Log Output

When mentioning bot in group chat, you should see:

```
🔔 [WebSocket] Received event type: im.message.receive_v1
📨 [WebSocket] Event received: im.message.receive_v1
🤖 [WebSocket] Bot User ID: ou_xxx
🔍 [WebSocket] Mentions array: [{"name":"bot","open_id":"ou_xxx","user_id":"xx_xxx"}]
✅ [WebSocket] Bot mention detected via mentions array
👥 [WebSocket] Processing group mention: "@bot 什么是 OKR？"
👤 [Auth] Extracted user ID: xx_xxx

[Manager Agent processes query...]
[Specialist agent responds...]

✅ Reply card message sent in thread
Response message_id: om_xxx
Response root_id: om_yyy
Response thread_id: xxx
```

---

## Devtools Monitoring

Access the devtools UI to see:

1. **Event Timeline**:
   - All `im.message.receive_v1` events with full JSON
   - User who mentioned the bot
   - Message content and mentions array

2. **Filtering**:
   - Filter by event type: `im.message.receive_v1`
   - Filter by agent: watch manager agent routing
   - Check event IDs for deduplication

3. **Statistics**:
   - Total events processed
   - Event types breakdown
   - Timestamps and latencies

---

## Troubleshooting

### No Thread Created

**Issue**: Message appears in group chat instead of thread

**Cause**: `reply_in_thread: true` parameter may not be passed correctly

**Fix**:
1. Check `lib/feishu-utils.ts` - `replyCardMessageInThread()` function
2. Verify `reply_in_thread: true` is in the API call
3. Check Feishu API response for errors
4. Verify permissions include `im:message.message_reply`

### Mention Not Detected

**Issue**: Bot doesn't respond to mention

**Cause**: Mention detection logic failing

**Fix**:
1. Check devtools - is `im.message.receive_v1` event arriving?
2. Verify `mentions` array contains bot ID
3. Check `chat_type === "group"` condition
4. Review `extractFeishuUserId()` for user ID extraction

### Thread Reply 404

**Issue**: API returns 404 when replying

**Cause**: Invalid message ID or permission issue

**Fix**:
1. Verify original message ID is correct
2. Check message is in the same chat
3. Verify `im:message.message_reply` permission granted
4. Check Feishu API response in server logs

### Memory Context Missing

**Issue**: Bot doesn't remember context in thread

**Cause**: Memory key issue

**Fix**:
1. Check `chatId + rootId` combination in memory
2. Verify Supabase connection for memory store
3. Check RLS policies for user isolation
4. Review `getThread()` query in `lib/memory.ts`

---

## Performance Metrics

Expected behavior:

| Metric | Expected | Notes |
|--------|----------|-------|
| Mention Detection | <100ms | WebSocket event arrives immediately |
| Thread Creation | 1-3s | Includes API call + card generation |
| Streaming Response | 5-15s | Depends on query complexity |
| Total Response Time | 6-20s | From mention to full response in thread |
| Memory Lookup | <100ms | Supabase query for conversation history |

---

## Sign-Off Checklist

- [ ] All 10 tests pass
- [ ] Streaming effect visible in threads
- [ ] Memory context works correctly
- [ ] P2P chats unaffected
- [ ] No regressions in existing features
- [ ] Devtools shows correct event flow
- [ ] Error handling graceful (no crashes)
- [ ] Documentation updated

---

## Additional Resources

- [Implementation Details](thread-response-for-mentions.md)
- [Feishu Reply Message API](https://open.feishu.cn/document/server-docs/im-v1/message/reply)
- [Testing Guide](testing-guide.md)
- [Quick Start](test-quick-start.md)
