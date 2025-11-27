# Phase 5b: Execute Real Message Test Scenarios

## Status
IN PROGRESS - Testing scenarios A through E

## Overview

Phase 5b will execute 5 test scenarios using the infrastructure set up in Phase 5a:
- **Server**: Running in Subscription Mode with WebSocket
- **Devtools**: Enabled for real-time event monitoring
- **Test Group**: `oc_cd4b98905e12ec0cb68adc529440e623`
- **Testing Method**: Interactive script with manual verification

## Test Scenarios

### Scenario A: Basic Routing & Agent Response
**Goal**: Verify Manager Agent correctly routes to specialist agents

**Test Flow**:
```
1. Send: "@AI 请分析我们的OKR"
   Expected: OKR Reviewer Agent responds
   Verify: Response contains OKR analysis

2. Send: "我们的团队对齐吗?"
   Expected: Alignment Agent responds
   Verify: Response about team alignment

3. Send: "最近的P&L如何?"
   Expected: P&L Agent responds
   Verify: Response about financial status
```

**Success Criteria**:
- ✅ Correct agent routing (right specialist handles each)
- ✅ Response received within 10 seconds
- ✅ Response is substantive (>100 characters)
- ✅ No errors logged in devtools
- ✅ Memory context loaded

**Monitoring**:
```bash
# Before test:
curl -X POST http://localhost:3000/devtools/api/clear

# Send test messages to group

# After test:
curl http://localhost:3000/devtools/api/stats | jq .
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq '.events[] | {agent, duration}'
```

**Expected Devtools Output**:
```json
{
  "totalEvents": 3,
  "agentHandoffs": 3,
  "toolCalls": 3,
  "avgToolDuration": 3000
}
```

---

### Scenario B: Multi-Turn Context Awareness
**Goal**: Verify memory system improves response quality across turns

**Test Flow**:
```
Turn 1:
- User: "What is an OKR?"
- AI: [Explains OKR concept]
- Memory: Q1 + A1 saved

Turn 2:
- User: "How many key results should we have?"
- AI: [Refers back to Q1, provides specific guidance]
- Memory: Loads Q1+A1, adds Q2+A2

Turn 3:
- User: "Analyze our current OKRs"
- AI: [Uses all accumulated context]
- Memory: Loads Q1-Q2, adds Q3 context
```

**Success Criteria**:
- ✅ Agent references or acknowledges previous messages
- ✅ Memory history loads (visible in logs)
- ✅ Response quality improves with context
- ✅ All messages saved to memory
- ✅ No repetition across turns

**Monitoring**:
```bash
# Check memory loads
curl "http://localhost:3000/devtools/api/events?search=memory" | jq .

# Check agent sessions
curl http://localhost:3000/devtools/api/sessions | jq '.sessions[] | {agent, steps}'

# Verify context awareness
# (Manual: read responses and verify they reference previous context)
```

**Expected Behavior**:
- Turn 1 response: Pure explanation, no context
- Turn 2 response: References Q1 content, provides guidance
- Turn 3 response: Incorporates all previous context

---

### Scenario C: User Isolation & RLS
**Goal**: Verify memory isolation between different users

**Test Flow** (requires 2+ users):
```
User A (Alice):
- Send: "What's my OKR status?"
- AI-A: [Response A - Alice's specific data]
- Memory-A: Saved under Alice's user ID

User B (Bob):
- Send: "What's my OKR status?"
- AI-B: [Response B - Bob's specific data]
- Memory-B: Saved under Bob's user ID

Verification:
- Alice cannot see Bob's memory
- Bob cannot see Alice's memory
- RLS policy enforces isolation
```

**Success Criteria**:
- ✅ Each user has separate memory
- ✅ User A's conversation not visible to User B
- ✅ RLS properly enforces isolation
- ✅ No cross-user data leakage
- ✅ Responses are user-specific

**Monitoring**:
```bash
# Check separate memory contexts
curl "http://localhost:3000/devtools/api/events?search=userId" | jq .

# Verify RLS in Supabase logs (if available)
# Check different userScopeId for each user
```

**Note**: If only 1 user available, skip this scenario or use different accounts

---

### Scenario D: Performance & Concurrent Load
**Goal**: Verify performance meets targets under load

**Test Flow**:
```
Send concurrent messages from multiple users:
- 5 users × 3 messages = 15 total messages
- Slight delay between each (200-500ms)
- Monitor response times and resource usage
```

**Success Criteria**:
- ✅ All messages processed (no timeouts)
- ✅ Response time p95 < 10 seconds
- ✅ Token usage reasonable
- ✅ No memory leaks (stable resources)
- ✅ Devtools handles event volume
- ✅ No errors under load

**Monitoring**:
```bash
# Monitor concurrent requests
curl http://localhost:3000/devtools/api/stats | jq '{totalEvents, toolCalls, avgToolDuration}'

# Check response time distribution
curl "http://localhost:3000/devtools/api/events?limit=100" | jq '.events[] | {type, duration}' | sort

# Check errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq '.events | length'
```

**Performance Targets**:
- p50 response: < 3 seconds
- p95 response: < 10 seconds  
- p99 response: < 15 seconds
- Error rate: < 1%

---

### Scenario E: Error Handling & Edge Cases
**Goal**: Verify system handles errors gracefully

**Test Cases**:
```
1. Nonsense Input:
   Send: "xyz!!!@@@###$$%^&*()"
   Expected: Handled gracefully, agent responds or fails gracefully

2. Long Input:
   Send: 5000+ character text
   Expected: Processed or rejected with clear error

3. Unicode/Special Chars:
   Send: "你好 😀 مرحبا 🚀"
   Expected: Processed correctly

4. Rapid-Fire Messages:
   Send: 10+ messages in 5 seconds
   Expected: Queue processed, no data loss

5. Special Formats:
   Send: Code blocks, tables, special formatting
   Expected: Preserved or handled appropriately
```

**Success Criteria**:
- ✅ All edge cases handled gracefully
- ✅ No crashes or exceptions
- ✅ Errors logged to devtools
- ✅ System continues operating
- ✅ Users receive feedback (error message or response)

**Monitoring**:
```bash
# Count errors
curl "http://localhost:3000/devtools/api/stats" | jq '.errors'

# List error events
curl "http://localhost:3000/devtools/api/events?search=error" | jq '.events'

# Check specific error types
curl "http://localhost:3000/devtools/api/events?type=error" | jq '.events[] | {error, timestamp}'
```

---

## Execution Guide

### Quick Start
```bash
# 1. Ensure server is running
ps aux | grep "bun run dev" | grep -v grep

# 2. Open devtools in browser
open http://localhost:3000/devtools

# 3. Run test script
./scripts/phase-5-test.sh

# 4. Follow interactive prompts
```

### Manual Testing

**Before Each Scenario**:
```bash
# Clear event history
curl -X POST http://localhost:3000/devtools/api/clear

# Check initial state
curl http://localhost:3000/devtools/api/stats | jq .
```

**During Test**:
- Send messages to test group: `oc_cd4b98905e12ec0cb68adc529440e623`
- Watch devtools dashboard for real-time events
- Monitor response times in devtools UI

**After Each Scenario**:
```bash
# Get summary stats
curl http://localhost:3000/devtools/api/stats | jq .

# Get detailed events
curl http://localhost:3000/devtools/api/events | jq '.events[] | {type, agent, duration, error}'

# Document results
```

### Detailed Test Script Usage
```bash
chmod +x scripts/phase-5-test.sh
./scripts/phase-5-test.sh

# Menu options:
# A) Run Scenario A (Basic Routing)
# B) Run Scenario B (Multi-Turn)
# C) Run Scenario C (User Isolation)
# D) Run Scenario D (Performance)
# E) Run Scenario E (Error Handling)
# R) Print test report
# Q) Quit and generate final report
```

---

## Expected Results Summary

| Scenario | Pass Criteria | Typical Result |
|----------|---------------|----------------|
| A (Routing) | 3 agents respond in <10s | ✅ 3 events, avg 3-4s |
| B (Multi-turn) | Context improves response | ✅ References previous context |
| C (Isolation) | Separate memory per user | ✅ No data leakage |
| D (Performance) | p95 < 10s under 15 msgs | ✅ Avg 3-5s, p95 8-10s |
| E (Error handling) | No crashes, errors logged | ✅ Graceful degradation |

## Troubleshooting

### Messages Not Appearing in Devtools
```bash
# Check WebSocket connection
grep "WebSocket\|ws client ready" /tmp/server.log

# Verify server is receiving messages
curl http://localhost:3000/devtools/api/events | jq '.events | length'

# If 0 events: Messages aren't reaching server
# Verify test group ID is correct and bot is in group
```

### High Response Times
```bash
# Check system resources
top -l 1 | grep -E "CPU|Mem"

# Check if other processes are using resources
ps aux | sort -k3 -r | head -10

# Check network latency to Feishu
# May indicate network issues rather than code issues
```

### Agent Not Routing Correctly
```bash
# Check manager agent was called
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq .

# Check specific agent routing
curl "http://localhost:3000/devtools/api/events?agent=OKRReviewer" | jq .

# Look for errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq .
```

### Memory Not Loading
```bash
# Check memory-related events
curl "http://localhost:3000/devtools/api/events?search=memory" | jq .

# Check conversation history
curl "http://localhost:3000/devtools/api/events?search=conversation" | jq .

# Verify Supabase connection
grep "Supabase\|Memory\|database" /tmp/server.log | tail -5
```

---

## Next Steps After Phase 5b

Once all scenarios are tested:

1. **Phase 5c**: Memory Persistence Validation
   - Deep dive into memory system
   - RLS isolation testing
   - Recovery procedures

2. **Phase 5d**: Devtools Monitoring Verification
   - Validate all events captured
   - Check filtering accuracy
   - Statistics verification

3. **Phase 5e**: Performance Analysis
   - Response time distribution
   - Token usage calculation
   - Cost estimation

4. **Phase 5f**: Phased Rollout
   - Single user testing
   - Small group testing
   - Full deployment

---

## Beads Issue

Tracking: **feishu_assistant-2c4**
- Phase 5b: Execute Real Message Test Scenarios
- Status: IN PROGRESS
- Scenarios: A, B, C, D, E to be tested

---

**Estimated Duration**: 1.5-2 hours (including manual testing time)  
**Current Status**: Ready for testing  
**Next Milestone**: Phase 5c Memory Validation
