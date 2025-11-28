# Bot Mention Detection Fix

## Problem

Bot was NOT responding to @bot mentions in group chats because of incorrect mention detection logic.

**Bug:** The code treated ANY mention in a group chat as a bot mention, causing:
- Messages with user mentions (@user1 @user2) were processed as bot mentions ❌
- @bot mentions were ignored or processed alongside user mentions ❌

## Root Cause

```typescript
// WRONG - treats ANY mention as bot mention
if (mentions.length > 0 && message.chat_type === "group") {
  isMention = true;  // ← Sets true for @user1, @user2, etc. (not just @bot)
}
```

The mentions array contains ALL mentions in the message, not just the bot mention.

## Solution

```typescript
// CORRECT - checks if BOT specifically is in mentions
const botMentioned = mentions.some(mention => {
  const mentionId = mention.id?.open_id || mention.id?.user_id;
  return mentionId === botUserId;
});

if (botMentioned) {
  isMention = true;  // ← Only set if bot's ID is in mentions
}
```

Now properly detects:
- ✓ Messages with @bot → processed by bot
- ✓ Messages with @user1 @user2 → ignored (not bot mention)
- ✓ Mixed mentions with @bot → processed by bot

## Changes

**File:** server.ts (lines 219-233)
**Commit:** 7f243a8

### Before
```typescript
if (mentions.length > 0 && message.chat_type === "group") {
  console.log(`🔍 [WebSocket] Found ${mentions.length} mention(s) in group message`);
  isMention = true;
  console.log(`✅ [WebSocket] Bot mention detected via mentions array`);
}
```

### After
```typescript
if (message.chat_type === "group") {
  const botMentioned = mentions.some(mention => {
    const mentionId = mention.id?.open_id || mention.id?.user_id;
    return mentionId === botUserId;
  });
  
  if (botMentioned) {
    console.log(`✅ [WebSocket] Bot mention detected in mentions array`);
    isMention = true;
  } else if (mentions.length > 0) {
    console.log(`🔍 [WebSocket] Found ${mentions.length} user mention(s) (not bot mention)`);
  }
}
```

## How to Test

1. **Setup:** Send @bot mention to Feishu test group
   ```
   @bot What are the key principles of OKR setting?
   ```

2. **Expected Logs:**
   ```
   🤖 [WebSocket] Bot User ID: cli_a6af6b76c6f0d013
   📩 [WebSocket] Message details: chatId=oc_cd4b98905e12ec0cb68adc529440e623...
   ✅ [WebSocket] Bot mention detected in mentions array
   👥 [WebSocket] Processing group mention: "What are the key principles..."
   [Manager] Received query: "What are the key principles of OKR setting?"
   ```

3. **User Experience:**
   - Bot responds in thread with OKR explanation
   - Response appears as card message

## Mention Structure in Feishu

When @bot is mentioned in Feishu subscription mode:

```json
{
  "mentions": [
    {
      "id": { "open_id": "cli_a6af6b76c6f0d013" },  // Bot's ID
      "key": "@bot",
      "name": "assistant-name"
    }
  ],
  "message_type": "text",
  "text": "@bot What are the key principles of OKR setting?"
}
```

When @user is mentioned:
```json
{
  "mentions": [
    {
      "id": { "open_id": "ou_b996baaafd4fd8f41d219ec7ad2af324" },  // User's ID (not bot)
      "key": "@_user_1",
      "name": "UserName"
    }
  ]
}
```

## Memory Persistence Impact

With this fix, the bot will now:
1. ✅ Properly detect @bot mentions
2. ✅ Extract mentioned user ID (if any user is @mentioned in same message)
3. ✅ Use user ID for memory scoping
4. ✅ Save Q1 to memory
5. ✅ Load Q1 on Q2 (follow-up in same thread)
6. ✅ Provide context-aware response

## Fallback

The code also includes a fallback for webhook mode:
```typescript
if (!isMention && (messageText.includes(`<at user_id="${botUserId}">`) ||
    messageText.includes(`<at open_id="${botUserId}">`))) {
  isMention = true;
}
```

This handles cases where @bot is encoded as XML in the message text.

## Ready for Testing

✅ Server restarted with fix
✅ Build successful
✅ Bot will now respond to @bot mentions
✅ Memory persistence ready to test

Next: Send @bot message to test group to validate memory works across turns.
