# lark-mcp Integration Example: Hybrid Smart Tracking

Based on the comparison analysis, here's how to implement the recommended **Phase 2+3: Hybrid approach** that combines Node SDK (fast metadata) with lark-mcp (rich content).

## Architecture

```
Document Poller (every 30s, Node SDK)
  ↓
Fetch metadata (2-3 API calls, batched)
  ↓
Detect change (locally, <10ms)
  ↓
If changed: Fetch content (lark-mcp, on-demand)
  ↓
Generate summary (AI analysis)
  ↓
Send rich notification
  ↓
Update tracking state
```

**Cost**: Same as current (~$0) because content only fetched on changes  
**Latency**: Same as current (metadata is fast, content loaded in background)  
**Value**: Much better notifications with context

---

## Implementation: Phase 2 (Add Content Reading)

### Step 1: Add lark-mcp Utility Module

**File**: `lib/doc-content-reader.ts`

```typescript
import { docx } from "@larksuiteoapi/lark-mcp";

/**
 * Get document content via lark-mcp
 * Returns markdown formatted content
 */
export async function getDocumentContent(
  documentId: string,
  maxAttempts: number = 2
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(
          `⏳ [DocContent] Retry attempt ${attempt + 1}/${maxAttempts} for ${documentId}`
        );
      }

      // Call lark-mcp tool
      const result = await docx.builtin.rawContent({
        document_id: documentId,
      });

      console.log(
        `✅ [DocContent] Retrieved content for ${documentId} (${result.content.length} chars)`
      );
      return result.content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxAttempts - 1) {
        console.error(
          `❌ [DocContent] Failed to get content for ${documentId}:`,
          lastError.message
        );
      }
    }
  }

  return null;
}

/**
 * Extract key information from document content
 * Used for summaries and change detection
 */
export interface DocumentSummary {
  headings: string[];
  keyPhrases: string[];
  estimatedWordCount: number;
  lastModifiedSection?: string;
}

export function extractDocumentSummary(content: string): DocumentSummary {
  // Extract headings
  const headingMatch = content.match(/^#+\s+.+$/gm) || [];
  const headings = headingMatch.map((h) => h.replace(/^#+\s+/, ""));

  // Count words
  const words = content.split(/\s+/).length;

  // Extract key phrases (capitalized phrases)
  const phraseMatch = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  const keyPhrases = [...new Set(phraseMatch)].slice(0, 10);

  return {
    headings,
    keyPhrases,
    estimatedWordCount: words,
  };
}

/**
 * Detect what changed between two versions
 */
export function detectContentChanges(
  previous: string | null,
  current: string
): {
  added: number;
  removed: number;
  modified: boolean;
  summary: string;
} {
  if (!previous) {
    return {
      added: current.length,
      removed: 0,
      modified: true,
      summary: "First version",
    };
  }

  // Simple diff: character count changes
  const diff = current.length - previous.length;
  const added = Math.max(0, diff);
  const removed = Math.max(0, -diff);

  return {
    added,
    removed,
    modified: true,
    summary:
      diff > 0
        ? `Added ${added} characters`
        : `Removed ${removed} characters`,
  };
}
```

### Step 2: Enhance Document Poller

**File**: `lib/doc-poller-enhanced.ts` (extends current)

```typescript
import { DocMetadata, TrackedDoc } from "./doc-tracker";
import { getDocumentContent, extractDocumentSummary } from "./doc-content-reader";

/**
 * Enhanced tracked document with content cache
 */
export interface EnhancedTrackedDoc extends TrackedDoc {
  lastKnownContent?: string; // Cache full content
  lastContentSummary?: DocumentSummary; // Cached summary
  lastContentFetch?: number; // Timestamp of last content fetch
}

/**
 * Enhanced notification with content context
 */
export interface EnhancedNotification {
  title: string;
  metadataInfo: string; // Who changed, when
  contentSummary?: string; // What's in the doc
  changeContext?: string; // What likely changed
}

/**
 * Generate enhanced notification with content context
 */
export async function generateEnhancedNotification(
  metadata: DocMetadata,
  tracked: EnhancedTrackedDoc
): Promise<EnhancedNotification> {
  const modTime = new Date(metadata.lastModifiedTime * 1000).toLocaleString();

  let notification: EnhancedNotification = {
    title: `📝 ${metadata.title} updated`,
    metadataInfo: `Modified by: ${metadata.lastModifiedUser}\nTime: ${modTime}`,
  };

  // Try to fetch content for richer context
  try {
    const content = await getDocumentContent(metadata.docToken, 2);

    if (content) {
      const summary = extractDocumentSummary(content);
      notification.contentSummary = `Sections: ${summary.headings.join(", ") || "No headings"}`;

      // Optional: detect what changed
      if (tracked.lastKnownContent) {
        const change = detectContentChanges(
          tracked.lastKnownContent,
          content
        );
        notification.changeContext = change.summary;
      }

      // Update cache
      tracked.lastKnownContent = content;
      tracked.lastContentSummary = summary;
      tracked.lastContentFetch = Date.now();
    }
  } catch (error) {
    console.warn(
      `⚠️  [DocPoller] Could not fetch content for ${metadata.docToken}:`,
      (error as Error).message
    );
    // Continue with metadata-only notification
  }

  return notification;
}

/**
 * Format enhanced notification for Feishu card
 */
export function formatEnhancedNotificationCard(
  notification: EnhancedNotification
): string {
  let message = notification.title + "\n\n";
  message += notification.metadataInfo;

  if (notification.contentSummary) {
    message += "\n\n" + notification.contentSummary;
  }

  if (notification.changeContext) {
    message += "\n" + notification.changeContext;
  }

  return message;
}
```

### Step 3: Integration Point

**File**: `lib/doc-poller.ts` (modify notifyDocChange)

```typescript
private async notifyDocChange(
  metadata: DocMetadata,
  tracked: TrackedDoc
): Promise<void> {
  try {
    // Try enhanced notification (with content)
    const enhancedTracked = tracked as EnhancedTrackedDoc;
    const notification = await generateEnhancedNotification(
      metadata,
      enhancedTracked
    );
    const message = formatEnhancedNotificationCard(notification);

    await createAndSendStreamingCard(tracked.chatIdToNotify, "chat_id", {
      title: notification.title,
      initialContent: message,
    });

    // Update tracked state
    this.updateTrackedDocState(enhancedTracked);

    this.metrics.notificationsSent++;
    this.log(
      `✅ [DocPoller] Enhanced notification sent for ${tracked.docToken}`
    );
  } catch (error) {
    this.metrics.notificationsFailed++;
    this.error(
      `❌ [DocPoller] Failed to send notification for ${tracked.docToken}:`,
      error
    );
  }
}
```

---

## Implementation: Phase 3 (On-Demand Content Analysis)

### Add Content Analysis Handler

**File**: `lib/handle-doc-commands-enhanced.ts` (extend existing)

```typescript
import { getDocumentContent } from "./doc-content-reader";

/**
 * Handle "analyze document" command
 * User: @bot analyze <doc_url>
 */
export async function handleAnalyzeCommand(
  docUrl: string,
  userId: string
): Promise<string> {
  try {
    // Extract document ID from URL
    const documentId = extractDocIdFromUrl(docUrl);

    if (!documentId) {
      return "Could not parse document URL. Please provide a valid Feishu doc link.";
    }

    // Fetch content
    const content = await getDocumentContent(documentId);
    if (!content) {
      return "Could not read document content. Check permissions or try again.";
    }

    // Analyze
    const summary = extractDocumentSummary(content);
    const wordCount = content.split(/\s+/).length;

    return `📄 **Document Analysis**

**Title**: ${summary.title || "Unknown"}
**Length**: ${wordCount} words
**Sections**: ${summary.headings.join(", ") || "None"}
**Key Topics**: ${summary.keyPhrases.join(", ") || "None"}

Would you like me to:
1. Summarize the content
2. Answer specific questions
3. Extract tables/data`;
  } catch (error) {
    return `Error analyzing document: ${(error as Error).message}`;
  }
}

/**
 * Handle "summarize document" command
 * User: @bot summarize <doc_url>
 */
export async function handleSummarizeCommand(
  docUrl: string,
  aiModel: any // Your AI model
): Promise<string> {
  try {
    const documentId = extractDocIdFromUrl(docUrl);
    const content = await getDocumentContent(documentId);

    if (!content) {
      return "Could not read document.";
    }

    // Use your AI model to summarize
    const summary = await aiModel.generateContent({
      prompt: `Please summarize the following document in 2-3 bullet points:\n\n${content}`,
    });

    return `📝 **Summary**\n\n${summary}`;
  } catch (error) {
    return `Error summarizing: ${(error as Error).message}`;
  }
}
```

---

## Usage Examples

### Example 1: Smart Change Notification

Before (current):
```
📝 Q4 Report
Modified by: alice@company.com
Time: Dec 2, 2025 3:45 PM
```

After (enhanced):
```
📝 Q4 Report updated
Modified by: alice@company.com
Time: Dec 2, 2025 3:45 PM

Sections: Executive Summary, Revenue Analysis, Forecast
Added 2,340 characters
```

### Example 2: Content Analysis

```
User: "@bot analyze https://feishu.com/docs/doxc..."

Bot: 📄 Document Analysis
Title: Q4 Financial Plan
Length: 5,240 words
Sections: Overview, Revenue Projections, Cost Analysis, Timeline
Key Topics: Revenue, COGS, Margin, Forecast, Timeline
```

### Example 3: Q&A on Document

```
User: "@bot what's the Q4 revenue target?"

Bot: [Fetches document content]
    Q4 revenue target is $2.5M based on the financial plan document.
```

---

## Cost/Performance Analysis

### Phase 2 Implementation

```
Scenario: 100 tracked documents, 1 change every 5 minutes (average)

API Calls per day:
  • Metadata polling: 2,880 calls (30 sec interval × 2-3 docs/call)
  • Content fetches: ~288 calls (1 change per 5 min × 100 docs/day)
  • Total: ~3,168 calls/day

Cost: ~$0 (Well within free tier)
Latency: 300ms baseline + 500ms content (on changes only)
User Experience: ⭐⭐⭐⭐ (Rich notifications with context)
```

### Phase 3 (On-Demand)

```
Scenario: Users request analysis/summary ~10 times/day

API Calls per day:
  • Phase 2 baseline: 3,168
  • On-demand requests: ~10 content fetches
  • Total: ~3,178 calls/day

Cost: Still ~$0
Impact: Minimal (on-demand is negligible)
```

---

## Migration Path

### Week 1: Add Content Reader
1. Create `doc-content-reader.ts`
2. Test with sample documents
3. Add error handling

### Week 2: Enhance Poller
1. Modify `doc-poller.ts` to use content when available
2. Make content fetching optional (graceful degradation)
3. Test with production data

### Week 3: Add Commands
1. Implement analyze/summarize commands
2. Add to bot command handler
3. Test with users

---

## Summary

| Phase | What | Effort | Value | Cost |
|-------|------|--------|-------|------|
| Current | Node SDK tracking | Done | ✅ Good | $0 |
| Phase 2 | Add smart summaries | 4h | ⭐⭐⭐ | $0 |
| Phase 3 | On-demand analysis | 3h | ⭐⭐⭐⭐ | $0 |

**Total effort**: 7 hours over 3 weeks
**Total cost**: $0 (stays within free tier)
**Result**: Professional document tracking + AI analysis

