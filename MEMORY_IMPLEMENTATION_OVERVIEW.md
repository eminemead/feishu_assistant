# Memory Implementation Overview - Mastra Integration

## Current Architecture

### High-Level Flow
```
Feishu Message
    ↓
Extract: chatId, rootId, userId (mentioned user)
    ↓
initializeAgentMemoryContext(chatId, rootId, userId)
    ↓
loadConversationHistory(memoryContext, maxMessages=5)
    ↓
[Q1, A1, Q2] loaded from Supabase
    ↓
Prepend to current message: [...history, currentUserMessage]
    ↓
Pass to Mastra Manager Agent
    ↓
Agent processes with full context, calls specialist agent
    ↓
saveMessageToMemory(memoryContext, response, "assistant")
    ↓
Response sent to Feishu
```

## Components

### 1. Memory Backends

**lib/memory.ts**
- Configures memory providers from `@ai-sdk-tools/memory`
- Two providers:
  - **DrizzleProvider**: Production (Supabase PostgreSQL backend)
  - **InMemoryProvider**: Development/fallback (loses data on restart)

```typescript
// Uses Supabase tables
workingMemoryTable: 'agent_working_memory'
messagesTable: 'agent_messages'
chatsTable: 'agent_chats'
```

**Key Functions:**
- `createMemoryProvider(feishuUserId)` - Creates user-scoped provider
- `memoryProvider` - Default provider for backward compatibility
- `getConversationId(chatId, rootId)` - Returns `feishu:${chatId}:${rootId}`
- `getUserScopeId(userId)` - Returns `user:${userId}`

### 2. Memory Integration Wrapper

**lib/agents/memory-integration.ts**
- Unified interface for Mastra agents
- Abstracts away provider implementation
- Handles memory lifecycle

**Key Functions:**

#### `initializeAgentMemoryContext(chatId, rootId, userId)`
Sets up memory context with:
- `conversationId`: Unique thread ID
- `userScopeId`: User-scoped ID for RLS
- `provider`: Memory provider instance
- Raw IDs: `chatId`, `rootId`, `userId` for reference

```typescript
const context = await initializeAgentMemoryContext(
  'oc_cd4b98...',  // Feishu group chat ID
  'msg_12345...',  // Root message ID (thread)
  'ou_user123'     // Mentioned user ID (extracted from @mention)
);
```

#### `loadConversationHistory(context, maxMessages=10)`
Returns array of `CoreMessage` objects:
```typescript
[
  { role: 'user', content: 'Q1: What are OKR principles?' },
  { role: 'assistant', content: 'OKRs stand for...' },
  { role: 'user', content: 'Q2: Apply to my team' }
]
```

**Note**: Fixed bug where `.slice(0, -1)` was dropping last message.
Now returns all history: `Q1, A1, Q2` (not `Q1, A1`).

#### `saveMessageToMemory(context, message, role)`
Saves a single message to Supabase:
```typescript
await saveMessageToMemory(context, agentResponse, "assistant");
```

Stores with metadata:
- `chatId`: conversation ID
- `userId`: user ID (for RLS)
- `role`: "user" or "assistant"
- `content`: message text
- `timestamp`: creation time

#### `updateWorkingMemory(context, memoryObject)`
Stores structured context (JSON):
```typescript
await updateWorkingMemory(context, {
  userGoal: "Increase Q4 revenue by 20%",
  teamSize: 5,
  budget: 100000
});
```

#### `getWorkingMemory(context)`
Retrieves structured context as object.

#### `clearConversationMemory(context)`
Clears working memory (but NOT message history).

#### `buildSystemMessageWithMemory(baseMsg, history, workingMemory)`
Helper to build enhanced system prompt with context.

### 3. Manager Agent Integration

**lib/agents/manager-agent-mastra.ts**

Usage pattern (lines 166-182):

```typescript
// Initialize memory context
const memoryContext = await initializeAgentMemoryContext(chatId, rootId, userId);

// Load conversation history
const historyMessages = await loadConversationHistory(memoryContext, 5);
if (historyMessages.length > 0) {
  // Prepend ALL history to current messages
  const enrichedMessages = [...historyMessages, ...messages];
  messages = enrichedMessages;
}

// Save user query to memory
await saveMessageToMemory(memoryContext, query, "user");

// Agent processes with enriched messages...

// Save agent response
await saveMessageToMemory(memoryContext, response, "assistant");
```

### 4. Storage Schema

**Supabase Tables**

#### agent_messages
```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY,
  conversation_id VARCHAR,  -- feishu:chat:root
  user_id VARCHAR,          -- ou_user_id or user:uuid
  role VARCHAR,             -- 'user' or 'assistant'
  content TEXT,
  created_at TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES agent_chats(id)
);

CREATE RLS POLICY agent_messages_user_isolation
  ON agent_messages
  USING (auth.uid()::text = user_id OR is_admin());
```

#### agent_working_memory
```sql
CREATE TABLE agent_working_memory (
  id UUID PRIMARY KEY,
  conversation_id VARCHAR,
  user_id VARCHAR,
  scope VARCHAR,            -- 'chat', 'user', etc.
  content TEXT,             -- JSON
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### agent_chats
```sql
CREATE TABLE agent_chats (
  id VARCHAR PRIMARY KEY,    -- feishu:chat:root
  title VARCHAR,
  user_id VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## Key Design Decisions

### 1. Conversation Scoping
**Format**: `feishu:${chatId}:${rootId}`
- Unique per thread (not per message)
- Allows memory to persist across multiple exchanges in same thread
- Includes both chat ID and root ID for full context

**Example**:
```
Group chat: oc_cd4b9890...
  Message 1 (root): Q1
    reply 1: A1
    reply 2: Q2
    reply 3: A2
  Message 2 (new root): Q3

Memory scopes:
  - feishu:oc_cd4b9890:msg_root_1  (Q1, A1, Q2, A2 all in this scope)
  - feishu:oc_cd4b9890:msg_root_2  (Q3 separate scope)
```

### 2. User Scoping
**Format**: `user:${userId}`
- User ID extracted from `@mention` (not message sender!)
- Ensures memory isolation between users in group chats
- RLS policy enforces at database level

**Fixed Bug** (commit 9ab67d7):
- Previously: Stored memory with sender's ID
- Now: Stores with mentioned user's ID
- Result: Bot remembers context for @_user_2, not the person who typed

### 3. History Context Window
**Default**: 5-10 messages loaded
- Keep context manageable for token limits
- Enough to maintain coherent multi-turn conversation
- Can increase if token budget allows

**Fixed Bug** (commit 7590175):
- Previously: `.slice(0, -1)` dropped last message
- Now: Include ALL loaded history
- Example: [Q1, A1, Q2] all preserved (not [Q1, A1])

### 4. Graceful Fallbacks
- **No Supabase**: Falls back to InMemoryProvider (conversation continues, no persistence)
- **Message save fails**: Continues operation (memory best-effort)
- **History load fails**: Continues without context (agent can still respond)

## Data Flow Example

### Scenario: Multi-turn conversation with @_user_2

**Turn 1:**
```
Sender: Alice
Message: "@_user_2 What are OKR principles?"

Flow:
1. Extract: userId=ou_john (from @_user_2 mention)
2. Load history: [] (empty, first message)
3. Save to memory: 
   - conversation_id: feishu:oc_cd4b9890:root_msg123
   - user_id: ou_john
   - role: user
   - content: "What are OKR principles?"
4. Agent responds (sees no history context)
5. Save response:
   - conversation_id: feishu:oc_cd4b9890:root_msg123
   - user_id: ou_john
   - role: assistant
   - content: "OKRs stand for..."
```

**Turn 2:**
```
Sender: Alice
Message: "@_user_2 How do I apply those to my team?"

Flow:
1. Extract: userId=ou_john
2. Load history: [
     { role: 'user', content: 'What are OKR principles?' },
     { role: 'assistant', content: 'OKRs stand for...' }
   ]
3. Prepend: [history..., current_message]
4. Agent responds WITH CONTEXT (mentions "OKR principles" from turn 1)
5. Save response to same conversation_id
```

**Result**: Memory now includes both turns for ou_john in this thread.

## Current Limitations

1. **Service Role Only**
   - Uses Supabase service role (bypasses RLS)
   - Application-level filtering for RLS
   - Future: User-scoped connections when SDK supports

2. **No Message Deletion**
   - Can clear working memory, but not message history
   - Messages persist forever (by design)
   - Workaround: Implement cleanup job if needed

3. **Token Limits**
   - Loading 10 messages might exceed token budget for long conversations
   - No automatic summarization
   - Future: Implement message summarization for long histories

4. **No Working Memory Diff**
   - Always overwrites working memory, no partial updates
   - Can't store incremental changes
   - Future: Implement merging strategy

## Testing

### Unit Tests
- `test/integration/memory-integration.test.ts` - 9 tests
- `test/integration/memory-multiturn.test.ts` - 16 tests
- All passing ✅

### Integration Test
- `bun test` runs full suite
- Tests memory isolation, multi-turn, RLS patterns

### Manual Testing (Phase 5c-2)
- Configured test group: `oc_cd4b98905e12ec0cb68adc529440e623`
- Test script: `scripts/check-phase5c-memory.ts`
- Monitor: `scripts/monitor-phase5c.sh`

## Recent Improvements (Nov 28)

1. **User Identity Resolution** (9ab67d7)
   - Extract mentioned user ID from Feishu mentions array
   - Memory now scoped to @_user_2, not sender

2. **History Context Loading** (7590175)
   - Fixed `.slice(0, -1)` bug
   - All history messages now included

3. **Auth Email Validation**
   - Test users work with Supabase auth
   - Placeholder email generation for arbitrary IDs

4. **Duplicate Elimination** (136f324)
   - Follow-ups show only in buttons, not card text
   - No duplicate suggestions

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Feishu Message Event                                    │
│ - chatId, messageId, rootId                            │
│ - userId, mentions array                               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ server.ts / handleNewAppMention()                       │
│ - Extract mentioned user ID from mentions[0]           │
│ - Pass to generateResponse()                           │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ generateResponse() with Memory Integration             │
│ 1. initializeAgentMemoryContext(chatId, rootId, userId)│
│ 2. loadConversationHistory(context, 5)                 │
│ 3. [...history, ...currentMessages]                    │
│ 4. Manager Agent processes with context                │
│ 5. saveMessageToMemory(context, response)              │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Memory Integration Wrapper                             │
│ lib/agents/memory-integration.ts                       │
│ - initializeAgentMemoryContext                         │
│ - loadConversationHistory                              │
│ - saveMessageToMemory                                  │
│ - updateWorkingMemory / getWorkingMemory               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Memory Provider Layer                                  │
│ @ai-sdk-tools/memory (DrizzleProvider / InMemory)      │
│ - getMessages(chatId, limit)                           │
│ - saveMessage(chatId, userId, role, content)           │
│ - getWorkingMemory / updateWorkingMemory               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│ Storage Backend                                        │
│ Supabase PostgreSQL + RLS                              │
│ - agent_messages (conversation history)                │
│ - agent_working_memory (structured context)            │
│ - agent_chats (metadata)                               │
└─────────────────────────────────────────────────────────┘
```

## Next Steps

### Phase 5c-2 Manual Testing
Execute multi-turn conversation in test group to validate:
- Memory loads correctly (no .slice bug)
- Context includes all history
- Token counts increase (evidence of context inclusion)
- Responses reference previous turns

### Phase 5c-3 User Isolation
Test that different users maintain separate memory:
- User A's context doesn't leak to User B
- RLS policy enforced correctly
- Each user's memory fully isolated

### Performance Optimization (Phase 5e)
- Monitor memory load times
- Implement lazy loading if needed
- Consider message summarization for long conversations

### Production Readiness (Phase 5f-5h)
- Rollout to production
- Setup monitoring and alerting
- Document for operations team
