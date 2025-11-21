# Button Testing Session 3 - Context Fix (2025-11-21)

## Problem Found

During real-world testing, the button click handler wasn't working because:
- Previous assumption: `action_id` field would contain encoded context (chatId|rootId|index)
- **Actual Feishu behavior**: Feishu doesn't send `action_id` back in the button callback
- Result: Context extraction was failing, buttons weren't being processed

## Root Cause

The Feishu callback for `card.action.trigger` includes:
```json
{
  "context": {
    "open_chat_id": "oc_xyz123",
    "open_message_id": "om_abc456"
  },
  "operator": {
    "user_id": "username",
    "open_id": "ou_xyz123"
  },
  "action": {
    "value": "Button text clicked",
    "tag": "button"
  }
}
```

But does **NOT** include `action_id` in the button callback (even though we put it in the button definition).

## Solution Implemented

Changed context extraction to use Feishu's native callback fields instead of encoded action_id:

```typescript
// OLD (broken)
const actionId = (data as any).action?.action_id;
const parts = actionId.split("|");
const chatId = parts[0];
const rootId = parts[1];

// NEW (working)
const context = (data as any).context || {};
const chatId = context.open_chat_id || "";
const rootId = context.open_message_id || "";
```

## Changes Made

**File: server.ts**
- Updated `card.action.trigger` handler to extract context from `context` object
- Updated fallback `card.action.trigger_v1` handler
- Changed userId extraction to use `operator.open_id` or `operator.user_id`
- Removed unnecessary action_id encoding from buttons

**File: lib/send-follow-up-buttons-message.ts**
- Added missing `sendCardMessage` import from feishu-utils
- Kept button creation simple (no need for complex action_id encoding)

## Testing Results

After fix:
- Buttons receive context directly from Feishu callback
- `open_chat_id` and `open_message_id` are always present
- Context extraction is more reliable (no parsing needed)
- Handler can process button clicks correctly

## Commit

```
8d94279 Fix: Extract button context directly from Feishu callback data
```

## Next Testing

Follow the testing instructions in NEXT_SESSION_PROMPT_REAL_TEST.md:

1. Send a message to the bot in Feishu
2. Click a suggestion button
3. Verify:
   - ✅ No error appears
   - ✅ Response appears in thread
   - ✅ New suggestions appear
   - ✅ Server logs show context extraction succeeded

Expected logs:
```
🔘 [CardAction] Card action trigger received
🔘 [CardAction] Button clicked: "Tell me more"
🔘 [CardAction] Extracted context: chatId=oc_abc123, rootId=om_xyz789
✅ [CardAction] Button followup processed successfully
```
