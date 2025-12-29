# Feishu Chat History Tool: Concrete Use Cases

## Overview

The `feishu_chat_history` tool provides **explicit access** to Feishu chat messages via API calls. This is different from Mastra Memory, which automatically handles conversation context.

**Key Distinction**:
- **Mastra Memory**: Automatic conversation context (same thread, recent messages)
- **Chat History Tool**: Explicit chat access (any chat, time-based queries, cross-chat operations)

---

## Tool Capabilities

### Parameters

```typescript
{
  chatId: string,        // Required: "oc_xxxxx" (group) or "ou_xxxxx" (private)
  limit?: number,        // Optional: Max messages (default: 50, max: 100)
  startTime?: string,   // Optional: Unix timestamp (seconds)
  endTime?: string      // Optional: Unix timestamp (seconds)
}
```

### What It Returns

```typescript
{
  success: boolean,
  chatId: string,
  messageCount: number,
  messages: Array<{
    messageId: string,
    sender: {
      id: string,
      type: string,
      name: string,
    },
    content: string,
    createTime: string,
    isBot: boolean,
  }>
}
```

---

## Use Case Categories

### Category 1: External Chat Access ⭐ **PRIMARY USE CASE**

**Scenario**: Agent needs to access chats it didn't participate in

**Why Memory Can't Handle This**:
- Memory only stores messages from conversations where the agent participated
- If agent wasn't mentioned/involved, those messages aren't in Memory

**Concrete Examples**:

#### Example 1.1: "What did the team discuss in the DPA team chat yesterday?"
```
User: "What did the team discuss in the DPA team chat yesterday?"

Agent needs to:
1. Know the DPA team chat ID (e.g., "oc_dpa_team_chat")
2. Calculate yesterday's timestamp
3. Call: feishu_chat_history({
     chatId: "oc_dpa_team_chat",
     startTime: "1703001600",  // Yesterday start
     endTime: "1703088000",    // Yesterday end
     limit: 100
   })
4. Summarize the discussions
```

**When This Happens**:
- User asks about team discussions agent wasn't part of
- Agent needs to catch up on missed conversations
- User wants summary of team activity

#### Example 1.2: "Check what Alice said in the project planning chat"
```
User: "Check what Alice said in the project planning chat last week"

Agent needs to:
1. Identify project planning chat ID
2. Filter by sender (Alice's user ID)
3. Call: feishu_chat_history({
     chatId: "oc_project_planning",
     startTime: "1702406400",  // Last week
     limit: 100
   })
4. Filter results by sender.id === "ou_alice"
5. Return Alice's messages
```

**When This Happens**:
- User wants to know what specific person said
- Agent needs to track individual contributions
- User asks about someone's input in a meeting

---

### Category 2: Time-Based Queries ⭐ **PRIMARY USE CASE**

**Scenario**: User asks about messages from specific time periods

**Why Memory Is Limited**:
- Memory keeps last 20 messages (configurable)
- Doesn't support arbitrary time ranges
- Can't query "messages from last month"

**Concrete Examples**:

#### Example 2.1: "What did we discuss last week?"
```
User: "What did we discuss last week?"

Agent needs to:
1. Get current chat ID (from context)
2. Calculate last week's time range
3. Call: feishu_chat_history({
     chatId: "oc_current_chat",
     startTime: "1702406400",  // Last Monday
     endTime: "1703011200",    // Last Sunday
     limit: 100
   })
4. Summarize discussions from that period
```

**When This Happens**:
- User wants to review past discussions
- Agent needs to recall older conversations
- User asks about historical context

#### Example 2.2: "Show me messages from the morning standup"
```
User: "Show me messages from this morning's standup"

Agent needs to:
1. Identify standup chat ID
2. Calculate this morning's time range (e.g., 9am-10am)
3. Call: feishu_chat_history({
     chatId: "oc_standup_chat",
     startTime: "1703059200",  // 9am today
     endTime: "1703062800",    // 10am today
     limit: 50
   })
4. Format and present the messages
```

**When This Happens**:
- User wants to review meeting notes
- Agent needs to reference specific time periods
- User asks about scheduled discussions

---

### Category 3: Cross-Chat Search ⭐ **PRIMARY USE CASE**

**Scenario**: User wants to find information across multiple chats

**Why Memory Can't Handle This**:
- Memory is thread-scoped (one conversation at a time)
- Can't search across multiple chats simultaneously
- Each chat has its own thread ID

**Concrete Examples**:

#### Example 3.1: "Find where we discussed the Q4 OKR review"
```
User: "Find where we discussed the Q4 OKR review"

Agent needs to:
1. Know relevant chat IDs (e.g., ["oc_dpa_team", "oc_okr_chat", "oc_planning"])
2. For each chat, search for "Q4 OKR review"
3. Call: feishu_chat_history({
     chatId: "oc_dpa_team",
     limit: 100
   })
   // Then search content for "Q4 OKR review"
4. Repeat for other chats
5. Return all matches across chats
```

**When This Happens**:
- User wants to find discussions across team chats
- Agent needs to search multiple conversation threads
- User asks about topics that span multiple chats

#### Example 3.2: "What did we decide about the new feature in all team chats?"
```
User: "What did we decide about the new feature in all team chats?"

Agent needs to:
1. Get list of team chat IDs
2. For each chat, fetch recent messages
3. Search for "new feature" mentions
4. Extract decisions/action items
5. Summarize across all chats
```

**When This Happens**:
- User wants comprehensive view across teams
- Agent needs to aggregate information from multiple sources
- User asks about decisions made in different contexts

---

### Category 4: Explicit Chat Fetch ⭐ **SECONDARY USE CASE**

**Scenario**: User explicitly requests a specific chat

**Why Tool Is Better**:
- User knows exactly which chat they want
- Tool provides full message list
- Memory might not have all messages

**Concrete Examples**:

#### Example 4.1: "Show me the last 50 messages from the DPA team chat"
```
User: "Show me the last 50 messages from the DPA team chat"

Agent needs to:
1. Identify DPA team chat ID
2. Call: feishu_chat_history({
     chatId: "oc_dpa_team",
     limit: 50
   })
3. Format and display messages
```

**When This Happens**:
- User wants to see raw chat history
- Agent needs to show full conversation
- User explicitly requests specific chat

#### Example 4.2: "Get all messages from the incident response chat"
```
User: "Get all messages from the incident response chat"

Agent needs to:
1. Identify incident response chat ID
2. Call: feishu_chat_history({
     chatId: "oc_incident_response",
     limit: 100  // Max allowed
   })
3. If more messages exist, paginate or inform user
```

**When This Happens**:
- User wants complete chat export
- Agent needs to analyze full conversation
- User requests comprehensive chat review

---

### Category 5: Context Gathering for Analysis ⭐ **SECONDARY USE CASE**

**Scenario**: Agent needs to gather context from multiple sources before answering

**Why Tool Is Needed**:
- Memory only has current thread context
- Agent needs broader context from other chats
- Tool provides explicit control over what to fetch

**Concrete Examples**:

#### Example 5.1: "Summarize what happened in the team this week"
```
User: "Summarize what happened in the team this week"

Agent needs to:
1. Identify relevant team chats
2. For each chat, fetch this week's messages
3. Call: feishu_chat_history({
     chatId: "oc_team_chat_1",
     startTime: "1703011200",  // Start of week
     limit: 100
   })
4. Repeat for other team chats
5. Analyze and summarize across all chats
```

**When This Happens**:
- User wants team activity summary
- Agent needs to aggregate information
- User asks for comprehensive overview

#### Example 5.2: "What are the main topics discussed in the engineering chat?"
```
User: "What are the main topics discussed in the engineering chat?"

Agent needs to:
1. Identify engineering chat ID
2. Fetch recent messages (e.g., last 200)
3. Call: feishu_chat_history({
     chatId: "oc_engineering",
     limit: 100  // May need multiple calls
   })
4. Analyze message content for topics
5. Extract and summarize main themes
```

**When This Happens**:
- User wants topic analysis
- Agent needs to understand chat themes
- User asks for insights from conversations

---

## When NOT to Use the Tool

### ❌ Don't Use Tool For:

1. **Current conversation context**
   - Memory automatically provides last 20 messages
   - No need to explicitly fetch current thread

2. **Recent messages in same thread**
   - Memory handles this automatically
   - Tool would be redundant

3. **Semantic search within conversation**
   - Memory's `semanticRecall` handles this
   - Finds relevant past messages automatically

4. **Working memory extraction**
   - Memory can extract and store facts
   - No need to manually fetch and parse

---

## Decision Tree: Tool vs Memory

```
User asks about chat history
    │
    ├─ Is it the current conversation thread?
    │   └─ YES → Use Memory (automatic)
    │   └─ NO → Continue
    │
    ├─ Did agent participate in the chat?
    │   └─ YES → Check Memory first, use Tool if needed
    │   └─ NO → Use Tool (Memory doesn't have it)
    │
    ├─ Is it a time-based query (specific date/time)?
    │   └─ YES → Use Tool (Memory limited to recent messages)
    │   └─ NO → Continue
    │
    ├─ Is it cross-chat search?
    │   └─ YES → Use Tool (Memory is thread-scoped)
    │   └─ NO → Continue
    │
    └─ Is it explicit chat fetch request?
        └─ YES → Use Tool
        └─ NO → Use Memory (automatic context)
```

---

## Real-World Scenarios for dpa_mom Agent

### Scenario 1: Team Activity Summary
```
User: "What did the DPA team discuss this week?"

dpa_mom needs to:
1. Use Tool: feishu_chat_history({
     chatId: "oc_dpa_team",
     startTime: "1703011200",  // Start of week
     limit: 100
   })
2. Analyze messages for key topics
3. Summarize: "This week the team discussed:
   - Q4 OKR review preparation
   - New data pipeline deployment
   - Team offsite planning"
```

### Scenario 2: Finding Past Decisions
```
User: "Where did we decide to use PostgreSQL for the new project?"

dpa_mom needs to:
1. Identify relevant chats (e.g., ["oc_dpa_team", "oc_tech_discussions"])
2. For each chat, use Tool to fetch recent messages
3. Search for "PostgreSQL" mentions
4. Find decision context
5. Return: "Decision made in DPA team chat on Dec 15, 2023:
   [message content with decision]"
```

### Scenario 3: Catching Up on Missed Conversations
```
User: "I was out last week, what did I miss in the team chat?"

dpa_mom needs to:
1. Calculate last week's time range
2. Use Tool: feishu_chat_history({
     chatId: "oc_dpa_team",
     startTime: "1702406400",  // Last week start
     endTime: "1703011200",    // Last week end
     limit: 100
   })
3. Summarize key discussions and decisions
4. Highlight action items user might need to follow up on
```

### Scenario 4: Cross-Team Coordination
```
User: "What did the data team and engineering team discuss about the API?"

dpa_mom needs to:
1. Use Tool for data team chat:
   feishu_chat_history({ chatId: "oc_data_team", limit: 100 })
2. Use Tool for engineering chat:
   feishu_chat_history({ chatId: "oc_engineering", limit: 100 })
3. Search both for "API" mentions
4. Compare and synthesize discussions
5. Provide unified summary
```

---

## Implementation Examples

### Example: Tool Usage in Agent Response

```typescript
// In dpa_mom agent instructions or tool usage:

// User: "What did we discuss in the team chat yesterday?"

// Agent decides to use tool:
const result = await feishu_chat_history({
  chatId: "oc_dpa_team",
  startTime: "1703001600",  // Yesterday start
  endTime: "1703088000",    // Yesterday end
  limit: 100
});

// Agent processes result:
if (result.success && result.messages.length > 0) {
  // Analyze messages
  const topics = extractTopics(result.messages);
  const decisions = extractDecisions(result.messages);
  
  // Respond to user
  return `Yesterday in the team chat, we discussed:
  
  **Main Topics:**
  ${topics.map(t => `- ${t}`).join('\n')}
  
  **Decisions Made:**
  ${decisions.map(d => `- ${d}`).join('\n')}`;
}
```

---

## Summary: When to Use Chat History Tool

### ✅ **Use Tool When**:

1. **External chat access** - Chats agent didn't participate in
2. **Time-based queries** - Specific date/time ranges
3. **Cross-chat search** - Search across multiple chats
4. **Explicit requests** - User asks for specific chat
5. **Context gathering** - Need broader context for analysis

### ❌ **Don't Use Tool When**:

1. **Current conversation** - Memory handles automatically
2. **Recent messages** - Memory provides last 20 messages
3. **Semantic recall** - Memory's semanticRecall handles this
4. **Working memory** - Memory extracts and stores facts

---

## Current Status

**Tool is available** to `dpa_mom` agent but **may not be actively used** yet.

**Recommendation**:
- Keep tool available for explicit use cases
- Update agent instructions to use tool for:
  - External chat access
  - Time-based queries
  - Cross-chat operations
- Rely on Memory for automatic conversation context

---

## Future Enhancements

1. **Chat ID resolution** - Helper to resolve chat names to IDs
2. **Message filtering** - Filter by sender, keywords, message type
3. **Pagination** - Handle chats with >100 messages
4. **Caching** - Cache frequently accessed chats
5. **Semantic search** - Add semantic search over fetched messages

