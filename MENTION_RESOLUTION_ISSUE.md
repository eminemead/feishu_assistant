# Issue: Bot Memory Not Correctly Associating User Identity for Mentions

## Problem

When someone mentions `@_user_2` in a group message, the bot should remember information **for @_user_2**, not for the **message sender**.

**Current behavior**: Memory is being stored with the **sender's user ID**, not the **mentioned user's ID**.

**Example**:
```
Sender: Alice (open_id: ou_alice)
Message: "@_user_2 What's your Q4 goal?"
Current: Memory saved with user_id = "ou_alice" (WRONG)
Expected: Memory saved with user_id = "ou_user_2" (CORRECT)
```

## Root Cause

In `server.ts` (line 251), when handling group mentions:

```typescript
await handleNewAppMention({
  chatId,
  messageId,
  rootId,
  messageText,
  botUserId,
  userId: userId || chatId,  // ← This is the SENDER's ID, not the MENTIONED user!
} as any);
```

The Feishu webhook provides a `mentions` array with the details of mentioned users:

```typescript
// From Feishu message event (line 200)
const mentions = (message as any).mentions || [];
// mentions = [
//   {
//     key: "@_user_2",
//     id: {
//       open_id: "ou_xyz123",
//       user_id: "john.doe",
//       union_id: "on_xyz"
//     },
//     name: "John Doe",
//     ...
//   }
// ]
```

But we're **never extracting the mentioned user's ID** from this array. We just check if mentions exist (line 206) to set `isMention = true`, then ignore the actual mention data.

## Impact

1. **Memory isolation broken**: User isolation RLS doesn't work correctly
2. **Context confusion**: Bot may associate memories with wrong users
3. **Multi-user tracking fails**: Can't track different context for different users

## Solution

### Step 1: Detect which user is being mentioned

When `mentions` array has length > 0 in a group chat, extract the **first mentioned user's ID**:

```typescript
const mentions = (message as any).mentions || [];
let mentionedUserId: string | null = null;

if (mentions.length > 0 && message.chat_type === "group") {
  const firstMention = mentions[0];
  // Try to extract user ID from mentioned user
  mentionedUserId = firstMention.id?.open_id || 
                   firstMention.id?.user_id || 
                   firstMention.id?.union_id ||
                   null;
  
  console.log(`📌 [WebSocket] First mentioned user: ${mentionedUserId} (${firstMention.name})`);
}
```

### Step 2: Use mentioned user ID for memory context

When passing to `handleNewAppMention`, use the mentioned user's ID, not the sender's:

```typescript
if (isMention) {
  console.log(`👥 [WebSocket] Processing group mention: "${messageText.substring(0, 50)}..."`);
  await handleNewAppMention({
    chatId,
    messageId,
    rootId,
    messageText,
    botUserId,
    userId: mentionedUserId || userId || chatId,  // ← Use mentioned user ID!
  } as any);
  return;
}
```

### Step 3: Handle multiple mentions (optional enhancement)

If multiple users are mentioned, we could:
- Create separate memory entries for each mentioned user
- Or focus on the first mention (current approach)
- Or require explicit context (e.g., only mentions at start of message)

## Testing

### Before Fix
Send in test group:
```
@_user_2 What's your Q4 OKR focus?
```
Check memory is saved with sender's user_id (WRONG)

### After Fix
Send in test group:
```
@_user_2 What's your Q4 OKR focus?
```
Check memory is saved with @_user_2's actual user_id (CORRECT)

Verify in Supabase:
```sql
SELECT user_id, role, content FROM agent_messages 
WHERE conversation_id LIKE 'feishu:%'
ORDER BY created_at DESC;
```

Should show messages scoped to the **mentioned** user, not the sender.

## Related Code Files

- `server.ts` (lines 200-251) - Mention detection and handling
- `lib/handle-app-mention.ts` (line 21, 88) - Uses userId for memory context
- `lib/auth/extract-feishu-user-id.ts` - User ID extraction
- `lib/agents/memory-integration.ts` - Memory storage with user scoping

## Implementation Priority

**HIGH** - This affects memory isolation and RLS enforcement for the entire system.
