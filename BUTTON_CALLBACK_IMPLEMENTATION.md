# Button Click Handler Implementation

**Date**: 2025-11-21  
**Issue**: Button callbacks not being handled properly  
**Status**: ✅ IMPLEMENTED (needs real Feishu testing)

## Problem

When users click suggestion buttons in Feishu:
1. Button click event was being received by the server
2. But no response was generated to the button click
3. User saw no change (felt broken)

## Root Cause

The button context (chatId, rootId) wasn't being passed from the button card to the callback handler. When buttons were clicked:
- The action_id field was not set on buttons
- The callback had no way to know which conversation/thread the button belonged to
- The handler couldn't route the response to the correct thread

## Solution Implemented

### 1. **Encode Context in Button Action IDs** (`lib/send-follow-up-buttons-message.ts`)

When sending follow-up buttons, we now encode the conversation context in the button's `id` field:

```typescript
const contextPrefix = `${conversationId}|${rootId}`;
const actionId = `${contextPrefix}|${index}`;

return {
  tag: "button",
  text: { content: followup.text, tag: "plain_text" },
  type: isFirst ? "primary" : "default",
  id: actionId,  // ← Context encoded here
  behaviors: [
    {
      type: "callback",
      value: followup.text,  // Button text sent as callback value
    },
  ],
};
```

**Format**: `chatId|rootId|buttonIndex`

Example: `oc_abc123|msg_xyz789|0`

### 2. **Extract Context from Action ID** (`lib/handle-button-followup.ts`)

Updated `extractButtonFollowupContext()` to parse context from the action_id:

```typescript
if (actionId && typeof actionId === "string") {
  const parts = actionId.split("|");
  if (parts.length >= 2) {
    extractedChatId = parts[0];
    extractedRootId = parts[1];
  }
}
```

This gives the handler the chatId and rootId needed to:
- Know which chat to send response to
- Know which thread to reply in
- Preserve conversation history

### 3. **Improved Server Routing** (`server.ts`)

Updated the card webhook handler to better parse the action_id:

```typescript
const actionId = cardActionPayload.event?.action?.action_id;
let chatId = "";

if (actionId && typeof actionId === "string" && actionId.includes("|")) {
  // Parse context from action_id (chatId|rootId|index)
  const parts = actionId.split("|");
  chatId = parts[0];
}
```

This ensures:
- Proper parsing of encoded context
- Clear logging of extracted values
- Fallback to app_id if format doesn't match

## Files Modified

1. **lib/send-follow-up-buttons-message.ts** (lines 27-84)
   - Added context encoding to button action_ids
   - Logs context being embedded

2. **lib/handle-button-followup.ts** (lines 101-153)
   - Parse action_id format: `chatId|rootId|index`
   - Extract chatId and rootId from context
   - Pass extracted values to response handler

3. **server.ts** (lines 274-326)
   - Improved action_id parsing
   - Better error handling and logging
   - Clear context extraction flow

## How It Works

### User Flow
```
User asks question
         ↓
Bot responds with suggestions as buttons
  (buttons have id="chatId|rootId|index")
         ↓
User clicks "Tell me more" button
         ↓
Feishu sends callback with action_id="chatId|rootId|0"
         ↓
Server parses action_id to extract chatId and rootId
         ↓
Server treats button value as new user message
         ↓
Bot generates response in same conversation thread
         ↓
Response appears as reply in thread
```

### Technical Flow
```
sendFollowupButtonsMessage()
  ↓ (encodes context in button id)
Button element with id="oc_abc|msg_xyz|0"
  ↓ (user clicks)
Feishu webhook: /webhook/card (receives callback)
  ↓ (extracts action_id)
extractButtonFollowupContext()
  ↓ (parses action_id, splits on "|")
ButtonFollowupContext { chatId, rootId, buttonValue }
  ↓ (routes to message handler)
handleNewMessage() or handleNewAppMention()
  ↓ (generates response)
Response sent to chatId in rootId thread
```

## Testing Checklist

- [x] Build succeeds without errors
- [x] Server starts and responds to card webhooks
- [x] Action_id context is properly parsed
- [ ] Real Feishu test: Send message, get suggestions, click button
- [ ] Verify response appears in thread (not standalone)
- [ ] Verify conversation context is preserved (bot remembers previous messages)
- [ ] Verify new suggestions appear on button-clicked response
- [ ] Test chaining: Click button → get new response → click new button (repeat)

## Expected Behavior (After Testing)

1. **Button Click Detected**: Server receives callback with encoded context
2. **Context Extracted**: chatId and rootId are parsed from action_id
3. **Response Generated**: Bot treats button value as user message
4. **Reply in Thread**: Response sent as reply to root message (maintains thread)
5. **Suggestions Repeat**: New follow-up suggestions appear on new response
6. **Chain Works**: User can click multiple suggestions in sequence

## Logs to Watch For

When button is clicked, you should see:

```
🔘 [CardAction] Detected button followup action: "Tell me more"
🔘 [CardAction] Extracted chatId from action_id: oc_abc123
✅ [ButtonFollowup] Extracted context from action_id: chatId=oc_abc123, rootId=msg_xyz789
🔘 [ButtonFollowup] Processing button click as new query: buttonValue="Tell me more", chatId=oc_abc123, rootId=msg_xyz789
💬 [ButtonFollowup] Routing to message handler: "Tell me more"
✅ [ButtonFollowup] Button followup processed successfully
```

## Backward Compatibility

- ✅ Old buttons without context in action_id still work (fallback to app_id)
- ✅ Text-based suggestions still appear in response
- ✅ Existing message handling unchanged
- ✅ No breaking changes to APIs or data structures

## Next Steps

1. Deploy changes and test with real Feishu
2. Monitor logs for button clicks
3. Verify full conversation flow
4. If issues found, adjust context encoding format
5. Document any Feishu-specific quirks discovered

## References

- Feishu Card JSON 2.0: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button
- Card Action Callbacks: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication
- Previous session prompt: NEXT_SESSION_PROMPT_BUTTONS.md
