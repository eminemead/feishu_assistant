# Feishu Document Tracking System - Implementation Guide

## Overview

This document describes the **Feishu Document Tracking System** - a feature that enables real-time monitoring of Feishu documents with bot-driven notifications. The system detects when documents are modified and sends notifications to groups, supporting collaborative awareness and automated workflows.

**Status**: Phase 1 MVP Complete (TODOs 1-7)  
**Last Updated**: December 2, 2025

---

## Executive Summary

### What It Does

The document tracking system enables users to:

1. **Monitor documents** - Tell the bot to watch a Feishu document
2. **Detect changes** - System polls document metadata every 30 seconds
3. **Get notified** - When changes are detected, notifications appear in the group
4. **Check status** - Manually request current document status anytime
5. **Stop tracking** - Unwatch documents when no longer needed

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ User Command (@bot watch <doc>)                      │
└─────────────────┬───────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────┐
│ Command Handler (handle-doc-commands.ts)             │
│ - Parse document URL/token                           │
│ - Validate document exists                           │
│ - Start tracking + persist state                     │
└─────────────────┬───────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────────────────┐
│ Document Poller (doc-poller.ts) - Runs Every 30s    │
│ - Fetch all tracked documents metadata               │
│ - Compare with cached state                          │
│ - Detect changes                                     │
└─────────────────┬───────────────────────────────────┘
                  ↓
        ┌─────────┴──────────┐
        ↓                    ↓
┌──────────────────┐  ┌──────────────────────┐
│ No Change        │  │ Change Detected      │
│ Continue Polling │  │ Apply Debouncing     │
└──────────────────┘  └──────┬───────────────┘
                             ↓
                      ┌──────────────────┐
                      │ Debounced?       │
                      └──────┬───────────┘
                      ┌──────┴──────────┐
                      ↓                 ↓
              ┌──────────────┐  ┌─────────────────┐
              │ Skip (wait   │  │ Send Notification│
              │ next poll)   │  └────────┬────────┘
              └──────────────┘           ↓
                            ┌─────────────────────┐
                            │ Record in Audit     │
                            │ Trail + Update Cache│
                            └─────────────────────┘
```

---

## Core Components

### 1. **doc-tracker.ts** - Metadata Fetching & Caching

**Responsibility**: Fetch and cache Feishu document metadata

**Key Functions**:

```typescript
getDocMetadata(docToken, docType, useCache)
  → Fetches document metadata from Feishu
  → Handles retries with exponential backoff
  → Caches results (30s TTL)
  → Returns: { title, ownerId, lastModifiedUser, lastModifiedTime, ... }

hasDocChanged(current, previous)
  → Detects if document state changed
  → Compares: modification time, modifier user

formatDocChange(metadata)
  → Formats metadata for display in notifications
```

**Details**:

- Uses Feishu's legacy `docs-api/meta` endpoint (POST /open-apis/suite/docs-api/meta)
- Returns who modified the document and when
- **Does NOT** return what was changed (limitation of Feishu API)
- Retry logic: 3 attempts with backoff [100ms, 500ms, 2000ms]
- Cache: 30-second TTL to minimize API calls

**Example**:

```typescript
const meta = await getDocMetadata('doccnXXXXX', 'doc');
if (meta) {
  console.log(`${meta.title} by ${meta.lastModifiedUser}`);
}
```

---

### 2. **change-detector.ts** - Change Detection & Debouncing

**Responsibility**: Intelligently detect changes with debouncing

**Key Function**:

```typescript
detectChange(current, previous, config)
  → Analyzes metadata for changes
  → Applies debouncing rules
  → Returns: { hasChanged, changeType, debounced, reason }
```

**Algorithm**:

1. **First tracking**: Always detect as change (new_document)
2. **No metadata change**: Return no change
3. **Modification time changed**: Detect change (time_updated)
4. **Different modifier**: Detect change (user_changed)
5. **Apply debouncing**:
   - If notification sent < 5 seconds ago, suppress (debounced=true)
   - Otherwise, allow notification

**Change Types**:

- `time_updated` - Document modification time changed
- `user_changed` - Different user modified
- `new_document` - First time tracking

**Configuration**:

```typescript
interface ChangeDetectionConfig {
  debounceWindowMs: 5000;           // 5 second debounce window
  allowDuplicateNotifications: false; // Don't spam same-user changes
  enableLogging: true;
}
```

**Example**:

```typescript
const result = detectChange(currentMetadata, previousState);
if (result.hasChanged && !result.debounced) {
  // Send notification
  console.log(`Change: ${result.reason}`);
}
```

---

### 3. **doc-poller.ts** - Polling Service

**Responsibility**: Continuously monitor tracked documents

**Key Class**: `DocumentPoller` (Singleton)

**Methods**:

```typescript
startTrackingDoc(docToken, docType, chatIdToNotify)
  → Begin monitoring a document
  → Automatically starts polling if not running

stopTrackingDoc(docToken)
  → Stop monitoring a document
  → Stops polling if no more docs

getTrackedDocs()
  → Returns all currently tracked documents

getMetrics()
  → Returns health metrics (success rate, notifications, errors)

getHealthStatus()
  → Returns "healthy" | "degraded" | "unhealthy"
```

**Polling Loop**:

1. Every 30 seconds, fetch metadata for all tracked documents
2. For each document:
   - Get latest metadata via `getDocMetadata()`
   - Detect changes via `detectChange()`
   - If not debounced, send notification
   - Update cached state in database
3. Collect metrics (success rate, error count, notifications sent)

**Batching & Concurrency**:

- Uses `Promise.allSettled()` to handle partial failures
- Individual document failures don't crash polling
- Configurable polling interval (default: 30s)
- Configurable max concurrent polls (default: 100)

**Metrics Tracking**:

```typescript
interface PollingMetrics {
  docsTracked: number;
  successRate: number;         // 0-1
  errorsInLastHour: number;
  notificationsInLastHour: number;
  lastPollDurationMs: number;
  queuedNotifications: number;
}
```

**Example**:

```typescript
const poller = getDocPoller();
poller.startTrackingDoc('doccnXXXXX', 'doc', 'oc_chatid');
// Polling starts automatically every 30 seconds

const metrics = poller.getMetrics();
console.log(`Success rate: ${metrics.successRate * 100}%`);

poller.stopTrackingDoc('doccnXXXXX');
```

---

### 4. **doc-persistence.ts** - Database Persistence

**Responsibility**: Store tracking configuration and audit trail

**Key Methods**:

```typescript
startTracking(docToken, docType, chatIdToNotify, metadata, notes)
  → Insert tracking record into Supabase

stopTracking(docToken)
  → Mark document as inactive (soft delete)

updateTrackedDocState(docToken, { lastModifiedUser, lastModifiedTime, lastNotificationSentAt })
  → Update cached metadata after poll

getTrackedDocs(activeOnly)
  → Retrieve all tracked documents for current user

recordChange(docToken, change)
  → Insert change record into audit trail

getChangeHistory(docToken, limit)
  → Retrieve recent changes (default: 50)

getChangeStats(docToken)
  → Get statistics: total changes, notified, debounced, unique modifiers
```

**Database Schema**:

Three main tables:

1. **document_tracking**
   - Tracks which documents are being monitored
   - Caches latest metadata from Feishu
   - Records last notification time (for debouncing)

2. **document_changes**
   - Audit trail of all detected changes
   - Records whether notification was sent
   - Tracks debounced changes for analytics

3. **document_rules** (Phase 2)
   - Stores user-defined conditional rules
   - Enables advanced workflows

**RLS (Row Level Security)**:

- All tables are protected with RLS policies
- Users can only see their own tracked documents
- Enforced at database level

**Example**:

```typescript
const persistence = getPersistence();
persistence.setUserId(userId);

// Start tracking
await persistence.startTracking(
  'doccnXXXXX',
  'doc',
  'oc_chatid',
  metadata
);

// Record a change
await persistence.recordChange('doccnXXXXX', {
  newModifiedUser: 'user123',
  newModifiedTime: Math.floor(Date.now() / 1000),
  changeType: 'time_updated',
  debounced: false,
  notificationSent: true,
});

// Get history
const history = await persistence.getChangeHistory('doccnXXXXX');
```

---

### 5. **handle-doc-commands.ts** - User Commands

**Responsibility**: Process bot commands from users

**Supported Commands**:

#### `@bot watch <doc_url_or_token>`

Start tracking a document.

```
Usage: @bot watch doccnXXXXX
       @bot watch https://feishu.cn/docs/doccnXXXXX

Response:
  ✅ "Now Monitoring Document"
  - Shows document title, type, owner
  - Confirms tracking started
```

Validates:
- Document token format
- Document exists (fetches metadata)
- User has permission

#### `@bot check <doc_url_or_token>`

Show current status of a document.

```
Usage: @bot check doccnXXXXX

Response:
  📄 Document Status
  - Last modified: <timestamp>
  - Modified by: <user>
  - Recent changes: [list of last 5 changes]
```

#### `@bot unwatch <doc_url_or_token>`

Stop tracking a document.

```
Usage: @bot unwatch doccnXXXXX

Response:
  ⏹️ Stopped Tracking
  - Confirms document no longer monitored
```

#### `@bot watched`

List all documents being tracked in this group.

```
Usage: @bot watched

Response:
  📋 Tracked Documents
  - Document 1 (last changed 2h ago)
  - Document 2 (last changed 5m ago)
```

#### `@bot tracking:status`

Show poller health metrics.

```
Usage: @bot tracking:status

Response:
  📈 Tracking System Status
  - Documents tracked: 5
  - Success rate: 99.5%
  - Notifications sent (1h): 12
  - Errors: 0
```

#### `@bot tracking:help`

Show help for all commands.

```
Usage: @bot tracking:help
```

**Command Parsing**:

- Extracts document token from URLs: `https://feishu.cn/docs/doccnXXXXX`
- Also accepts direct tokens: `doccnXXXXX`, `shtcnXXXXX`
- Supports multiple doc types: doc, sheet, bitable, docx
- Removes bot mention automatically

---

## Data Flow

### User Starts Tracking Document

```
1. User: "@bot watch https://feishu.cn/docs/doccnXXXXX"
2. Bot parses URL → extracts docToken
3. Bot validates token format
4. Bot fetches metadata via getDocMetadata()
5. Bot inserts tracking record in Supabase
6. Bot calls startTrackingDoc() → starts polling
7. Bot sends confirmation card with document info
```

### Polling Detects Change

```
1. Poller runs every 30 seconds
2. Fetches metadata for all tracked documents
3. Compares with cached state
4. Detects change: lastModifiedTime !== previous
5. Applies debouncing: not sent in last 5 seconds
6. Sends notification card to group
7. Records change in audit trail (document_changes)
8. Updates cached state (lastNotificationTime)
```

### User Checks Status

```
1. User: "@bot check doccnXXXXX"
2. Bot fetches latest metadata
3. Bot queries change history (last 5 changes)
4. Bot formats response with current state + history
5. Bot sends card with document status
```

---

## Integration with Existing Bot

### Adding to Message Handler

The document tracking command handler should be called from your main message handler:

```typescript
// In handle-app-mention.ts or handle-messages.ts
import { handleDocumentCommand } from './handle-doc-commands';

async function handleMessage(event) {
  const { message, chatId, userId, botUserId } = event;

  // Check if this is a document tracking command
  const isDocCommand = await handleDocumentCommand({
    message,
    chatId,
    userId,
    botUserId,
  });

  if (isDocCommand) {
    return; // Command handled
  }

  // Handle other bot commands...
}
```

### Server Initialization

Initialize the polling service on server startup:

```typescript
// In server.ts
import { getDocPoller } from './lib/doc-poller';
import { getPersistence } from './lib/doc-persistence';

// Verify Supabase connection
const persistence = getPersistence();
const isConnected = await persistence.healthCheck();
if (!isConnected) {
  console.warn('⚠️  Document persistence unavailable');
}

// Initialize poller (it starts automatically when documents are added)
const poller = getDocPoller({
  intervalMs: 30000,
  debounceWindowMs: 5000,
  enableMetrics: true,
});

console.log('✅ Document tracking system initialized');
```

---

## Configuration

### Polling Configuration

```typescript
interface PollingConfig {
  intervalMs: 30000;              // Poll every 30 seconds
  maxConcurrentPolls: 100;        // Process up to 100 docs per poll
  batchSize: 200;                 // Feishu API batch limit
  retryAttempts: 3;               // Retry failed API calls 3 times
  debounceWindowMs: 5000;         // Don't notify within 5 seconds
  enableLogging: true;            // Enable debug logging
  enableMetrics: true;            // Collect health metrics
}
```

### Environment Variables

```bash
# Feishu API
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret

# Supabase persistence
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

### Required Feishu Permissions

Add these scopes to your Feishu app manifest:

```json
{
  "scopes": [
    "docs:read",                   // Read documents
    "drive:file:read",             // Read file metadata
    "im:message:send_as_bot"       // Send messages as bot
  ]
}
```

---

## Monitoring & Debugging

### Health Checks

```typescript
const health = getPollingHealth();
// {
//   status: "healthy" | "degraded" | "unhealthy",
//   reason: "All systems operational"
// }

if (health.status !== "healthy") {
  console.warn(`⚠️  Polling degraded: ${health.reason}`);
}
```

### Metrics Endpoint

```typescript
const metrics = getPollingMetrics();
console.log(`
  Tracked: ${metrics.docsTracked}
  Success rate: ${(metrics.successRate * 100).toFixed(1)}%
  Notifications (1h): ${metrics.notificationsInLastHour}
  Errors (1h): ${metrics.errorsInLastHour}
`);
```

### Logging

The system uses console logging with prefixes:

- `✅` - Success
- `⚠️` - Warning
- `❌` - Error
- `🔄` - In progress
- `📊` - Metrics/stats

Enable/disable with:

```typescript
const config: PollingConfig = {
  enableLogging: process.env.DEBUG_POLLING === 'true',
  // ...
};
```

### Viewing Change History

```typescript
const persistence = getPersistence();
persistence.setUserId(userId);

const changes = await persistence.getChangeHistory('doccnXXXXX', 100);
for (const change of changes) {
  console.log(`
    ${change.changeDetectedAt}
    Type: ${change.changeType}
    User: ${change.newModifiedUser}
    Notified: ${change.notificationSent}
    Debounced: ${change.debounced}
  `);
}
```

---

## Testing

### Unit Testing

Test individual components:

```typescript
import { detectChange } from './change-detector';
import { getDocMetadata } from './doc-tracker';

// Test change detection
const result = detectChange(
  { /* current metadata */ },
  { /* previous state */ }
);
expect(result.hasChanged).toBe(true);
expect(result.debounced).toBe(false);

// Test metadata fetching
const meta = await getDocMetadata('doccnXXXXX', 'doc');
expect(meta?.title).toBeDefined();
```

### Integration Testing

Test with real Feishu documents:

```typescript
// Create test document in Feishu
const testDocToken = 'doccnXXXXX';

// Start tracking
const poller = getDocPoller();
poller.startTrackingDoc(testDocToken, 'doc', 'oc_chatid');

// Wait for poll
await new Promise(r => setTimeout(r, 35000)); // 30s + buffer

// Verify metrics
const metrics = poller.getMetrics();
expect(metrics.docsTracked).toBe(1);
expect(metrics.changesDetected).toBeGreaterThan(0);
```

### Manual Testing

1. Create a test Feishu document
2. Invite the bot to a group
3. Run: `@bot watch <doc_url>`
4. Edit the document in Feishu
5. Verify notification appears in group chat

---

## Limitations & Future Work

### Current Limitations

- **No content diffs**: Only detects "who modified when", not "what changed"
- **Polling-based**: Not real-time (30 second latency)
- **No concurrent editing info**: Can't see multiple simultaneous editors
- **Feishu API limitations**: Legacy endpoint may be deprecated in future

### Phase 2 (Future)

- Content snapshots and diff generation
- Conditional rules and workflows
- Multi-channel notifications (Slack, Teams)
- Smart filtering (only notify on important changes)
- Performance optimization for 1000+ documents

---

## Troubleshooting

### Polling Not Working

1. Check database connectivity: `persistence.healthCheck()`
2. Check Feishu API key: Verify `FEISHU_APP_ID` and `FEISHU_APP_SECRET`
3. Check permissions: Verify app has `docs:read` and `drive:file:read` scopes
4. Enable logging: Set `enableLogging: true` in config

### Notifications Not Sent

1. Check debouncing: Look at `document_changes.debounced` flag
2. Check failure reason: Query `document_changes.error_message`
3. Verify chat ID: Confirm `chatIdToNotify` is correct group chat ID
4. Check RLS policies: Verify user has permissions in Supabase

### Performance Issues

1. Check metric: `lastPollDurationMs` (should be < 5 seconds)
2. Reduce document count: Unwatch less important documents
3. Increase polling interval: Change `intervalMs` to 60000+ if lag acceptable
4. Check API rate limits: Monitor `errorsInLastHour` for Feishu API throttling

---

## References

- **Feishu API Docs**: https://open.feishu.cn/document
- **docs-api/meta Endpoint**: POST /open-apis/suite/docs-api/meta
- **Supabase Docs**: https://supabase.com/docs
- **Investigation**: See FEISHU_DOC_TRACKING_INVESTIGATION.md

---

## Summary

The document tracking system provides **real-time collaborative awareness** for Feishu documents through a simple bot interface. Users can monitor documents with `@bot watch`, check status with `@bot check`, and receive notifications when changes are detected.

The MVP (Phase 1) includes:
1. ✅ Metadata fetching with caching
2. ✅ Smart change detection with debouncing
3. ✅ Polling infrastructure with metrics
4. ✅ Database persistence with audit trail
5. ✅ Intuitive bot commands
6. ✅ Error handling and observability

See FEISHU_DOC_TRACKING_ELABORATION.md for detailed project breakdown and Phase 2 roadmap.
