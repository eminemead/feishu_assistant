# Button Click Testing - FIXED & READY

**Status**: 🚀 **READY FOR REAL FEISHU TESTING**

**Fix Applied**: Context extraction now uses Feishu callback data directly (not action_id)

---

## What Was Fixed

The previous session attempted to encode context in `action_id`, but Feishu doesn't send that back in button callbacks. 

**The Fix**: Use Feishu's native `context` object that IS included in the callback:

```json
// Feishu sends this:
{
  "context": {
    "open_chat_id": "oc_xyz123",
    "open_message_id": "om_abc456"
  },
  "action": {
    "value": "Button text",
    "tag": "button"
  }
}
```

Server now extracts `open_chat_id` and `open_message_id` directly - much more reliable!

---

## Testing Instructions

### 1. Verify Server is Running

```bash
curl http://localhost:3000/health | jq .status
# Should show: "healthy"
```

### 2. Send a Message in Feishu

- Open Feishu chat with the bot
- Send: **"What is machine learning?"**
- Wait ~5-10 seconds for response

### 3. You Should See

1. **Card with bot's response** (explanation of ML)
2. **Separate message below with 3 suggestion buttons**
   - Example: "Tell me more", "Give examples", "Explain limitations"

### 4. Click a Button

- Click any suggestion button
- Wait ~3-5 seconds

### 5. Verify the Response

✅ **Expected behavior:**
- No error message appears
- New response appears **in the same thread** (not as new message)
- Response is relevant to the button click
- Response acknowledges the previous context
- New suggestion buttons appear below

### 6. Monitor Server Logs

In a terminal window:

```bash
tail -f /Users/xiaofei.yin/work_repo/feishu_assistant/server.log | grep -E "CardAction|ButtonFollowup"
```

**What you should see on button click:**

```
🔘 [CardAction] Card action trigger received
🔘 [CardAction] Action data: { ... "context": { "open_chat_id": "oc_...", "open_message_id": "om_..." } ... }
🔘 [CardAction] Button clicked: "Tell me more"
🔘 [CardAction] Extracted context: chatId=oc_abc123, rootId=om_xyz789
✅ [CardAction] Button followup processed successfully
```

If you see this, **it's working!**

---

## Success Criteria

All must be true:

- [ ] Buttons appear in Feishu (below response)
- [ ] Clicking button shows no error
- [ ] Response appears **in thread** (continues conversation)
- [ ] Response is relevant to button click
- [ ] New suggestions appear after response
- [ ] Can click multiple buttons in sequence
- [ ] Conversation flows naturally
- [ ] Server logs show clean processing (context extracted correctly)

---

## If It Doesn't Work

### Check 1: Are buttons appearing?
```bash
grep "FollowupButtons" server.log | tail -5
```

### Check 2: Is the button being received?
```bash
grep "CardAction" server.log | tail -10
```

### Check 3: Is context being extracted?
```bash
grep "Extracted context" server.log
```

Should show: `chatId=oc_xyz, rootId=om_abc` (both non-empty)

### Check 4: Clear logs and try again
```bash
cat /dev/null > server.log
# Send message and click button
tail -50 server.log
```

---

## Key Files Changed

1. **server.ts** (lines 38-89, 101-144)
   - Updated card.action.trigger handler
   - Now extracts context from `context` object, not `action_id`
   - Updated both main and fallback handlers

2. **lib/send-follow-up-buttons-message.ts** (line 17)
   - Added missing `sendCardMessage` import

---

## Session Notes

- **Commit**: `8d94279` Fix: Extract button context directly from Feishu callback data
- **What was wrong**: action_id isn't sent back by Feishu in button callbacks
- **What's fixed**: Now using Feishu's native context.open_chat_id and context.open_message_id
- **Why it works**: Feishu always includes these fields, extraction is much more reliable

---

## Implementation Flow

```
User clicks "Tell me more" button
    ↓
Feishu sends card.action.trigger webhook with:
  - context.open_chat_id = "oc_xyz123"
  - context.open_message_id = "om_abc456"
  - action.value = "Tell me more"
    ↓
Server receives in card.action.trigger handler
    ↓
Extracts: chatId="oc_xyz123", rootId="om_abc456"
    ↓
Routes to: handleButtonFollowup()
    ↓
Calls: handleNewMessage() with button text as message
    ↓
Response generated with streaming
    ↓
Sent as reply to rootId (thread)
    ↓
New suggestions sent
    ↓
User sees: Natural conversation continuation
```

---

**Ready to test! Go click some buttons and verify it works end-to-end.** 🎉
