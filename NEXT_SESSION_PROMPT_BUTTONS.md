# Next Session - Button Click Handler Implementation

**Previous Session**: 2025-11-21 (Button UI implementation completed)  
**Current Session**: 2025-11-21 (Button callbacks not working)  
**Issue**: bd-s5p (in_progress)

## Current Status

✅ **Completed This Session:**
- Fixed button UI rendering (Card JSON 2.0 button components)
- Buttons appear in thread as separate message
- Auto-generated suggestions based on response content
- Dynamic follow-up generation working correctly

❌ **Still Needed:**
- Handle button click callbacks
- Pass clicked button value back to model
- Generate response to button click
- Send response in thread (continuing conversation)

## The Problem

When user clicks a suggestion button in Feishu:
1. Button click event is sent to bot (callback)
2. Bot receives callback but doesn't process it
3. No new response is generated
4. User sees no change (feels broken)

**Expected flow:**
```
User clicks "Tell me more" button
        ↓
Bot receives callback with value="Tell me more"
        ↓
Bot treats it like user sent message "Tell me more"
        ↓
Bot generates response (streaming)
        ↓
Response appears in thread as new reply
```

## Technical Details

### Where Button Callbacks Come In

Buttons are configured in `lib/send-follow-up-buttons-message.ts`:
```typescript
{
  tag: "button",
  text: { content: "Tell me more", tag: "plain_text" },
  type: "primary",
  behaviors: [
    {
      type: "callback",
      value: followup.text,  // This gets sent when clicked
    },
  ],
}
```

When user clicks, Feishu sends HTTP POST with callback data.

### Where to Handle It

Check `lib/handle-card-action.ts`:
- This likely handles card interaction callbacks
- Need to check if it handles button callbacks
- If not, need to implement button callback handling

### What Needs to Happen

1. **Detect button click callback** in `handle-card-action.ts`
2. **Extract button value** from callback payload
3. **Get context** (conversation ID, thread ID, root message ID)
4. **Fetch thread context** (previous messages in thread)
5. **Call generateResponse** with button value as user message
6. **Stream response** in thread as new message

### Key Files to Check/Modify

- `lib/handle-card-action.ts` - Button callback handler (main work)
- `lib/handle-messages.ts` - Message handling pattern to follow
- `lib/feishu-utils.ts` - Thread context fetching
- `lib/generate-response.ts` - Response generation
- `server.ts` - Event routing (make sure card callbacks are routed here)

## Implementation Approach

### Step 1: Understand Current Callback Handler
```bash
# Check what handle-card-action.ts currently does
cat lib/handle-card-action.ts | head -100
```

### Step 2: Add Button Click Detection
Feishu callback structure (when button clicked):
```json
{
  "type": "card_action",
  "action": {
    "type": "callback",
    "value": "Tell me more"  // Button value
  },
  "context": {
    "open_message_id": "...",  // Original message ID
    "open_chat_id": "...",     // Chat ID
    "open_id": "...",          // User ID
    "user_id": "..."
  }
}
```

### Step 3: Implement Response Handler
Pseudocode:
```typescript
async function handleButtonClick(callbackData) {
  const buttonValue = callbackData.action.value;  // e.g., "Tell me more"
  const chatId = callbackData.context.open_chat_id;
  const messageId = callbackData.context.open_message_id;  // Root message
  const userId = callbackData.context.user_id;
  
  // Get thread context (previous messages in conversation)
  const threadMessages = await getThreadMessages(chatId, messageId);
  
  // Generate response to button click
  const response = await generateResponse(
    [
      ...threadMessages,
      { role: "user", content: buttonValue }  // Treat button as user message
    ],
    // ... other params
  );
  
  // Send response in thread
  await streamResponseToThread(response);
}
```

### Step 4: Send Response in Thread
Use `im.message.reply` to keep response in same thread:
```typescript
await feishuClient.im.message.reply({
  path: { message_id: rootMessageId },
  data: {
    msg_type: "interactive",
    content: JSON.stringify({ type: "card", data: { card_id: newCardId } }),
    reply_in_thread: true,
  },
});
```

## Testing Plan

1. Test with simple query: "What is AI?"
2. Wait for suggestions to appear
3. Click "Tell me more" button
4. Check:
   - ✅ New response appears in thread
   - ✅ Response is relevant to button click
   - ✅ Response streams normally
   - ✅ New suggestion buttons appear

4. Click another suggestion
5. Verify chain continues (can keep clicking suggestions)

## Success Criteria

- ✅ Button click triggers response generation
- ✅ Response appears in thread (not standalone)
- ✅ Response includes new suggestion buttons
- ✅ Can chain multiple button clicks
- ✅ Context is preserved (bot remembers conversation)

## Files Modified This Session

- `lib/send-follow-up-buttons-message.ts` - Button UI (completed)
- `lib/tools/generate-followups-tool.ts` - Follow-up generation (completed)
- `lib/handle-card-action.ts` - Button callbacks (TODO)
- `server.ts` - Event routing (verify, may need update)

## Debugging Tips

**If button click doesn't trigger response:**
1. Check server logs for callback event: `grep "card_action\|button" server.log`
2. Verify callback is being received: `grep "action\|callback" server.log`
3. Check if handler is being called: Add logging in `handle-card-action.ts`

**If response doesn't appear in thread:**
1. Verify `reply_in_thread: true` is set
2. Check correct message ID is being used
3. Verify response generation is working

**If context is lost:**
1. Verify thread messages are being fetched
2. Check conversation history is preserved
3. Ensure all messages are passed to response generator

## References

- `lib/handle-messages.ts` - Good pattern for message handling
- `lib/finalize-card-with-buttons.ts` - How we send cards
- `lib/feishu-utils.ts` - Feishu API patterns

## Next Steps for You

1. **Examine current callback handler**: Check what `handle-card-action.ts` does
2. **Add button click detection**: Identify button callbacks in payload
3. **Implement response generation**: Reuse existing `generateResponse` function
4. **Test with real clicks**: Verify responses work in thread
5. **Chain suggestions**: Ensure multiple clicks work in sequence

This is the final piece to make the suggestion buttons fully functional!
