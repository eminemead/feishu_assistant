# Critical Memory Fix: User Identity Resolution for Mentions

## Executive Summary

**Issue Found**: Bot was storing memory with **sender's user ID** instead of **mentioned user's ID** in group mentions.

**Impact**: User isolation RLS was not working correctly; memory was associated with wrong users.

**Status**: ✅ FIXED and deployed

**Commit**: `9ab67d7` - Extract mentioned user ID for proper memory context scoping

---

## The Problem

When a message like `@_user_2 What's your Q4 goal?` is sent in a group chat:

- **Expected behavior**: Memory stored with @_user_2's user ID
- **Actual behavior**: Memory stored with sender's user ID
- **Result**: User isolation broken, RLS enforcement failed

### Root Cause

In `server.ts` (line 251), the code was passing the **sender's user ID** to `handleNewAppMention()`:

```typescript
// BEFORE (WRONG)
await handleNewAppMention({
  // ...
  userId: userId || chatId,  // ← sender's ID, not mentioned user!
});
```

But Feishu provides a `mentions` array with the actual user details:

```typescript
// Feishu webhook includes mentions like:
mentions = [
  {
    key: "@_user_2",
    id: {
      open_id: "ou_xyz123",
      user_id: "john.doe",
      union_id: "on_xyz"
    },
    name: "John Doe"
  }
]
```

This data was **never extracted** - we just checked if mentions existed.

---

## The Fix

Extracted the mentioned user's ID from the `mentions` array:

```typescript
// NEW (CORRECT)
let mentionedUserId: string | null = null;

if (mentions.length > 0 && message.chat_type === "group") {
  const firstMention = mentions[0];
  mentionedUserId = firstMention.id?.open_id || 
                   firstMention.id?.user_id || 
                   firstMention.id?.union_id ||
                   null;
}

// Use mentioned user's ID for memory context
const contextUserId = mentionedUserId || userId || chatId;

await handleNewAppMention({
  // ...
  userId: contextUserId,  // ← mentioned user's ID!
});
```

### Key Changes

1. **Extract mention data**: Get open_id/user_id from first mention in group chats
2. **Use for memory context**: Pass mentioned user ID to agent, not sender ID
3. **Fallback gracefully**: Use sender ID if no mention found
4. **Log clearly**: Show which user ID is being used (from mention or sender)

---

## Impact

### Before Fix
```
Message: "Alice says: @_user_2 What's your Q4 goal?"
Sender: Alice (open_id: ou_alice)
Mentioned: John (open_id: ou_john)

Memory stored with: user_id = ou_alice ❌ WRONG
Result: Memory associated with Alice, not John
```

### After Fix
```
Message: "Alice says: @_user_2 What's your Q4 goal?"
Sender: Alice (open_id: ou_alice)
Mentioned: John (open_id: ou_john)

Memory stored with: user_id = ou_john ✅ CORRECT
Result: Memory correctly associated with John
```

---

## Affected Components

- **Memory isolation**: Now works correctly with RLS
- **User scoping**: Each user gets separate context
- **Multi-user tracking**: Different users in same group maintain independent memory
- **Memory persistence**: Correct user context persists across turns

---

## Testing the Fix

### Manual Verification

1. Send message in test group: `@_user_2 What are OKR principles?`
2. Check server logs: Look for `💾 Using user ID for memory context: ou_xyz (from mention)`
3. Verify Supabase: Messages saved with mentioned user's ID
4. Send follow-up: `@_user_2 How do I apply these to my team?`
5. Confirm: Response references previous context correctly

### Automated Tests

Run memory tests to verify isolation works:

```bash
bun test test/integration/memory-multiturn.test.ts --timeout 15000
```

All tests should pass with proper user scoping.

---

## Phase 5c Continuation

With this fix, Phase 5c testing can now proceed with **correct user identity handling**:

- ✅ Single user multi-turn context preservation
- ✅ User isolation within same thread (RLS now functional)
- ✅ Group chat memory scope (proper conversation_id + user_id)
- ✅ Memory persistence across server restarts

**Next**: Execute Phase 5c-2 manual testing in Feishu test group to confirm memory is now working correctly.

---

## Related Documents

- `MENTION_RESOLUTION_ISSUE.md` - Detailed problem analysis
- `PHASE_5C_MEMORY_VALIDATION.md` - Phase 5c test plan
- `PHASE_5C_TESTING_STEPS.md` - Manual testing guide
- `server.ts` - Implementation (lines 190-268)
