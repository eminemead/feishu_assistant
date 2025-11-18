# Feishu Mentions → Thread Response Implementation

## Problem
When a bot is mentioned in a Feishu group chat, the response was sent directly to the group as a regular message, cluttering the main conversation thread. Users needed a way to keep mention responses organized in their own threads.

## Solution
Modified the bot to create a new thread when mentioned, using Feishu's official Reply API with the `reply_in_thread: true` parameter. This keeps the group chat clean while maintaining context in dedicated threads.

## Implementation Details

### Official API Reference
**Endpoint**: `POST /open-apis/im/v1/messages/:message_id/reply`
- **SDK Method**: `client.im.message.reply()`
- **Key Parameter**: `reply_in_thread: true` - Creates a threaded reply
- **Documentation**: https://open.feishu.cn/document/server-docs/im-v1/message/reply
- **Node SDK**: @larksuiteoapi/node-sdk@1.44.0

### Code Changes

#### 1. New Function: `replyCardMessageInThread()`
**File**: `lib/feishu-utils.ts` (lines 422-452)

```typescript
export async function replyCardMessageInThread(
  messageId: string,
  cardEntityId: string,
  replyInThread: boolean = true
): Promise<string>
```

Uses Feishu's reply API to send a card as a thread reply. Handles response verification and error logging.

**Parameters**:
- `messageId`: The message ID to reply to (the mention message)
- `cardEntityId`: The card entity ID from the streaming card
- `replyInThread`: Whether to create a thread reply (default: true)

**Returns**: The ID of the sent reply message

#### 2. Updated Function: `createAndSendStreamingCard()`
**File**: `lib/feishu-utils.ts` (lines 457-487)

Extended signature to support thread replies while maintaining backward compatibility:

```typescript
export async function createAndSendStreamingCard(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  config: StreamingCardConfig = {},
  options?: { replyToMessageId?: string; replyInThread?: boolean }
): Promise<...>
```

**Logic**:
- If `options.replyToMessageId` provided → use `replyCardMessageInThread()`
- Otherwise → use existing `sendCardMessage()` (direct message)

#### 3. Updated Handler: `handleNewAppMention()`
**File**: `lib/handle-app-mention.ts` (lines 29-36)

Modified to pass thread options when creating streaming card:

```typescript
const card = await createAndSendStreamingCard(chatId, "chat_id", {
  title: "Evidence-总参",
  initialContent: "我琢么琢么...",
}, {
  replyToMessageId: messageId,  // The mention message ID
  replyInThread: true,          // Enable thread reply
});
```

### Thread ID Logic

The implementation maintains proper thread context:

```typescript
if (rootId !== messageId) {
  // This is a follow-up in an existing thread
  messages = await getThread(chatId, rootId, botUserId);
} else {
  // This is a new mention (creates new thread root)
  messages = [{ role: "user" as const, content: cleanText }];
}
```

- **First mention**: `messageId === rootId` → Creates new thread
- **Follow-up mentions**: `messageId !== rootId` → Continues existing thread

### API Response

When the reply succeeds, Feishu returns:

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "message_id": "om_xxx",
    "root_id": "om_yyy",
    "parent_id": "om_zzz",
    "thread_id": "xxx"
  }
}
```

## User Experience Flow

### Before
```
User: @bot what is X?  [in group chat]
Bot responds...        [in group chat, visible to all]
→ Main chat becomes cluttered
```

### After
```
User: @bot what is X?  [in group chat]
Bot creates thread and responds...  [only bot mention shows in group]
→ Full conversation in dedicated thread
→ Main chat stays clean
```

## Features Preserved

✅ **Streaming Cards**: Typing effect still works with `updateCardElement()`  
✅ **Memory Context**: Scoped by `chatId + rootId` for conversation history  
✅ **Image Attachments**: Image addition to cards still functions  
✅ **Card Finalization**: Settings updates work the same way  
✅ **Error Handling**: Comprehensive error logging and fallbacks  

## Backward Compatibility

✅ **Fully backward compatible**:
- Direct messages (p2p chats) still use `sendCardMessage()`
- Existing thread replies continue to work unchanged
- `createAndSendStreamingCard()` without options works as before
- All existing card streaming features unchanged

## Testing Checklist

- [ ] Mention bot in group chat with a question
- [ ] Verify response appears as a new thread (not direct group message)
- [ ] Verify thread title shows the original mention message
- [ ] Verify streaming/typing effect works in the thread
- [ ] Verify follow-up messages in the same thread work correctly
- [ ] Verify images/attachments still display if applicable
- [ ] Verify memory context maintains conversation history
- [ ] Test direct message (p2p) still works as before
- [ ] Test existing thread replies still function normally

## Error Handling

Both new and modified functions follow the existing error handling pattern:

1. Verify response success status
2. Check that message_id exists in response
3. Log detailed error information if failed
4. Throw descriptive error for caller handling

Example:
```typescript
if (!isSuccess || !responseData?.message_id) {
  console.error("Failed to reply card message in thread. Response:", ...);
  throw new Error(`Failed to reply card message in thread: ...`);
}
```

## Performance Considerations

- **Thread reply API**: Same performance as regular reply API (~200-500ms)
- **No additional memory overhead**: Uses existing streaming mechanisms
- **One API call per response**: No extra calls compared to direct messages

## Future Enhancements

Potential improvements:
1. Add thread title customization in card config
2. Support for thread summaries or highlights
3. Thread notification preferences
4. Automatic thread archive after N days
5. Thread-specific memory retention policies

## References

- [Feishu Reply Message API](https://open.feishu.cn/document/server-docs/im-v1/message/reply)
- [Thread Introduction in Feishu](https://open.feishu.cn/document/im-v1/message/thread-introduction)
- [Node SDK GitHub](https://github.com/larksuite/node-sdk)
