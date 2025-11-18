# Threading Feature - Detailed Test Scenarios

## Pre-Test Checklist

- [ ] `.env` has `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_SUBSCRIPTION_MODE=true`
- [ ] `.env` has `OPENROUTER_API_KEY` for bot to respond
- [ ] Feishu admin panel shows "Subscription Mode: Connected"
- [ ] Bot app is installed in test group chat
- [ ] Server is running: `bun dist/server.js` (port 3000)
- [ ] Devtools accessible at `http://localhost:3000/devtools`

---

## Scenario 1: New Thread on First Mention

**Objective**: Verify bot creates a new thread when first mentioned

**Setup**: Group chat with 2+ users

**Test Steps**:

1. **Send mention**:
   - You (User A): `@bot 什么是 OKR？`
   - Wait for bot response

2. **Verify in Feishu**:
   - [ ] Original mention appears in group chat
   - [ ] A **thread badge/indicator** shows on the mention message
   - [ ] Click thread → Bot's card response is inside
   - [ ] Main group chat is NOT cluttered with bot response

3. **Verify in Logs**:
   ```
   👥 [WebSocket] Processing group mention: "@bot 什么是 OKR？"
   ✅ Reply card message sent in thread
   Response message_id: om_xxx
   Response thread_id: xxx
   ```

4. **Verify in Devtools**:
   - Event type: `im.message.receive_v1`
   - Message has `mentions` array with bot ID
   - `chat_type: "group"`

**Pass Criteria**:
- ✅ Response only visible in thread, not group chat
- ✅ Thread shows proper conversation context
- ✅ Card displays correctly in thread
- ✅ Logs show thread creation

---

## Scenario 2: Thread Reply Continues Conversation

**Objective**: Verify follow-up messages stay in same thread with memory

**Prerequisite**: Complete Scenario 1

**Test Steps**:

1. **Open the thread** created in Scenario 1

2. **Send follow-up**:
   - You: `再详细解释一下如何设定 OKR 目标`
   - Wait for bot response

3. **Verify in Feishu**:
   - [ ] Response appears in **same thread**
   - [ ] Bot reference's previous answer when responding
   - [ ] Conversation flows naturally

4. **Verify in Logs**:
   ```
   🧵 [WebSocket] Processing thread reply: "再详细解释一下如何设定..."
   [Bot uses memory context from original question]
   ```

5. **Verify Memory**:
   - Bot's response should reference original OKR question
   - Shows it's maintaining conversation history
   - Not treating this as a new, isolated query

**Pass Criteria**:
- ✅ Response in same thread (not new thread)
- ✅ Bot references previous context
- ✅ No duplication of explanations
- ✅ Memory scope is `chatId + rootId`

---

## Scenario 3: Multiple Concurrent Mentions

**Objective**: Verify each mention gets its own isolated thread

**Setup**: Group chat with 3+ users

**Test Steps**:

1. **Rapid mentions**:
   - User A: `@bot OKR 和 KPI 有什么区别？`
   - User B: `@bot 项目管理的核心是什么？`
   - User C: `@bot 如何评估团队表现？`

2. **Verify Threads**:
   - [ ] Each mention shows a separate thread badge
   - [ ] Threads don't interfere with each other
   - [ ] Can see all 3 threads from group chat
   - [ ] Each thread has only its own conversation

3. **Verify in Logs**:
   ```
   👥 [WebSocket] Processing group mention: "@bot OKR 和 KPI..."
   👥 [WebSocket] Processing group mention: "@bot 项目管理..."
   👥 [WebSocket] Processing group mention: "@bot 如何评估..."
   ```
   All should have different `messageId` and `rootId`

4. **Verify Memory Isolation**:
   - Thread A's context ≠ Thread B's context
   - Each thread answers only its own question
   - No cross-contamination

**Pass Criteria**:
- ✅ 3 independent threads created
- ✅ Each thread has unique memory scope
- ✅ No context leakage between threads
- ✅ All responses happen independently

---

## Scenario 4: P2P (Direct Message) Unaffected

**Objective**: Verify direct messages still work without threading

**Setup**: Direct chat with bot (1-on-1)

**Test Steps**:

1. **Send direct message**:
   - You: `你好，告诉我如何制定年度目标`

2. **Verify in Feishu**:
   - [ ] Bot response appears directly in chat
   - [ ] No thread created
   - [ ] Regular conversation flow

3. **Verify in Logs**:
   ```
   💬 [WebSocket] Processing direct message: "你好，告诉我..."
   ```

4. **Verify Structure**:
   - `chat_type: "p2p"` (not "group")
   - No `reply_in_thread` used
   - Regular `sendCardMessage()` API call (not `replyCardMessageInThread()`)

**Pass Criteria**:
- ✅ No thread created in direct chat
- ✅ Response appears as normal message
- ✅ Backward compatibility maintained

---

## Scenario 5: Streaming/Typing Effect in Thread

**Objective**: Verify animated response in threaded context

**Test Steps**:

1. **Send mention with complex question**:
   - You: `@bot 请详细介绍一下 OKR 目标管理体系和实施步骤，包括如何设定目标、跟踪进度和评估结果`

2. **Watch Card Streaming**:
   - [ ] Card starts appearing with "我琢么琢么..." placeholder
   - [ ] Content fills in progressively (not all at once)
   - [ ] Typing effect is visible
   - [ ] Final card is fully formatted

3. **Verify in Logs**:
   ```
   updateCardElement() called multiple times
   Each call adds more content
   Final call completes the card
   ```

4. **Verify Card Quality**:
   - [ ] Title displays correctly
   - [ ] Content is properly formatted
   - [ ] Links/references are clickable (if any)
   - [ ] No rendering glitches

**Pass Criteria**:
- ✅ Streaming animation visible
- ✅ Not all content appears at once
- ✅ Card finalizes correctly
- ✅ User can see "thinking" process

---

## Scenario 6: Mention Detection Edge Cases

**Objective**: Verify mention detection is robust

**Test Steps**:

1. **Test Case 1 - Multiple Mentions**:
   - You: `@bot and @someone else, what about OKR？`
   - Bot should respond (still detects mention)

2. **Test Case 2 - Mention in Middle**:
   - You: `I wonder if @bot can explain OKR？`
   - Bot should respond

3. **Test Case 3 - Mention with Text Before/After**:
   - You: `Hi @bot, thanks, what is KPI please？`
   - Bot should respond

4. **Verify in Each Case**:
   - [ ] Devtools shows `mentions` array with bot ID
   - [ ] Logs show: `✅ Bot mention detected via mentions array`
   - [ ] Thread is created for each

**Pass Criteria**:
- ✅ All mention positions detected
- ✅ No false negatives
- ✅ Thread created in all cases

---

## Scenario 7: Error Handling - Server Restart

**Objective**: Verify graceful handling of server downtime

**Test Steps**:

1. **Server Running**:
   - Verify server is running normally
   - Mention bot: `@bot test message 1`
   - Thread should be created with response

2. **Stop Server**:
   - Stop the server: `Ctrl+C`
   - Mention bot: `@bot test message 2`
   - Wait 10 seconds

3. **Restart Server**:
   - Start server again: `bun dist/server.js`
   - Wait for logs: "WebSocket connection established successfully"

4. **Continue Testing**:
   - Mention bot: `@bot test message 3`
   - Should respond normally

5. **Verify No Duplicates**:
   - Check devtools for event deduplication
   - Each event processed only once
   - Event IDs prevent re-processing

**Pass Criteria**:
- ✅ No duplicate responses
- ✅ Server reconnects cleanly
- ✅ Deduplication works via event IDs
- ✅ No memory/state corruption

---

## Scenario 8: Images/Attachments in Thread

**Objective**: Verify media handling in threads

**Test Steps** (if applicable to your bot):

1. **Send mention requesting visual content**:
   - You: `@bot 能否给我展示一个 OKR 目标的示意图？`

2. **If bot returns images**:
   - [ ] Images render in thread
   - [ ] No resolution issues
   - [ ] Proper sizing in thread context
   - [ ] Can save/download images

3. **Verify Card Structure**:
   - Check if card includes image elements
   - Verify image URLs are correct
   - Check in devtools for full card JSON

**Pass Criteria** (if applicable):
- ✅ Images display in thread
- ✅ No broken image links
- ✅ Proper card formatting

---

## Scenario 9: Performance Under Load

**Objective**: Verify threading doesn't degrade performance

**Test Steps**:

1. **Baseline Test** - Single mention:
   - Time from mention to thread response: ~5-15s (should be normal)

2. **Load Test** - Multiple rapid mentions:
   ```
   User A: @bot question 1 (time: 0s)
   User B: @bot question 2 (time: 1s)
   User C: @bot question 3 (time: 2s)
   User D: @bot question 4 (time: 3s)
   ```
   - Measure response time for each
   - Should be similar to baseline (not degrading)

3. **Verify Threads**:
   - All threads created
   - All responses appear
   - No timeouts or failures

4. **Check Logs**:
   - No error messages
   - All events processed
   - Memory usage stable

**Pass Criteria**:
- ✅ Response time consistent (±20%)
- ✅ No queue buildup
- ✅ All requests handled
- ✅ No memory leaks

---

## Scenario 10: Backward Compatibility

**Objective**: Verify no regressions in existing features

**Test Steps**:

1. **Test Existing Features**:
   - [ ] Direct message conversation works
   - [ ] Card updates work (if applicable)
   - [ ] Memory context works
   - [ ] Error handling works

2. **Compare Behavior**:
   - Direct messages: Should be unchanged
   - Card formatting: Should be unchanged
   - Response time: Should be similar

3. **Verify No Regressions**:
   - No errors in existing workflows
   - All previous test cases still pass
   - No new console errors

**Pass Criteria**:
- ✅ All existing features work
- ✅ No new errors
- ✅ Performance unchanged

---

## Sign-Off Checklist

After completing all scenarios:

- [ ] Scenario 1: New thread creation ✅
- [ ] Scenario 2: Thread continuation ✅
- [ ] Scenario 3: Multiple threads isolated ✅
- [ ] Scenario 4: P2P unaffected ✅
- [ ] Scenario 5: Streaming animation works ✅
- [ ] Scenario 6: Mention detection robust ✅
- [ ] Scenario 7: Server restart handled ✅
- [ ] Scenario 8: Media in threads (if applicable) ✅
- [ ] Scenario 9: Performance stable ✅
- [ ] Scenario 10: No regressions ✅

**Overall Status**: 
- [ ] PASS - All tests successful
- [ ] FAIL - Issues found (document below)

**Issues Found** (if any):
```
[List any failures or unexpected behavior]
```

**Sign-off**:
- Tested by: _______________
- Date: _______________
- Approved: _______________
