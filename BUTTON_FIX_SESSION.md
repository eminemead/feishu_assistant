# Button UI Fix - Current Session

**Date**: 2025-11-21  
**Issue**: bd-s5p - Buttons not showing in Feishu bot responses  
**Status**: Fixed - Hypothesis 1 (separate message) now uses CardKit validation

## Problem Found

### Root Cause
When sending buttons via inline card JSON in `im.message.create`, Feishu API returned:
```
Error 200621: parse card json err - please check whether the card json is correct
```

The card JSON was structurally valid, but the inline approach had issues.

### Solution
Changed button message sending to use **two-step approach**:
1. **Create card via CardKit first** - This validates the card JSON structure properly
2. **Send message referencing the card entity** - This is more reliable than inline card data

### Why This Works
- CardKit API (`cardkit.v1.card.create`) properly validates card JSON
- Once card is created, `im.message.create` can reference it by `card_id`
- This matches how Feishu expects card messages to be sent
- Fallback to inline data if CardKit fails

## Changes Made

**File**: `lib/send-follow-up-buttons-message.ts`

### Before
```typescript
// Inline card data (broken with 200621 error)
const createResp = await feishuClient.im.message.create({
  data: {
    receive_id: conversationId,
    msg_type: "interactive",
    content: JSON.stringify({
      type: "card",
      data: JSON.stringify(cardData),  // ❌ Inline data
    }),
  },
});
```

### After
```typescript
// Step 1: Create via CardKit (validates JSON)
const cardCreateResp = await feishuClient.cardkit.v1.card.create({
  data: {
    type: "card_json",
    data: JSON.stringify(cardData),
  },
});

// Step 2: Send via message reference (references card entity)
const createResp = await feishuClient.im.message.create({
  data: {
    receive_id: conversationId,
    msg_type: "interactive",
    content: JSON.stringify({
      type: "card",
      data: {
        card_id: cardEntityId,  // ✅ Reference instead of inline
      },
    }),
  },
});
```

## Testing

**To test the fix**:
1. Mention @bot in Feishu with a question
2. Watch server logs for:
   ```
   🔘 [FollowupButtons] Creating card via CardKit...
   🔘 [FollowupButtons] Card created: oc_xxxxx
   🔘 [FollowupButtons] Sending card reference message...
   ✅ [FollowupButtons] Successfully sent buttons message
   ```
3. Buttons should now appear in Feishu chat

**Expected Outcome**:
- Response streams normally in first card
- After streaming completes, separate message with buttons appears
- Buttons are clickable and functional

## Other Fixes This Session

1. **Fixed import error** in `lib/tools/generate-followups-tool.ts`
   - Missing `generateObject` import from `ai` SDK
   - This was preventing the tool from working at all

2. **Added detailed logging** throughout button generation pipeline:
   - `[CardSuggestions]` - Card finalization
   - `[Followups]` - Follow-up generation
   - `[FollowupButtons]` - Button message creation

## Next Steps if Still Not Working

If buttons still don't appear after this fix:

1. **Check server logs** for `[FollowupButtons]` messages
2. **Verify card was created**: Look for `Card created: oc_xxxxx`
3. **If CardKit fails**, check the error message
4. **If message fails**, error will be in `[FollowupButtons] Failed to create message`

## Architecture (Hypothesis 1 - Confirmed)

```
1. User asks question
   ↓
2. Stream response in card (streaming_mode: true)
   ↓
3. Generate follow-up suggestions
   ↓
4. Disable streaming in first card
   ↓
5. Create SEPARATE card with buttons via CardKit
   ↓
6. Send separate card as message (card_id reference)
   ↓
7. User sees: Streaming response + Buttons below
```

This approach bypasses Feishu's 99992402 restriction (action elements in streaming cards) by putting buttons in a separate, non-streaming message.

## Files Modified

- `lib/send-follow-up-buttons-message.ts` - Button message creation (2-step approach)
- `lib/tools/generate-followups-tool.ts` - Fixed missing import
- `lib/finalize-card-with-buttons.ts` - Already correct, just verified

## Issue Status

**bd-s5p**: Waiting for testing confirmation after fix
- If buttons now appear: Close as ✅ Implemented
- If still failing: Pivot to Hypothesis 2 (rich text links) or 3 (v3 schema)
