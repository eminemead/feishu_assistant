# Start Testing Phase 5b NOW

## Your Setup is Ready! ✅

Server is running and healthy. Devtools is enabled. Test group is configured.

### Quick Test Instructions

**Follow these steps in order:**

---

## Step 1: Open Devtools Dashboard

Open in your browser:
```
http://localhost:3000/devtools
```

You should see a real-time event monitoring dashboard.

---

## Step 2: Clear Event History

Before each scenario, clear previous events:
```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

---

## Step 3: Test Scenario A - Basic Routing

**In your Feishu group** `oc_cd4b98905e12ec0cb68adc529440e623`, send these 3 messages:

```
1. @AI 请分析我们的OKR
2. 我们的团队对齐吗?
3. 最近的P&L如何?
```

**What to expect:**
- Message 1 → OKR Reviewer Agent responds
- Message 2 → Alignment Agent responds
- Message 3 → P&L Agent responds
- All responses within 10 seconds

**Watch the devtools dashboard:**
- You should see 3 events appear in real-time
- Each should show agent routing information
- Duration should be < 10000ms

**Verify:**
```bash
curl http://localhost:3000/devtools/api/stats | jq .
```

Should show:
- `agentHandoffs: 3`
- `errors: 0`

✅ **Success**: All 3 agents responded  
❌ **Failure**: One or more agents didn't respond

---

## Step 4: Test Scenario B - Multi-Turn Context

**In same group or thread, send these messages in sequence:**

```
1. What is an OKR?
2. How many key results should we have?
3. Analyze our current OKRs
```

**What to expect:**
- Message 1: Pure explanation, no context
- Message 2: References Message 1 content (mentions OKR concept)
- Message 3: Incorporates both previous messages

**Manual check:**
- Read the responses carefully
- Does Turn 2 mention the OKR definition from Turn 1?
- Does Turn 3 reference both previous answers?

✅ **Success**: Context awareness demonstrated  
❌ **Failure**: No reference to previous context

---

## Step 5: Test Scenario C - User Isolation (Optional)

**Only if you have access to 2+ user accounts:**

User A: `What's my OKR status?`
User B: `What's my OKR status?`

**What to expect:**
- Different responses (user-specific data)
- User A cannot see User B's conversation
- User B cannot see User A's conversation

✅ **Success**: Complete isolation  
⏭️ **Skip**: Only 1 user available

---

## Step 6: Test Scenario D - Performance & Load

**Send many messages rapidly:**

Send 15+ messages to the group in quick succession (within 1-2 minutes)

**What to expect:**
- All messages processed (no timeouts)
- Average response time < 5 seconds
- p95 response time < 10 seconds
- No errors

**Check performance:**
```bash
curl http://localhost:3000/devtools/api/events | jq '.events[] | {duration}' | head -20
```

All durations should be < 10000ms

✅ **Success**: Fast responses, no timeouts  
❌ **Failure**: Slow responses or timeouts

---

## Step 7: Test Scenario E - Error Handling

**Send these edge cases:**

```
1. Nonsense: xyz!!!@@@###$$%^&*()
2. Long text: [copy/paste 5000+ character text]
3. Unicode: 你好 😀 مرحبا 🚀
4. Rapid: Send 10+ messages within 5 seconds
```

**What to expect:**
- No crashes
- System continues working
- All messages processed or handled gracefully

**Verify no errors:**
```bash
curl http://localhost:3000/devtools/api/stats | jq '.errors'
```

Should be 0 (or very low)

✅ **Success**: Graceful error handling  
❌ **Failure**: Crashes or unhandled exceptions

---

## View Full Report

After testing scenarios, view the summary:

```bash
curl http://localhost:3000/devtools/api/stats | jq .
```

Sample output:
```json
{
  "totalEvents": 50,
  "toolCalls": 15,
  "agentHandoffs": 15,
  "errors": 0,
  "avgToolDuration": 4500
}
```

---

## Document Your Results

Fill in the testing checklist:

```bash
open TESTING_CHECKLIST.md
# Check off each scenario as you complete it
# Note any issues found
```

---

## Summary Table

| Scenario | Time | Status | Notes |
|----------|------|--------|-------|
| A (Routing) | 5 min | [ ] PASS / [ ] FAIL | |
| B (Multi-turn) | 5 min | [ ] PASS / [ ] FAIL | |
| C (Isolation) | 5 min | [ ] PASS / [ ] SKIP / [ ] FAIL | |
| D (Performance) | 5-10 min | [ ] PASS / [ ] FAIL | |
| E (Error handling) | 5 min | [ ] PASS / [ ] FAIL | |

**Total estimated time**: 30-35 minutes

---

## Useful Commands

```bash
# Clear events
curl -X POST http://localhost:3000/devtools/api/clear

# Get stats
curl http://localhost:3000/devtools/api/stats | jq .

# Get all events
curl http://localhost:3000/devtools/api/events | jq .

# Get events for specific agent
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq .

# Search for errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq .

# Get session info
curl http://localhost:3000/devtools/api/sessions | jq .
```

---

## Test Group Reference

**Send all test messages to:**
```
oc_cd4b98905e12ec0cb68adc529440e623
```

This is your dedicated testing group - messages here won't affect production.

---

## If Something Goes Wrong

### Server not responding
```bash
ps aux | grep "bun run dev"
# If not running, start it:
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev
```

### Devtools not working
```bash
# Check it's enabled
curl http://localhost:3000/devtools/api/stats
# Should return JSON, not 404
```

### Events not appearing
```bash
# Verify WebSocket is connected
tail -20 /tmp/server.log | grep -i websocket
# Should show "ws client ready"
```

### Agent not responding
```bash
# Check manager agent was called
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq '.events | length'
# Should be > 0
```

---

## Next Steps

After completing all 5 scenarios:

1. **Document results** in `TESTING_CHECKLIST.md`
2. **Fix any issues** (create beads issues if needed)
3. **Proceed to Phase 5c** (Memory Validation)

---

## Start Now! 🚀

1. Open devtools: `http://localhost:3000/devtools`
2. Send test messages to: `oc_cd4b98905e12ec0cb68adc529440e623`
3. Watch events appear in real-time
4. Check results with curl commands above

**Everything is ready. Begin testing!**
