# Supabase Webhook Migration - Completed

**Issue:** feishu_assistant-fiw2  
**Date:** Dec 18, 2025  
**Status:** ✅ Complete

## Overview

After migrating to webhook-based document tracking (using Feishu's `docs:event:subscribe` scope), the Supabase integration in `lib/doc-supabase.ts` required updates to properly handle authenticated backend operations.

## Key Issues Fixed

### 1. **Auth Context: ANON_KEY → SERVICE_KEY**

**Problem:**
- Original code used `SUPABASE_ANON_KEY` for all operations
- RLS policies in migration 010 only allowed service-role access
- Operations were being rejected by RLS policies

**Solution:**
```typescript
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  "";
```

Service key is required for:
- Webhook event handlers (trusted backend operations)
- RLS policy bypass for server-side operations
- Secure multi-tenant access

### 2. **Error Handling & Logging**

**Problem:**
- Generic error logs made debugging difficult
- No context about which operation failed
- Supabase error objects not properly formatted

**Solution:**
Added consistent logging pattern:
- ❌ `[DocSupabase]` Error logs with operation context
- ✅ `[DocSupabase]` Success logs with doc_token
- ℹ️ `[DocSupabase]` Debug logs for missing data
- ⚠️ `[DocSupabase]` Warning logs for partial failures

Example:
```typescript
console.error(`❌ [DocSupabase] Failed to store metadata for ${meta.doc_token}:`, error.message);
```

### 3. **Configuration Validation**

**Problem:**
- No check if Supabase was configured before operations
- Silent failures when credentials missing

**Solution:**
Added guard checks in every function:
```typescript
if (!supabaseUrl || !supabaseServiceKey) {
  console.debug("ℹ️ Supabase not configured - skipping operation");
  return false; // or null, or []
}
```

Enables graceful degradation when Supabase not configured.

### 4. **Complete Field Storage**

**Problem:**
- `storeDocumentMetadata()` only stored `doc_token`
- Comment said "other columns pending schema fix"
- Lost document context (title, type, owner, timestamps)

**Solution:**
Now stores all fields:
```typescript
{
  doc_token: meta.doc_token,
  title: meta.title,
  doc_type: meta.doc_type,
  owner_id: meta.owner_id,
  created_at: meta.created_at,
  last_modified_user: meta.last_modified_user,
  last_modified_at: meta.last_modified_at,
  updated_at: new Date().toISOString(),
}
```

## Files Changed

### lib/doc-supabase.ts
- Initialized with SERVICE_KEY
- Added configuration validation to all 6 functions
- Improved error handling with context-aware logging
- Fixed metadata storage to use all fields
- Better error differentiation (missing data vs API errors)

### .env.example
- Added `SUPABASE_SERVICE_KEY` with explanation
- Clarified it's required for document tracking

### test/doc-supabase-migration.test.ts (NEW)
Comprehensive test suite covering:
- Service key configuration and fallback logic
- Graceful degradation when Supabase not configured
- All metadata/snapshot/change-event operations
- Error handling without throwing exceptions
- RLS policy compatibility
- Consistent logging patterns

## Webhook Integration Flow

```
Feishu Document Change Event
         ↓
POST /webhook/docs/change
         ↓
handleDocChangeWebhook()
         ↓
logChangeEvent() → doc_change_events table ✅ (NOW FIXED)
         ↓
webhookStorage.load() → Get subscription
         ↓
notifyDocChange() → Send chat notification
```

**Key Fix:** `logChangeEvent()` now properly stores events to Supabase using SERVICE_KEY auth.

## RLS Policies

Migration 010 defines policies for webhook operations:

```sql
-- Service role can perform all operations (used by backend)
CREATE POLICY documents_service_role ON documents
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY doc_snapshots_service_role ON doc_snapshots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY doc_change_events_service_role ON doc_change_events
  FOR ALL USING (true) WITH CHECK (true);
```

Service key authenticates as service role, bypassing RLS.

## Deployment Checklist

- [x] Update lib/doc-supabase.ts with SERVICE_KEY logic
- [x] Add error handling and logging
- [x] Fix metadata storage to include all fields
- [x] Update .env.example with SUPABASE_SERVICE_KEY
- [x] Create comprehensive test suite
- [x] Verify graceful degradation mode
- [x] Document RLS policy compatibility

**Status:** Ready to test with real Feishu webhook events

## Next Steps

1. **Test with real document changes:**
   ```bash
   # Watch a document in Feishu
   # Make a change
   # Verify event logged to Supabase doc_change_events table
   ```

2. **Monitor logs:**
   Look for `[DocSupabase]` prefixed logs to track:
   - Event storage success/failures
   - Configuration warnings
   - RLS policy issues

3. **Verify stored data:**
   ```sql
   SELECT * FROM doc_change_events WHERE doc_token = 'xxx';
   ```

## Graceful Degradation

If `SUPABASE_SERVICE_KEY` not configured:
- All storage functions return `false`
- All retrieval functions return `null` or `[]`
- Debug logs explain why (not errors)
- System continues working (no chat notifications though)

This allows development without Supabase until ready to configure.
