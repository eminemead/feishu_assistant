# User Mention Extraction Fix

## Issue

Bot could not extract the mentioned user ID when @user was mentioned alongside @bot.

**Example:**
```
@bot @some_user What is OKR?
```

Expected: Extract `some_user`'s ID for memory context
Actual: Extracted bot's own ID (or wrong user)

## Root Cause

The extraction logic blindly took the **first mention** from the array:

```typescript
const firstMention = mentions[0];  // ← Could be @bot or @user
mentionedUserId = firstMention.id?.open_id;
```

When both @bot and @user are mentioned, the order depends on Feishu's ordering. If @bot is first, we get the bot's ID instead of the user's.

## Solution

Now **skips the bot mention** and finds the actual user:

```typescript
const userMention = mentions.find(mention => {
  const mentionId = mention.id?.open_id || mention.id?.user_id;
  return mentionId && mentionId !== botUserId;  // ← Skip bot
});
```

### Logic Flow

1. Iterate through all mentions
2. Skip the bot mention (compare to botUserId)
3. Use the first non-bot mention as the addressed user
4. Extract that user's ID for memory context

## Changes

**File:** server.ts (lines 205-227)
**Commit:** f6f1a52

### Before
```typescript
if (mentions.length > 0) {
  const firstMention = mentions[0];
  mentionedUserId = firstMention.id?.open_id || ...;
}
```

### After
```typescript
if (mentions.length > 0) {
  const userMention = mentions.find(mention => {
    const mentionId = mention.id?.open_id || mention.id?.user_id;
    return mentionId && mentionId !== botUserId;
  });

  if (userMention) {
    mentionedUserId = userMention.id?.open_id || ...;
  }
}
```

## Expected Behavior

### Scenario 1: @bot @user
```
Message: "@bot @john_doe What is OKR?"

Mentions array: [
  { id: { open_id: "cli_a6af6b76c6f0d013" }, name: "bot" },
  { id: { open_id: "ou_xyz123" }, name: "John Doe" }
]

Expected extraction: ou_xyz123 (John Doe)
```

**Logs:**
```
🔍 [WebSocket] Mentions array: [bot, john_doe]
✅ [WebSocket] Bot mention detected in mentions array
📌 [WebSocket] Extracted mentioned user ID: ou_xyz123 (John Doe)
💾 [WebSocket] Using user ID for memory context: ou_xyz123
```

### Scenario 2: @user @bot
```
Message: "@jane_smith @bot What is OKR?"

Mentions array: [
  { id: { open_id: "ou_abc456" }, name: "Jane Smith" },
  { id: { open_id: "cli_a6af6b76c6f0d013" }, name: "bot" }
]

Expected extraction: ou_abc456 (Jane Smith)
```

**Logs:**
```
🔍 [WebSocket] Mentions array: [jane_smith, bot]
✅ [WebSocket] Bot mention detected in mentions array
📌 [WebSocket] Extracted mentioned user ID: ou_abc456 (Jane Smith)
💾 [WebSocket] Using user ID for memory context: ou_abc456
```

### Scenario 3: @bot (no user mention)
```
Message: "@bot What is OKR?"

Mentions array: [
  { id: { open_id: "cli_a6af6b76c6f0d013" }, name: "bot" }
]

Expected extraction: none
```

**Logs:**
```
🔍 [WebSocket] Mentions array: [bot]
✅ [WebSocket] Bot mention detected in mentions array
🔍 [WebSocket] No user mention found (only bot mention)
💾 [WebSocket] Using user ID for memory context: null (fallback to sender)
```

## Memory Context Impact

With correct user extraction:

1. **Q1: @bot @user What is OKR?**
   - Extracts user ID correctly ✓
   - Creates memory thread scoped to that user ✓
   - Saves messages under user's context ✓

2. **Q2 (follow-up): @bot Tell me more**
   - Uses same user ID from message thread ✓
   - Loads prior messages from memory ✓
   - Response has full context ✓

## Testing

Send to test group:
```
@bot @your_name What are the key principles of OKR setting?
```

Check logs for:
```
📌 [WebSocket] Extracted mentioned user ID: ou_xxxxx (your_name)
💾 [WebSocket] Using user ID for memory context: ou_xxxxx
```

Then send follow-up to verify memory loads context from first message.

## Related Issues

- bd-yce: Cannot extract mentioned user ID in @bot messages
- bd-77l: Complete Mastra Memory message persistence implementation (depends on correct user ID)
- bd-lra: Phase 5c: Memory Persistence Validation (testing)

## Status

✅ Fix deployed
✅ Server restarted
⏳ Ready for testing

Next: Send @bot @user messages to verify extraction works and memory context persists.
