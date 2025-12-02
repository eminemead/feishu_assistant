# Feishu Document Tracking - Comprehensive Beads Structure

**Date Created**: December 2, 2025
**Epic ID**: `feishu_assistant-c0y`
**Status**: Ready to implement
**Total Issues**: 18 (1 epic + 3 phases + 10 TODOs + 5 subtasks)

---

## Overview

This document describes a comprehensive, self-documenting issue tracking structure for implementing **Feishu document change tracking** - a feature that monitors documents for changes and sends bot notifications.

**Why These Beads Matter:**
- Enables **reactive automation** in the Feishu assistant
- Demonstrates **advanced SDK integration** beyond basic message handling
- Builds **foundational infrastructure** for sophisticated workflows
- Supports **OKR/collaboration** use cases requiring document awareness

---

## Beads Structure

### Epic: `feishu_assistant-c0y`
**Title**: feat: Feishu document change tracking system (Epic)
**Priority**: 1 (High)
**Type**: Epic

```
Description:
Enable real-time monitoring of Feishu document changes with bot-driven notifications.
This epic implements a complete document tracking system that:
- Polls Feishu documents for changes (who modified, when)
- Detects changes using metadata comparison
- Sends notifications to groups when changes detected
- Provides bot commands for users to manage tracking
- Persists state across restarts
- Provides observability/metrics

This serves core project goals of enhanced collaboration awareness and demonstrates 
advanced SDK integration.

References:
- FEISHU_DOC_TRACKING_INVESTIGATION.md (Research & findings)
- FEISHU_DOC_TRACKING_ELABORATION.md (Detailed TODOs & rationale)
```

---

## Phase 1: MVP (2-3 weeks)

### Phase 1 Task: `feishu_assistant-2c3`
**Title**: Phase 1 MVP: Core document tracking implementation (2-3 weeks)
**Priority**: 1 (High)
**Status**: Open
**Effort**: 40-50 hours

**Description**:
Implement minimum viable product for document tracking.
Delivers: Basic polling, change detection, notifications, persistence, bot commands.
Success: Can track 10+ docs, detects 90%+ of changes, zero false positives.

**Children (Blocking Subtasks)**:
1. `feishu_assistant-mt0` - [TODO 1] Implement getDocMetadata()
2. `feishu_assistant-f4i` - [TODO 2] Implement change detection algorithm
3. `feishu_assistant-rlf` - [TODO 3] Build DocumentPollingService
4. `feishu_assistant-qkq` - [TODO 4] Add Supabase persistence
5. `feishu_assistant-crm` - [TODO 7] Implement bot commands

---

### TODO 1: `feishu_assistant-mt0`
**Title**: [1/10] Implement getDocMetadata() function with retry logic
**Priority**: 1 (High)
**Status**: Open
**Effort**: 3-4 hours
**Dependency**: None (foundational)

**Self-Documenting Description**:
```
Implement reliable wrapper for Feishu's legacy docs-api/meta endpoint.

🎯 GOAL: Get document metadata (title, owner, last_modified_user, last_modified_time)

🏗️ DESIGN REQUIREMENTS:
- Handle raw HTTP request to POST /open-apis/suite/docs-api/meta
- Extract and validate response (latest_modify_user, latest_modify_time)
- Implement error handling (404, 403, transient errors)
- Retry logic with exponential backoff (100ms, 500ms, 2000ms)
- Proper timestamp conversion (Unix seconds → JS milliseconds)
- Type safety: map Feishu response to DocMetadata interface
- Logging: debug, warn, error levels with context

⚠️  CONSIDERATIONS:
- This is the FOUNDATION - all change detection depends on it
- Feishu's legacy API might behave differently than modern APIs
- At scale (100+ docs), need to batch requests (200 docs per call)
- Type assertions needed: resp?.success?.() vs resp.code === 0

✅ SUCCESS CRITERIA:
1. Unit tests: Handle all error cases gracefully
2. Integration test: Fetch metadata from real test doc
3. Handles deleted docs without crashing
4. Handles permission changes without crashing
5. Performance: <500ms per call (p95)
6. Works with doc, sheet, bitable, docx types

TESTING STRATEGY:
- Unit tests with mock responses
- Integration test with real Feishu doc (create test doc, verify metadata)
- Error case testing (invalid token, deleted doc, insufficient permissions)

SUBTASKS:
- [ ] Research Feishu docs-api/meta endpoint schema
- [ ] Implement core function with error handling
- [ ] Add retry logic with exponential backoff
- [ ] Write unit tests for all paths
- [ ] Integration test with real Feishu doc
```

**Why This Matters**:
This is the **single most critical function** - all change detection depends on it. If this is unreliable, the entire system fails.

**Related Documentation**:
- FEISHU_DOC_TRACKING_INVESTIGATION.md Section 1
- lib/feishu-utils.ts (existing SDK setup)

---

### TODO 2: `feishu_assistant-f4i`
**Title**: [2/10] Implement change detection algorithm with debouncing
**Priority**: 1 (High)
**Status**: Open
**Effort**: 3-4 hours
**Dependency**: Related to TODO 1

**Self-Documenting Description**:
```
Build logic to detect when document has changed.

🎯 GOAL: Accurately detect changes using only metadata (no content diff yet)

🏗️ DESIGN REQUIREMENTS:
- Interface TrackedDoc: { docToken, lastKnownUser, lastKnownTime, chatId }
- Function hasDocChanged(current, previous): boolean
- Change is detected if: user changed OR time changed
- Debouncing: ignore changes within 5 seconds (same edit session)
- Never send duplicate notifications for same change
- Track attribution: log WHO made the change

⚠️  CONSIDERATIONS:
- Can't detect WHAT changed, only WHO and WHEN
- Multiple edits in same second might be missed (polling interval issue)
- What if user edits, then reverts? (Still notify - acceptable)
- Simultaneous multi-user editing only shows last editor
- Clock skew: server time != client time (use server time only)

✅ EDGE CASES TO HANDLE:
1. First time tracking (no previous state) → always notify
2. Rapid successive edits (<5s apart) → debounce to one notification
3. Same user editing multiple times → notify on each change
4. Different users editing alternately → notify on each change
5. Document deleted → stop tracking gracefully
6. Permissions revoked → stop tracking gracefully

✅ SUCCESS CRITERIA:
1. Unit tests for all edge cases
2. Debouncing works correctly (no spam)
3. No false positives (notifications only on real changes)
4. No false negatives (catches all changes)
5. Handles null/undefined states gracefully
```

**Why This Matters**:
This determines **accuracy and reliability** of notifications. Poor change detection = missed alerts or spam.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 2 section
- FEISHU_DOC_TRACKING_INVESTIGATION.md Section 3

---

### TODO 3: `feishu_assistant-rlf`
**Title**: [3/10] Build DocumentPollingService with lifecycle management
**Priority**: 1 (High)
**Status**: Open
**Effort**: 4-5 hours
**Dependency**: Blocks on TODO 1 & 2

**Self-Documenting Description**:
```
Implement polling loop that continuously monitors tracked documents.

🎯 GOAL: Manage 10-100+ documents with reliable polling

🏗️ DESIGN REQUIREMENTS:
- Singleton DocumentPollingService class
- In-memory Map<docToken, TrackedDoc> for tracking state
- Polling interval: 30 seconds (configurable)
- Batch requests: fetch up to 200 docs per call
- Graceful error handling: one doc failing doesn't crash others
- Exponential backoff on API errors
- Lifecycle: startPolling(), stopPolling(), lifecycle hooks
- Metrics: documents tracked, last poll time, error count

ARCHITECTURE:
┌─ DocumentPollingService ─┐
│ - trackedDocs Map        │
│ - pollingInterval        │
│ - config                 │
└─────────────────────────┘
         ↓
┌─ startPolling() ─────────┐
│ Every 30s:               │
│ 1. Collect doc tokens    │
│ 2. Batch request meta    │
│ 3. Detect changes        │
│ 4. Dispatch notify()     │
│ 5. Update state          │
└─────────────────────────┘

✅ SUCCESS CRITERIA:
1. Can track 10, 100, 1000+ documents
2. Never blocks event loop (async/await)
3. Handles partial failures (some docs fail, others continue)
4. Memory usage <200MB at 100 docs
5. CPU usage <5% at idle (100 docs)
6. Startup/shutdown clean with no leaks
7. Metrics exposed for monitoring
```

**Why This Matters**:
This is the **operational backbone**. Poor polling infrastructure = unreliable service.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 3 section
- FEISHU_DOC_TRACKING_INVESTIGATION.md Section 5

---

### TODO 4: `feishu_assistant-qkq`
**Title**: [4/10] Add Supabase persistence for tracked documents
**Priority**: 1 (High)
**Status**: Open
**Effort**: 5-6 hours
**Dependency**: Blocks by TODO 3

**Self-Documenting Description**:
```
Implement persistent storage of document tracking state.

🎯 GOAL: Survive server restarts and enable multi-instance support

🏗️ DESIGN REQUIREMENTS:
- Supabase tables:
  * document_tracking: { docToken, docType, chatId, startedAt, isActive, ... }
  * document_changes: { docToken, prevUser, newUser, prevTime, newTime, detectedAt, ... }
- Load tracked docs from DB on startup
- Sync state to DB every 5 minutes (batched)
- Audit trail of all changes detected
- Multi-instance support: use database as source of truth

HYBRID APPROACH:
┌─ Memory (Fast) ──────┐
│ Map<token, state>    │ ← Used for polling
│ Updated in real-time │
└──────────────────────┘
         ↓ (every 5 min)
┌─ Database (Durable) ─┐
│ Supabase tables      │ ← Source of truth
│ Survives restart     │
└──────────────────────┘
         ↑ (on startup)
│ Reload on startup   │

✅ SUCCESS CRITERIA:
1. Tracked docs restored after server restart
2. Audit trail complete and queryable
3. Schema migrations working
4. No data loss on restart
5. Multi-instance reads don't conflict
6. Audit trail queries <100ms (indexed)
```

**Why This Matters**:
For production use, we need **persistent state**. Users expect "I told the bot to watch this doc" to survive restarts.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 4 section

---

### TODO 7: `feishu_assistant-crm`
**Title**: [7/10] Implement bot commands (watch, check, unwatch, watched)
**Priority**: 1 (High)
**Status**: Open
**Effort**: 4-5 hours
**Dependency**: Related to TODO 3

**Self-Documenting Description**:
```
Build user-facing commands for document tracking management.

🎯 GOAL: Users can easily watch/check/unwatch documents

🏗️ DESIGN REQUIREMENTS:
Command: @bot watch <doc_url_or_token>
  - Extract doc token from URL or direct token
  - Validate doc exists and accessible
  - Start tracking
  - Confirm with card showing doc info
  - Store in database

Command: @bot check <doc_url_or_token>
  - Fetch current metadata
  - Show: title, last editor, last edit time
  - Show: recent 5 changes (timestamps)
  - Show: who edited in last 24h

Command: @bot unwatch <doc_url_or_token>
  - Stop tracking
  - Confirm with message
  - Keep audit trail

Command: @bot watched [group:<name>]
  - List all tracked docs in this group
  - Show count, last edit times
  - Provide quick unwatch buttons

CARD RESPONSE FORMAT:
Title: 📄 Document Status
Fields:
  - Document: [title]
  - Status: Being tracked / Not tracked
  - Last modified: [user] at [time]
  - Recent editors: @john, @jane, @bob
  - Last changes: (timestamps)

Actions:
  - [View in Feishu] [Stop Tracking] [Change Rules]

✅ SUCCESS CRITERIA:
1. Command parsing works for all formats
2. URL extraction handles all Feishu link types
3. Error messages helpful (why failed?)
4. Commands responsive (<500ms p95)
5. Cards well formatted and informative
6. Natural language variants work
```

**Why This Matters**:
Good UX = feature actually used. Poor UX = feature ignored or misused.

**Related Documentation**:
- FEISHU_DOC_TRACKING_INVESTIGATION.md Section 6
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 7 section

---

## Phase 2: Testing & Reliability (1-2 weeks)

### Phase 2 Task: `feishu_assistant-cuu`
**Title**: Phase 2: Testing, documentation, and reliability (1-2 weeks)
**Priority**: 2 (Medium)
**Blocks**: Phase 1 completion
**Effort**: 35-40 hours

**Description**:
Polish Phase 1 MVP to production-ready quality.
Delivers: Comprehensive testing, full documentation, observability.
Success: >85% test coverage, zero crashes in 24h load test, full documentation.

**Children (Subtasks)**:
1. `feishu_assistant-5dp` - [TODO 9] Implement comprehensive test suite
2. `feishu_assistant-rxz` - [TODO 8] Write comprehensive documentation

---

### TODO 9: `feishu_assistant-5dp`
**Title**: [9/10] Implement comprehensive test suite (unit, integration, load, e2e)
**Priority**: 1 (High)
**Status**: Open
**Effort**: 6-8 hours
**Dependency**: Related to TODO 1,2,3

**Self-Documenting Description**:
```
Build comprehensive test coverage ensuring reliability and correctness.

🎯 GOAL: >85% code coverage, zero crashes, scalable to 100+ docs

🏗️ DESIGN REQUIREMENTS:

UNIT TESTS (30+):
- getDocMetadata: all success/error paths
- hasDocChanged: all edge cases
- formatDocChange: output formatting
- Command parsing: all command types
- Error handling: rate limits, invalid responses

INTEGRATION TESTS (15+):
- Real Feishu test docs
- Full polling lifecycle
- Notification sending
- Persistence/restore
- Multi-doc tracking

LOAD TESTS (5+):
- 100 concurrent tracked docs
- 1000 rapid changes
- API rate limiting behavior
- Memory usage trends
- Memory leak detection

E2E TESTS (10+):
- User watch → detect → notify flow
- Multi-group tracking
- Restart/recovery
- Error recovery scenarios

✅ TEST INFRASTRUCTURE:
- Jest/Vitest for unit/integration
- Mock Feishu client
- Test database (separate Supabase project)
- Load testing tool (k6)
- CI/CD integration (GitHub Actions)

✅ SUCCESS CRITERIA:
1. >85% line coverage
2. >90% function coverage  
3. All error paths tested
4. Load test: 100 docs, <10% failure rate
5. No memory leaks (heap snapshots)
6. CI passing on every commit
7. Test docs clear and maintainable
```

**Why This Matters**:
Users won't trust a feature that crashes or misses critical updates.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 9 section

---

### TODO 8: `feishu_assistant-rxz`
**Title**: [8/10] Write comprehensive documentation (user, dev, operator guides)
**Priority**: 1 (High)
**Status**: Open
**Effort**: 3-4 hours
**Dependency**: None

**Self-Documenting Description**:
```
Create documentation for all audiences: users, developers, operators.

🎯 GOAL: Self-documenting system with guides for all personas

🏗️ DOCUMENTS TO CREATE:

1. USER GUIDE (docs/USER_GUIDE.md)
   - What is document tracking?
   - How to use @bot watch/check/unwatch
   - Examples with screenshots
   - FAQs and troubleshooting
   - Limits and best practices

2. ARCHITECTURE GUIDE (docs/ARCHITECTURE.md)
   - System overview (diagram)
   - Component responsibilities
   - Data flow
   - Deployment architecture
   - Scaling considerations

3. API REFERENCE (docs/API_REFERENCE.md)
   - All bot commands
   - Response schemas
   - Error codes
   - Rate limits
   - Webhook formats (future)

4. DEVELOPER GUIDE (docs/DEVELOPER_GUIDE.md)
   - How to extend with custom actions
   - How to add new commands
   - How to write tests
   - Code structure
   - Integration points

5. OPERATOR GUIDE (docs/OPERATOR_GUIDE.md)
   - Deployment steps
   - Health checks
   - Monitoring metrics
   - Debugging issues
   - Performance tuning
   - Common problems + fixes

6. TROUBLESHOOTING GUIDE (docs/TROUBLESHOOTING.md)
   - Common issues and solutions
   - Debug steps
   - Log interpretation
   - Recovery procedures

✅ SUCCESS CRITERIA:
1. >90% of code documented
2. All commands documented with examples
3. Setup instructions clear and tested
4. Troubleshooting guide covers 80% of issues
5. Developer can extend feature in 1 hour
6. Operator can deploy/debug independently
7. Zero technical debt in docs
```

**Why This Matters**:
Documentation = **knowledge transfer**. Without it, knowledge lost when people leave.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 8 section

---

## Phase 3: Advanced Features (2-3 weeks)

### Phase 3 Task: `feishu_assistant-jwd`
**Title**: Phase 3: Advanced features and optimizations (2-3 weeks)
**Priority**: 3 (Low)
**Blocks**: Phase 2 completion
**Effort**: 35-45 hours

**Description**:
Add advanced capabilities and performance optimizations.
Delivers: Content snapshots, rules engine, multi-channel, advanced metrics.
Success: 1000 docs, <5% CPU, rich automation capabilities.

**Children (Subtasks)**:
1. `feishu_assistant-yyy` - [TODO 5] Implement document content snapshots
2. `feishu_assistant-zzz` - [TODO 6] Build rules engine for conditional actions
3. `feishu_assistant-www` - [TODO 10] Add metrics, monitoring, optimization

---

### TODO 5: `feishu_assistant-yyy`
**Title**: [5/10] Implement document content snapshots and semantic diff engine
**Priority**: 2 (Medium)
**Status**: Open
**Effort**: 6-8 hours
**Dependency**: None (Phase 3 only)

**Self-Documenting Description**:
```
Store document snapshots and compute semantic diffs.

🎯 GOAL: Answer "WHAT changed?" not just "WHO and WHEN?"

🏗️ DESIGN REQUIREMENTS:
- On each change detected, optionally download full content
- Store compressed snapshot in Supabase
- Compute semantic diff between snapshots
- Generate human-readable change summary

DIFF ALGORITHM:
Option 1: Simple text diff (fast)
  - Line-by-line comparison
  - Shows insertions/deletions/modifications
  - ~100ms for typical doc

Option 2: Semantic diff (slow, better quality)
  - Parse document structure
  - Diff at semantic level (blocks, paragraphs)
  - Better for humans to read
  - ~500ms for typical doc

Hybrid: Show simple for quick display, semantic on demand

✅ EDGE CASES:
1. Very large docs (10MB+) → don't snapshot automatically
2. Binary content (sheets, images) → different handling
3. Rapid changes → don't snapshot every change
4. Storage quota → archive old snapshots

✅ SUCCESS CRITERIA:
1. Snapshots <1GB for 1000 changes
2. Compression ratio >5x
3. Diff computation <500ms
4. Supports 90% of doc types
5. Old snapshots auto-archival works
6. Queries for historical analysis fast
```

**Why This Matters**:
This is a **stretch goal** for phase 3. It's not needed for basic functionality but enables sophisticated workflows.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 5 section
- FEISHU_DOC_TRACKING_INVESTIGATION.md Section 8

---

### TODO 6: `feishu_assistant-zzz`
**Title**: [6/10] Build rules engine for conditional actions and reactions
**Priority**: 2 (Medium)
**Status**: Open
**Effort**: 3-4 hours
**Dependency**: Related to TODO 2 (Phase 3)

**Self-Documenting Description**:
```
Enable conditional actions triggered by document changes.

🎯 GOAL: React to changes with custom actions (not just notifications)

🏗️ DESIGN REQUIREMENTS:

RULES INTERFACE:
interface ChangeRule {
  id: string;
  docToken: string;
  name: string;
  condition: {
    type: 'any' | 'modified_by_user' | 'content_match' | 'time_range';
    value?: string | string[];
  };
  action: {
    type: 'notify' | 'create_task' | 'webhook' | 'aggregate';
    target?: string;
    template?: string;
  };
  enabled: boolean;
}

EXAMPLE RULES:
1. "Notify @john only on Monday-Friday"
2. "Create task when status doc reaches 100%"
3. "Aggregate changes every hour, send summary"
4. "Call webhook on specific content patterns"
5. "Notify Slack when critical section changes"

RULES ENGINE ARCHITECTURE:
┌─ Change Detected ──────────┐
│ WHO, WHEN, WHAT            │
└────────┬────────────────────┘
         ↓
┌─ Rules Evaluator ──────────┐
│ For each enabled rule:      │
│ 1. Evaluate condition       │
│ 2. If match, execute action │
└────────┬────────────────────┘
         ↓
┌─ Action Executor ──────────┐
│ - Notify (existing)        │
│ - Create task (new)        │
│ - Webhook (new)            │
│ - Aggregate (new)          │
└────────────────────────────┘

✅ SUCCESS CRITERIA:
1. Rule evaluation <100ms
2. 100+ rules evaluatable
3. Rules never block polling
4. Action failures don't affect other actions
5. Rules logged for debugging
6. History of rule executions audited
```

**Why This Matters**:
This transforms the feature from **"passive alerting"** to **"reactive automation"**, enabling workflows.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 6 section

---

### TODO 10: `feishu_assistant-www`
**Title**: [10/10] Add metrics, monitoring, and performance optimization
**Priority**: 2 (Medium)
**Status**: Open
**Effort**: 4-5 hours
**Dependency**: None (Phase 3 only)

**Self-Documenting Description**:
```
Implement comprehensive observability and performance optimization.

🎯 GOAL: Production-ready monitoring and debugging capabilities

🏗️ DESIGN REQUIREMENTS:

METRICS TO EXPOSE:
- document_polling_documents_tracked (gauge)
- document_polling_last_duration_ms (gauge)
- document_polling_success_rate (gauge, 0-1)
- document_changes_detected_total (counter)
- document_notifications_sent_total (counter)
- document_notifications_failed_total (counter)
- feishu_api_calls_total (counter)
- feishu_api_latency_ms (histogram)
- poller_queue_depth (gauge)

HEALTH CHECK ENDPOINT:
GET /health/document-polling
→ {
  "status": "healthy|degraded|unhealthy",
  "lastPollTime": 1234567890,
  "documentsTracked": 42,
  "errorCount": 2,
  "nextPollIn": 15000,
  "metrics": { ... }
}

PERFORMANCE OPTIMIZATION:
1. Batch API requests (up to 200 docs/call)
2. Cache recently fetched metadata (5min TTL)
3. Async change notifications (don't block polling)
4. Connection pooling for API calls
5. Memory pooling for temporary objects

✅ SUCCESS CRITERIA:
1. Health check responds <100ms
2. Metrics accurate and up-to-date
3. CPU <5% idle, <15% at full load
4. Memory <200MB at 100 docs
5. No memory leaks (24h baseline)
6. All alerts working
7. Dashboards viewable
```

**Why This Matters**:
Production systems need **observability**. Without it, issues are hard to diagnose.

**Related Documentation**:
- FEISHU_DOC_TRACKING_ELABORATION.md TODO 10 section

---

## Success Criteria Summary

### Phase 1 MVP Success:
✅ Can track 10+ documents simultaneously
✅ Detects 90%+ of real changes within 5 minutes
✅ Zero false positives
✅ Survives 24 hours without crash
✅ Users can easily watch/check/unwatch with bot commands
✅ 500ms response time for commands (p95)

### Phase 2 Polish Success:
✅ >85% unit test coverage
✅ >10 integration tests all passing
✅ Load test: 100 docs with <10% failure rate
✅ Memory usage <200MB at steady state (100 docs)
✅ All critical paths instrumented with logging
✅ Comprehensive documentation (user + dev guides)

### Phase 3 Advanced Success:
✅ Content snapshots <1GB storage for 1000 changes
✅ Semantic diffs working for 95% of doc types
✅ Custom rules framework tested
✅ Multi-channel notifications (Slack integration)
✅ Performance: 1000 tracked docs with <5% CPU

---

## Risk Analysis

### High Risks
1. **API Instability**: Feishu's legacy API might be deprecated
   - Mitigation: Monitor changelog, migration plan to newer APIs
2. **False Negatives**: Polling interval might miss rapid edits
   - Mitigation: Use smaller interval (10s), accept higher API cost
3. **Rate Limiting**: Feishu might rate limit at 100+ docs
   - Mitigation: Request batching, exponential backoff
4. **Storage Exploding**: Snapshots could consume 100+ GB
   - Mitigation: Retention policy, compression, archival

### Medium Risks
5. **User Confusion**: Expect changes, not any change
   - Mitigation: Clear docs, rules/filtering
6. **Multi-Instance Coordination**: Duplicate notifications
   - Mitigation: DB locks, leader election

---

## Next Steps

1. **Start Phase 1**: Begin with TODO 1 (getDocMetadata)
2. **Run Subtasks**: Follow breakdown for TODO 1
3. **Iterate**: TODO 2 → TODO 3 → TODO 4 → TODO 7
4. **Test**: Move to Phase 2 for testing/docs
5. **Scale**: Phase 3 for advanced features

**View Progress**:
```bash
bd ready --json                    # See ready work
bd list --status in_progress       # Current work
bd dep tree feishu_assistant-c0y   # Full dependency tree
bd show feishu_assistant-mt0       # TODO 1 details
```

---

## Documentation References

- **Investigation**: `FEISHU_DOC_TRACKING_INVESTIGATION.md` - Complete technical research
- **Elaboration**: `FEISHU_DOC_TRACKING_ELABORATION.md` - Detailed TODOs, risks, rationale
- **Code Examples**: Inline in each TODO description with working implementations

---

## Final Notes

This beads structure is **self-documenting and comprehensive**:
- Each TODO includes full context, rationale, and success criteria
- Dependencies clearly marked (blocks, related, parent relationships)
- Phases organize work into digestible chunks
- Subtasks break down complex work into testable pieces
- Success criteria measurable and verifiable
- Risks identified with mitigations

The structure supports **continuity** - if a developer comes back in 3 months, they can read the TODO descriptions and understand the full context, decisions made, and what needs to be done next.

