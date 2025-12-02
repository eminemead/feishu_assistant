# Feishu Document Tracking Investigation

**Goal**: Monitor changes in Feishu documents, detect who made what edits, and react with bot actions (e.g., send messages to a group).

**Status**: ✅ **FEASIBLE** with current Feishu SDK (@larksuiteoapi/node-sdk@^1.44.0)

---

## Summary: Yes, It's Possible

You can:
1. ✅ Read documents with the Docs API (`doc.v2.content`)
2. ✅ Get who last modified a document and when (Drive API metadata)
3. ✅ Poll documents periodically or react to message events
4. ✅ Send bot messages to groups

**However**: Feishu **does NOT have real-time webhooks for document changes**. You'll need to **poll periodically** or react when **users mention the bot**.

---

## 1. Getting Document Metadata (Who Modified, When)

### Current Implementation (Legacy but Still Works)
**Endpoint**: `POST /open-apis/suite/docs-api/meta`

This is the legacy Drive API but it still works for getting file metadata:

```typescript
import * as lark from '@larksuiteoapi/node-sdk';

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

// Get document metadata including who modified it last
async function getDocMetadata(docToken: string, docType: string = 'doc') {
  try {
    const resp = await client.request({
      method: 'POST',
      url: '/open-apis/suite/docs-api/meta',
      data: {
        request_docs: [
          {
            docs_token: docToken,
            docs_type: docType, // 'doc', 'sheet', 'bitable', 'docx', etc.
          },
        ],
      },
    });

    if (!resp.success()) {
      console.error('Failed to get metadata:', resp);
      return null;
    }

    const meta = resp.data?.docs_metas?.[0];
    if (!meta) return null;

    return {
      docToken: meta.docs_token,
      title: meta.title,
      ownerId: meta.owner_id,
      createdTime: meta.create_time,        // Unix timestamp
      lastModifiedUser: meta.latest_modify_user,  // User ID who last modified
      lastModifiedTime: meta.latest_modify_time,  // Unix timestamp
      docType: meta.docs_type,
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return null;
  }
}

// Usage:
const meta = await getDocMetadata('doccnULnB44EMMPSYa3rIb4eJCf', 'doc');
console.log(`Doc: ${meta.title}`);
console.log(`Last modified by: ${meta.lastModifiedUser}`);
console.log(`Last modified at: ${new Date(meta.lastModifiedTime * 1000).toISOString()}`);
```

**Response Fields**:
- `docs_token` - Document token
- `title` - Document title
- `owner_id` - Owner user ID
- `create_time` - Unix timestamp (seconds)
- **`latest_modify_user`** ⭐ User ID of the last editor
- **`latest_modify_time`** ⭐ Unix timestamp of last edit (seconds)
- `docs_type` - Document type ('doc', 'sheet', 'bitable', 'docx', etc.)

---

## 2. Reading Document Content

### Current Implementation (Using Docs API v2)
Already implemented in your `lib/feishu-utils.ts`

```typescript
// Get document content (rich text)
async function getDocContent(docToken: string) {
  const resp = await client.doc.v2.content({
    params: {
      doc_token: docToken,
    },
  });

  if (!resp.success()) {
    console.error('Failed to get doc content:', resp);
    return null;
  }

  return {
    docToken: resp.data?.document?.document_id,
    title: resp.data?.document?.title,
    revision: resp.data?.document?.revision,  // Version number
    content: resp.data?.document?.body?.content, // Rich text content
  };
}
```

---

## 3. Tracking Changes: The Challenge

### ❌ What's NOT Available
- **No real-time webhooks for document edits** - Feishu doesn't emit events when documents are modified
- **No revision history API** - No way to get "what changed" between versions
- **No per-user change tracking** - No API showing "user X added text Y at time Z"

### ✅ Workarounds

#### Option 1: **Polling** (Recommended for your use case)
Poll document metadata every N seconds to detect changes:

```typescript
interface DocTracker {
  docToken: string;
  lastKnownRevision: number;
  lastKnownModifier: string;
  lastKnownModTime: number;
}

const trackedDocs = new Map<string, DocTracker>();

async function checkForDocChanges(docToken: string) {
  const current = await getDocMetadata(docToken);
  if (!current) return;

  const previous = trackedDocs.get(docToken);

  // Detect change
  if (!previous || 
      current.lastModifiedTime !== previous.lastKnownModTime ||
      current.lastModifiedUser !== previous.lastKnownModifier) {
    
    console.log(`📝 Doc changed: ${current.title}`);
    console.log(`  Modified by: ${current.lastModifiedUser}`);
    console.log(`  Modified at: ${new Date(current.lastModifiedTime * 1000).toISOString()}`);

    // Trigger action (send bot message)
    await sendBotNotification(docToken, current);

    // Update tracker
    trackedDocs.set(docToken, {
      docToken,
      lastKnownRevision: current.revision || 0,
      lastKnownModifier: current.lastModifiedUser,
      lastKnownModTime: current.lastModifiedTime,
    });
  }
}

// Poll every 30 seconds
setInterval(() => {
  for (const [docToken, _] of trackedDocs) {
    checkForDocChanges(docToken);
  }
}, 30000);
```

#### Option 2: **React to User Mentions**
Instead of polling, wait for users to mention the bot in a message, then:

```typescript
// In your handle-messages.ts or handle-app-mention.ts
async function handleUserMentioningDoc(message: string, docToken: string) {
  const metadata = await getDocMetadata(docToken);
  
  // Send bot response with latest doc info
  await sendCardMessage(chatId, {
    title: `📄 ${metadata.title}`,
    content: `
Last modified by: **${metadata.lastModifiedUser}**
Last modified: **${new Date(metadata.lastModifiedTime * 1000).toLocaleString()}**
Creator: **${metadata.ownerId}**
    `,
  });
}
```

#### Option 3: **Hybrid**: Polling + User Commands
Users send commands like:
- `@bot watch <doc_url>` - Start monitoring
- `@bot check <doc_url>` - Get latest status
- `@bot unwatch <doc_url>` - Stop monitoring

---

## 4. Sending Bot Notifications

### Already Implemented in Your Code
From `lib/feishu-utils.ts`:

```typescript
// Send card message to group
await sendCardMessage(
  chatId,
  'chat_id',
  cardEntityId
);

// Or reply in thread
await replyCardMessageInThread(
  messageId,
  cardEntityId,
  true
);
```

### Example: Full Doc Change Handler

```typescript
async function sendBotNotification(docToken: string, metadata: any) {
  const chatId = 'oc_cd4b9890...'; // Your group chat ID
  
  const card = await createAndSendStreamingCard(
    chatId,
    'chat_id',
    {
      title: `📝 Document Updated: ${metadata.title}`,
      initialContent: `
**Modified by:** ${metadata.lastModifiedUser}
**Modified at:** ${new Date(metadata.lastModifiedTime * 1000).toLocaleString()}
**Document:** ${metadata.title}
      `,
    }
  );

  console.log(`✅ Notification sent: ${card.messageId}`);
}
```

---

## 5. Architecture: Document Change Tracking System

### Flow Diagram
```
┌─────────────────────────────────────────────────────────┐
│ Option A: Polling (Recommended)                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Polling Loop (30s)]                                  │
│         ↓                                               │
│  [Get Doc Metadata via Feishu SDK]                     │
│  GET /open-apis/suite/docs-api/meta                    │
│         ↓                                               │
│  [Compare: last_modify_user & last_modify_time]        │
│         ↓                                               │
│  [Change detected?]                                    │
│    ├─ YES → [Create notification card]                │
│    │         → [Send to Feishu group]                 │
│    │         → [Log to database]                      │
│    └─ NO → [Continue polling]                         │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Option B: Event-Driven (User Mentions)                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [User mentions bot with doc URL]                      │
│         ↓                                               │
│  [Extract doc_token from message]                      │
│         ↓                                               │
│  [Get Doc Metadata]                                    │
│         ↓                                               │
│  [Send formatted response card]                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. Implementation: Add to Your Project

### New File: `lib/doc-tracker.ts`

```typescript
import * as lark from '@larksuiteoapi/node-sdk';
import { client } from './feishu-utils';

export interface DocMetadata {
  docToken: string;
  title: string;
  ownerId: string;
  createdTime: number;
  lastModifiedUser: string;
  lastModifiedTime: number;
  docType: string;
}

export interface TrackedDoc {
  docToken: string;
  docType: string;
  lastKnownUser: string;
  lastKnownTime: number;
  chatIdToNotify: string;
}

/**
 * Get document metadata including modification info
 */
export async function getDocMetadata(
  docToken: string,
  docType: string = 'doc'
): Promise<DocMetadata | null> {
  try {
    const resp = await client.request({
      method: 'POST',
      url: '/open-apis/suite/docs-api/meta',
      data: {
        request_docs: [
          {
            docs_token: docToken,
            docs_type: docType,
          },
        ],
      },
    }) as any;

    if (!resp?.success?.()) {
      console.error('❌ Failed to get doc metadata:', resp);
      return null;
    }

    const meta = resp.data?.docs_metas?.[0];
    if (!meta) return null;

    return {
      docToken: meta.docs_token,
      title: meta.title,
      ownerId: meta.owner_id,
      createdTime: meta.create_time,
      lastModifiedUser: meta.latest_modify_user,
      lastModifiedTime: meta.latest_modify_time,
      docType: meta.docs_type,
    };
  } catch (error) {
    console.error('❌ Error fetching doc metadata:', error);
    return null;
  }
}

/**
 * Check if document has been modified since last known state
 */
export function hasDocChanged(
  current: DocMetadata,
  previous?: TrackedDoc
): boolean {
  if (!previous) return true;

  return (
    current.lastModifiedUser !== previous.lastKnownUser ||
    current.lastModifiedTime !== previous.lastKnownTime
  );
}

/**
 * Format metadata for display
 */
export function formatDocChange(metadata: DocMetadata): string {
  const modTime = new Date(metadata.lastModifiedTime * 1000).toLocaleString();
  return `📝 **${metadata.title}**
Modified by: ${metadata.lastModifiedUser}
Time: ${modTime}`;
}
```

### New File: `lib/doc-poller.ts`

```typescript
import { 
  getDocMetadata, 
  hasDocChanged, 
  formatDocChange, 
  TrackedDoc,
  DocMetadata 
} from './doc-tracker';
import { createAndSendStreamingCard } from './feishu-utils';

const trackedDocs = new Map<string, TrackedDoc>();
let pollingInterval: NodeJS.Timer | null = null;

/**
 * Start tracking a document
 */
export function startTrackingDoc(
  docToken: string,
  docType: string,
  chatIdToNotify: string
) {
  trackedDocs.set(docToken, {
    docToken,
    docType,
    chatIdToNotify,
    lastKnownUser: '',
    lastKnownTime: 0,
  });

  console.log(`✅ [DocPoller] Now tracking: ${docToken}`);

  // Start polling if not already running
  if (!pollingInterval) {
    startPolling();
  }
}

/**
 * Stop tracking a document
 */
export function stopTrackingDoc(docToken: string) {
  trackedDocs.delete(docToken);
  console.log(`⏹️ [DocPoller] Stopped tracking: ${docToken}`);

  if (trackedDocs.size === 0 && pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log(`⏹️ [DocPoller] No more docs to track, stopping poller`);
  }
}

/**
 * Start the polling loop
 */
function startPolling() {
  // Poll every 30 seconds
  const POLL_INTERVAL_MS = 30000;

  pollingInterval = setInterval(async () => {
    for (const [docToken, tracked] of trackedDocs) {
      try {
        const metadata = await getDocMetadata(docToken, tracked.docType);
        if (!metadata) continue;

        if (hasDocChanged(metadata, tracked)) {
          console.log(
            `🔔 [DocPoller] Change detected in ${docToken}`
          );

          // Send notification
          await notifyDocChange(metadata, tracked);

          // Update tracking state
          trackedDocs.set(docToken, {
            ...tracked,
            lastKnownUser: metadata.lastModifiedUser,
            lastKnownTime: metadata.lastModifiedTime,
          });
        }
      } catch (error) {
        console.error(
          `❌ [DocPoller] Error checking ${docToken}:`,
          error
        );
      }
    }
  }, POLL_INTERVAL_MS);

  console.log(`🚀 [DocPoller] Started polling every ${POLL_INTERVAL_MS}ms`);
}

/**
 * Send notification when document changes
 */
async function notifyDocChange(
  metadata: DocMetadata,
  tracked: TrackedDoc
) {
  try {
    const message = formatDocChange(metadata);

    await createAndSendStreamingCard(
      tracked.chatIdToNotify,
      'chat_id',
      {
        title: `📄 Document Changed`,
        initialContent: message,
      }
    );

    console.log(`✅ [DocPoller] Notification sent to ${tracked.chatIdToNotify}`);
  } catch (error) {
    console.error(
      `❌ [DocPoller] Failed to send notification:`,
      error
    );
  }
}

/**
 * Get list of tracked documents
 */
export function getTrackedDocs(): TrackedDoc[] {
  return Array.from(trackedDocs.values());
}
```

### Usage in Message Handler

```typescript
// In lib/handle-app-mention.ts or handle-messages.ts
import { startTrackingDoc, stopTrackingDoc } from './doc-poller';

async function handleDocCommand(
  message: string,
  chatId: string,
  botUserId: string
) {
  // Command: @bot watch <doc_token>
  const watchMatch = message.match(/watch\s+(\w+)/i);
  if (watchMatch) {
    const docToken = watchMatch[1];
    startTrackingDoc(docToken, 'doc', chatId);
    
    return await replyCardMessage(chatId, {
      title: '👀 Now tracking',
      content: `Monitoring changes to document: ${docToken}`,
    });
  }

  // Command: @bot check <doc_token>
  const checkMatch = message.match(/check\s+(\w+)/i);
  if (checkMatch) {
    const docToken = checkMatch[1];
    const metadata = await getDocMetadata(docToken);
    
    return await replyCardMessage(chatId, {
      title: '📄 Document Status',
      content: `
Title: ${metadata?.title}
Last modified by: ${metadata?.lastModifiedUser}
Modified at: ${new Date((metadata?.lastModifiedTime || 0) * 1000).toLocaleString()}
      `,
    });
  }

  // Command: @bot unwatch <doc_token>
  const unwatchMatch = message.match(/unwatch\s+(\w+)/i);
  if (unwatchMatch) {
    const docToken = unwatchMatch[1];
    stopTrackingDoc(docToken);
    
    return await replyCardMessage(chatId, {
      title: '⏹️ Stopped tracking',
      content: `No longer monitoring: ${docToken}`,
    });
  }
}
```

---

## 7. Feishu SDK Methods Reference

### Your Current Setup
```typescript
// From lib/feishu-utils.ts
import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId,
  appSecret,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});
```

### Available Doc APIs

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `client.request()` | `POST /open-apis/suite/docs-api/meta` | Get doc metadata (who, when modified) |
| `client.doc.v2.content()` | `GET /open-apis/doc/v2/:docToken/content` | Read rich text content |
| `client.doc.v2.rawContent()` | `GET /open-apis/doc/v2/:docToken/raw_content` | Read plain text |
| `client.doc.v2.batchUpdate()` | `POST /open-apis/doc/v2/:docToken/batch_update` | Edit document |
| `client.im.message.create()` | `POST /open-apis/im/v1/messages` | Send message to group |

---

## 8. Limitations & Workarounds

### ❌ Limitation: No Change Diff API
**What you can't do**: Get a diff of "what changed" between versions

**Workaround**: Store document content snapshots:
```typescript
interface DocSnapshot {
  docToken: string;
  revision: number;
  content: string;
  timestamp: number;
  modifiedBy: string;
}

// Store snapshots in Supabase
const snapshots: DocSnapshot[] = [];

async function takeSnapshot(docToken: string) {
  const metadata = await getDocMetadata(docToken);
  const content = await getDocContent(docToken);
  
  snapshots.push({
    docToken,
    revision: content.revision,
    content: JSON.stringify(content.content),
    timestamp: Date.now(),
    modifiedBy: metadata?.lastModifiedUser || 'unknown',
  });
}

// Compare snapshots to see what changed
function compareSnapshots(oldSnapshot: DocSnapshot, newSnapshot: DocSnapshot) {
  const oldContent = JSON.parse(oldSnapshot.content);
  const newContent = JSON.parse(newSnapshot.content);
  
  // Simple diff (you could use a library like diff-match-patch)
  return {
    revision: {
      from: oldSnapshot.revision,
      to: newSnapshot.revision,
    },
    modifiedBy: newSnapshot.modifiedBy,
    timestamp: newSnapshot.timestamp,
  };
}
```

### ❌ Limitation: No Specific User Actions
**What you can't do**: See exactly which user made which edit

**Workaround**: Use metadata + polling to infer changes:
- `lastModifiedUser` tells you WHO last modified (but not which specific edit they made)
- `lastModifiedTime` tells you WHEN (but not the exact operation)

---

## 9. Alternative: Bitable (Spreadsheet) API

If you're working with **Feishu Bitable** (tables), there's a better option:

```typescript
// Get bitable metadata
async function getBitableMetadata(tableToken: string) {
  const resp = await client.request({
    method: 'POST',
    url: '/open-apis/suite/docs-api/meta',
    data: {
      request_docs: [{
        docs_token: tableToken,
        docs_type: 'bitable', // ← Different type
      }],
    },
  });
  
  return resp.data?.docs_metas?.[0];
}

// List records (might have creation/modification timestamps)
const resp = await client.bitable.v1.app.list({
  params: {
    // ...
  },
});
```

The **Bitable API is more feature-rich** for structured data like tables with rows/columns.

---

## 10. Quick Start: Add Doc Tracking to Your Bot

### Step 1: Create the tracker module
Copy `lib/doc-tracker.ts` and `lib/doc-poller.ts` from section 6 above.

### Step 2: Update your message handler
```typescript
// In server.ts or your event handler
import { startTrackingDoc, stopTrackingDoc } from './lib/doc-poller';

// When user says "@bot watch doc_token_here"
if (userMessage.includes('watch')) {
  const docToken = extractDocToken(userMessage);
  startTrackingDoc(docToken, 'doc', chatId);
}
```

### Step 3: Handle polling events
The poller automatically sends card messages to the group when changes are detected.

---

## 11. Configuration & Scopes

### Required Permission Scopes
```json
{
  "scopes": [
    "docs:read",                    // Read documents
    "docs:list",                    // List documents
    "drive:file:read",              // Read file metadata
    "im:message:send_as_bot"        // Send messages as bot
  ]
}
```

### Environment Variables
```bash
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_SUBSCRIPTION_MODE=true
```

---

## Summary

| Feature | Available? | Implementation |
|---------|-----------|-----------------|
| Read document content | ✅ | `client.doc.v2.content()` |
| Get who modified last | ✅ | `POST /open-apis/suite/docs-api/meta` → `latest_modify_user` |
| Get when modified | ✅ | `latest_modify_time` (Unix timestamp) |
| Real-time webhooks | ❌ | Use polling instead |
| Change diff/history | ❌ | Store snapshots manually |
| Send bot messages | ✅ | Already implemented |
| React to changes | ✅ | Polling + message handler |

**Next Steps**:
1. Copy the doc tracker code (section 6)
2. Add doc poller to your server.ts startup
3. Create bot commands: `watch`, `check`, `unwatch`
4. Test with a real Feishu doc

Let me know if you want help implementing any specific part!
