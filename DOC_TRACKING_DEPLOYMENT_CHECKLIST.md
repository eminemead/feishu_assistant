# Document Tracking Deployment Checklist

## Pre-Deployment Verification

- [x] Webhook registration fixed (normalizeFileType() handles docx vs doc)
- [x] Supabase storage functions implemented (doc-supabase.ts)
- [x] Webhook handler updated to log changes (doc-webhook-handler.ts)
- [x] Server webhook route already exists (server.ts line 493-513)
- [ ] Supabase migration deployed (010_create_simplified_doc_tables.sql)

## Step 1: Deploy Supabase Migration

### Option A: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in left sidebar
4. Click **+ New Query**
5. Copy entire contents of `supabase/migrations/010_create_simplified_doc_tables.sql`
6. Paste into query editor
7. Click **Run** button
8. Verify success message at bottom

### Option B: Via Supabase CLI

```bash
supabase db push
```

### Option C: Verify Migration Deployed

```bash
bun scripts/setup-doc-tables.ts
```

Expected output:
```
✅ Document tables already exist!
✅ Successfully connected to documents table
✅ Successfully connected to doc_change_events table
```

## Step 2: Verify Webhook Route

The webhook route is already in `server.ts` at line 493-513:

```typescript
app.post("/webhook/docs/change", async (c) => {
  // Route already handles:
  // - URL verification challenge
  // - Webhook signature validation
  // - Event parsing and logging
  // - Error handling
});
```

**Verification**: Server will start normally on `bun run dev`

## Step 3: Test with End-to-End Script

```bash
bun scripts/test-doc-tracking-e2e.ts
```

Expected output:
```
✅ Step 1: Register webhook for test document - PASSED
✅ Step 2: Store document metadata in Supabase - PASSED
✅ Step 3: Retrieve document metadata from Supabase - PASSED
✅ Step 4: Simulate and log document change event - PASSED
✅ Step 5: Query recent changes from Supabase - PASSED
✅ Step 6: Log additional change events and verify ordering - PASSED
✅ Step 7: Deregister webhook for test document - PASSED
```

## Step 4: Test with Real Document Changes

### In Feishu Group Chat:

1. Run command: `@bot watch L7v9dyAvLoaJBixTvgPcecLqnIh`
   - Expected response: Confirmation that tracking started
   - Webhook is registered with Feishu

2. Edit the document in Feishu
   - Make any change (add/edit/delete text)
   - Wait 2-3 seconds

3. Check group chat for notification
   - Should see: "📝 Document change detected"
   - Shows: Document token, change type, who modified it, when

4. Verify in Supabase
   - Go to Supabase SQL Editor
   - Run:
     ```sql
     SELECT * FROM doc_change_events 
     WHERE doc_token = 'L7v9dyAvLoaJBixTvgPcecLqnIh'
     ORDER BY logged_at DESC LIMIT 5;
     ```
   - Should see new row(s) for each edit

### Expected Supabase Data:

```
doc_token: L7v9dyAvLoaJBixTvgPcecLqnIh
change_type: edit
changed_by: <user_id>
changed_at: <timestamp>
logged_at: <server timestamp>
```

## Step 5: Monitor and Validate

### Check Server Logs

Look for patterns:
```
📡 [DocWebhook] Registering webhook for L7v9dyAvLoaJBixTvgPcecLqnIh...
✅ [DocWebhook] Registered webhook for L7v9dyAvLoaJBixTvgPcecLqnIh

📨 [DocWebhook] Received change event for L7v9dyAvLoaJBixTvgPcecLqnIh
✅ [DocWebhook] Notification sent to <chat_id>
```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Table 'documents' does not exist" | Run Supabase migration (Step 1) |
| "Webhook registration fails" | Verify Feishu app scopes include `docs:event:subscribe` |
| "No notification in chat" | Check bot has permission to post in chat |
| "Changes not logged in Supabase" | Verify Supabase credentials in `.env` |

## Configuration

### Environment Variables Required

```env
# Feishu
FEISHU_APP_ID=<your-app-id>
FEISHU_APP_SECRET=<your-app-secret>

# Supabase
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>

# Server
PORT=3000
NODE_ENV=development
```

### Feishu App Settings

Required scopes:
- `docs:event:subscribe` - Register/deregister document webhooks
- `im:message` - Send notifications to chat
- `im:message:get` - Read message content

## Rollback Plan

If issues arise:

1. **Disable tracking**: Don't run `@bot watch` commands
2. **Revert migration** (if needed):
   ```bash
   # In Supabase SQL Editor, run:
   DROP TABLE IF EXISTS doc_change_events CASCADE;
   DROP TABLE IF EXISTS doc_snapshots CASCADE;
   DROP TABLE IF EXISTS documents CASCADE;
   ```
3. **Check server logs** for webhook errors
4. **Contact support** with error messages

## Success Criteria

✅ **Deployment successful when:**

1. Supabase tables created without errors
2. End-to-end test passes (all 7 steps)
3. Real document change generates:
   - Notification in Feishu group chat
   - Entry in `doc_change_events` table
   - Metadata in `documents` table
4. Server logs show no webhook processing errors

## Next Features (Future)

- [ ] Document content snapshots (once ECONNRESET resolved)
- [ ] Change diff detection (highlight what changed)
- [ ] Custom notification rules (only notify on specific changes)
- [ ] Change history visualization
- [ ] Document version comparison

## Support

For issues:
1. Check server logs: `bun run dev 2>&1 | grep -i "docwebhook\|doc_"`
2. Review setup guide: `DOC_TRACKING_SETUP_GUIDE.md`
3. Test with script: `bun scripts/test-doc-tracking-e2e.ts`
