# Webhook Deployment Test Plan

**Document:** https://nio.feishu.cn/docx/L7v9dyAvLoaJBixTvgPcecLqnIh  
**Date:** Dec 18, 2025

## Understanding the Webhook Flow

### Current Setup
The webhook system is **deployed and ready**, but it requires an explicit subscription first.

```
Step 1: User says "@bot watch <doc>"
  ↓
Step 2: Bot registers webhook via Feishu API
  ↓
Step 3: Feishu confirms subscription
  ↓
Step 4: User edits document
  ↓
Step 5: Feishu sends event to POST /webhook/docs/change
  ↓
Step 6: Event logged to Supabase doc_change_events
  ↓
Step 7: Chat notification sent
```

## Test Steps

### Option A: Manual Test with Real Document (Recommended)

1. **In a Feishu group chat, mention the bot:**
   ```
   @bot watch https://nio.feishu.cn/docx/L7v9dyAvLoaJBixTvgPcecLqnIh
   ```
   - Bot should register webhook
   - Feishu should confirm subscription
   - Check server log: `grep -i "webhook" server.log`

2. **Wait 30 seconds** (for subscription to be active)

3. **Edit the document** (add/modify content)
   - Any change should trigger webhook event
   - Check server log immediately:
     ```bash
     tail -f server.log | grep -E "webhook|DocSupabase"
     ```

4. **Verify event logged to Supabase:**
   ```sql
   SELECT * FROM doc_change_events 
   WHERE doc_token LIKE '%L7v9dyAvLoaJBixTvgPcecLqnIh%'
   ORDER BY logged_at DESC;
   ```

5. **Check notification** in the Feishu chat group

### Option B: Test with Curl (Simulated Event)

```bash
# Simulate a document change event
curl -X POST http://localhost:3000/webhook/docs/change \
  -H "Content-Type: application/json" \
  -H "X-Feishu-Request-Timestamp: $(date +%s)" \
  -H "X-Feishu-Request-Nonce: test-nonce-$(date +%s)" \
  -d '{
    "schema": "2.0",
    "header": {
      "event_id": "event-'$(date +%s)'",
      "event_type": "docs_doc_changed_v1",
      "create_time": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "token": "test-token",
      "app_id": "test-app"
    },
    "event": {
      "doc_token": "wiki-L7v9dyAvLoaJBixTvgPcecLqnIh",
      "doc_type": "docx",
      "user_id": "user-test-123",
      "editor_type": "user",
      "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "change_type": "edited"
    }
  }'
```

Expected response: `{"ok":true}`

### Option C: Run Integration Test

```bash
bun test test/doc-supabase-migration.test.ts
```

## What to Expect

### Success Indicators ✅

**In Server Logs:**
```
✅ [DocSupabase] Logged change event for wiki-xxx
📨 [DocWebhook] Received change event for wiki-xxx
✅ [DocWebhook] Notification sent to chat-xxx
```

**In Supabase:**
```sql
SELECT * FROM doc_change_events LIMIT 1;
-- Should show:
-- - doc_token: wiki-L7v9dyAvLoaJBixTvgPcecLqnIh
-- - change_type: edited
-- - logged_at: 2025-12-18T...Z
```

**In Feishu Chat:**
- Bot responds with document change notification
- Shows which user edited the doc and when

### Troubleshooting 🔧

**No webhook event received:**
- Verify `@bot watch` was executed successfully
- Check bot has permissions for the document
- Look for error logs: `grep -i error server.log`

**Event received but not stored in Supabase:**
- Check SUPABASE_SERVICE_KEY is configured
- Verify doc_change_events table exists
- Check migration 010 was applied

**Event received but no notification:**
- Verify webhook handler has chatId
- Check Feishu API auth token is valid
- Look for notification send errors

## Current System Status

```
Server: http://localhost:3000
PID: 3929
Webhook Endpoint: POST /webhook/docs/change
Supabase: Connected with SERVICE_KEY
Status: Ready to receive events
```

## Key Files for Reference

| File | Purpose |
|------|---------|
| lib/doc-webhook.ts | Webhook registration/deregistration |
| lib/handlers/doc-webhook-handler.ts | Event handling + Supabase logging |
| lib/doc-supabase.ts | Supabase storage layer |
| server.ts:493 | Webhook route |
| supabase/migrations/010 | Database schema |

## Next Actions

1. **Test with real document edit** (Option A recommended)
2. Monitor logs: `tail -f server.log`
3. Verify Supabase storage
4. Check chat notification
5. Run test suite: `bun test`

---

Document URL: https://nio.feishu.cn/docx/L7v9dyAvLoaJBixTvgPcecLqnIh  
Token: L7v9dyAvLoaJBixTvgPcecLqnIh  
Type: docx
