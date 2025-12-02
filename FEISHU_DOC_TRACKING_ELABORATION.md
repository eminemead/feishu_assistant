# Feishu Document Tracking - Detailed Elaboration & TODOs

## Executive Summary

This document elaborates on the investigation findings and breaks down implementation TODOs into granular, self-documenting tasks with full context. This work enables **reactive document monitoring** - a capability that enhances the Feishu assistant's usefulness by allowing it to watch documents for changes and proactively notify teams.

**Why This Matters to the Project:**
- Enables **real-time collaboration awareness** without users manually polling
- Demonstrates **SDK mastery** - moving from basic message handling to advanced integrations
- Builds **foundational infrastructure** for more sophisticated document workflows (diffs, versioning, workflows)
- Supports **OKR/project tracking** use cases where document changes signal progress updates

---

## TODOs Elaboration

### TODO 1: Core Metadata Fetching (Foundation)
**Current Status**: Researched, code examples provided, NOT implemented
**Complexity**: Low | **Priority**: High | **Effort**: 2-3 hours

**Problem Being Solved:**
The Feishu SDK doesn't expose a semantic method for the legacy `docs-api/meta` endpoint. We need a reliable wrapper that:
1. Handles the raw HTTP request properly
2. Extracts user IDs and timestamps correctly
3. Provides error handling and logging
4. Caches results to minimize API calls

**Why It Matters:**
This is the **single most important function** - all change detection depends on it. If this is unreliable, the entire system fails silently.

**Implementation Considerations:**
- **Error Handling**: Feishu's legacy API can return various error codes. Need retry logic with exponential backoff.
- **Type Safety**: The response structure differs from newer APIs. We need careful type assertions.
- **Permissions**: Requires `docs:read` and `drive:file:read` scopes - must validate in app config.
- **Performance**: Each metadata fetch is an API call. At scale with 100+ documents, this becomes expensive. Need caching strategy.
- **Timestamp Precision**: Feishu returns Unix timestamps in seconds (not milliseconds). Must convert correctly for JS comparisons.

**Detailed Requirements:**
```
Feature: Get document metadata reliably
Given a document token and type
When I request metadata
Then I receive:
  - document_token (string)
  - title (string)
  - owner_id (string/user_id)
  - created_time (unix timestamp in seconds)
  - last_modified_user (string/user_id) ← CRITICAL
  - last_modified_time (unix timestamp in seconds) ← CRITICAL
  - doc_type (string: 'doc', 'sheet', 'bitable', 'docx')

And error handling:
  - Gracefully handle 404 (doc deleted)
  - Gracefully handle 403 (permissions changed)
  - Retry transient errors (429, 500-599)
  - Log all failures with context
```

**Testing Strategy:**
- Unit tests with mock responses
- Integration test with real Feishu doc (create test doc, verify metadata fetching)
- Error case testing (invalid token, deleted doc, insufficient permissions)

---

### TODO 2: Change Detection Algorithm (Logic)
**Current Status**: Conceptual, needs refinement
**Complexity**: Medium | **Priority**: High | **Effort**: 3-4 hours

**Problem Being Solved:**
Detecting changes is non-trivial because:
1. Multiple edits can happen between polls
2. We can't see WHAT changed, only WHO and WHEN
3. Simultaneous edits by multiple users need handling
4. False positives (polling at exact moment of edit) must be minimized

**Why It Matters:**
This determines **accuracy and reliability** of notifications. Poor change detection = missed alerts or spam.

**Current Approach (Simple):**
```
IF last_modified_time != previous_last_modified_time THEN
  notification()
END IF
```

**Issues with Simple Approach:**
- What if two edits happen in the same second? (Unlikely but possible)
- What if edit happens DURING our polling? We might miss the intermediate state.
- What if someone edits, then reverts? We still notify.

**Proposed Improved Approach:**
```
State: (last_modified_user, last_modified_time, revision_number)

Check 1: Time Changed
  IF last_modified_time > previous_time THEN
    notification()
  END IF

Check 2: User Changed (Different editor)
  IF last_modified_user != previous_user THEN
    notification()
  ELSE IF Check 1 satisfied THEN
    notification()  # Same user, updated their own edit
  END IF

Check 3: Debouncing (Avoid duplicate notifications)
  IF time_since_last_notification < 5 seconds THEN
    skip_notification()
  END IF
```

**Detailed Requirements:**
```
Feature: Detect document changes accurately
Given tracked document state
When polling for updates
Then:
  - Detect ANY change to (user, time, revision)
  - Debounce rapid successive changes (< 5 sec = same edit session)
  - Track change attribution (who made the change)
  - Log all detected changes with full context
  - Handle clock skew (server time != client time)
  - Never send duplicate notifications for same change
```

**Edge Cases to Handle:**
1. **Simultaneous multi-user editing**: Last modified time doesn't show all contributors
2. **Rapid edits within same second**: Might not detect intermediate state
3. **Reverts**: Notification sent even if content reverted (acceptable for now)
4. **Deleted documents**: Handle gracefully without crashing
5. **Permission loss**: Stop notifications if access revoked

**Testing Strategy:**
- Simulate rapid successive edits (what is debounce window?)
- Test multi-user concurrent edits
- Test revert scenario (edit, revert, should we notify twice?)
- Test permission revocation

---

### TODO 3: Polling Infrastructure (Operational)
**Current Status**: Sketched, not implemented
**Complexity**: Medium | **Priority**: High | **Effort**: 4-5 hours

**Problem Being Solved:**
Managing continuous polling for 10-100+ documents requires:
1. **Resource Management**: Don't create too many API calls
2. **Failure Handling**: One doc's failure shouldn't crash the whole system
3. **Lifecycle Management**: Start/stop polling cleanly
4. **Observability**: Know what's happening at any time
5. **Testability**: Easy to test without real Feishu

**Why It Matters:**
This is the **operational backbone**. Poor polling infrastructure = unreliable service.

**Design Questions Needing Answers:**
1. **Polling Interval**: 30 seconds? Configurable? Different for different docs?
2. **Batch Requests**: Feishu's `docs-api/meta` accepts up to 200 docs per request. Should we batch?
3. **Graceful Degradation**: If API rate limited, what happens?
4. **Memory Usage**: With 1000 tracked docs, how much memory?
5. **Restart Behavior**: If server crashes, how do we restore tracking state?

**Proposed Architecture:**
```
┌─────────────────────────────────────────┐
│ DocumentPollingService                  │
│ (Singleton)                             │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ In-Memory Tracker Map                   │
│ Map<docToken, TrackedDoc>               │
│ (Ephemeral - lost on restart)           │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Polling Loop (30s interval)             │
│ - Batches requests (200 per call)       │
│ - Handles partial failures              │
│ - Implements exponential backoff        │
│ - Logs metrics (success rate, latency)  │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Change Detection Engine                 │
│ - Compares state                        │
│ - Applies debouncing                    │
│ - Filters out duplicates                │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ Notification Dispatcher                 │
│ - Sends cards to groups                 │
│ - Queues on failure                     │
│ - Logs delivery                         │
└─────────────────────────────────────────┘
```

**Detailed Requirements:**
```
Feature: Run document polling reliably
Given N tracked documents
When server is running
Then:
  - Poll all docs every 30 seconds
  - Handle up to 100 concurrent documents
  - If one doc fails, don't fail others
  - Implement exponential backoff on transient errors
  - Stop polling when no docs tracked
  - Persist tracked docs across restarts (if possible)
  - Expose metrics (docs tracked, last poll time, error count)
```

**Configuration Needs:**
```typescript
interface PollingConfig {
  intervalMs: number;                    // 30000 = 30 seconds
  maxConcurrentPolls: number;            // 100
  batchSize: number;                     // 200 per API call
  retryAttempts: number;                 // 3
  retryBackoffMs: number[];              // [100, 500, 2000]
  debounceWindowMs: number;              // 5000 = 5 seconds
  enableMetrics: boolean;                // true
}
```

**Testing Strategy:**
- Mock Feishu API with various response patterns
- Test startup/shutdown lifecycle
- Test graceful error handling
- Test with 1, 10, 100, 1000 documents
- Measure memory usage
- Load test

---

### TODO 4: Persistence Layer (State Management)
**Current Status**: NOT addressed, critical gap
**Complexity**: High | **Priority**: Medium | **Effort**: 5-6 hours

**Problem Being Solved:**
The current proposal stores tracked docs in memory (`Map<string, TrackedDoc>`). This has issues:
1. **Data Loss**: Server restart = lose all tracked docs
2. **No Audit Trail**: Don't know which docs were watched or for how long
3. **No Analytics**: Can't see "which docs change most frequently"
4. **No Multi-Instance**: Can't run multiple server instances (no shared state)

**Why It Matters:**
For production use, we need **persistent state**. Users expect "I told the bot to watch this doc" to survive restarts.

**Options:**

**Option A: Supabase (Database)**
```
Table: document_tracking
Columns:
  - id: UUID primary key
  - doc_token: string unique
  - doc_type: string (doc, sheet, bitable)
  - chat_id_to_notify: string (group chat ID)
  - started_tracking_at: timestamp
  - last_modified_user: string
  - last_modified_time: integer (unix timestamp)
  - is_active: boolean
  - created_by_user_id: string
  - notes: text

Table: document_changes (Audit trail)
Columns:
  - id: UUID primary key
  - doc_token: string
  - previous_modified_user: string
  - new_modified_user: string
  - previous_modified_time: integer
  - new_modified_time: integer
  - change_detected_at: timestamp
  - notification_sent: boolean
  - notification_message_id: string (if sent)
```

Pros:
- Persistent across restarts
- Auditable history
- Multi-instance compatible
- Analytics ready

Cons:
- Additional database schema
- Schema migration complexity
- Adds latency (DB query per poll)

**Option B: JSON File (Simple)**
```
File: .data/tracked-docs.json
{
  "documents": [
    {
      "docToken": "doccn123",
      "docType": "doc",
      "chatIdToNotify": "oc_456",
      "lastKnownUser": "user_789",
      "lastKnownTime": 1735804800
    }
  ]
}
```

Pros:
- Simple, no database
- Easy to version control history
- Human readable

Cons:
- No multi-instance support
- Potential race conditions
- Not suitable for large number of docs

**Recommended: Hybrid**
- Use in-memory Map for **speed** (polling performance)
- Sync to Supabase every 5 minutes for **persistence**
- On startup, reload from Supabase into memory
- Provide API to export/backup tracking state

**Detailed Requirements:**
```
Feature: Persist document tracking state
Given tracked documents
When server starts/stops
Then:
  - Load previously tracked docs from persistence
  - Survive restart with all tracking state intact
  - Maintain audit trail of all changes detected
  - Support multi-instance (shared Supabase state)
  - Allow export/import of tracking config

Feature: Audit trail
Given document changes
When detected
Then:
  - Log who detected change (system vs user triggered)
  - Log what changed (user, time, revision)
  - Log notification outcomes
  - Enable historical analysis
```

**Testing Strategy:**
- Test persistence/restore cycle
- Test multi-instance concurrent updates
- Test audit trail accuracy
- Load test with large tracking lists

---

### TODO 5: Change Content Snapshots (Advanced)
**Current Status**: Proposed but not required for MVP
**Complexity**: High | **Priority**: Low-Medium | **Effort**: 6-8 hours

**Problem Being Solved:**
Currently, we can detect "WHO changed WHEN" but not "WHAT changed". For advanced use cases:
1. **Workflows**: "When doc reaches X state, trigger action"
2. **Summaries**: "Show me what changed in this doc"
3. **Rollback Support**: "Revert to previous state"

**Why It Matters:**
This is a **stretch goal** for phase 2. It's not needed for basic functionality but enables sophisticated workflows.

**Design Approach:**

On each change detection, optionally store content snapshot:

```
Table: document_snapshots
Columns:
  - id: UUID primary key
  - doc_token: string
  - revision: integer
  - content_hash: string (SHA256 of content)
  - content_size: integer (bytes)
  - modified_by: string
  - modified_at: timestamp
  - stored_at: timestamp
  - content_compressed: bytea (gzip compressed JSON)
  - metadata: jsonb (indexing info)
```

**Comparison Logic:**
```typescript
function compareSnapshots(old: DocSnapshot, new: DocSnapshot) {
  const oldContent = decompress(old.content_compressed);
  const newContent = decompress(new.content_compressed);
  
  // Use library like 'diff-match-patch' for semantic diff
  const diff = computeDiff(oldContent, newContent);
  
  return {
    revision: { from: old.revision, to: new.revision },
    modifiedBy: new.modified_by,
    changes: {
      insertions: diff.insertions,
      deletions: diff.deletions,
      modifications: diff.modifications,
    },
    changeSize: new.content_size - old.content_size,
  };
}
```

**Detailed Requirements:**
```
Feature: Store and compare document versions
Given document changes
When change detected
Then optionally:
  - Download full content
  - Store snapshot with compression
  - Generate semantic diff
  - Identify added/removed/modified sections
  - Enable historical queries ("what was this doc 2 hours ago?")

Feature: Content-based change detection
Given snapshots
When analyzing
Then:
  - Support semantic queries ("all docs where section X changed")
  - Enable diff visualization
  - Support rollback workflows
```

**Known Issues:**
- Storage overhead (docs can be large - 10MB+)
- Compression adds latency
- Diff computation is expensive
- Not suitable for all document types (images, code less useful)

**Testing Strategy:**
- Test with various document sizes
- Test compression/decompression
- Test diff accuracy
- Benchmark storage and retrieval

---

### TODO 6: Change-Triggered Actions (Reactions)
**Current Status**: Partially implemented (basic notifications)
**Complexity**: Medium | **Priority**: High | **Effort**: 3-4 hours

**Problem Being Solved:**
Currently, when change detected → send notification card. But users might want:
1. **Conditional Actions**: "Only notify if title changed"
2. **Multi-Channel**: "Notify in Slack too"
3. **Aggregation**: "Batch updates every hour"
4. **Integration**: "Create task when doc status changes"

**Why It Matters:**
This transforms the feature from **"passive alerting"** to **"reactive automation"**, enabling workflows.

**Proposed Architecture:**
```
┌──────────────────────────┐
│ Change Detected          │
│ (WHO, WHEN, WHAT)        │
└──────────────┬───────────┘
               ↓
┌──────────────────────────┐
│ Rules Engine             │
│ IF condition THEN action │
└──────────────┬───────────┘
               ↓
      ┌────────┴──────────┬──────────────┐
      ↓                   ↓              ↓
┌──────────────┐   ┌───────────┐  ┌──────────┐
│ Send Card    │   │ Create    │  │ Webhook  │
│ Message      │   │ Task      │  │ Trigger  │
└──────────────┘   └───────────┘  └──────────┘
```

**Rule Definition Language:**
```typescript
interface ChangeRule {
  id: string;
  docToken: string;
  name: string;
  condition: {
    type: 'any' | 'modified_by' | 'content_match' | 'time_range';
    value?: string | string[];
  };
  action: {
    type: 'notify' | 'task' | 'webhook' | 'aggregate';
    target?: string;
    template?: string;
  };
  enabled: boolean;
}

// Example:
const rule: ChangeRule = {
  id: 'rule-1',
  docToken: 'doccn123',
  name: 'Notify on any change',
  condition: { type: 'any' },
  action: { 
    type: 'notify',
    target: 'oc_group456'
  },
  enabled: true,
};
```

**Detailed Requirements:**
```
Feature: Trigger actions on document changes
Given rules defined
When change detected
Then:
  - Evaluate change against rules
  - Execute matching actions
  - Log action results
  - Support async/queued actions (no blocking)

Feature: Rule management
When user manages rules
Then:
  - Can create/update/delete rules
  - Can enable/disable rules
  - Can test rules against sample data
  - Can view execution history
```

**Testing Strategy:**
- Test rule evaluation engine
- Test action execution
- Test error handling (action fails, system continues)
- Integration test with real Feishu updates

---

### TODO 7: Bot Commands & UX (User Interface)
**Current Status**: Sketched, not implemented
**Complexity**: Medium | **Priority**: High | **Effort**: 4-5 hours

**Problem Being Solved:**
Users need intuitive way to:
1. **Start Tracking**: "Watch this document"
2. **Check Status**: "What's changed in this doc?"
3. **Stop Tracking**: "Stop watching"
4. **Configure**: "Notify only on certain changes"
5. **List**: "What am I watching?"

**Why It Matters:**
Good UX = feature actually used. Poor UX = feature ignored or misused.

**Proposed Commands:**

```
@bot watch <doc_url_or_token> [in:<group>]
  → Start tracking document
  → Optional: specify which group to notify (default: current group)

@bot check <doc_url_or_token>
  → Show current status (who modified, when)
  → Show change history (last 5 changes)

@bot unwatch <doc_url_or_token>
  → Stop tracking

@bot watched [group:<name>]
  → List all tracked docs
  → Optional: filter by group

@bot tracking:status
  → Show poller stats (how many docs, last poll time, errors)

@bot tracking:history <doc_token>
  → Show change history for specific doc
  → Show who changed, when, (optionally what changed)
```

**Natural Language Alternatives:**
```
"Watch this doc"          → Infer doc from context/link
"Monitor OKR spreadsheet" → Search for doc by title
"Any changes?"            → Check status of referenced doc
"Stop watching"           → Stop tracking previous context
```

**Card Response Format:**
```
Title: 📄 Document Status
Content:
  Document: My Awesome Doc
  Status: Being tracked
  Last modified: 2 hours ago by @john
  Modified by: @john, @jane, @bob (in last 24h)
  
  Recent changes:
    • 14:23 - @john updated content
    • 10:45 - @jane created document
  
  [View in Feishu] [Stop Tracking] [Change Rules]
```

**Detailed Requirements:**
```
Feature: Watch command
Given user message "@bot watch <doc>"
When user in group chat
Then:
  - Extract doc token from URL or message
  - Start tracking
  - Confirm with card showing doc info
  - Send welcome message explaining notifications

Feature: Check command
Given user message "@bot check <doc>"
When user in group chat
Then:
  - Fetch latest metadata
  - Show formatted status
  - Show recent changes
  - Show last 5 change timestamps

Feature: List tracked
Given user message "@bot watched"
When user in group chat
Then:
  - Show all docs being tracked in this group
  - Show count and summary
  - Allow quick unwatch

Feature: Help
Given user message "@bot help tracking"
Then:
  - Show available commands
  - Show examples
  - Link to documentation
```

**Testing Strategy:**
- Test command parsing (various formats)
- Test URL extraction (Feishu URL → token)
- Test error messages (invalid doc, permissions)
- Test natural language variants
- User acceptance testing

---

### TODO 8: Documentation & Examples
**Current Status**: Partially done (investigation doc)
**Complexity**: Low | **Priority**: Medium | **Effort**: 3-4 hours

**Problem Being Solved:**
Need comprehensive documentation so:
1. **Future developers** understand design decisions
2. **Users** know how to use the feature
3. **Operators** know how to monitor/debug
4. **Contributors** can extend it

**Why It Matters:**
Documentation = **knowledge transfer**. Without it, knowledge lost when people leave.

**Required Documentation:**

1. **User Guide**
   - How to start tracking docs
   - What notifications to expect
   - Troubleshooting common issues
   - Examples with screenshots

2. **Architecture Guide**
   - System design (diagrams)
   - Component responsibilities
   - Data flow (changes → notifications)
   - Deployment architecture

3. **Developer Guide**
   - How to extend with custom actions
   - How to add new commands
   - How to write tests
   - API reference

4. **Operator Guide**
   - How to monitor health
   - How to debug issues
   - Performance tuning
   - Metrics to watch

**Detailed Requirements:**
```
Feature: Complete documentation
Then:
  - User guide with examples (docs/USER_GUIDE.md)
  - Architecture documentation (docs/ARCHITECTURE.md)
  - API reference (docs/API_REFERENCE.md)
  - Troubleshooting guide (docs/TROUBLESHOOTING.md)
  - Example configs and rules
  - Screenshots of bot interactions
  - Video walkthrough (optional)
```

---

### TODO 9: Testing & Quality Assurance
**Current Status**: None yet
**Complexity**: High | **Priority**: High | **Effort**: 6-8 hours

**Problem Being Solved:**
Need comprehensive testing to ensure:
1. **Reliability**: Feature works consistently
2. **Correctness**: No missed or false alerts
3. **Performance**: Scales to 100+ docs
4. **Robustness**: Handles errors gracefully

**Why It Matters:**
Users won't trust a feature that crashes or misses critical updates.

**Test Categories:**

1. **Unit Tests** (30+ tests)
   - Metadata fetching
   - Change detection algorithm
   - Command parsing
   - Snapshot comparison

2. **Integration Tests** (15+ tests)
   - Real Feishu API (with test docs)
   - Polling lifecycle
   - Notification sending
   - Persistence/restore

3. **Load Tests** (5+ tests)
   - 100 concurrent tracked docs
   - 1000 rapid changes
   - API rate limiting
   - Memory usage

4. **E2E Tests** (10+ tests)
   - Full workflow: watch → detect → notify
   - User commands
   - Error scenarios
   - Multi-group tracking

**Detailed Requirements:**
```
Feature: Comprehensive test coverage
Then:
  - Unit tests for all core functions (>80% coverage)
  - Integration tests against test Feishu org
  - Load tests for scale (100+ docs)
  - E2E tests for user workflows
  - Performance benchmarks
  - Chaos testing (API failures, network issues)
```

**Testing Infrastructure:**
- Mock Feishu API responses
- Test Feishu org with throwaway docs
- Load testing tool (k6 or locust)
- CI/CD integration

---

### TODO 10: Performance & Observability
**Current Status**: Not addressed
**Complexity**: Medium-High | **Priority**: Medium | **Effort**: 4-5 hours

**Problem Being Solved:**
Need visibility into:
1. **Polling health**: Is it working? How many docs? Success rate?
2. **Performance**: API latency, memory usage, CPU
3. **Errors**: What's failing? How often?
4. **Metrics**: How many notifications sent? How many failures?

**Why It Matters:**
Production systems need **observability**. Without it, issues are hard to diagnose.

**Proposed Metrics:**
```typescript
interface PollingMetrics {
  totalDocumentsTracked: number;
  lastPollTime: number;
  lastPollDuration: number;
  successRate: number; // 0-1
  errorsInLastHour: number;
  notificationsInLastHour: number;
  apiCallsInLastHour: number;
  apiCallLatencyP50: number;
  apiCallLatencyP99: number;
  memoryUsageMB: number;
  queuedNotifications: number;
  failedNotifications: number;
}
```

**Observability Implementation:**

1. **Logging**
```typescript
logger.info('Poll started', { docCount: 100 });
logger.info('Change detected', { docToken, user, time });
logger.warn('API rate limit', { retryAfter: 60 });
logger.error('Notification failed', { error, docToken });
```

2. **Metrics Exposition**
```
GET /metrics
→ Prometheus format
  - document_polling_documents_tracked
  - document_polling_last_duration_ms
  - document_polling_success_rate
  - document_changes_detected_total
  - document_notifications_sent_total
  - document_notifications_failed_total
```

3. **Alerting**
```
Alert if:
  - Success rate < 90% for 10 minutes
  - More than 5 consecutive API failures
  - Queue depth > 100
  - Memory usage > 500MB
```

4. **Health Check**
```
GET /health/document-polling
→ {
    "status": "healthy" | "degraded" | "unhealthy",
    "lastPollTime": 1234567890,
    "documentCount": 42,
    "errorCount": 2,
    "nextPollIn": 15000
  }
```

**Detailed Requirements:**
```
Feature: Monitor polling health
Then:
  - Expose Prometheus metrics
  - Health check endpoint
  - Detailed logs for debugging
  - Error tracking and reporting
  - Performance dashboards

Feature: Troubleshoot issues
Given issues occur
Then:
  - Easy to see what's wrong
  - Easy to understand root cause
  - Easy to estimate impact
  - Easy to fix or work around
```

---

## Phase Breakdown

### Phase 1: MVP (Core Functionality)
**Duration**: 2-3 weeks
**TODOs**: 1, 2, 3, 4, 7 (partial)
**Outcome**: Basic working system

Requirements:
- Can track documents
- Detects changes
- Sends notifications
- Basic commands (@bot watch, check, unwatch)
- Persistent state

### Phase 2: Polish & Reliability
**Duration**: 1-2 weeks
**TODOs**: 5 (partial), 6 (partial), 8, 9
**Outcome**: Production-ready

Requirements:
- Comprehensive testing
- Full documentation
- Observability/monitoring
- Error handling hardening

### Phase 3: Advanced Features
**Duration**: 2-3 weeks
**TODOs**: 5 (complete), 6 (complete), 10 (advanced)
**Outcome**: Feature-rich system

Requirements:
- Content snapshots & diffs
- Conditional actions & workflows
- Advanced metrics & alerting
- Performance optimization

---

## Success Criteria

### Phase 1 (MVP) Success Means:
1. ✅ Can track 10+ documents simultaneously
2. ✅ Detects 90%+ of real changes within 5 minutes
3. ✅ Zero false positives (no notification for no-change state)
4. ✅ Survives 24 hours without crash
5. ✅ Users can easily start/stop tracking with bot commands
6. ✅ 500ms response time for commands (p95)

### Phase 2 (Polish) Success Means:
1. ✅ >85% unit test coverage
2. ✅ >10 integration tests all passing
3. ✅ Load test: 100 docs with <10% failure rate
4. ✅ Memory usage <200MB at steady state (100 docs)
5. ✅ All critical paths instrumented with logging
6. ✅ Comprehensive documentation (user + dev guides)

### Phase 3 (Advanced) Success Means:
1. ✅ Content snapshots <1GB storage for 1000 changes
2. ✅ Semantic diffs working for 95% of doc types
3. ✅ Custom rules framework tested
4. ✅ Multi-channel notifications (Slack integration)
5. ✅ Performance: 1000 tracked docs with <5% CPU

---

## Risk Analysis

### High Risks

**Risk 1: API Instability**
- Feishu's legacy `docs-api/meta` might be deprecated/removed
- **Mitigation**: Monitor Feishu changelog, have migration plan to newer APIs
- **Contingency**: Fall back to polling document content (more expensive)

**Risk 2: False Negatives** (Missing changes)
- Polling interval might miss rapid edits
- **Mitigation**: Use smaller polling interval (10s instead of 30s), accept higher API cost
- **Contingency**: Ask users to manually trigger checks if critical

**Risk 3: Rate Limiting**
- Feishu might rate limit at 100+ docs
- **Mitigation**: Implement request batching (200/call), exponential backoff
- **Contingency**: Distribute polling across multiple bot instances

**Risk 4: Storage Exploding**
- If storing snapshots for 1000 docs, storage could be 100+ GB
- **Mitigation**: Configurable retention policy, compression, archival
- **Contingency**: Store only diffs instead of full snapshots

### Medium Risks

**Risk 5: User Confusion**
- Users might expect notifications for specific changes (not any change)
- **Mitigation**: Set clear expectations in documentation
- **Contingency**: Implement rules/filtering

**Risk 6: Multi-Instance Coordination**
- Multiple bot instances might send duplicate notifications
- **Mitigation**: Use database-backed locks or leader election
- **Contingency**: Recommend single instance initially

---

## Dependencies & Integration Points

### External Dependencies:
1. **Feishu SDK**: @larksuiteoapi/node-sdk@^1.44.0
   - Maintained by Feishu team
   - Risk: Version updates, API changes

2. **Supabase**: For persistence
   - Database for tracking state & audit trail
   - Risk: Storage limits, cost at scale

3. **NodeJS**: Runtime environment
   - Risk: Package vulnerabilities, performance issues

### Internal Dependencies:
1. **lib/feishu-utils.ts**: Message sending
2. **lib/auth/extract-feishu-user-id.ts**: User context
3. **lib/memory.ts**: Conversation context (for future integration)
4. **server.ts**: Event handling

### Integration Points:
1. **Message handler**: Intercept bot commands
2. **Card creation**: Use existing streaming card infrastructure
3. **Database**: Extend Supabase schema for tracking state
4. **Logging**: Integrate with existing logging

---

## Future Considerations

### Near Term (Month 2-3):
1. Multi-channel notifications (Slack, Teams)
2. Document workflow triggers
3. Change analytics/dashboards
4. Rollback/versioning support

### Mid Term (Month 3-6):
1. AI-powered change summaries ("What changed in plain English?")
2. Smart notifications (only notify on important changes)
3. Collaboration features (see who's editing right now)
4. Integration with task management (auto-create tasks)

### Long Term (Month 6+):
1. Document comparison engine
2. Compliance/audit trails
3. Custom document types
4. GraphQL API for integrations

