# Phase 5: Real Feishu Integration Testing - Quick Reference

**Status**: Phase 5a ✅ Complete | Phase 5b 🚀 In Progress

## One-Minute Setup

```bash
# Start server with devtools (Terminal 1)
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Wait for server to start (5-8 seconds)
# You'll see: "✨ [Startup] Server is ready to accept requests"

# Open devtools in browser (Terminal 2)
open http://localhost:3000/devtools

# Verify health
curl http://localhost:3000/health | jq .status

# You're ready to test!
```

## Quick Test Commands

```bash
# Clear previous test events
curl -X POST http://localhost:3000/devtools/api/clear

# After sending test messages, check stats
curl http://localhost:3000/devtools/api/stats | jq .

# See all events
curl http://localhost:3000/devtools/api/events | jq '.events[] | {type, agent, duration}'

# Filter by agent
curl "http://localhost:3000/devtools/api/events?agent=Manager" | jq .

# Search for errors
curl "http://localhost:3000/devtools/api/events?search=error" | jq .
```

## Test Scenarios at a Glance

### Scenario A: Basic Routing (5-10 min)
```
Send to test group: oc_cd4b98905e12ec0cb68adc529440e623

1. "@AI 请分析我们的OKR"
   → Should route to OKR Reviewer Agent

2. "我们的团队对齐吗?"
   → Should route to Alignment Agent

3. "最近的P&L如何?"
   → Should route to P&L Agent

✅ Pass if: All 3 agents respond within 10s, devtools shows 3 events
```

### Scenario B: Multi-Turn Context (5-10 min)
```
1. "What is an OKR?"
2. "How many key results should we have?"
3. "Analyze our current OKRs"

✅ Pass if: Responses reference previous context, memory loads each turn
```

### Scenario C: User Isolation (5 min, optional)
```
Requires 2+ users/accounts. Test if available.

✅ Pass if: Each user gets separate responses, no cross-user data
```

### Scenario D: Performance (5-10 min)
```
Send 15 messages rapidly (5 users × 3 messages)

✅ Pass if: All respond in <10s, no timeouts, avg <5s
```

### Scenario E: Error Handling (5-10 min)
```
Send edge cases:
- Nonsense text
- Very long text (>5000 chars)
- Unicode/emoji: "你好 😀 مرحبا"
- Rapid messages (10+ in 5 seconds)

✅ Pass if: No crashes, errors logged, system continues
```

## Test Monitoring Dashboard

**Devtools UI**: http://localhost:3000/devtools

**Features**:
- 📊 Real-time event monitoring
- 🔍 Filter by type, agent, tool
- 🚀 Session grouping
- 💰 Token usage tracking
- ⏱️ Response time metrics
- 📈 Error tracking

## Test Results Interpretation

### Good Signs ✅
```json
{
  "totalEvents": 5,          // Events captured
  "toolCalls": 5,            // Tools invoked
  "agentHandoffs": 3,        // Agents routed
  "errors": 0,               // No errors
  "avgToolDuration": 3500    // 3.5 second average
}
```

### Warning Signs ⚠️
```json
{
  "errors": 5,                    // Errors occurred
  "avgToolDuration": 15000,      // >10 seconds slow
  "totalEvents": 0               // Nothing captured
}
```

## Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Server won't start | `echo $FEISHU_APP_ID` - check env vars |
| Devtools 404 | Restart with `ENABLE_DEVTOOLS=true` |
| No events captured | Verify WebSocket connected in logs |
| Slow responses | Check system resources: `top` |
| High error rate | Check error details in devtools |

## Phase 5 Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| 5a: Setup | 30 min | ✅ Complete |
| 5b: Testing | 1.5-2h | 🚀 In Progress |
| 5c: Memory | 1h | ⏳ Pending |
| 5d: Devtools | 45 min | ⏳ Pending |
| 5e: Performance | 1h | ⏳ Pending |
| 5f: Rollout | 1-2h | ⏳ Pending |
| 5g: Monitoring | 30 min | ⏳ Pending |
| 5h: Docs | 1h | ⏳ Pending |
| **Total** | **4-6h** | **In Progress** |

## Important Files

| File | Purpose |
|------|---------|
| `server.ts` | Main Feishu integration |
| `lib/devtools-integration.ts` | Event tracking |
| `lib/devtools-page.html` | UI dashboard |
| `scripts/phase-5-test.sh` | Interactive test script |
| `history/PHASE_5_PLAN.md` | Detailed plan |
| `history/PHASE_5A_COMPLETION.md` | Setup details |
| `history/PHASE_5B_EXECUTION.md` | Testing guide |

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Health check (ok/error) |
| `GET /health` | Detailed metrics |
| `GET /devtools` | UI dashboard |
| `GET /devtools/api/events` | Events API |
| `GET /devtools/api/stats` | Statistics |
| `GET /devtools/api/sessions` | Sessions |
| `POST /devtools/api/clear` | Clear events |

## Test Group

**ID**: `oc_cd4b98905e12ec0cb68adc529440e623`

This is the dedicated test group where all Phase 5 testing happens. Messages sent here will:
1. Be received by WebSocket
2. Route to appropriate agents
3. Generate events in devtools
4. Save memory if applicable
5. Return responses in chat

## Checklist for Phase 5b

- [ ] Server running with `NODE_ENV=development ENABLE_DEVTOOLS=true`
- [ ] WebSocket connected (check logs)
- [ ] Devtools accessible at http://localhost:3000/devtools
- [ ] Health check passing
- [ ] Events cleared for fresh test
- [ ] Scenario A tested (basic routing)
- [ ] Scenario B tested (multi-turn)
- [ ] Scenario C tested (isolation) - optional
- [ ] Scenario D tested (performance)
- [ ] Scenario E tested (error handling)
- [ ] Test results documented
- [ ] No critical errors found
- [ ] Ready to proceed to Phase 5c

## Next Steps

**After Phase 5b**:
1. Document test results
2. Move to Phase 5c (Memory Validation)
3. Continue with 5d, 5e, 5f, 5g, 5h

**Expected Outcome**: All agents working with real Feishu, memory system validated, performance acceptable, ready for phased rollout.

---

**Server Status**: ✅ Running  
**Devtools Status**: ✅ Enabled  
**Test Group**: ✅ Configured  
**Ready for Testing**: ✅ YES

**Start testing**: Send messages to `oc_cd4b98905e12ec0cb68adc529440e623` and watch devtools!
