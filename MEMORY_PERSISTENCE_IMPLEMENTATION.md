# Mastra Memory Persistence Implementation

## Summary

Implemented full message persistence for the Mastra Memory system to enable multi-turn conversations with context retention. Messages are now automatically saved to PostgreSQL (Supabase) after each agent call, enabling semantic recall and conversation history between questions.

## Problem Solved

Memory was being initialized but messages were NOT persisting between calls:
- Q1: 'What is OKR?' → bot responds ✅
- Q2: 'Tell me more about KRs' → bot doesn't have context from Q1 ❌

Log showed:
```
[Manager] Loading conversation history from Mastra Memory...
[Manager] Failed to load memory context: warn: No thread found
```

## Solution Implemented

### 1. Thread Creation on Initialization (lib/agents/manager-agent-mastra.ts:174-201)

Before saving messages, ensure the memory thread exists:

```typescript
if (mastraMemory && memoryThread && memoryResource) {
  const existingThread = await mastraMemory.getThreadById({ threadId: memoryThread });
  if (!existingThread) {
    await mastraMemory.saveThread({
      thread: {
        id: memoryThread,
        resourceId: memoryResource,
        title: `Feishu Chat ${chatId}`,
        metadata: { chatId, rootId },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}
```

**Why this matters:**
- Mastra Memory requires threads to exist before storing messages
- Auto-creates thread on first message (idempotent)
- Includes metadata (chatId, rootId) for debugging

### 2. Message Persistence for Manager Agent (lib/agents/manager-agent-mastra.ts:677-710)

After generating response, explicitly save both user and assistant messages:

```typescript
if (mastraMemory && memoryThread && memoryResource) {
  const timestamp = new Date();
  const userMessageId = `msg-${memoryThread}-user-${timestamp.getTime()}`;
  const assistantMessageId = `msg-${memoryThread}-assistant-${timestamp.getTime()}`;
  
  const messagesToSave = [
    {
      id: userMessageId,
      threadId: memoryThread,
      resourceId: memoryResource,
      role: "user" as const,
      content: { content: query },
      createdAt: timestamp,
    },
    {
      id: assistantMessageId,
      threadId: memoryThread,
      resourceId: memoryResource,
      role: "assistant" as const,
      content: { content: text },
      createdAt: timestamp,
    },
  ];
  
  const savedMessages = await mastraMemory.saveMessages({
    messages: messagesToSave,
    format: 'v2', // Use v2 format for structured message storage
  });
}
```

**Key aspects:**
- Uses `saveMessages()` API (correct method on Memory class)
- Provides unique message IDs (required for v2 format)
- Includes timestamps for semantic recall ordering
- Saves BOTH user query and assistant response (bidirectional context)
- Uses v2 format for structured message storage

### 3. Message Persistence for Routed Specialists (OKR, Alignment, P&L, DPA-PM)

Same pattern applied to all specialist agent routing paths:
- OKR Reviewer (line 278-310)
- Alignment Agent (line 374-406)
- P&L Agent (line 466-498)
- DPA PM Agent (line 561-593)

Each follows identical pattern:
1. Check if memory is available
2. Generate unique message IDs
3. Save user + assistant message pair
4. Log success/failure

## Mastra Memory API Details

### saveMessages() Method Signature

```typescript
saveMessages(args: {
  messages: (MastraMessageV1 | MastraMessageV2)[] | MastraMessageV1[] | MastraMessageV2[];
  memoryConfig?: MemoryConfig | undefined;
  format: 'v2';
}): Promise<MastraMessageV2[]>;
```

### Message Object Structure (v2 format)

```typescript
{
  id: string;              // Unique message ID (required)
  threadId: string;        // Thread identifier
  resourceId: string;      // User/resource identifier
  role: "user" | "assistant";
  content: { content: string };  // Structured content
  createdAt: Date;         // Timestamp for ordering
}
```

## How It Enables Multi-Turn Conversations

1. **First Message (Q1):**
   - User asks: "What is OKR?"
   - Agent responds (saves both messages)
   - Messages stored: `[{user: "What is OKR?"}, {assistant: "OKR is..."}]`

2. **Second Message (Q2):**
   - User asks: "Tell me more about KRs"
   - Agent calls `query()` which retrieves previous messages
   - Context includes Q1 + answer
   - Agent can reference prior context
   - New messages are saved again

3. **Semantic Recall:**
   - Mastra Memory configured with:
     - `lastMessages: 20` - keeps recent context
     - `semanticRecall: { enabled: true, topK: 10 }` - vector-based retrieval
   - Future questions can match against entire history

## Testing Checklist

- [x] Build succeeds without errors
- [x] Type checking passes (TypeScript v2 format)
- [x] Specialist agent saves implemented for all 4 agents
- [x] Thread creation is idempotent (won't fail if thread exists)
- [x] Message IDs are unique (timestamp-based)
- [x] Error handling graceful (continues if memory save fails)

## Files Modified

- **lib/agents/manager-agent-mastra.ts**
  - Added thread creation logic on initialization
  - Implemented message persistence for manager agent
  - Implemented message persistence for 4 specialist agents
  - Removed legacy memory context code
  - Total changes: ~150 lines added/modified

## Next Steps

1. **Real testing in Feishu:** Send Q1, then Q2 in same conversation
   - Verify bot references prior context
   - Check logs for "Loaded X messages from Mastra Memory"

2. **Monitoring:**
   - Check Supabase logs for message storage
   - Verify thread creation (check `.beads/` if available)

3. **Optimization (future):**
   - Consider batching messages if multiple saves happen
   - Add memory usage metrics to devtools

## Known Limitations

- Messages saved immediately (no batching) - could optimize for bulk saves
- Memory failures don't break response (graceful degradation)
- Thread creation happens per-conversation (not per-user) - scoped to chat+thread

## Architecture

```
┌─ Mastra Memory Instance
│  ├─ PostgreSQL Storage (Supabase)
│  │  └─ Threads Table (one per conversation)
│  │  └─ Messages Table (user + assistant turns)
│  └─ Configuration
│     ├─ lastMessages: 20 (recent context)
│     ├─ semanticRecall: enabled (vector search)
│     └─ workingMemory: enabled (persistent facts)
│
└─ Agent Flow
   ├─ Initialize Memory (user scoped)
   ├─ Create Thread (chat+thread scoped)
   ├─ Load History (query() retrieves prior messages)
   ├─ Generate Response
   └─ Save Messages (both user query + response)
```

## References

- Mastra Memory API: https://mastra.ai/docs/memory/overview
- PostgreSQL Storage: https://mastra.ai/reference/storage/postgresql
- Memory Class: https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/reference/memory/memory-class.mdx
