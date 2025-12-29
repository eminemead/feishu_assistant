# Chat History Prefetch: Feishu APIs & Storage Analysis

## Question

**Can we store chat history from Feishu group chats even when the bot didn't participate?**
**Are there Feishu APIs to prefetch messages and store in PostgreSQL?**
**Is this reasonable?**

---

## Short Answer

**Yes, it's technically possible** but has **significant limitations**:
- ✅ **API Available**: `client.im.message.list()` can fetch messages
- ⚠️ **Permissions Required**: Bot must be in the chat or have admin permissions
- ⚠️ **No Universal Access**: Can't access chats bot isn't part of
- ⚠️ **Rate Limits**: API has rate limits (need to check)
- ✅ **Reasonable**: Yes, if bot is added to chats you want to monitor

---

## Feishu APIs Available

### 1. Message List API (Current Implementation)

**API**: `client.im.message.list()`

**Current Usage** (in `feishu_chat_history` tool):
```typescript
const resp = await client.im.message.list({
  params: {
    container_id_type: "chat_id",
    container_id: chatId,
    page_size: limit || 50,
    start_time: startTime,  // Optional
    end_time: endTime,      // Optional
  },
});
```

**Capabilities**:
- ✅ Fetch messages from a specific chat
- ✅ Filter by time range
- ✅ Pagination support (page_size)
- ✅ Returns up to 100 messages per call

**Limitations**:
- ❌ **Requires bot to be in chat** (or admin permissions)
- ❌ **Can't access chats bot isn't part of**
- ❌ **Rate limits** (need to check Feishu docs)
- ❌ **No real-time push** (must poll)

### 2. WebSocket Subscription Mode (Real-time Events)

**Current Implementation** (in `server.ts`):
```typescript
eventDispatcher.register({
  "im.message.receive_v1": async (data) => {
    // Receives messages in real-time
    const message = data.message;
    const chatId = message.chat_id;
    // ... process message
  },
});
```

**Capabilities**:
- ✅ Real-time message events
- ✅ Low latency (<10ms)
- ✅ Automatic delivery

**Limitations**:
- ❌ **Only receives messages from chats bot is in**
- ❌ **Only receives messages when bot is mentioned** (in some cases)
- ❌ **Can't subscribe to chats bot isn't part of**

### 3. Webhook Mode (Alternative)

**Available but not used** (WebSocket preferred):
- HTTP webhooks for message events
- Same limitations as WebSocket (only chats bot is in)

---

## Storage Architecture Options

### Option 1: Real-time Storage via WebSocket Events ✅ **RECOMMENDED**

**How It Works**:
1. Bot receives `im.message.receive_v1` events via WebSocket
2. Store messages in PostgreSQL as they arrive
3. No polling needed

**Implementation**:
```typescript
// In server.ts - extend current event handler
eventDispatcher.register({
  "im.message.receive_v1": async (data) => {
    const message = data.message;
    const chatId = message.chat_id;
    
    // Existing: Handle bot mentions
    // ... existing code ...
    
    // NEW: Store all messages in PostgreSQL
    await storeMessageInPostgres({
      chatId: chatId,
      messageId: message.message_id,
      content: parseMessageContent(message.content),
      senderId: message.sender?.sender_id?.user_id,
      createTime: message.create_time,
      role: message.sender?.sender_type === "app" ? "bot" : "user",
    });
  },
});
```

**Pros**:
- ✅ Real-time (no delay)
- ✅ Efficient (only processes new messages)
- ✅ No rate limit issues
- ✅ Automatic (no polling needed)

**Cons**:
- ❌ Only works for chats bot is in
- ❌ Requires bot to be added to chats

**Storage Schema**:
```sql
CREATE TABLE feishu_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT,
  content TEXT NOT NULL,
  create_time BIGINT NOT NULL,
  role TEXT CHECK (role IN ('user', 'bot', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_chat_id (chat_id),
  INDEX idx_create_time (create_time),
  INDEX idx_message_id (message_id)
);
```

### Option 2: Periodic Polling ⚠️ **FALLBACK**

**How It Works**:
1. Periodically fetch messages from known chats
2. Store new messages in PostgreSQL
3. Track last fetched timestamp per chat

**Implementation**:
```typescript
// Background job: Poll chats every N minutes
async function pollChatHistory() {
  const chatsToMonitor = await getMonitoredChats(); // From config/DB
  
  for (const chatId of chatsToMonitor) {
    const lastFetched = await getLastFetchedTime(chatId);
    const now = Math.floor(Date.now() / 1000);
    
    // Fetch messages since last poll
    const resp = await client.im.message.list({
      params: {
        container_id_type: "chat_id",
        container_id: chatId,
        start_time: lastFetched.toString(),
        end_time: now.toString(),
        page_size: 100,
      },
    });
    
    // Store new messages
    for (const msg of resp.data.items) {
      await storeMessageIfNew(msg);
    }
    
    // Update last fetched time
    await updateLastFetchedTime(chatId, now);
  }
}

// Run every 5 minutes
setInterval(pollChatHistory, 5 * 60 * 1000);
```

**Pros**:
- ✅ Works for any chat bot is in
- ✅ Can catch up on missed messages
- ✅ More control over what to fetch

**Cons**:
- ❌ Delay (up to polling interval)
- ❌ Rate limit concerns
- ❌ More complex (need to track state)
- ❌ Wastes API calls (polling empty chats)

**When to Use**:
- Fallback if WebSocket events miss messages
- Catching up on historical messages
- Chats where bot was added later

### Option 3: Hybrid Approach ✅ **BEST**

**How It Works**:
1. **Real-time**: Store messages via WebSocket events (primary)
2. **Polling**: Periodic catch-up for missed messages (backup)
3. **On-demand**: Fetch historical messages when needed (tool)

**Implementation**:
```typescript
// 1. Real-time storage (primary)
eventDispatcher.register({
  "im.message.receive_v1": async (data) => {
    await storeMessageRealTime(data.message);
  },
});

// 2. Periodic catch-up (backup, runs hourly)
setInterval(async () => {
  await catchUpMissedMessages();
}, 60 * 60 * 1000);

// 3. On-demand fetch (tool)
export async function fetchChatHistory(chatId: string, startTime?: number) {
  // Fetch from PostgreSQL first
  const cached = await getMessagesFromPostgres(chatId, startTime);
  if (cached.length > 0) {
    return cached;
  }
  
  // Fallback to Feishu API
  return await fetchFromFeishuAPI(chatId, startTime);
}
```

**Pros**:
- ✅ Best of both worlds
- ✅ Real-time for active chats
- ✅ Catch-up for missed messages
- ✅ Efficient (cached in PostgreSQL)

**Cons**:
- ⚠️ More complex implementation
- ⚠️ Need to handle sync conflicts

---

## Permissions & Access

### What's Required

**For `client.im.message.list()` API**:
- ✅ Bot must be **added to the chat** (group member)
- ✅ OR bot must have **admin permissions** (tenant admin)
- ❌ **Cannot access chats bot isn't part of**

### How to Add Bot to Chats

**Manual**:
1. User adds bot to group chat
2. Bot receives `im.chat.member_bot_added_v1` event
3. Bot can now access messages

**Programmatic** (if admin):
- Can add bot to chats via API (if available)
- Need to check Feishu API docs

### Current Event Handling

**Already implemented** (in `server.ts`):
```typescript
eventDispatcher.register({
  "im.chat.member_bot_added_v1": async (data) => {
    // Bot was added to a chat
    const chatId = data.chat_id;
    console.log(`Bot added to chat: ${chatId}`);
    // Could store chatId for monitoring
  },
});
```

---

## Is It Reasonable?

### ✅ **YES, If**:

1. **Bot is added to chats you want to monitor**
   - ✅ Normal use case
   - ✅ Users add bot when they want its help
   - ✅ Bot can then store messages

2. **You want to build a knowledge base**
   - ✅ Store team discussions
   - ✅ Enable semantic search
   - ✅ Build context for future queries

3. **You have storage capacity**
   - ✅ PostgreSQL can handle large volumes
   - ✅ Can archive old messages
   - ✅ Can compress/optimize storage

4. **You respect privacy**
   - ✅ Only store messages from chats bot is in
   - ✅ Users consent by adding bot
   - ✅ RLS ensures user isolation

### ❌ **NO, If**:

1. **You want to access all chats without permission**
   - ❌ Not possible (API limitation)
   - ❌ Privacy concern
   - ❌ Would require admin access

2. **You want to avoid adding bot to chats**
   - ❌ Can't access messages without being in chat
   - ❌ API doesn't support this

3. **You have strict rate limits**
   - ⚠️ Polling approach hits rate limits
   - ⚠️ Need to be careful with API calls

---

## Implementation Plan

### Phase 1: Real-time Storage (Recommended Start)

**Goal**: Store messages as they arrive via WebSocket

**Steps**:
1. Create `feishu_chat_messages` table in Supabase
2. Extend `im.message.receive_v1` handler to store messages
3. Add deduplication (check `message_id` uniqueness)
4. Test with bot in a test chat

**Code**:
```typescript
// lib/storage/chat-message-storage.ts
export async function storeChatMessage(message: any) {
  const db = getSupabaseClient();
  
  await db.from('feishu_chat_messages').insert({
    chat_id: message.chat_id,
    message_id: message.message_id,
    sender_id: message.sender?.sender_id?.user_id,
    content: parseMessageContent(message.content),
    create_time: message.create_time,
    role: message.sender?.sender_type === "app" ? "bot" : "user",
  }).onConflict('message_id').ignore(); // Deduplication
}
```

### Phase 2: Historical Backfill (Optional)

**Goal**: Fetch historical messages for chats bot is in

**Steps**:
1. List chats bot is member of
2. For each chat, fetch messages from beginning
3. Store in PostgreSQL
4. Handle pagination

**Code**:
```typescript
// lib/storage/chat-history-backfill.ts
export async function backfillChatHistory(chatId: string) {
  let pageToken: string | undefined;
  let totalFetched = 0;
  
  do {
    const resp = await client.im.message.list({
      params: {
        container_id_type: "chat_id",
        container_id: chatId,
        page_size: 100,
        page_token: pageToken,
      },
    });
    
    // Store messages
    for (const msg of resp.data.items) {
      await storeChatMessage(msg);
      totalFetched++;
    }
    
    pageToken = resp.data.page_token;
  } while (pageToken && totalFetched < 10000); // Limit to prevent abuse
  
  return totalFetched;
}
```

### Phase 3: Enhanced Tool (Use Stored Data)

**Goal**: Update `feishu_chat_history` tool to use stored data

**Steps**:
1. Check PostgreSQL first (fast)
2. Fallback to Feishu API if not cached
3. Store fetched messages for future use

**Code**:
```typescript
// Enhanced feishu_chat_history tool
export async function getChatHistory(params: {
  chatId: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}) {
  // 1. Try PostgreSQL first
  const cached = await getMessagesFromPostgres(params);
  if (cached.length >= (params.limit || 50)) {
    return { success: true, messages: cached, source: "cache" };
  }
  
  // 2. Fallback to Feishu API
  const apiMessages = await fetchFromFeishuAPI(params);
  
  // 3. Store for future use
  await storeMessages(apiMessages);
  
  return { success: true, messages: apiMessages, source: "api" };
}
```

---

## Storage Considerations

### Database Schema

```sql
-- Table: feishu_chat_messages
CREATE TABLE feishu_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  sender_id TEXT,
  sender_type TEXT,
  content TEXT NOT NULL,
  create_time BIGINT NOT NULL,
  role TEXT CHECK (role IN ('user', 'bot', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_chat_id (chat_id),
  INDEX idx_create_time (create_time),
  INDEX idx_message_id (message_id),
  INDEX idx_chat_time (chat_id, create_time)
);

-- RLS Policy (optional - for user isolation)
ALTER TABLE feishu_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see messages from chats they're in"
  ON feishu_chat_messages
  FOR SELECT
  USING (
    chat_id IN (
      SELECT chat_id FROM user_chat_memberships 
      WHERE user_id = auth.uid()
    )
  );
```

### Storage Size Estimates

**Per Message**:
- Message ID: ~20 bytes
- Chat ID: ~20 bytes
- Content: ~500 bytes (average)
- Metadata: ~100 bytes
- **Total**: ~640 bytes per message

**For 1000 messages**: ~640 KB
**For 1M messages**: ~640 MB
**For 10M messages**: ~6.4 GB

**Recommendations**:
- Archive old messages (>90 days) to separate table
- Compress content for very old messages
- Consider partitioning by date

---

## Rate Limits & API Constraints

### Feishu API Rate Limits

**Need to check Feishu documentation**, but typical limits:
- **Message List API**: ~100 requests/minute (estimate)
- **WebSocket Events**: No limit (real-time)
- **Overall**: Check Feishu developer console

### Best Practices

1. **Use WebSocket for real-time** (no rate limits)
2. **Cache in PostgreSQL** (reduce API calls)
3. **Batch operations** (fetch multiple chats together)
4. **Respect rate limits** (implement backoff)

---

## Privacy & Security Considerations

### ✅ **Good Practices**:

1. **Only store messages from chats bot is in**
   - Users consent by adding bot
   - Respects privacy boundaries

2. **RLS for user isolation**
   - Users can only see their own chats
   - Database-level security

3. **Data retention policies**
   - Archive old messages
   - Delete on user request
   - Comply with data regulations

4. **Encryption**
   - Encrypt sensitive content
   - Secure database connections

### ⚠️ **Concerns**:

1. **Storage of private conversations**
   - Users may not realize bot stores messages
   - Need clear disclosure

2. **Data access**
   - Who can access stored messages?
   - Admin access controls needed

3. **Compliance**
   - GDPR, CCPA, etc.
   - Right to deletion
   - Data export

---

## Conclusion

### ✅ **Yes, It's Reasonable** If:

1. ✅ Bot is added to chats (normal use case)
2. ✅ Store messages via WebSocket events (real-time, efficient)
3. ✅ Use PostgreSQL for caching (fast access)
4. ✅ Respect privacy (only chats bot is in)
5. ✅ Implement RLS (user isolation)

### ❌ **Not Reasonable** If:

1. ❌ Want to access chats bot isn't in (not possible)
2. ❌ Don't want to add bot to chats (can't access)
3. ❌ Have strict privacy requirements (may conflict)

### 🎯 **Recommended Approach**:

**Hybrid Real-time + Storage**:
1. Store messages via WebSocket events (real-time)
2. Cache in PostgreSQL (fast retrieval)
3. Use stored data in `feishu_chat_history` tool
4. Periodic catch-up for missed messages

**This gives you**:
- ✅ Real-time message storage
- ✅ Fast retrieval (cached)
- ✅ Historical access
- ✅ Efficient (no unnecessary API calls)

---

## Next Steps

1. **Create storage schema** in Supabase
2. **Extend WebSocket handler** to store messages
3. **Update `feishu_chat_history` tool** to use stored data
4. **Test with bot in test chat**
5. **Monitor storage growth** and implement archiving

