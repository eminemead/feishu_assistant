# Document Tracking API Reference

Quick API reference for integrating document tracking into your bot.

---

## Core APIs

### doc-tracker.ts

#### `getDocMetadata(docToken, docType?, useCache?)`

Fetch document metadata from Feishu.

```typescript
const meta = await getDocMetadata('doccnXXXXX', 'doc', true);
// Returns:
// {
//   docToken: string
//   title: string
//   ownerId: string
//   createdTime: number (Unix timestamp)
//   lastModifiedUser: string (User ID)
//   lastModifiedTime: number (Unix timestamp)
//   docType: "doc" | "sheet" | "bitable" | "docx"
// }
```

**Parameters**:
- `docToken` (string): Feishu document token (required)
- `docType` (string): Document type (default: "doc")
- `useCache` (boolean): Use cached results (default: true)

**Returns**: `DocMetadata | null`

**Throws**: On API errors, after retries exhausted

---

#### `hasDocChanged(current, previous?)`

Check if document has changed since last known state.

```typescript
const changed = hasDocChanged(currentMetadata, previousState);
```

**Parameters**:
- `current` (DocMetadata): Current metadata from Feishu
- `previous` (TrackedDoc?): Previous tracked state (optional)

**Returns**: `boolean`

---

#### `formatDocChange(metadata)`

Format metadata for display in notifications.

```typescript
const formatted = formatDocChange(metadata);
// Returns markdown string: "📝 **Title**\nModified by: user\nTime: ..."
```

---

#### `isValidDocToken(docToken)`

Validate document token format.

```typescript
if (!isValidDocToken('doccnXXXXX')) {
  // Invalid token
}
```

**Returns**: `boolean`

---

### change-detector.ts

#### `detectChange(current, previous?, config?)`

Intelligent change detection with debouncing.

```typescript
const result = detectChange(currentMetadata, previousState, {
  debounceWindowMs: 5000,
  allowDuplicateNotifications: false,
  enableLogging: true,
});

// Returns:
// {
//   hasChanged: boolean
//   changeType?: "time_updated" | "user_changed" | "new_document"
//   previousUser?: string
//   previousTime?: number
//   currentUser: string
//   currentTime: number
//   changedAt: Date
//   debounced: boolean  // true if detected but suppressed
//   reason?: string     // Explanation
// }
```

**Parameters**:
- `current` (DocMetadata): Current metadata
- `previous` (TrackedDoc?): Previous state (optional)
- `config` (ChangeDetectionConfig?): Configuration options

**Returns**: `ChangeDetectionResult`

---

#### `shouldNotifyAgain(lastNotificationTime, minIntervalMs?)`

Check if enough time has passed to send another notification.

```typescript
if (shouldNotifyAgain(lastNotificationTime, 5000)) {
  // Safe to send another notification
}
```

**Parameters**:
- `lastNotificationTime` (number): Timestamp of last notification
- `minIntervalMs` (number): Minimum interval (default: 5000)

**Returns**: `boolean`

---

### doc-poller.ts

#### `getDocPoller(config?)`

Get singleton instance of document poller.

```typescript
const poller = getDocPoller({
  intervalMs: 30000,
  maxConcurrentPolls: 100,
  debounceWindowMs: 5000,
  enableMetrics: true,
});
```

**Parameters**: `Partial<PollingConfig>`

**Returns**: `DocumentPoller`

---

#### `startTrackingDoc(docToken, docType, chatIdToNotify)`

Start tracking a document.

```typescript
startTrackingDoc('doccnXXXXX', 'doc', 'oc_chatid');
```

**Parameters**:
- `docToken` (string): Document token
- `docType` (string): Document type
- `chatIdToNotify` (string): Chat ID for notifications

**Returns**: `void`

---

#### `stopTrackingDoc(docToken)`

Stop tracking a document.

```typescript
stopTrackingDoc('doccnXXXXX');
```

**Parameters**:
- `docToken` (string): Document token

**Returns**: `void`

---

#### `getTrackedDocs()`

Get all currently tracked documents.

```typescript
const tracked = getTrackedDocs();
// Returns: TrackedDoc[]
```

---

#### `getPollingMetrics()`

Get polling health metrics.

```typescript
const metrics = getPollingMetrics();
// Returns:
// {
//   docsTracked: number
//   lastPollTime: number
//   lastPollDurationMs: number
//   successRate: number (0-1)
//   errorsInLastHour: number
//   notificationsInLastHour: number
//   apiCallsInLastHour: number
//   queuedNotifications: number
//   failedNotifications: number
// }
```

---

#### `getPollingHealth()`

Get polling service health status.

```typescript
const health = getPollingHealth();
// Returns:
// {
//   status: "healthy" | "degraded" | "unhealthy"
//   reason?: string
// }
```

---

### doc-persistence.ts

#### `getPersistence()`

Get persistence service instance.

```typescript
const persistence = getPersistence();
```

**Returns**: `DocumentPersistence`

---

#### `setPersistenceUserId(userId)`

Set current user ID for RLS-based operations.

```typescript
setPersistenceUserId('user_123');
```

**Must be called before any database operations.**

---

#### `startTracking(docToken, docType, chatIdToNotify, metadata?, notes?)`

Insert tracking record in database.

```typescript
const persisted = await persistence.startTracking(
  'doccnXXXXX',
  'doc',
  'oc_chatid',
  metadata,
  'Optional notes'
);

// Returns: PersistedTrackedDoc
```

---

#### `stopTracking(docToken)`

Mark document as inactive.

```typescript
await persistence.stopTracking('doccnXXXXX');
```

**Soft delete**: Document record remains for audit trail.

---

#### `getTrackedDocs(activeOnly?)`

Retrieve all tracked documents for current user.

```typescript
const docs = await persistence.getTrackedDocs(true);
// Returns: PersistedTrackedDoc[]
```

**Parameters**:
- `activeOnly` (boolean): Only active documents (default: true)

---

#### `recordChange(docToken, change)`

Insert change record in audit trail.

```typescript
await persistence.recordChange('doccnXXXXX', {
  previousModifiedUser: 'user_1',
  newModifiedUser: 'user_2',
  previousModifiedTime: 1234567890,
  newModifiedTime: 1234567900,
  changeType: 'time_updated',
  debounced: false,
  notificationSent: true,
  notificationMessageId: 'msg_id',
  metadata: { /* optional */ },
});
```

---

#### `getChangeHistory(docToken, limit?)`

Retrieve recent changes for a document.

```typescript
const changes = await persistence.getChangeHistory('doccnXXXXX', 50);
// Returns: DocumentChange[]
```

**Parameters**:
- `docToken` (string): Document token
- `limit` (number): Max results (default: 50)

---

#### `getChangeStats(docToken)`

Get change statistics.

```typescript
const stats = await persistence.getChangeStats('doccnXXXXX');
// Returns:
// {
//   totalChanges: number
//   notifiedChanges: number
//   debouncedChanges: number
//   uniqueModifiers: string[]
// }
```

---

#### `healthCheck()`

Verify database connectivity.

```typescript
const isConnected = await persistence.healthCheck();
```

**Returns**: `boolean`

---

### handle-doc-commands.ts

#### `handleDocumentCommand(args)`

Process document tracking commands.

```typescript
const handled = await handleDocumentCommand({
  message: '@bot watch doccnXXXXX',
  chatId: 'oc_chatid',
  userId: 'user_123',
  botUserId: 'ou_bot_id',
});

// Returns: boolean (true if command was handled)
```

**Supported commands**:
- `@bot watch <doc>`
- `@bot check <doc>`
- `@bot unwatch <doc>`
- `@bot watched`
- `@bot tracking:status`
- `@bot tracking:help`

---

## Type Definitions

### DocMetadata

```typescript
interface DocMetadata {
  docToken: string;
  title: string;
  ownerId: string;
  createdTime: number;           // Unix timestamp (seconds)
  lastModifiedUser: string;      // User ID
  lastModifiedTime: number;      // Unix timestamp (seconds)
  docType: "doc" | "sheet" | "bitable" | "docx" | string;
}
```

### TrackedDoc

```typescript
interface TrackedDoc {
  docToken: string;
  docType: string;
  chatIdToNotify: string;        // Group chat ID
  lastKnownUser: string;         // Last modifier user ID
  lastKnownTime: number;         // Last known timestamp
  lastNotificationTime: number;  // For debouncing
}
```

### ChangeDetectionResult

```typescript
interface ChangeDetectionResult {
  hasChanged: boolean;
  changeType?: "time_updated" | "user_changed" | "new_document";
  previousUser?: string;
  previousTime?: number;
  currentUser: string;
  currentTime: number;
  changedAt: Date;
  debounced: boolean;
  reason?: string;
}
```

### PollingMetrics

```typescript
interface PollingMetrics {
  docsTracked: number;
  lastPollTime: number;
  lastPollDurationMs: number;
  successRate: number;           // 0-1
  errorsInLastHour: number;
  notificationsInLastHour: number;
  apiCallsInLastHour: number;
  queuedNotifications: number;
  failedNotifications: number;
}
```

### PollingConfig

```typescript
interface PollingConfig {
  intervalMs: number;            // Poll interval (default: 30000)
  maxConcurrentPolls: number;    // (default: 100)
  batchSize: number;             // (default: 200)
  retryAttempts: number;         // (default: 3)
  debounceWindowMs: number;      // (default: 5000)
  enableLogging: boolean;        // (default: true)
  enableMetrics: boolean;        // (default: true)
}
```

---

## Usage Examples

### Basic Usage

```typescript
import {
  startTrackingDoc,
  stopTrackingDoc,
  getTrackedDocs,
  getPollingMetrics,
} from './lib/doc-poller';
import { getDocMetadata } from './lib/doc-tracker';

// Start tracking
startTrackingDoc('doccnXXXXX', 'doc', 'oc_chatid');

// Check metrics
const metrics = getPollingMetrics();
console.log(`Tracking ${metrics.docsTracked} documents`);

// Stop tracking
stopTrackingDoc('doccnXXXXX');
```

### Command Integration

```typescript
import { handleDocumentCommand } from './lib/handle-doc-commands';

// In your message handler
async function handleMessage(event) {
  const handled = await handleDocumentCommand({
    message: event.message,
    chatId: event.chatId,
    userId: event.userId,
    botUserId: event.botUserId,
  });

  if (handled) return;
  
  // Handle other commands...
}
```

### Persistence Usage

```typescript
import { getPersistence, setPersistenceUserId } from './lib/doc-persistence';

const persistence = getPersistence();
setPersistenceUserId('user_123');

// Start tracking with persistence
const tracked = await persistence.startTracking(
  'doccnXXXXX',
  'doc',
  'oc_chatid',
  metadata
);

// Record changes
await persistence.recordChange('doccnXXXXX', {
  newModifiedUser: 'user_456',
  newModifiedTime: Math.floor(Date.now() / 1000),
  changeType: 'time_updated',
  debounced: false,
  notificationSent: true,
});

// Query history
const history = await persistence.getChangeHistory('doccnXXXXX');
```

---

## Error Handling

All functions may throw errors. Handle appropriately:

```typescript
try {
  const metadata = await getDocMetadata('doccnXXXXX');
  if (!metadata) {
    console.log('Document not found or no access');
  }
} catch (error) {
  console.error('Failed to fetch metadata:', error);
  // Send error message to user
}
```

---

## Performance Considerations

### Caching

Metadata is cached for 30 seconds by default:

```typescript
// Uses cache
const meta1 = await getDocMetadata('doccnXXXXX');

// Returns same result without API call (within 30s)
const meta2 = await getDocMetadata('doccnXXXXX');

// Force fresh fetch
const meta3 = await getDocMetadata('doccnXXXXX', 'doc', false);
```

### Polling Optimization

- Polling runs every 30 seconds by default
- Uses `Promise.allSettled()` to handle partial failures
- Debouncing prevents notification spam (5 seconds default)
- Metrics help identify slow pollers

### Database Queries

All operations use RLS for security:

```typescript
// Must set user ID first
setPersistenceUserId(userId);

// This query filters by RLS policy
const tracked = await persistence.getTrackedDocs();
```

---

## Migration from Memory-Only Tracking

If migrating from in-memory tracking:

```typescript
// 1. Get all in-memory tracked docs
const allTracked = getTrackedDocs();

// 2. Persist to database
const persistence = getPersistence();
for (const doc of allTracked) {
  const metadata = await getDocMetadata(doc.docToken);
  await persistence.startTracking(
    doc.docToken,
    doc.docType,
    doc.chatIdToNotify,
    metadata
  );
}

// 3. Polling continues automatically
```

---

## See Also

- **Implementation Guide**: document-tracking-implementation.md
- **Investigation**: FEISHU_DOC_TRACKING_INVESTIGATION.md
- **Elaboration**: FEISHU_DOC_TRACKING_ELABORATION.md
