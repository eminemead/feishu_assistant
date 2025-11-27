# Phase 5b Testing Checklist

## Pre-Testing Checklist

### Server Status
- [ ] Server running: `ps aux | grep "bun run dev"`
- [ ] Health check passes: `curl http://localhost:3000/health`
- [ ] Devtools accessible: `curl http://localhost:3000/devtools/api/stats`
- [ ] WebSocket connected (check logs): `tail -20 /tmp/server.log | grep -i websocket`

### Clear Event History
```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

### Open Monitoring
- [ ] Devtools UI: http://localhost:3000/devtools
- [ ] Terminal for API checks: `curl http://localhost:3000/devtools/api/stats | jq .`

---

## Scenario A: Basic Routing

### Test Messages
Send to group: `oc_cd4b98905e12ec0cb68adc529440e623`

```
1. @AI 请分析我们的OKR
2. 我们的团队对齐吗?
3. 最近的P&L如何?
```

### Expected Results
- [ ] Message 1 → OKR Reviewer Agent responds
- [ ] Message 2 → Alignment Agent responds
- [ ] Message 3 → P&L Agent responds
- [ ] All responses < 10 seconds
- [ ] All responses > 100 characters
- [ ] No errors in devtools

### Verification
```bash
# Check stats after test
curl http://localhost:3000/devtools/api/stats | jq .

# Should show:
# - agentHandoffs: 3
# - errors: 0
# - avgToolDuration: < 10000
```

### Result
- [ ] PASS - All 3 agents responded correctly
- [ ] FAIL - One or more agents didn't respond
- [ ] ERROR - Errors logged in devtools

---

## Scenario B: Multi-Turn Context

### Test Conversation (in one thread)
```
Turn 1:
User: What is an OKR?

Turn 2:
User: How many key results should we have?

Turn 3:
User: Analyze our current OKRs
```

### Expected Results
- [ ] Turn 1: Pure explanation, no context
- [ ] Turn 2: References Turn 1 content
- [ ] Turn 3: Incorporates all previous context
- [ ] Memory loads successfully each turn
- [ ] No errors

### Verification (Manual)
- [ ] Read responses and verify context reference
- [ ] Check Turn 2 mentions OKR concept from Turn 1
- [ ] Check Turn 3 integrates all previous context

### Verification (Devtools)
```bash
# Check memory-related events
curl "http://localhost:3000/devtools/api/events?search=memory" | jq .

# Check conversation history loads
curl "http://localhost:3000/devtools/api/events?search=conversation" | jq .
```

### Result
- [ ] PASS - Context awareness demonstrated
- [ ] PARTIAL - Some context but not all
- [ ] FAIL - No context improvement across turns

---

## Scenario C: User Isolation (Optional)

### Prerequisites
- [ ] Access to 2+ different user accounts (if only 1 user, skip)

### Test Steps
```
User A: What's my OKR status?
User B: What's my OKR status?

Verify: Responses are different (user-specific)
        User A can't see User B's memory
        User B can't see User A's memory
```

### Verification
- [ ] User A's response different from User B's
- [ ] No cross-user data leakage
- [ ] Separate memory for each user
- [ ] RLS properly enforced

### Devtools Check
```bash
# Check different userScopeId for each user
curl "http://localhost:3000/devtools/api/events?search=userId" | jq '.events[] | {userId, timestamp}'
```

### Result
- [ ] PASS - Complete isolation verified
- [ ] SKIP - Only 1 user available
- [ ] FAIL - Data leakage detected

---

## Scenario D: Performance & Load

### Test Setup
Send 15 messages rapidly (5 users × 3 messages each)

```bash
# Send messages in rapid succession
# Monitor response times
```

### Expected Results
- [ ] All 15 messages processed (no timeouts)
- [ ] Average response: < 5 seconds
- [ ] p95 response: < 10 seconds
- [ ] No errors or timeouts
- [ ] System stable (no memory leaks)

### Verification
```bash
# Get all events
curl "http://localhost:3000/devtools/api/events?limit=15" | jq '.events[] | {type, duration}'

# Calculate percentiles
# Sort durations, find p95
```

### Performance Targets
- [ ] p50: < 3 seconds
- [ ] p95: < 10 seconds
- [ ] p99: < 15 seconds
- [ ] Error rate: < 1%

### Result
- [ ] PASS - All targets met
- [ ] PARTIAL - Some targets missed
- [ ] FAIL - Performance unacceptable

---

## Scenario E: Error Handling

### Test Cases
Send these edge cases to group:

```
1. Nonsense:     xyz!!!@@@###$$%^&*()
2. Long text:    [5000+ character text]
3. Unicode:      你好 😀 مرحبا 🚀
4. Rapid:        [10+ messages in 5 seconds]
```

### Expected Results
- [ ] Case 1: Handled gracefully (no crash)
- [ ] Case 2: Processed or rejected with message
- [ ] Case 3: Correct encoding/processing
- [ ] Case 4: All queued and processed
- [ ] No unhandled exceptions
- [ ] System continues operating

### Verification
```bash
# Check error count
curl "http://localhost:3000/devtools/api/stats" | jq '.errors'

# Should be 0 or very low (handled gracefully)

# List any errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq '.events'
```

### Result
- [ ] PASS - All cases handled gracefully
- [ ] PARTIAL - Some issues but system recovered
- [ ] FAIL - Crashes or unhandled exceptions

---

## Summary Results

### Scenario Results
| Scenario | Status | Notes |
|----------|--------|-------|
| A (Routing) | [ ] PASS / [ ] FAIL | |
| B (Multi-turn) | [ ] PASS / [ ] FAIL | |
| C (Isolation) | [ ] PASS / [ ] SKIP / [ ] FAIL | |
| D (Performance) | [ ] PASS / [ ] FAIL | |
| E (Error handling) | [ ] PASS / [ ] FAIL | |

### Overall Assessment
- [ ] All scenarios pass → Ready for Phase 5c
- [ ] Some failures → Debug and fix
- [ ] Critical issues → Escalate immediately

### Issues Found
Create beads issues for any failures:
```bash
bd create "Fix: [scenario] [issue description]" -p 1 --deps discovered-from:feishu_assistant-2c4 --json
```

---

## Post-Testing Steps

### Document Results
- [ ] Fill in all checkboxes above
- [ ] Add notes about any issues
- [ ] Save results for Phase 5c

### Commit Results
```bash
git add TESTING_CHECKLIST.md
git commit -m "Phase 5b testing complete: [A-PASS/FAIL] [B-PASS/FAIL] [C-PASS/SKIP/FAIL] [D-PASS/FAIL] [E-PASS/FAIL]"
git push
```

### Update Beads Issue
```bash
bd update feishu_assistant-2c4 --notes "Testing complete: Scenarios [list results]"
```

### Move to Next Phase
- [ ] If all pass → Move to Phase 5c Memory Validation
- [ ] If issues → Fix and retest
- [ ] If blocking issues → Escalate

---

## Quick Commands Reference

```bash
# Clear events before test
curl -X POST http://localhost:3000/devtools/api/clear

# Get stats
curl http://localhost:3000/devtools/api/stats | jq .

# Get all events
curl http://localhost:3000/devtools/api/events | jq .events

# Get events for specific agent
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq .

# Search for errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq .

# Get sessions
curl http://localhost:3000/devtools/api/sessions | jq .sessions
```

---

## Notes Section

Use this to document findings during testing:

```
Scenario A Notes:
- 

Scenario B Notes:
- 

Scenario C Notes:
- 

Scenario D Notes:
- 

Scenario E Notes:
- 

General Issues Found:
- 

Recommendations:
- 
```

---

**Testing Status**: [  ] NOT STARTED / [ ] IN PROGRESS / [ ] COMPLETE

**Date Started**: _______________  
**Date Completed**: _______________  
**Tester Name**: _______________

---

**Next Action**: Document findings and proceed to Phase 5c (Memory Validation)
