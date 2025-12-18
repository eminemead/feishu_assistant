# Document Tracking Implementation Guide

## Overview

Document tracking is now implemented with **webhook-based change detection**. The system:
- Registers webhooks when users run `@bot watch <doc>`
- Receives real-time change events from Feishu
- Stores events and metadata in Supabase
- Notifies users in group chats

## Architecture

```
User runs @bot watch <doc>
    ↓
registerDocWebhook() → Feishu API (drive/v1/files/{token}/subscribe)
    ↓
Feishu sends change events to → POST /webhook/docs/change
    ↓
handleDocChangeWebhook() → logChangeEvent() → Supabase
    ↓
Notification sent to group chat
```

## Fixed Issues

### ✅ Webhook Registration (RESOLVED)
- **Issue**: File type parameter was wrong for online documents
- **Solution**: Added `normalizeFileType()` helper
  - Maps "document" → "docx" (for online docs)
  - Maps "sheets" → "sheet"
  - Applies to both registration and deregistration

**Testing**: Webhook registration now succeeds with test document L7v9dyAvLoaJBixTvgPcecLqnIh

### ✅ Document Content Fetch (DEFERRED)
- **Issue**: ECONNRESET errors on all content endpoints (`/docx/v1/rawContent`, `/doc/v2/content`)
- **Workaround**: Use webhooks instead (better anyway)
- **Fallback**: Can fetch metadata via other endpoints if needed later

## Setup Required

### 1. Deploy Supabase Migrations

Run this in your Supabase dashboard or via CLI:

```bash
supabase migration up
```

This creates:
- `documents` - Document metadata
- `doc_snapshots` - Content versions
- `doc_change_events` - Change audit trail

**File**: `supabase/migrations/010_create_simplified_doc_tables.sql`

### 2. Ensure Webhook Route Exists

Add this to your `server.ts`:

```typescript
// POST /webhook/docs/change - Document change webhooks
app.post("/webhook/docs/change", async (c) => {
  const rawBody = await c.req.text();
  const { status, body } = await handleDocChangeWebhook(c.req.raw, rawBody);
  return c.text(body, status);
});
```

### 3. Environment Variables

```env
FEISHU_APP_ID=<your-app-id>
FEISHU_APP_SECRET=<your-app-secret>
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-key>
```

## Files Created/Modified

### New Files
- `lib/doc-supabase.ts` - Supabase storage functions
- `supabase/migrations/010_create_simplified_doc_tables.sql` - Database schema
- `scripts/test-doc-webhook-flow.ts` - End-to-end test

### Modified Files
- `lib/doc-webhook.ts` - Added `normalizeFileType()` helper
- `lib/handlers/doc-webhook-handler.ts` - Added Supabase logging

## Testing

### 1. Test Webhook Registration
```bash
bun scripts/test-doc-webhook-flow.ts
```

Expected output:
```
✅ Webhook registered successfully
✅ Document metadata stored
✅ Change event logged to Supabase
✅ Found 1 recent change(s)
✅ Webhook deregistered
```

### 2. Test Real Document Change
1. Run `@bot watch L7v9dyAvLoaJBixTvgPcecLqnIh` in Feishu
2. Edit the document in Feishu
3. Check that notification is received in group chat
4. Verify change event is stored in Supabase

### 3. Verify Supabase Data
```sql
-- Check documents
SELECT * FROM documents;

-- Check change events
SELECT * FROM doc_change_events ORDER BY logged_at DESC;

-- Check recent changes for a document
SELECT * FROM doc_change_events 
WHERE doc_token = 'L7v9dyAvLoaJBixTvgPcecLqnIh'
ORDER BY logged_at DESC LIMIT 10;
```

## Next Steps

1. **Deploy Supabase migration** (010_create_simplified_doc_tables.sql)
2. **Add webhook route** to server.ts
3. **Test with real document** - Use `@bot watch <doc>` command
4. **Content Snapshots** (Optional) - When document fetch is resolved
5. **Change Diff Detection** - Analyze changes between snapshots
6. **Custom Rules** - Allow users to set notification rules

## Known Limitations

### Content Fetch Issue
Document content endpoints return ECONNRESET errors:
- `/docx/v1/document/{id}/rawContent`
- `/doc/v2/{token}/raw_content`

This is a Feishu API issue. Workaround:
- Use webhooks for change detection (no content needed for basic tracking)
- If content is needed later, check with Feishu support

### No User ID on Webhook Events
Feishu webhook events don't always include the full user info. Currently storing:
- `user_id` from the change event
- `changed_at` timestamp
- `change_type` (edit, rename, etc.)

To get full user info, would need separate API call to `contact/v3/users/{user_id}`

## API Integration Points

### Register Webhook
```typescript
await registerDocWebhook(
  "L7v9dyAvLoaJBixTvgPcecLqnIh",  // docToken
  "docx",                          // docType
  "oc_xxxx"                        // chatId to notify
);
```

### Store Change Event
```typescript
await logChangeEvent({
  doc_token: "L7v9dyAvLoaJBixTvgPcecLqnIh",
  change_type: "edit",
  changed_by: "user_123",
  changed_at: new Date().toISOString(),
});
```

### Query Recent Changes
```typescript
const changes = await getRecentChanges("L7v9dyAvLoaJBixTvgPcecLqnIh", 10);
// Returns: Array<{doc_token, change_type, changed_by, changed_at, ...}>
```

## References

- Feishu API: https://open.feishu.cn/document/en/home
- Webhook Security: Signature verified using X-Lark-Signature header
- Database: Supabase PostgreSQL with RLS policies
