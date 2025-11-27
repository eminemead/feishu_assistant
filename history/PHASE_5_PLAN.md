# Phase 5: Real Feishu Integration Testing - Plan

**Status**: 📋 PLANNED  
**Phase**: 5 of 6 (Mastra Migration)  
**Effort**: ~4-6 hours  
**Risk Level**: Medium (touches production Feishu)  
**Timeline**: 1-3 days (phased rollout)

---

## Executive Summary

Phase 5 transitions from lab testing (unit/integration tests) to real-world validation with actual Feishu messages and users. All agents will be tested in a production-like environment with comprehensive monitoring.

### Key Objectives

1. **Validate Complete Integration** - Mastra agents work end-to-end with real Feishu
2. **Test Memory System** - Multi-turn conversations work with actual users
3. **Monitor Performance** - Response times, token costs within acceptable ranges
4. **Plan Rollout** - Phased approach (1 user → group → all users)
5. **Establish Procedures** - Monitoring, alerting, and rollback ready

### Success Definition

✅ All agents respond correctly to real Feishu messages  
✅ Memory system improves response quality across turns  
✅ Token costs within budget  
✅ Response time <10s (p95)  
✅ Error rate <1%  
✅ Zero data loss/corruption  
✅ Devtools shows all expected events  

---

## Part 1: Test Scenarios

### Scenario A: Basic Routing & Routing

**Setup**: Real Feishu group, admin user in test mode

**Test Flow**:
```
1. User sends: "@AI 请分析我们的OKR"
   Expected → OKR Reviewer Agent responds with analysis
   
2. User sends: "我们的团队对齐吗?"
   Expected → Alignment Agent responds about alignment
   
3. User sends: "最近的P&L如何?"
   Expected → P&L Agent responds with analysis
```

**Success Criteria**:
- ✅ Correct agent routing (right specialist handles each query)
- ✅ Response received within 10 seconds
- ✅ Response is substantive (>100 characters)
- ✅ No errors logged in devtools
- ✅ Memory context loaded successfully

**Monitoring**:
- Agent call events recorded
- Response duration tracked
- No error events

---

### Scenario B: Multi-Turn Context

**Setup**: Same conversation thread, multiple messages

**Test Flow**:
```
1. User: "What is an OKR?"
   AI: Explains OKR concept
   [Memory saved: Q1 + A1]

2. User: "How many key results should we have?"
   AI: Refers back to OKR explanation, provides specific guidance
   [Memory loaded: previous Q1+A1, answer references context]

3. User: "Analyze our current OKRs"
   AI: Uses accumulated context from previous turns
   [Memory loaded: Q1+A1+Q2+A2, incorporates all context]
```

**Success Criteria**:
- ✅ Agent references or acknowledges previous messages
- ✅ Memory history loaded before second/third turn
- ✅ Response quality improves with context (not just repetitive)
- ✅ All messages saved to memory

**Monitoring**:
- loadConversationHistory() called successfully
- Previous message count increases across turns
- No memory save failures

---

### Scenario C: User Isolation

**Setup**: Multiple users in same chat

**Test Flow**:
```
User A: "What's my OKR status?"
AI A: [Response A - specific to User A's data]

User B: "What's my OKR status?"
AI B: [Response B - specific to User B's data]

Verify: User A cannot see User B's memory
Verify: User B cannot see User A's memory
```

**Success Criteria**:
- ✅ Each user has separate memory
- ✅ User A's conversation not visible to User B
- ✅ RLS properly enforces isolation
- ✅ No cross-user data leakage

**Monitoring**:
- Different userScopeId for each user
- Separate memory contexts loaded
- No RLS violations in database logs

---

### Scenario D: Performance & Load

**Setup**: Concurrent messages from multiple users

**Test Flow**:
```
- 5 users each send 3 sequential messages
- Messages sent concurrently with slight delays
- Monitor response times and resource usage
```

**Success Criteria**:
- ✅ All messages processed (no timeouts/failures)
- ✅ Response time p95 < 10 seconds
- ✅ Token usage reasonable (track per-agent)
- ✅ No memory leaks (CPU/memory stable)
- ✅ Devtools handles event volume

**Monitoring**:
- Response duration per agent
- Token usage per request
- Concurrent request count
- Error rates
- System resource usage

---

### Scenario E: Error Handling

**Setup**: Intentional edge cases and failures

**Test Cases**:
```
1. Invalid query (nonsense text)
   Expected → Agent gracefully handles, no crash
   
2. Extremely long query (>5000 chars)
   Expected → Processed or rejected gracefully
   
3. Special characters/Unicode (中文, emoji)
   Expected → Processed correctly
   
4. Rapid-fire messages (10+ in quick succession)
   Expected → Queue processed, no data loss
   
5. Network timeout simulation
   Expected → Devtools tracks error, fallback works
```

**Success Criteria**:
- ✅ All edge cases handled gracefully
- ✅ No crashes or unhandled exceptions
- ✅ Errors logged to devtools
- ✅ System continues operating
- ✅ User receives feedback (error message or timeout handling)

**Monitoring**:
- Error events in devtools
- Exception types and frequencies
- Fallback activation logs

---

## Part 2: Phase 5 Subtasks

### 5a: Setup Test Environment
**Goal**: Prepare Feishu group for testing  
**Effort**: 30 min  
**Tasks**:
- Create dedicated test Feishu group (if not exists)
- Add test users
- Enable webhooks for testing
- Verify message delivery working
- Configure devtools for real-time monitoring

**Success**: Test messages successfully routed to manager agent

---

### 5b: Real Message Testing
**Goal**: Execute test scenarios A-E  
**Effort**: 1.5 hours  
**Tasks**:
- Run Scenario A (basic routing)
- Run Scenario B (multi-turn context)
- Run Scenario C (user isolation)
- Run Scenario D (performance/load)
- Run Scenario E (error handling)
- Document results

**Success**: All 5 scenarios pass acceptance criteria

---

### 5c: Memory Persistence Validation
**Goal**: Verify memory works correctly with real data  
**Effort**: 1 hour  
**Tasks**:
- Verify conversation history saved correctly
- Check RLS isolation with real users
- Validate memory content accuracy
- Test recovery from memory errors
- Monitor memory usage over time

**Success**: Multi-turn conversations show context awareness

---

### 5d: Devtools Monitoring Verification
**Goal**: Ensure all events captured and accessible  
**Effort**: 45 min  
**Tasks**:
- Verify agent call events recorded
- Check response events include duration
- Monitor error events captured
- Validate filtering/search works
- Check statistics accuracy

**Success**: Devtools shows complete event log for all scenarios

---

### 5e: Performance Analysis
**Goal**: Verify performance meets targets  
**Effort**: 1 hour  
**Tasks**:
- Measure response time distribution (p50/p95/p99)
- Calculate token usage per agent per day
- Monitor system resource usage
- Identify bottlenecks
- Estimate cost impact

**Success**: Response p95 < 10s, costs acceptable

---

### 5f: Rollout Strategy Execution
**Goal**: Gradually roll out to all users  
**Effort**: 1-2 hours (phased over days)  
**Tasks**:

**Phase 1 - Single User (30 min)**:
- Enable Mastra agents for test admin only
- Monitor devtools continuously
- Run manual test scenarios
- Check for crashes/errors
- Get feedback from user
- Rollback plan on standby

**Phase 2 - Small Group (1 hour)**:
- Enable for 5-10 real users
- Monitor real-world usage patterns
- Check memory isolation with real data
- Verify token costs
- Collect user feedback
- Watch for unexpected behaviors

**Phase 3 - Full Rollout (variable)**:
- Enable for all users gradually (10% → 50% → 100%)
- Continuous monitoring
- Kill switch ready to disable
- Support team monitoring
- Document issues as they arise

---

### 5g: Monitoring & Alerting Setup
**Goal**: Establish production monitoring  
**Effort**: 30 min  
**Tasks**:
- Configure devtools dashboard
- Set up alert thresholds:
  - Error rate > 1%
  - Response time p95 > 15 seconds
  - Token usage spike
  - Memory/CPU spike
- Document alert procedures
- Test alert channels

**Success**: Alerts working, team notified of issues

---

### 5h: Documentation & Release Notes
**Goal**: Document findings and release readiness  
**Effort**: 1 hour  
**Tasks**:
- Document Phase 5 findings
- Create release notes
- Update user documentation
- Document known issues (if any)
- Create Phase 5 completion report
- Plan Phase 6 work

**Success**: All documentation complete, ready for handoff

---

## Part 3: Rollout Strategy

### Phase 1: Single User Test (Day 1, 30 min)

**Setup**:
- Add feature flag for Mastra agents
- Enable ONLY for test admin user
- Heavy devtools monitoring
- Instant rollback capability

**Activities**:
```
1. Admin runs manual test scenarios (A-E)
2. Verify all agents respond correctly
3. Check devtools events captured
4. Monitor for errors/crashes
5. Get feedback from user
6. Document any issues
```

**Exit Criteria**:
- ✅ All test scenarios pass
- ✅ No crashes or errors
- ✅ Devtools shows expected events
- ✅ Admin provides approval

**Rollback**: Disable feature flag (revert to old implementation)

### Phase 2: Small Team Test (Day 2, 1-2 hours)

**Setup**:
- Enable Mastra agents for 5-10 real users
- Real workflow testing
- Production monitoring

**Activities**:
```
1. Users work normally with Mastra agents
2. Team monitors devtools continuously
3. Check memory isolation working
4. Verify token costs reasonable
5. Collect user feedback
6. Document any issues
```

**Exit Criteria**:
- ✅ Real users can use all features
- ✅ Memory works correctly
- ✅ Token costs within budget
- ✅ No memory leaks
- ✅ User feedback positive or neutral

**Rollback**: Disable for group, investigate issue

### Phase 3: Gradual Full Rollout (Days 2-3, variable)

**Setup**:
- Canary deployment: 10% of users first
- Monitor closely
- Gradual ramp: 10% → 25% → 50% → 100%
- Kill switch ready

**Activities**:
```
Day 1 (10%):
  - Enable for 10% of users
  - Monitor heavily (every 5 min check)
  - Prepare rollback
  
Day 2 (50%):
  - Increase to 50% if 10% stable
  - Broader monitoring
  - Support team engaged
  
Day 3 (100%):
  - If 50% stable, go 100%
  - Normal monitoring
  - Kill switch remains ready
```

**Exit Criteria**:
- ✅ 100% of users enabled
- ✅ Error rate < 1%
- ✅ No memory corruption
- ✅ Token costs stable
- ✅ All features working

**Rollback**: Can revert to old implementation instantly

---

## Part 4: Success Criteria

### Per-Scenario
| Scenario | Pass Criteria |
|----------|---------------|
| A (Routing) | All agents route correctly, <10s response |
| B (Multi-turn) | Context persists, agent references previous messages |
| C (User isolation) | No cross-user memory leakage |
| D (Performance) | p95 response <10s, concurrent handling works |
| E (Error handling) | All edge cases handled gracefully |

### System-Wide
| Metric | Target | Actual |
|--------|--------|--------|
| Agent error rate | <1% | TBD |
| Response time p95 | <10s | TBD |
| Token cost/day | <$X | TBD |
| Memory isolation | 100% | TBD |
| Feature completeness | 100% | TBD |
| Data loss incidents | 0 | TBD |

---

## Part 5: Monitoring Dashboard

### Real-Time Metrics

**Agent Performance**:
- Manager agent response time (p50/p95/p99)
- OKR Reviewer response time
- Alignment response time
- P&L response time
- DPA-PM response time
- Error rate per agent

**Memory System**:
- Conversation history loads per turn
- Memory save successes/failures
- RLS policy matches
- User isolation violations (should be 0)

**Token Usage**:
- Tokens per request (avg/max)
- Tokens per agent
- Total daily usage
- Estimated daily cost

**System Health**:
- CPU usage
- Memory usage
- Active connections
- Message queue depth
- Devtools event volume

---

## Part 6: Rollback Procedure

**If Critical Issue Found**:

```
SEVERITY: CRITICAL (data loss, memory corruption, security breach)
├── 1. IMMEDIATELY disable Mastra agents (feature flag)
├── 2. Revert to old implementation
├── 3. Notify team
├── 4. Investigate root cause
├── 5. Create fix
├── 6. Test thoroughly
└── 7. Deploy fix gradually

SEVERITY: HIGH (error rate >5%, response time >30s)
├── 1. Stop new rollout (don't increase %)
├── 2. Monitor current users closely
├── 3. Investigate issue
├── 4. Consider rollback if not improving
└── 5. Deploy fix if simple, else rollback

SEVERITY: MEDIUM (minor bugs, slow response)
├── 1. Document issue
├── 2. Continue monitoring
├── 3. Fix in next release
└── 4. Proceed with rollout if no escalation
```

---

## Part 7: Known Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Memory isolation failure | Low | High | RLS tested, feature flag ready |
| Token cost spike | Medium | High | Budget alert, stop rollout |
| Response timeout | Medium | Medium | Fall back to old impl, feature flag |
| Memory corruption | Low | Critical | Backup database, read-only fallback |
| User confusion | High | Low | Communication, support ready |
| Feishu webhook issues | Low | Medium | Fallback to polling, restart |

---

## Part 8: Team Preparation

### Before Phase 5

**Engineering**:
- ✅ Ensure build is stable
- ✅ Test feature flag mechanics
- ✅ Setup devtools monitoring
- ✅ Prepare rollback procedures
- ✅ Document known issues

**Operations**:
- ✅ Monitor infra capacity
- ✅ Setup alerting
- ✅ Prepare support procedures
- ✅ Have admin access ready

**Product/Support**:
- ✅ Communicate with users
- ✅ Prepare support docs
- ✅ Setup communication channels
- ✅ Collect feedback process

---

## Summary

**Phase 5 Goals**:
1. Validate Mastra integration works end-to-end
2. Test memory system with real multi-turn conversations
3. Verify performance meets targets
4. Execute phased rollout to all users
5. Establish production monitoring and procedures

**Phase 5 Timeline**:
- Setup: 30 min (Day 1)
- Testing: 1.5-2 hours (Day 1)
- Phase 1 Rollout: 30 min (Day 1)
- Phase 2 Rollout: 1-2 hours (Day 2)
- Phase 3 Rollout: Variable (Day 2-3)
- **Total**: 4-6 hours over 1-3 days

**Phase 5 Risks**: Medium (touches production, real users)

**Phase 5 Success**: ✅ Ready for Phase 6 (cleanup & release)

---

**Next Phase**: Phase 6 - Cleanup & Production Release  
**Expected Duration**: 1-2 hours  
**Expected Completion**: Ready for production deployment
