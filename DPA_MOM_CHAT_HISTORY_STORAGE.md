# Chat History Storage: Where and How

## Quick Answer

**Yes, chat history is stored in Supabase**, but there are **two different systems**:

1. **Mastra Memory** - Automatically stores conversation history in Supabase (when agent participates)
2. **Chat History Tool** - Does NOT store anything (read-only fetch from Feishu API)

---

## 1. Mastra Memory Storage (Automatic)

### Where It's Stored

**Supabase PostgreSQL Database** via `@mastra/pg` PostgresStore

**Table**: `agent_messages`

```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  conversation_id TEXT NOT NULL,  -- Format: "feishu:chatId:rootId"
  role TEXT NOT NULL,              -- 'user' or 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### How It Works

**Automatic Storage** - Happens automatically when agent participates in conversation:

```typescript
// In manager-agent-mastra.ts (lines 858-875):

// After agent responds, save to memory:
await mastraMemory.saveMessages({
  threadId: memoryThread,      // "feishu:chatId:rootId"
  resourceId: memoryResource,  // "user:userId"
  messages: [
    { role: "user", content: userMessage },
    { role: "assistant", content: agentResponse }
  ]
});
```

**Storage Flow**:
```
User sends message
    ↓
Agent processes (with Memory context)
    ↓
Agent responds
    ↓
saveMessageToMemory() called automatically
    ↓
Stored in Supabase agent_messages table
```

### What Gets Stored

- ✅ **Messages from conversations where agent participated**
- ✅ **User messages** (role: "user")
- ✅ **Agent responses** (role: "assistant")
- ✅ **Scoped by conversation_id** (`feishu:chatId:rootId`)
- ✅ **Scoped by user_id** (for RLS isolation)

### What Doesn't Get Stored

- ❌ **Messages from chats agent didn't participate in**
- ❌ **Messages before agent was added to chat**
- ❌ **Messages from other users in group chats** (only stores messages from conversations where agent was mentioned)

---

## 2. Chat History Tool (Read-Only)

### Where It's Stored

**Nowhere** - The tool does NOT store anything. It's a **read-only fetch** from Feishu API.

### How It Works

**Direct API Call** - Fetches messages on-demand from Feishu:

```typescript
// In lib/tools/feishu-chat-history-tool.ts (lines 54-56):

const resp = await client.im.message.list({
  params: {
    container_id_type: "chat_id",
    container_id: chatId,
    page_size: limit || 50,
    start_time: startTime,  // Optional
    end_time: endTime,      // Optional
  },
});

// Returns messages but DOES NOT store them
return {
  success: true,
  messages: parsedMessages,  // Just returns, doesn't save
};
```

**No Storage** - The tool:
- ✅ Fetches messages from Feishu API
- ✅ Parses and formats messages
- ✅ Returns messages to agent
- ❌ **Does NOT store in Supabase**
- ❌ **Does NOT cache messages**
- ❌ **Does NOT persist anywhere**

### Why No Storage?

The tool is designed for **on-demand access**:
- Fetch messages when needed
- No need to duplicate Feishu's storage
- Always gets latest messages from source
- No sync/maintenance overhead

---

## Comparison: Memory vs Tool Storage

| Aspect | Mastra Memory | Chat History Tool |
|--------|---------------|-------------------|
| **Stores in Supabase?** | ✅ Yes (`agent_messages` table) | ❌ No (read-only) |
| **When does it store?** | Automatically (when agent participates) | Never (fetch only) |
| **What gets stored?** | Agent conversations only | Nothing |
| **Storage location** | Supabase PostgreSQL | N/A |
| **Access pattern** | Automatic context loading | On-demand API fetch |
| **Use case** | Conversation continuity | External chat access |

---

## Storage Implementation Details

### Mastra Memory Storage

**File**: `lib/memory-mastra.ts`

**Storage Backend**:
```typescript
// Uses @mastra/pg PostgresStore
const postgresStore = new PostgresStore({
  id: "feishu-assistant-pg",
  connectionString: SUPABASE_DATABASE_URL,  // From env
});

// Memory uses this store
const memory = new Memory({
  storage: postgresStore,
  options: {
    lastMessages: 20,  // Keeps last 20 messages
  },
});
```

**Storage Implementation**:
```typescript
// Mastra Memory automatically:
// 1. Creates tables if needed (via PostgresStore)
// 2. Stores messages when saveMessages() called
// 3. Loads messages when query() called
// 4. Manages RLS via user_id scoping
```

**Tables Created** (by Mastra):
- Mastra creates its own tables for memory storage
- Uses `@mastra/pg` schema management
- Separate from `agent_messages` table (legacy)

**Note**: There are actually **two storage systems**:
1. **Legacy**: `agent_messages` table (from `@ai-sdk-tools/memory`)
2. **Mastra**: Mastra's own tables (via `@mastra/pg` PostgresStore)

### Chat History Tool Implementation

**File**: `lib/tools/feishu-chat-history-tool.ts`

**No Storage Code** - Just fetch and return:

```typescript
export function createFeishuChatHistoryTool() {
  return tool({
    description: "Access Feishu group chat histories",
    parameters: z.object({
      chatId: z.string(),
      limit: z.number().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }),
    execute: async ({ chatId, limit, startTime, endTime }) => {
      // 1. Fetch from Feishu API
      const resp = await client.im.message.list({ params });
      
      // 2. Parse messages
      const messages = parseMessages(resp.data.items);
      
      // 3. Return (NO STORAGE)
      return {
        success: true,
        messages: messages,  // Just returns, doesn't save
      };
    },
  });
}
```

**No Storage Logic** - The tool:
- ❌ Doesn't call any storage functions
- ❌ Doesn't save to Supabase
- ❌ Doesn't cache results
- ✅ Just fetches and returns

---

## Current Storage Status

### ✅ What's Already Implemented

1. **Mastra Memory Storage**:
   - ✅ Stores conversation history automatically
   - ✅ Uses Supabase PostgreSQL
   - ✅ RLS enforced via user_id
   - ✅ Thread-scoped (conversation_id)

2. **Chat History Tool**:
   - ✅ Fetches messages from Feishu API
   - ✅ Parses and formats messages
   - ✅ Returns to agent for use
   - ❌ Does NOT store (by design)

### ⚠️ What's NOT Implemented

1. **Tool doesn't store fetched messages**:
   - Currently: Fetches on-demand, doesn't cache
   - Could add: Cache fetched messages in Supabase
   - Could add: Store external chat messages for later use

2. **No cross-chat storage**:
   - Memory only stores agent conversations
   - Tool fetches but doesn't store
   - No unified storage for all chats

---

## Should the Tool Store Messages?

### Option 1: Keep Tool Read-Only (Current) ✅

**Pros**:
- ✅ Always gets latest from Feishu
- ✅ No sync/maintenance overhead
- ✅ No storage costs
- ✅ Simple implementation

**Cons**:
- ❌ Can't search cached messages
- ❌ Repeated API calls for same chat
- ❌ No offline access

### Option 2: Add Storage to Tool ⚠️

**Pros**:
- ✅ Cache frequently accessed chats
- ✅ Enable search over stored messages
- ✅ Reduce API calls
- ✅ Better performance

**Cons**:
- ❌ Storage overhead
- ❌ Sync complexity (keep cache fresh)
- ❌ More complex implementation
- ❌ Duplicate storage (Feishu + Supabase)

**Recommendation**: Keep tool read-only unless there's a specific need for caching.

---

## Storage Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Feishu Platform                       │
│  (Source of Truth - All Chat Messages Stored Here)      │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ API Calls
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│  Chat History    │         │  Mastra Memory   │
│      Tool        │         │   (Automatic)    │
│                  │         │                  │
│  • Fetches only  │         │  • Stores auto  │
│  • No storage    │         │  • Supabase DB  │
│  • On-demand     │         │  • agent_messages│
└──────────────────┘         └────────┬─────────┘
                                       │
                                       │ Stores
                                       ▼
                              ┌──────────────────┐
                              │   Supabase DB    │
                              │                  │
                              │ agent_messages   │
                              │ (conversations)  │
                              └──────────────────┘
```

---

## Summary

### Question 1: Where is chat history stored?

**Answer**: In Supabase, but only for conversations where the agent participated.

- **Mastra Memory**: Stores in Supabase `agent_messages` table (or Mastra's own tables)
- **Chat History Tool**: Does NOT store (read-only fetch)

### Question 2: Is it already implemented in the tool script?

**Answer**: No, the tool script does NOT implement storage.

- **Tool script**: Only fetches from Feishu API, doesn't store
- **Storage**: Implemented separately in Mastra Memory system
- **Automatic storage**: Happens in `manager-agent-mastra.ts` when agent responds

### Key Takeaway

- **Memory** = Automatic storage (agent conversations)
- **Tool** = Read-only fetch (external chats, on-demand)
- **Two different systems** for different purposes

