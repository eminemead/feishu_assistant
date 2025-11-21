# Button UI Investigation Results

**Date**: 2025-11-21  
**Test**: Option 5 - Deferred Button Addition

## Test Hypothesis
Adding buttons **AFTER** disabling streaming_mode might work, since the API constraint might only apply while streaming is active.

## Implementation
```typescript
1. Create streaming card (markdown only)
2. Stream response content
3. Disable streaming_mode via card.settings()
4. Try to add action element with buttons via cardElement.create()
```

## Result: ❌ FAILED

**Error**: `99992402 - field validation failed`

```
code: 99992402,
msg: "field validation failed",
error: { ... }
```

**Conclusion**: The constraint is **fundamental to cards created with streaming_mode**, not just while streaming is active. Even after disabling streaming_mode, you cannot add action elements to cards that were created with streaming enabled.

## What This Tells Us

| Approach | Status | Notes |
|----------|--------|-------|
| Add buttons at card creation | ❌ Failed | 99992402 error |
| Add buttons via `cardElement.create` while streaming | ❌ Failed | 99992402 error |
| Add buttons via `cardElement.create` after streaming disabled | ❌ Failed | 99992402 error |
| Add buttons via `card.update` | ❌ (not tested, likely same error) | Same underlying constraint |

## Next Steps

Since Option 5 doesn't work, remaining viable options are:

### Option 1: Non-Streaming Cards
- Create card WITHOUT `streaming_mode: true`
- Include buttons at creation
- Trade-off: No typewriter effect, but buttons work
- Status: Should work (based on API behavior)
- Effort: Low

### Option 2: Separate Messages
- Stream response in card (with text suggestions)
- Send buttons as separate interactive message
- Trade-off: Visual clutter (2 messages), but keeps streaming
- Status: Should work
- Effort: Low

### Option 3: NIO Chat Investigation
- Reverse engineer how NIO Chat shows working buttons with streaming
- They might use different API version, schema, or undocumented feature
- Status: Unknown
- Effort: Medium

### Option 4: Alternative Elements
- Investigate if other interactive element types work with streaming
- Rich text, forms, links, custom components
- Status: Unknown
- Effort: High

## Key Learning

**Feishu CardKit v2 has a hard architectural limit**: Cards created with `streaming_mode: true` cannot have action elements added by any mechanism, at any time. This appears to be a validation rule at the card schema level, not just during streaming.

## Recommendation

**Implement Option 1 (Non-streaming cards with buttons)** as a pragmatic fallback:
- Low effort
- Guaranteed to work
- Users get buttons, lose typewriter effect
- Can be toggled per response type (short responses = non-streaming, long = streaming with text)

**Parallelize Option 3 (NIO Chat investigation)** to potentially unlock better solution.

## Files Created
- `lib/test-deferred-buttons.ts` - Test implementation (for reference)
- This report
