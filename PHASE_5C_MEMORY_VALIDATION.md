# Phase 5c: Memory Persistence Validation

**Goal**: Verify memory works correctly with real Feishu data, RLS isolation, multi-turn context.

## Status: IN PROGRESS

Phase 5b confirmed agent routing works end-to-end. Now validate the memory system persists conversation context and maintains user/group isolation.

## Test Scenarios

### 1. Single User Multi-Turn Context Preservation
**Objective**: Verify memory maintains context across sequential messages in the same thread.

**Setup**:
- User sends Q1 in test group thread
- Agent responds A1 (with memory saved)
- User sends Q2 (should have access to Q1/A1 context)
- Agent responds A2 (referencing previous context)

**Success Criteria**:
- Q1/A1 saved to Supabase (agent_messages table)
- Q2 includes previous context in agent input
- A2 demonstrates context awareness (e.g., "As we discussed before...")
- All messages linked via conversation_id (feishu:chat_id:root_id)

**Testing via Devtools**:
```bash
# 1. Monitor devtools in real-time
curl http://localhost:3000/devtools/api/events?type=agent_call&limit=100

# 2. Send messages in test group thread (manual via Feishu)
#    Q1: "What are Q4 OKR best practices?"
#    Q2: "How do I apply those to my team?"

# 3. Check event logs in devtools
#    - Look for agent_call events
#    - Check token usage (should show memory input)
#    - Verify memory_addition in context

# 4. Verify Supabase directly
psql $SUPABASE_DATABASE_URL -c "\
  SELECT id, conversation_id, role, content, created_at \
  FROM agent_messages \
  WHERE conversation_id LIKE 'feishu:%' \
  ORDER BY created_at DESC \
  LIMIT 20"
```

### 2. User Isolation within Same Thread
**Objective**: Verify that when multiple users message in the same group thread, each maintains separate memory.

**Setup**:
- User A sends "My OKR focus is sales"
- User B sends "My OKR focus is engineering"
- User A sends follow-up question (should NOT see User B's context)

**Success Criteria**:
- User A's messages stored with `user_id = A`
- User B's messages stored with `user_id = B`
- When loading memory for User A, User B's messages are filtered out
- RLS policy enforces isolation (not just application-level)

**Testing**:
```bash
# Check RLS enforcement in Supabase
psql $SUPABASE_DATABASE_URL -c "\
  SELECT name, definition \
  FROM pg_policies \
  WHERE tablename = 'agent_messages'"

# Verify isolation via query with test user role
# (This requires Supabase JWT tokens - more advanced testing)
```

### 3. Group Chat Memory Scope
**Objective**: Verify memory is scoped by conversation_id (chatId + rootId), not just chatId.

**Setup**:
- Thread 1: User asks "Best practices for OKRs"
- Thread 2: User asks "Performance reviews" (different thread)
- Verify memory is NOT shared between threads

**Success Criteria**:
- Thread 1 memory conversation_id: `feishu:chat_123:root_456`
- Thread 2 memory conversation_id: `feishu:chat_123:root_789`
- Agent A2 in Thread 1 doesn't reference Thread 2's context
- Both threads maintain independent history

### 4. Memory Persistence Across Server Restarts
**Objective**: Verify Supabase persistence - memory survives server restart.

**Setup**:
- Send multi-turn exchange (Q1, A1, Q2, A2)
- Restart server (`bd sync && pkill -f "bun run dev"`)
- Resume conversation (Q3 should use Q1/A1/Q2/A2 context)

**Success Criteria**:
- Message history still in Supabase after restart
- Q3 response references previous turns
- Devtools shows memory tokens in new session

### 5. Memory Token Usage Tracking
**Objective**: Verify token usage is tracked for memory operations.

**Testing via Devtools**:
```bash
# Check token usage in devtools events
curl http://localhost:3000/devtools/api/events?limit=50 | jq '.[] | {
  agent: .metadata.agent,
  tokens_input: .metadata.tokens?.input,
  tokens_output: .metadata.tokens?.output,
  memory_tokens: .metadata.memory_tokens
}'

# Also check via devtools UI
# http://localhost:3000/devtools
# - Real-time monitoring tab
# - Filter by token usage to see memory impact
```

## Execution Plan

### Phase 5c-1: Setup Memory Monitoring (15 min)
- [ ] Verify Supabase connection is active
- [ ] Confirm memory tables exist (agent_messages, agent_chats, agent_working_memory)
- [ ] Test direct Supabase query access
- [ ] Verify devtools is capturing memory events

**Commands**:
```bash
# Check Supabase connection
curl http://localhost:3000/health

# Verify tables exist
psql $SUPABASE_DATABASE_URL -c "\dt agent_*"

# Run memory integration tests
bun test test/integration/memory-integration.test.ts
bun test test/integration/memory-multiturn.test.ts
```

### Phase 5c-2: Single User Multi-Turn Validation (30 min)
- [ ] Send Q1 in test group thread
- [ ] Verify Q1 saved to agent_messages
- [ ] Send Q2 (check that memory is loaded)
- [ ] Verify A2 references previous context
- [ ] Monitor devtools for token usage

**Test Messages**:
```
Q1: "What are the key principles of OKR setting?"
   Expected: Full explanation of OKR principles
   
Q2: "How can I apply those principles to my engineering team?"
   Expected: References back to principles, applies them to engineering context
```

### Phase 5c-3: User Isolation Validation (30 min)
- [ ] Have 2 users message in test group thread
- [ ] Verify memory isolation at database level
- [ ] Confirm agents don't cross-contaminate context

**Test Messages** (from different users):
```
User A: "I'm focusing on revenue growth"
User B: "I'm focusing on product quality"
User A: "How do I track progress?"
   Expected: NO mention of User B's goals, only A's context
```

### Phase 5c-4: Documentation & Cleanup (15 min)
- [ ] Document findings in session summary
- [ ] Update issue status
- [ ] Commit memory validation test scripts

## Success Definition

✅ Phase 5c is complete when:
1. Multi-turn conversations maintain context across Q/A exchanges
2. Different users in same thread have isolated memory
3. Memory persists correctly to Supabase
4. Devtools shows memory token usage
5. No errors in memory operations

## Blockers

- None currently identified
- Fallback: If Supabase unavailable, InMemory provider allows basic testing

## Next Phase (5d)

**Phase 5d: Devtools Monitoring Verification**
- Verify all agent calls are captured in devtools
- Check event filtering and search functionality
- Validate token cost estimation
- Test multi-turn tool session grouping
