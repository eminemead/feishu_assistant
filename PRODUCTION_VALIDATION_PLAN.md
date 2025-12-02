# Production Validation Plan: Document Tracking Feature

**Status**: Ready for Validation  
**Date**: Dec 2, 2025  
**Priority**: P0

## Phase 1: Integration Validation (Current)

### 1.1 Command Handler Integration
- **Goal**: Verify document commands are properly intercepted and handled before agent routing
- **What to do**:
  - [ ] Integrate `handleDocumentCommand()` into `handle-app-mention.ts`
  - [ ] Add early exit for document tracking commands (before generateResponse)
  - [ ] Test command interception with sample messages
  - [ ] Verify manager agent routing as fallback

### 1.2 Live API Testing
- **Goal**: Validate all 6 commands work end-to-end with real Feishu API
- **Commands to test**:
  ```
  ✓ @bot watch <doc_url>          → Start tracking document
  ✓ @bot check <doc_url>          → Show current status
  ✓ @bot unwatch <doc_url>        → Stop tracking
  ✓ @bot watched                  → List tracked documents
  ✓ @bot tracking:status          → Show poller health
  ✓ @bot tracking:help            → Show help text
  ```

- **Test documents**:
  - [ ] Use existing OKR document (production document)
  - [ ] Create test document for modifications
  - [ ] Test with different doc types (doc, sheet, bitable, docx)

- **Success criteria**:
  - Commands parse correctly
  - Metadata retrieval works
  - Status messages display properly
  - Notifications send on document changes

### 1.3 Persistence Validation
- **Goal**: Verify Supabase persistence works with real data
- **What to test**:
  - [ ] Database tables exist and have correct schema
  - [ ] Document tracking records persist across restarts
  - [ ] Change history records are created
  - [ ] RLS policies allow user-scoped access only
  - [ ] Cleanup of inactive tracking works

### 1.4 Memory Integration
- **Goal**: Ensure conversation memory works with document tracking
- **What to test**:
  - [ ] Memory includes document tracking context
  - [ ] Previous tracked documents remembered in conversation
  - [ ] Memory doesn't duplicate tracking state
  - [ ] Conversation history is saved

## Phase 2: Staging Deployment

### 2.1 Environment Setup
- [ ] Deploy to staging with document tracking feature
- [ ] Verify all environment variables configured
- [ ] Check Supabase staging DB is accessible
- [ ] Verify Feishu SDK credentials working

### 2.2 Smoke Tests
Run in order:
```bash
# 1. Basic connectivity
GET /health

# 2. Command parsing
@bot tracking:help

# 3. Document access
@bot watch <staging_doc_token>

# 4. Change detection (modify doc, wait 30s)
@bot check <staging_doc_token>

# 5. List tracked
@bot watched

# 6. Stop tracking
@bot unwatch <staging_doc_token>
```

### 2.3 Monitoring (24 hours)
- [ ] Monitor error rates (should be <0.1%)
- [ ] Monitor response times (should be <2s for checks)
- [ ] Monitor polling health (all polls successful)
- [ ] Check Langfuse traces for correct routing
- [ ] Verify memory persistence working
- [ ] Verify database queries completing

### 2.4 Scalability Test
- [ ] Track 50+ documents simultaneously
- [ ] Monitor polling loop performance
- [ ] Check API rate limits not exceeded
- [ ] Verify notification delivery under load

## Phase 3: Production Rollout

### 3.1 Pre-Deployment Checklist
- [ ] All staging tests passing
- [ ] No critical issues identified
- [ ] Documentation updated
- [ ] Team trained on new feature
- [ ] Rollback plan documented
- [ ] Monitoring/alerts configured

### 3.2 Blue-Green Deployment
- [ ] Deploy to production (green environment)
- [ ] Run smoke tests on green environment
- [ ] Health checks passing
- [ ] Switch traffic (blue → green)
- [ ] Monitor for 1 hour

### 3.3 Gradual Rollout
- [ ] **10% rollout**: Monitor for 2 hours
  - [ ] No error spikes
  - [ ] Response times normal
  - [ ] Notifications working
  
- [ ] **50% rollout**: Monitor for 4 hours
  - [ ] Continued stable performance
  - [ ] No database issues
  - [ ] Memory persistence working
  
- [ ] **100% rollout**: Full deployment
  - [ ] All traffic on new version
  - [ ] Monitor for 24 hours
  - [ ] Gather metrics

### 3.4 Post-Deployment Monitoring
Daily checks:
- [ ] Error rate < 0.1%
- [ ] P95 response time < 2s
- [ ] Token usage within budget
- [ ] Database performance stable
- [ ] No memory leaks detected
- [ ] Langfuse data quality good

## Phase 4: Validation Metrics

### Success Criteria
```
✅ Command Success Rate: >99%
✅ Document Detection Latency: <100ms
✅ Notification Latency: <5s
✅ Polling Health: >95%
✅ Database Response Time: <100ms
✅ Memory Persistence: 100%
✅ Error Rate: <0.1%
```

### Key Metrics to Track
```
1. Command Execution
   - watch success rate
   - check success rate
   - unwatch success rate
   - Command parsing errors
   
2. Document Polling
   - Documents tracked (count)
   - Successful polls per interval
   - Poll duration (avg/p95)
   - API call failures
   
3. Change Detection
   - Changes detected per hour
   - Debounced changes
   - False positives
   - Notification delivery success
   
4. Persistence
   - Database query latency
   - Storage growth rate
   - RLS policy enforcement
   - Data integrity checks
   
5. System Health
   - Error rate by type
   - Memory usage
   - CPU usage
   - Database connections
```

## Integration Checklist

### Code Changes Required
- [ ] Add `handleDocumentCommand()` early-exit in `handle-app-mention.ts`
- [ ] Update `generateResponse()` to skip agent call for doc commands
- [ ] Add logging for command interception
- [ ] Update tests to cover integration

### Files to Modify
```
lib/handle-app-mention.ts         - Add command interception
lib/generate-response.ts          - Conditional agent call
lib/doc-poller.ts                 - Verify polling starts on server init
lib/handle-doc-commands.ts        - No changes needed (complete)
lib/agents/manager-agent.ts       - Verify routing works as fallback
```

### Database Setup
```sql
-- Verify tables exist:
- document_tracking
- document_changes
- User RLS policies enabled
```

### Environment Variables
```bash
SUPABASE_URL=...              # Staging/Production DB
SUPABASE_ANON_KEY=...         # Service role key
FEISHU_APP_ID=...             # Bot credentials
FEISHU_APP_SECRET=...
```

## Rollback Plan

If critical issues discovered:

**Immediate Actions**:
1. Switch traffic back to previous version (blue)
2. Disable document tracking feature flag
3. Kill polling service
4. Clear Supabase tracking tables
5. Notify team

**Root Cause Analysis**:
- Review error logs
- Check Langfuse traces
- Verify database state
- Inspect polling metrics

**Recovery**:
- Fix identified issue
- Re-test in staging
- Get approval before retry
- Increment version number
- Deploy again with phased rollout

## Success Declaration

Feature is production-ready when:
```
✅ All smoke tests passing
✅ Staging validation complete (24h monitoring)
✅ Monitoring and alerts configured
✅ Team trained and documented
✅ Zero critical bugs in staging
✅ Performance within targets
✅ Rollback plan tested and verified
```

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Integration Validation | 2-4 hours | 🔄 In Progress |
| Phase 2: Staging Deployment | 24-48 hours | ⏳ Pending |
| Phase 3: Production Rollout | 4-8 hours | ⏳ Pending |
| Phase 4: Post-Deploy Monitoring | 24 hours | ⏳ Pending |

**Total Time to Production**: 48-72 hours

---

## Next Steps

1. **Immediate** (This session):
   - [ ] Integrate command handler into app-mention
   - [ ] Run integration tests
   - [ ] Verify manager agent fallback routing

2. **Short-term** (Next session):
   - [ ] Set up staging environment
   - [ ] Run smoke tests
   - [ ] Configure monitoring

3. **Medium-term**:
   - [ ] Production blue-green deployment
   - [ ] Gradual rollout with monitoring
   - [ ] Post-deployment validation

---

**Owner**: Amp Agent  
**Last Updated**: Dec 2, 2025  
**Status**: Ready to proceed with Phase 1
