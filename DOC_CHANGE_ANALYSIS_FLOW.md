# Document Change Analysis Flow

## User Flow After Document Change Notification

### Overview
When a watched document changes, the bot now:
1. **Captures** the current state (snapshot)
2. **Analyzes** what changed (semantic diff)
3. **Evaluates** rules based on change patterns
4. **Reacts** with intelligent actions

### Complete Flow

```
User edits watched document
  ↓
Feishu sends webhook event to /webhook/docs/change
  ↓
handleDocChangeWebhook()
  ├─ Verify webhook signature
  ├─ Parse change event (doc_token, change_type, modified_by, timestamp)
  ├─ Log to Supabase for audit trail
  ├─ Send basic text notification (immediate)
  └─ Trigger async analysis (background)
  
ASYNC: triggerChangeAnalysis()
  ├─ Step 1: Snapshot Capture
  │   └─ handleChangeDetectedSnapshot()
  │       ├─ Download current document content from Feishu
  │       ├─ Compress and store snapshot in db
  │       ├─ Compare with previous snapshot
  │       └─ Compute semantic diff
  │
  ├─ Step 2: Rules Evaluation  
  │   └─ evaluateChangeRules(docChange)
  │       ├─ Match change against defined rules
  │       ├─ Example rules:
  │       │   - Notify if specific sections changed
  │       │   - Alert on multiple edits in short time
  │       │   - Track who changed what when
  │       └─ Execute matched rule actions
  │
  └─ Step 3: Intelligent Analysis (TODO)
      └─ Future: Use agent to:
          ├─ Summarize what changed
          ├─ Ask clarifying questions
          ├─ Suggest actions
          └─ Post formatted card response to chat
```

## Key Components

### 1. Snapshot Capture (`doc-snapshot-integration.ts`)
- Downloads full document content from Feishu
- Stores compressed snapshots in Supabase
- Maintains version history
- **Output**: Semantic diff of changes

### 2. Rules Engine (`rules-integration.ts`)
- Evaluates changes against user-defined rules
- Rules can be:
  - **Notifications**: Send alerts for specific changes
  - **Workflows**: Trigger actions like API calls
  - **Tracking**: Log changes for compliance
- Runs asynchronously (doesn't block webhook)
- **Output**: Rule execution results

### 3. Intelligent Analysis (Future - TODO)
- Use document tracking agent to:
  - Analyze semantic meaning of changes
  - Generate context-aware questions
  - Provide actionable insights
  - Post card-formatted response to group
- **Would use**: Document semantic search + LLM reasoning

## Current Implementation Status

✅ **Done**
- Webhook registration and event receiving
- Snapshot capture infrastructure  
- Rules evaluation framework
- Supabase persistence

⏳ **In Progress**
- Wiring rules into webhook handler (JUST ADDED)
- Snapshot diff computation

❌ **TODO**
- Intelligent agent-driven analysis
- Generate follow-up questions based on changes
- Post analyzed responses as cards (with action buttons)
- Rule execution actions (notifications, workflows)

## User Experience

### Current (Text Notification Only)
```
User: @bot watch https://nio.feishu.cn/docx/L7v9...
Bot: ✅ Now Monitoring Document
      Webhook registered! You'll get notified in real-time...

[User edits doc]

Bot: 📝 Document change detected
     Token: L7v9...
     Type: docx
     Modified by: ou_xxx
     Change type: edit
     Time: 2025-12-18T...
```

### Future (Intelligent Analysis)
```
[User edits doc - adds new section on Q4 metrics]

Bot: 📊 **Document Update: New Content Added**
     
     **What changed**: Added "Q4 Financial Metrics" section
     
     **Questions for you**:
     - Should we update the OKR targets based on these metrics?
     - Do these numbers match last week's report?
     
     **Suggested actions**:
     [Review metrics] [Update OKRs] [Compare with previous]
```

## Configuration

### Disable/Enable Analysis
```typescript
// In webhook handler
triggerChangeAnalysis(change, chatId)
  // Enable/disable via config:
  // - Rules: `await evaluateChangeRules(docChange, { enabled: false })`
  // - Snapshots: `{ enableAutoSnapshot: false }`
```

### Define Custom Rules
See `rules-integration.ts` EXAMPLE_RULES for pattern.

## Files Modified
- `lib/handlers/doc-webhook-handler.ts` - Added analysis pipeline
- `lib/rules-integration.ts` - Existing (now integrated)
- `lib/doc-snapshot-integration.ts` - Existing (now integrated)

## Next Steps
1. Test rules evaluation with sample change events
2. Implement intelligent analysis agent
3. Add action buttons to response cards
4. Define useful rule templates for common scenarios
