# Quick Start: Document Handler Routing Fix Testing

## Session Context
- **Issue**: Document commands being routed to manager agent (P2P path)
- **Status**: ✅ Fixed and tested
- **What's Next**: Real Feishu webhook event testing

## What Was Fixed

In `lib/handle-messages.ts`, added document command interception (was only in handle-app-mention.ts):

```typescript
// Check if document command (early exit before agent)
const isDocCommand = /^(watch|check|unwatch|watched|tracking:\w+)\s+/i.test(cleanText);
if (isDocCommand) {
  const handled = await handleDocumentCommand({...});
  if (handled) return; // Early exit - don't call generateResponse()
}
```

Result: Document commands now consistently handled across P2P and group messages.

## Quick Verification

### 1. Build & Test (2 min)
```bash
cd /Users/xiaofei.yin/work_repo/feishu_assistant

# Build
bun run build
# ✅ Should show: ⚡ Done in ~600ms

# Run key tests
bun test test/integration-command-handling.test.ts test/handle-messages-doc-command.test.ts
# ✅ Should show: 45 pass, 0 fail
```

### 2. Start Server (1 min)
```bash
bun run dev
# ✅ Should show: 📋 [Startup] WebSocket enabled
```

### 3. Test P2P Document Command (2 min)
```
In Feishu, send P2P message to bot:
watch https://feishu.cn/docs/doccnXXXXXXXX

Expected in logs:
✅ [DocCommand] Intercepted document command
✅ [DocCommand] Command handled successfully
❌ NO [Manager] route logs
```

### 4. Test Group Mention Command (2 min)
```
In Feishu group, mention bot:
@bot watch https://feishu.cn/docs/doccnXXXXXXXX

Expected in logs:
✅ [DocCommand] Intercepted document command
✅ [DocCommand] Command handled successfully
```

## Documentation to Review

1. **DOC_HANDLER_ROUTING_FIX_SUMMARY.md** - Technical details
2. **NEXT_SESSION_WEBHOOK_TESTING.md** - Webhook testing guide
3. **WORKING_SESSION_COMPLETION.md** - Full session recap

## Files Changed

- `lib/handle-messages.ts` - PRIMARY FIX (+74 lines)
- `test/handle-messages-doc-command.test.ts` - NEW TEST SUITE (23 tests)

## Status

✅ Routing conflict FIXED
✅ 68+ tests PASSING
✅ Build SUCCESSFUL
✅ Ready for WEBHOOK TESTING

## Next Actions

### Phase 1: Verify Routing (This Session)
- [ ] P2P document commands work
- [ ] Group document commands work
- [ ] No manager agent invoked
- [ ] No duplicate responses

### Phase 2: Webhook Testing (Next Session)
- [ ] Real Feishu webhook events
- [ ] Supabase logging verification
- [ ] Notification flow validation
- [ ] Production deployment

## Quick Fixes If Needed

### If pattern doesn't match
Check: `/^(watch|check|unwatch|watched|tracking:\w+)\s+/i`
Should be identical in both handlers.

### If tests fail
```bash
bun test test/handle-messages-doc-command.test.ts
# Should show 23 pass
```

### If build fails
```bash
rm -rf dist/
bun run build
```

## Git Info

**Latest commits:**
```
e53cdc5 docs: Add comprehensive session documentation for routing fix
3317eaa fix: Document command routing conflict in handle-messages.ts
```

## Commands Summary

```bash
# Quick smoke test
bun run build && bun test test/handle-messages-doc-command.test.ts

# Start server
bun run dev

# Run all doc-related tests
bun test test/integration-command-handling.test.ts test/handle-messages-doc-command.test.ts test/document-tracking-integration.test.ts

# Check git status
git log --oneline -3
```

## Success Criteria for Today

- [x] Fix implemented
- [x] Tests created and passing
- [x] Build successful
- [x] Documentation complete
- [ ] Manual P2P command test
- [ ] Manual group command test

**Estimated Time**: 15-20 minutes for verification
