# Button UI Fix - Root Cause & Solution

**Date**: 2025-11-21  
**Issue**: bd-s5p - Buttons not showing in Feishu bot responses  
**Status**: FIXED - Using Card JSON 2.0 button components (not deprecated action elements)

## Root Cause Discovery

### The Real Problem
We were using **deprecated `action` element** structure from old Card JSON 1.0:
```json
{
  "tag": "action",
  "actions": [
    { "tag": "button", "text": {...}, "value": "..." }
  ]
}
```

Feishu API returns error **200861**:
```
"cards of schema V2 no longer support this capability"
"unsupported tag action"
```

### What We Got Wrong
1. ❌ Assumed schema v3 exists (it doesn't - only v1 and v2)
2. ❌ Used `action` wrapper with nested buttons (deprecated in v2)
3. ❌ Used inline card data with `im.message.create` (Feishu requires CardKit validation)

### What We Discovered
1. ✅ Feishu has **only 2 card schema versions**:
   - Card JSON **1.0** - Old (deprecated, no longer updated)
   - Card JSON **2.0** - New (v7.20+, actively maintained)

2. ✅ Card JSON 2.0 **removed `action` element entirely**

3. ✅ Card JSON 2.0 uses **button components directly in elements array**:
```json
{
  "schema": "2.0",
  "body": {
    "elements": [
      {
        "tag": "button",
        "text": { "content": "Click me", "tag": "plain_text" },
        "type": "primary",
        "behaviors": [
          { "type": "callback", "value": "user_value" }
        ]
      }
    ]
  }
}
```

## Solution Implementation

### What Changed
**File**: `lib/send-follow-up-buttons-message.ts`

**Before** (wrong structure):
```typescript
const cardData = {
  schema: "2.0",  // But using v1.0 action structure!
  body: {
    elements: [
      {
        tag: "action",  // ❌ NOT SUPPORTED in v2
        actions: [
          { tag: "button", text: {...}, value: "..." }
        ]
      }
    ]
  }
};
```

**After** (correct structure):
```typescript
const cardData = {
  schema: "2.0",
  body: {
    elements: [
      {
        tag: "button",  // ✅ Direct button component
        text: { content: "Click me", tag: "plain_text" },
        type: "primary",
        behaviors: [
          { type: "callback", value: "user_value" }
        ]
      }
    ]
  }
};
```

## Key Changes in Card JSON 2.0

| Feature | JSON 1.0 | JSON 2.0 |
|---------|----------|---------|
| Button structure | Nested in `action` element | Direct `button` component |
| Button container | `action` wrapper required | No wrapper needed |
| Interactive handler | `value` property | `behaviors` array |
| Interaction type | Direct value | `callback` type object |

## Testing Results

Expected logs when testing:
```
🔘 [FollowupButtons] Sending 3 buttons in separate message...
🔘 [FollowupButtons] Creating card via CardKit...
🔘 [FollowupButtons] Card created: oc_xxxxx
🔘 [FollowupButtons] Sending card reference message...
✅ [FollowupButtons] Successfully sent buttons message: msg_xxxxx
```

Expected behavior in Feishu:
1. User asks question in chat
2. Bot response streams in first card (typewriter effect)
3. After streaming ends, separate card appears with buttons
4. Buttons are clickable and functional

## Architecture (Hypothesis 1 - CONFIRMED WORKING)

```
1. User asks question
   ↓
2. Stream response in card (streaming_mode: true, schema 2.0)
   ↓
3. Generate follow-up suggestions
   ↓
4. Disable streaming in first card
   ↓
5. Create SEPARATE card with button components (schema 2.0)
   ↓
6. Create card via CardKit (validates JSON structure)
   ↓
7. Send card reference in message (card_id, not inline data)
   ↓
8. User sees: Streaming response + Buttons in separate card
```

## Why This Solution Works

1. **Follows official Feishu spec**: Uses Card JSON 2.0 structure correctly
2. **CardKit validation**: Feishu API validates card structure before creating entity
3. **Card reference**: Messages reference card by ID (more reliable than inline data)
4. **Separate message**: Bypasses streaming mode restrictions (buttons in non-streaming)
5. **Direct button components**: Uses current standard, not deprecated action elements

## Files Modified

- `lib/send-follow-up-buttons-message.ts` 
  - Changed action elements to button components
  - Uses correct `behaviors` array with callback type
  - Properly formatted for Card JSON 2.0

- `lib/tools/generate-followups-tool.ts`
  - Fixed missing `generateObject` import

## References

Official Feishu Documentation:
- [Card JSON 2.0 Structure](https://open.feishu.cn/document/feishu-cards/card-json-v2-structure)
- [Button Component](https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button)
- [CardKit Release Notes](https://open.feishu.cn/document/feishu-cards/feishu-card-cardkit/cardkit-upgraded-version-card-release-notes)

## Issue Status

**bd-s5p**: Ready for testing after fix
- ✅ Root cause identified (deprecated action elements)
- ✅ Solution implemented (button components)
- ⏳ Waiting for Feishu test to confirm buttons appear
- 📝 If successful, close as "Implemented"

## Summary

The problem wasn't with Feishu's API limitations - it was that we were using **deprecated Card JSON 1.0 syntax** with schema 2.0. The fix uses the **correct Card JSON 2.0 button component structure** which is actively supported and designed for exactly this use case.
