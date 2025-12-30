# Working Memory Investigation - Session Summary

## Issue Description
Working memory (Layer 1) is not functioning correctly. The bot cannot retrieve and use previously stored user facts across conversations.

## Current Status
- ✅ Working memory functions implemented (`getWorkingMemory`, `updateWorkingMemory`)
- ✅ Working memory extraction created (`working-memory-extractor.ts`)
- ✅ Manager agent loads working memory
- ✅ Working memory injected as system message
- ❌ **Bot still cannot retrieve stored facts**

## Test Scenario That Fails
```bash
1. User: "@_user_2 My team size is 5 people"
2. Wait 2 minutes
3. User: "@_user_2 What's my team size?"
Expected: Bot responds "5 people"
Actual: Bot doesn't remember the team size
```

## Investigation Findings

### 1. Memory Storage Implementation
- **File**: `lib/memory-middleware.ts`
- **Functions**: `getWorkingMemory()`, `updateWorkingMemory()`
- **Storage Method**: Working memory stored as special system messages in thread
- **Format**: JSON string in message content
- **Issue**: Storage looks correct, retrieval may be broken

### 2. Working Memory Extraction
- **File**: `lib/working-memory-extractor.ts`
- **Purpose**: Extract facts from agent responses (team size, goals, preferences)
- **Patterns**: Regex-based extraction for common fact patterns
- **Status**: Implemented but may not be triggering correctly

### 3. Manager Agent Integration
- **File**: `lib/agents/manager-agent-mastra.ts`
- **Loading**: `getWorkingMemory(memoryContext)` called ✅
- **Injection**: Added as system message to messages array ✅
- **Context**: Working memory added to execution context ✅
- **Issue**: Agent still doesn't use the stored facts

### 4. Memory Backend
- **System**: Mastra Memory with PostgreSQL (Supabase)
- **Tables**: `mastra_threads`, `mastra_messages`, `mastra_resources`
- **Configuration**: 3-layer architecture configured
- **Status**: Basic memory operations work, working memory retrieval fails

## Debugging Steps Taken

### 1. Verified Implementation
- ✅ All working memory functions exist
- ✅ Manager agent calls working memory functions
- ✅ System message injection implemented
- ✅ Build compiles successfully

### 2. Checked Logs
- ❌ No "Loaded working memory" logs found
- ❌ No "Enhancing messages with working memory" logs found
- ❌ No "Extracted team size" logs found
- **Conclusion**: Working memory loading may not be executing

### 3. Checked DevTools
- ✅ Agent calls tracked
- ✅ Responses tracked
- ❌ No working memory related events
- **Conclusion**: Working memory code path not executed

## Root Cause Hypotheses

### Hypothesis 1: Memory Context Not Initialized
- `initializeMemoryContext()` may be failing silently
- `memoryContext` could be null/undefined
- Working memory functions return early due to null context

### Hypothesis 2: Thread/Resource ID Mismatch
- Working memory stored with different thread/resource IDs
- Retrieval uses different IDs than storage
- Memory isolation broken between storage and retrieval

### Hypothesis 3: Message Format Incompatibility
- Working memory stored in wrong message format
- `getWorkingMemory()` expects different message structure
- JSON parsing fails silently

### Hypothesis 4: Mastra Memory API Changes
- Mastra Memory API may have changed
- `query()` or `recall()` methods not working as expected
- Working memory retrieval methods broken

## Next Session Action Plan

### Step 1: Add Debug Logging
Add extensive logging to working memory flow:
```typescript
console.log(`[Memory] Context initialized: ${!!memoryContext}`);
console.log(`[Memory] Thread ID: ${memoryThread}`);
console.log(`[Memory] Resource ID: ${memoryResource}`);
console.log(`[Memory] Working memory loaded: ${!!workingMemory}`);
```

### Step 2: Verify Memory Storage
Check if working memory is actually being stored:
```sql
-- Check for system messages with JSON content
SELECT * FROM mastra_messages 
WHERE role = 'system' AND content LIKE '{%}';
```

### Step 3: Test Memory Retrieval Directly
Create test script to verify working memory retrieval:
```typescript
const memory = await createMastraMemory(userId);
const context = await initializeMemoryContext(userId, chatId, rootId);
const workingMemory = await getWorkingMemory(context);
console.log('Working memory:', workingMemory);
```

### Step 4: Check Mastra Memory API
Verify Mastra Memory API methods:
- `memory.getThreadById()` works?
- `memory.query()` returns messages?
- `memory.recall()` returns messages?
- Message format structure?

### Step 5: Manual Memory Test
Bypass working memory functions and test direct storage/retrieval:
```typescript
// Store test data
await memory.saveMessages({
  messages: [{
    role: 'system',
    content: JSON.stringify({teamSize: 5}),
    threadId, resourceId
  }]
});

// Retrieve test data
const result = await memory.query({threadId, resourceId});
console.log('Retrieved messages:', result.messages);
```

## Files to Investigate

1. **`lib/memory-middleware.ts`** - Core working memory functions
2. **`lib/memory-mastra.ts`** - Mastra memory configuration
3. **`lib/agents/manager-agent-mastra.ts`** - Working memory integration
4. **`lib/working-memory-extractor.ts`** - Fact extraction logic
5. **Supabase tables** - `mastra_threads`, `mastra_messages`, `mastra_resources`

## Success Criteria

- [ ] Working memory is successfully stored in database
- [ ] Working memory is successfully retrieved across conversations
- [ ] Agent can access and use stored facts in responses
- [ ] Test scenario passes: "My team size is 5" → "What's my team size?" → "5 people"

## Priority: HIGH
This blocks the entire 3-layer memory system testing and is fundamental to the bot's usefulness.
