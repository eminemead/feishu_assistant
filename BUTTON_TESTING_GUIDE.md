# Button Click Handler Testing Guide

**Status**: Ready for real Feishu testing  
**Implementation Date**: 2025-11-21

## Quick Start

The button click handler implementation is complete. To test:

1. **Start the server** (if not running):
   ```bash
   bun run dev
   # Server listens on http://localhost:3000
   ```

2. **Send a message to the bot in Feishu**
   - Open Feishu group chat or direct message
   - Send a question (e.g., "What is AI?")
   - Wait for response with suggestion buttons

3. **Click a suggestion button**
   - Button text appears as separate message with interactive buttons
   - Click any button (e.g., "Tell me more")

4. **Verify the response**
   - Response should appear in the same thread
   - Not as a standalone message
   - Should include new suggestion buttons
   - Can click again to chain suggestions

## What We Implemented

### Context Encoding in Buttons

Buttons now include conversation context in their `id` field:

```
id="oc_chatId|msg_rootId|buttonIndex"
```

When clicked, Feishu sends the action_id back to our server, allowing us to:
- Know which chat to respond in
- Know which thread to reply to
- Maintain conversation context

### Server-Side Processing

When button is clicked:

1. **Webhook receives callback**
   ```
   POST /webhook/card
   {
     "event": {
       "action": {
         "action_id": "oc_abc123|msg_xyz789|0",
         "value": "Tell me more about this"
       }
     }
   }
   ```

2. **Server parses action_id**
   - Splits on "|" to extract chatId and rootId
   - Logs: `Extracted chatId from action_id: oc_abc123`

3. **Routes to message handler**
   - Button value "Tell me more" becomes new user message
   - Uses extracted rootId to maintain thread
   - Preserves conversation history

4. **Generates response**
   - Response streaming works same as regular messages
   - Suggestions are auto-generated
   - Buttons sent in separate message

## Testing Checklist

### ✅ Basic Flow

- [ ] Send message to bot
- [ ] Wait for response with suggestions
- [ ] Verify buttons appear in separate message
- [ ] Button text is readable and visible
- [ ] Click a button without errors

### ✅ Response Quality

- [ ] Response appears in thread (same conversation)
- [ ] Response is relevant to button click
- [ ] Response includes suggestions/buttons
- [ ] New buttons are clickable

### ✅ Conversation Context

- [ ] Bot remembers previous messages
- [ ] Response references previous context
- [ ] Conversation flows naturally
- [ ] Multiple button clicks work in sequence

### ✅ Edge Cases

- [ ] Click multiple buttons in sequence
- [ ] Click same button twice
- [ ] Wait long time then click button
- [ ] Multiple users clicking in same chat

### ✅ Server Stability

- [ ] No crashes when button clicked
- [ ] No memory leaks with repeated clicks
- [ ] Server logs are clean (no errors)
- [ ] Timeout handling works

## Log Monitoring

Watch server logs while testing:

```bash
# In another terminal, watch logs
tail -f server.log | grep -E "CardAction|ButtonFollowup|Button clicked|Extracted"
```

### Expected Log Sequence

```
🔘 [CardAction] Detected button followup action: "Tell me more about this"
🔘 [CardAction] Extracted chatId from action_id: oc_abc123
✅ [ButtonFollowup] Extracted context from action_id: chatId=oc_abc123, rootId=msg_xyz789
🔘 [ButtonFollowup] Processing button click as new query: buttonValue="Tell me more about this", chatId=oc_abc123, rootId=msg_xyz789
💬 [ButtonFollowup] Routing to message handler: "Tell me more about this"
...
✅ [CardSuggestions] Buttons sent in separate message: msg_abc999
✅ [ButtonFollowup] Button followup processed successfully
```

### If Something Goes Wrong

**Button click not received:**
- Check `/webhook/card` endpoint is reachable
- Verify Feishu callback URL is configured correctly
- Check firewall/network allows Feishu to reach your server

**Response not in thread:**
- Check server logs for rootId extraction
- Verify `rootId` is correct (should be root message ID)
- Check if `reply_in_thread: true` is being set

**Suggestions not appearing:**
- Check `generateFollowupQuestions` is working
- Verify response content is long enough to generate suggestions
- Check for errors in "CardSuggestions" logs

**Context lost between clicks:**
- Verify action_id format: `chatId|rootId|index`
- Check parsing splits on "|" correctly
- Monitor logs for "Extracted context" message

## Debugging Tips

### Add Extra Logging

In `server.ts`, add before button handler:

```typescript
console.log(`🔍 [DEBUG] Raw payload:`, JSON.stringify(cardActionPayload, null, 2));
console.log(`🔍 [DEBUG] action_id:`, cardActionPayload.event?.action?.action_id);
console.log(`🔍 [DEBUG] action_value:`, cardActionPayload.event?.action?.value);
```

### Test Context Encoding

In send-follow-up-buttons-message.ts, verify button elements:

```typescript
console.log(`🔍 [DEBUG] Button element:`, JSON.stringify(buttonElements[0], null, 2));
```

### Monitor Memory Usage

While running tests:

```bash
watch -n 1 'ps aux | grep "bun run dev" | head -1'
```

## Expected Results

✅ **Success**: User clicks button → response appears in thread → suggestions work

```
User: "What is AI?"
Bot: [response card]
Bot: [suggestion buttons: "Tell me more", "Give examples", "History"]

User clicks "Tell me more"
↓
Bot: [response to "Tell me more"]
Bot: [new suggestion buttons]

User clicks new button
↓
... (can chain indefinitely)
```

## Known Limitations

- Action_id format is simple (pipe-separated), not encrypted
- If chatId/rootId contain special characters, may need encoding
- Very long button text (100+ chars) may break formatting
- Maximum suggestions per response: 3 (configurable)

## Files to Monitor

When testing, these files handle button clicks:

1. **server.ts** (line 247-327)
   - `/webhook/card` endpoint
   - Parses callback payload
   - Routes to handleButtonFollowup

2. **lib/handle-button-followup.ts**
   - `extractButtonFollowupContext()` - Parses action_id
   - `handleButtonFollowup()` - Routes to message handler

3. **lib/handle-messages.ts** (line 19-52)
   - `handleNewMessage()` - Processes button value as user message
   - Calls generateResponse
   - Sends response in thread

4. **lib/send-follow-up-buttons-message.ts** (line 39-125)
   - `sendFollowupButtonsMessage()` - Sends buttons with context
   - Encodes chatId|rootId in button id

5. **lib/finalize-card-with-buttons.ts** (line 59-150)
   - `finalizeCardWithFollowups()` - Called when response ready
   - Generates suggestions
   - Calls sendFollowupButtonsMessage

## Success Criteria

✅ All of the following must work:

1. Button clicks are received by server
2. Context (chatId, rootId) is correctly extracted
3. Response is generated to button value
4. Response appears in thread (not standalone)
5. New suggestions are generated
6. User can click new suggestions to chain
7. Server logs are clean (no errors)
8. No memory leaks with repeated clicking

## Next Steps After Testing

If basic testing works:

1. **Load test**: Click buttons rapidly, stress test
2. **Integration test**: Test with real models (not just mocks)
3. **Performance**: Measure response time from click to reply
4. **User feedback**: Have users try it, gather feedback
5. **Deploy**: Roll out to production if stable

## Rollback Plan

If critical issues found:

1. Revert changes to:
   - `server.ts`
   - `lib/handle-button-followup.ts`
   - `lib/handle-messages.ts`
   - `lib/send-follow-up-buttons-message.ts`

2. Server will still send suggestions (in text form)
3. Buttons will just not work as before
4. No data loss, no user impact

---

**Questions or Issues?** Check the implementation document: `BUTTON_CALLBACK_IMPLEMENTATION.md`
