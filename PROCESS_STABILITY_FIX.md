# Process Stability Fix - feishu_assistant-yce

## Problem Summary

The feishu_assistant server was persisting (not shutting down properly) with a process named "feishu_assistant-yce" that would exit after 5-15 seconds of operation with a socket connection error.

## Root Causes Identified

### 1. Unhandled Promise Rejections
- Event handlers in server.ts had fire-and-forget async operations
- No global error handler for unhandled promise rejections
- Causes process to crash or hang unexpectedly

### 2. Model Request Hangs
- `generateText()` calls could timeout or hang indefinitely
- No timeout protection on model requests
- Causes socket connection to close unexpectedly

### 3. Null/Undefined Handling
- `generateText()` returning null/undefined was not properly handled
- Subsequent `.match()` call would fail
- Caused TypeError crashes

## Fixes Applied

### 1. Global Error Handlers (server.ts)
```typescript
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Process] Unhandled Promise Rejection:', reason);
  console.error('   Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('❌ [Process] Uncaught Exception:', error);
  // Don't exit immediately - log and continue
});
```

**Impact:** Prevents process from crashing on unhandled errors

### 2. Timeout Protection for Model Requests (generate-followups-tool.ts)
```typescript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error("generateText timeout after 30 seconds")), 30000);
});

const result = await Promise.race([resultPromise, timeoutPromise]);
```

**Impact:** Prevents hanging requests, allows graceful fallback to default followups

### 3. Proper Null/Undefined Checks
```typescript
if (!result) {
  console.error(`❌ [Followups] generateText returned null/undefined`);
  throw new Error("generateText returned no result");
}

const text = typeof result === 'string' ? result : (result?.text || '');

if (!text || text.length === 0) {
  console.error(`❌ [Followups] generateText returned empty result`);
  throw new Error("generateText returned empty text");
}
```

**Impact:** Prevents TypeErrors and ensures valid response text

## Testing Recommendations

1. **Stress Test**
   ```bash
   # Send multiple rapid mentions to test error handling
   for i in {1..10}; do
     # Simulate message in Feishu thread
     # Wait 1 second between requests
     sleep 1
   done
   ```

2. **Timeout Test**
   - Temporarily set model to a slow/rate-limited endpoint
   - Verify 30s timeout triggers graceful fallback

3. **Error Injection**
   - Force model to return null/undefined
   - Verify error is caught and logged, process continues

4. **Long-running**
   - Run server for 1 hour with normal traffic
   - Monitor for any socket errors or crashes

## Monitoring

Watch the logs for:
- ❌ [Process] Unhandled Promise Rejection - indicates missed error handling
- ⚠️ [Followups] generateText returned empty result - indicates model issues
- "socket connection was closed unexpectedly" - indicates network issues

## Files Modified

1. **server.ts**
   - Added global error handlers

2. **lib/tools/generate-followups-tool.ts**
   - Added timeout protection (30s)
   - Added null/undefined checks
   - Improved error messages

3. **lib/shared/model-fallback.ts**
   - Added comments about error handling

## Future Improvements

1. **Connection Pool Management**
   - Limit Feishu SDK connection pools
   - Implement connection reuse with timeouts

2. **Request Queuing**
   - Queue requests to prevent overwhelming the system
   - Rate limit model API calls

3. **Circuit Breaker Pattern**
   - Auto-fallback when primary model keeps failing
   - Exponential backoff for failed requests

4. **Process Manager**
   - Use PM2 for auto-restart on crash
   - Memory leak detection and restart

5. **Resource Monitoring**
   - Add memory usage logging
   - Add file descriptor monitoring
   - Track open connections

## Deployment

To deploy these fixes:

```bash
# 1. Pull latest code
git pull origin main

# 2. Rebuild
bun run build

# 3. Restart server
pkill -f "bun server.ts"
bun run dev  # or use PM2/systemd

# 4. Monitor logs for errors
tail -f logs/dev.log | grep "❌\|⚠️"
```

## Verification Checklist

- [ ] Build completes without errors
- [ ] Server starts and connects to Feishu
- [ ] Handles incoming messages without crashing
- [ ] Generates responses successfully
- [ ] Fallback followups appear when model fails
- [ ] Process stays alive for >1 hour
- [ ] No "socket connection was closed unexpectedly" errors
- [ ] No unhandled rejection errors in logs
