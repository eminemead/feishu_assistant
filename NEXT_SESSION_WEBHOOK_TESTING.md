# Next Session: Real Feishu Webhook Event Testing

## Status: Ready for Testing ✅

The document tracking webhook handler is **fully deployed** and tested. All routing conflicts have been **fixed**.

## What's Done

### Infrastructure ✅
- Webhook endpoint: `POST /webhook/docs/change` (server.ts:493)
- Handler: `lib/handlers/doc-webhook-handler.ts`
- Signature validation: `isValidFeishuRequest()` from feishu-utils.ts
- Supabase logging: `logChangeEvent()` from doc-supabase.ts
- Event processing: `handleDocChangeEvent()` from doc-webhook.ts

### Routing Conflicts Fixed ✅
- `lib/handle-messages.ts`: Added document command interception
- `lib/handle-app-mention.ts`: Already had interception
- Both handlers now use identical pattern matching
- Document commands NEVER sent to manager agent
- 68+ tests passing (integration, routing, document tracking)

### Devtools Integration ✅
- Devtools tracks all doc commands
- Tracks routing decisions
- Tracks successful/failed handlers
- Visible in devtools dashboard

## What to Test Next

### Phase 1: Simple P2P Message Test (5 min)

```bash
# Start server
bun run dev

# In Feishu, send P2P message to bot:
watch https://feishu.cn/docs/doccnXXXXXXXXXX

# Expected:
# ✅ Command handler responds
# ❌ NO manager agent response
# Logs show: [DocCommand] Intercepted document command
```

### Phase 2: Group Message Test (5 min)

```bash
# In Feishu group chat, mention bot:
@bot watch https://feishu.cn/docs/doccnXXXXXXXXXX

# Expected:
# ✅ Command handler responds
# ❌ NO manager agent response
# Logs show: [DocCommand] Intercepted document command
```

### Phase 3: Real Webhook Event Test (10 min)

This requires Feishu webhook configuration. Steps:

1. **Register Webhook in Feishu Console**
   - App ID: `FEISHU_APP_ID`
   - Webhook URL: `https://your-domain.com/webhook/docs/change`
   - Event: `docs:event:subscribe`
   - Signature Key: Set as `FEISHU_ENCRYPT_KEY` in .env

2. **Configure Environment**
   ```bash
   FEISHU_ENCRYPT_KEY=your_signature_key_from_feishu
   NODE_ENV=production  # Enable signature validation
   ```

3. **Test Flow**
   ```
   User watches document:
   @bot watch https://feishu.cn/docs/doccnABC123
   
   Document is modified (e.g., title changed)
   
   Feishu sends webhook event to POST /webhook/docs/change
   
   Server receives event → logs to Supabase → sends notification
   
   Expected logs:
   ✅ [DocWebhook] Received change event for wiki-ABC123
   ✅ [DocSupabase] Logged change event
   ✅ [DocWebhook] Notification sent to chat
   ```

4. **Verify Supabase**
   ```sql
   SELECT * FROM doc_change_events 
   WHERE doc_token LIKE 'wiki-ABC123%'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

### Phase 4: Multi-Document Test (15 min)

```bash
# Watch multiple documents
@bot watch doc1
@bot watch doc2
@bot watch doc3

# Verify all are tracked
@bot watched

# Modify each document in Feishu
# Expected: 3 separate notifications in chat

# Unwatch one
@bot unwatch doc2

# Verify only doc1 and doc3 get notifications
```

### Phase 5: Edge Cases (10 min)

1. **Invalid Document Token**
   ```bash
   @bot watch invalid-doc-token
   # Expected: Error message, NOT queued in webhook
   ```

2. **Rapid Changes**
   - Make 10 rapid changes to one document
   - Expected: All changes logged to Supabase
   - Check if notification debouncing works (if implemented)

3. **Very Long Document URL**
   ```bash
   @bot watch https://feishu.cn/docs/doccnVeryLongTokenHere...
   # Expected: Successfully parsed and registered
   ```

4. **Webhook Signature Validation**
   - Test with invalid signature in dev mode
   - Expected: Skips validation (as per NODE_ENV=development)
   - Test in prod with real signature
   - Expected: Validates correctly

## Debugging Guide

### If Command Doesn't Get Intercepted

Check server logs for:
```
[DocCommand] Intercepted document command
```

If missing:
- Verify pattern: `/^(watch|check|unwatch|watched|tracking:\w+)\s+/i`
- Check if message has cleaning issues (mentions not removed)
- Verify devtools shows "DocumentTracking" agent call

### If Webhook Event Not Received

Check:
1. **Server is listening on port 3000**
   ```bash
   curl http://localhost:3000/health
   # Should return JSON with status
   ```

2. **Webhook endpoint accessible**
   ```bash
   curl -X POST http://localhost:3000/webhook/docs/change \
     -H "Content-Type: application/json" \
     -d '{"type":"url_verification","challenge":"test123"}'
   # Should return challenge
   ```

3. **Feishu webhook configured correctly**
   - Check Feishu App Console → Event Subscription
   - Webhook URL must be publicly accessible
   - HTTPS recommended (HTTP OK for localhost testing)

4. **Signature validation**
   - If `NODE_ENV=development`: Signature validation is bypassed
   - If `NODE_ENV=production`: Must have valid `FEISHU_ENCRYPT_KEY`

### If Webhook Event Received But Not Processed

Check logs for:
```
[DocWebhook] Error processing webhook:
```

Common issues:
- Supabase connection failed (check env vars)
- Event parsing failed (check Feishu event format)
- Signature validation failed (check encryption key)

### Devtools Monitoring

Access at: `http://localhost:3000/devtools` (if `ENABLE_DEVTOOLS=true`)

Look for:
- "DocumentTracking" agent calls
- Command interception tracking
- Response tracking
- Error tracking

## Files to Review Before Testing

1. **lib/handle-messages.ts** (Line 32-72)
   - Document command interception logic
   - Pattern matching

2. **lib/handle-app-mention.ts** (Line 89-120)
   - Same pattern, already tested

3. **lib/handlers/doc-webhook-handler.ts** (Lines 19-64)
   - Webhook event handling
   - Signature validation
   - Supabase logging

4. **server.ts** (Lines 491-519)
   - Webhook endpoint setup
   - URL verification challenge handling

5. **test/handle-messages-doc-command.test.ts**
   - 23 test cases covering all scenarios
   - Can run: `bun test test/handle-messages-doc-command.test.ts`

## Quick Commands

```bash
# Start server
bun run dev

# Run routing tests
bun test test/integration-command-handling.test.ts

# Run new handle-messages tests
bun test test/handle-messages-doc-command.test.ts

# Run all document tracking tests
bun test test/document-tracking-integration.test.ts

# Build for production
bun run build

# Check server health
curl http://localhost:3000/health | jq

# Test webhook endpoint
curl -X POST http://localhost:3000/webhook/docs/change \
  -H "Content-Type: application/json" \
  -d '{
    "type": "url_verification",
    "challenge": "test123"
  }'
```

## Expected Outcomes

After completing all testing:

1. ✅ Document commands consistently handled (all paths)
2. ✅ Webhook events processed correctly
3. ✅ No duplicate responses
4. ✅ Supabase logs all document changes
5. ✅ Notifications sent to correct chats
6. ✅ Manager agent not invoked for document commands
7. ✅ Performance optimized (early exit for doc commands)

## Issues to Create (if needed)

If you discover issues during testing:
```bash
bd create "Issue title" -p 1 --deps feishu_assistant-wkfm --json
```

Link them to the webhook testing task.

## Success Criteria

Session complete when:
- [ ] P2P document commands work (not routed to agent)
- [ ] Group document commands work (not routed to agent)
- [ ] Real webhook events received and processed
- [ ] Supabase stores all change events
- [ ] Notifications sent without conflicts
- [ ] All 68+ tests passing
- [ ] No duplicate responses observed
- [ ] Devtools shows correct agent routing

**Estimated Time**: 1-2 hours with debugging
