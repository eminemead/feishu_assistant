# Debugging Session: Text-Based Suggestions Feature (Nov 21, 2025)

**Issue**: feishu_assistant-8t6  
**Related**: feishu_assistant-61u (Closed), feishu_assistant-kjl (Closed)  
**Status**: In Progress - Server running with fixes, needs testing

## Current State

### What's Working ✅
1. Feature code implemented and integrated
2. Server restarting with new code
3. Suggestions generation is being called
4. Logging shows CardSuggestions flow executing

### What We Fixed Today

#### Fix 1: Missing `getNextCardSequence` Import
- **Problem**: Removed import but function was still used in `finalizeCardSettings`
- **Error**: `ReferenceError: getNextCardSequence is not defined`
- **Solution**: Re-added import to finalize-card-with-buttons.ts

#### Fix 2: Order of Operations (Critical)
- **Problem**: Was calling `finalizeCardSettings()` BEFORE updating card element, which disabled streaming mode
- **Error**: `Failed to update card element: code 300309, msg: "streaming mode is closed"`
- **Root Cause**: Feishu API doesn't allow element updates after streaming_mode is set to false
- **Solution**: Reordered steps:
  1. Generate suggestions (while streaming active)
  2. Format suggestions as markdown
  3. Update card element with suggestions (BEFORE disabling streaming)
  4. Finally, disable streaming mode

### Known Issues to Address

#### Issue 1: LLM Generation Error
```
TypeError: undefined is not an object (evaluating '(await generateObject({...})')
```
- **Location**: `lib/tools/generate-followups-tool.ts` line 135
- **Root Cause**: `generateObject` from Vercel AI SDK may not be properly imported or available
- **Status**: Needs investigation - may be async import issue or model availability
- **Fallback**: Code has fallback default suggestions, so feature degrades gracefully

#### Issue 2: Timestamp Generation Issue  
- **Problem**: Timeline shows suggestions should have been generated but error occurred
- **Solution**: LLM issue needs fixing - may be model availability or API key issue

### Code Changes Made

**Files Modified**:
1. `lib/finalize-card-with-buttons.ts` - Reordered steps, fixed imports
2. `lib/generate-followups-tool.ts` - Added emoji/category metadata to FollowupOption interface
3. `lib/handle-messages.ts` - Simplified function calls
4. `lib/handle-app-mention.ts` - Simplified function calls

**Key Changes to Finalization Flow**:
```typescript
// OLD ORDER (BROKEN)
await finalizeCardSettings(cardId, finalContent);  // Closes streaming
const followups = await generateFollowupQuestions(...);  // Generate
await updateCardElement(cardId, elementId, contentWithSuggestions);  // ❌ FAILS - streaming closed

// NEW ORDER (FIXED)
const followups = await generateFollowupQuestions(...);  // Generate while open
await updateCardElement(cardId, elementId, contentWithSuggestions);  // ✅ Update while open
await finalizeCardSettings(cardId, contentWithSuggestions);  // Close streaming last
```

## Testing Checklist

### What Still Needs Testing
- [ ] LLM suggestion generation working properly
- [ ] Suggestions appear in Feishu card after response
- [ ] Emoji rendering correctly
- [ ] Formatting looks good (numbered list)
- [ ] Works on mobile Feishu client
- [ ] Fallback defaults work if LLM fails
- [ ] Multiple concurrent cards don't interfere

### How to Test
1. Send message to Feishu bot: "What are the quarterly OKR metrics?"
2. Wait for response to stream and complete
3. Check card for suggestions appearing at bottom
4. Verify format: numbered list with emoji
5. Check logs for CardSuggestions success messages

## Next Steps for Future Session

### Immediate (Priority 1)
1. **Verify LLM Generation**: Check why `generateObject` is undefined
   - Check model initialization in `getPrimaryModel()`
   - Verify Vercel AI SDK imports
   - Check if `generateObject` needs different import path
   
2. **Verify Feature End-to-End**: 
   - Test in Feishu desktop client
   - Test in Feishu mobile client
   - Check logs for errors

### Secondary (Priority 2)
1. **Add Better Error Logging**: Show what `generateObject` is (undefined vs function)
2. **Consider Alternative**: If LLM keeps failing, fallback to simple rule-based generation
3. **Performance**: Monitor time from response complete to suggestions visible

### Configuration
After getting it working, consider adding:
```bash
# .env
SUGGESTIONS_ENABLED=true
SUGGESTIONS_COUNT=3
SUGGESTIONS_STYLE=numbered
SUGGESTIONS_WITH_EMOJI=true
```

## Key Files for Reference

### Main Implementation
- `lib/finalize-card-with-buttons.ts` - Finalization & suggestions orchestration
- `lib/format-suggestions.ts` - Markdown formatting utility
- `lib/tools/generate-followups-tool.ts` - LLM-based question generation
- `test/format-suggestions.test.ts` - Formatter tests (39 tests, all passing)

### Documentation
- `docs/implementation/feishu-api-findings.md` - API constraints & workarounds
- `docs/implementation/text-based-suggestions-implementation.md` - Full implementation guide
- `docs/implementation/IMPLEMENTATION_SUMMARY.md` - High-level overview

### Test Results
- 46 unit tests passing (39 formatter + 7 finalization)
- Build succeeds with no errors
- No breaking changes

## Debugging Tips

### Check Logs
```bash
# Follow live logs
tail -f logs/dev.log | grep "CardSuggestions\|Followups"

# Check startup log from last test
tail -200 startup.log | grep "CardSuggestions\|Error"
```

### Restart Server
```bash
pkill -9 bun
sleep 2
cd /Users/xiaofei.yin/work_repo/feishu_assistant && \
NODE_ENV=development ENABLE_DEVTOOLS=true nohup bun run dev > startup.log 2>&1 &
sleep 8
curl -s http://localhost:3000/health | jq '.status'
```

### Rebuild Without Restarting
```bash
bun run build  # esbuild (fast)
```

## Technical Details

### Streaming Mode Lifecycle
```
1. Create card with streaming_mode: true
2. Stream text updates (updateCardElement while streaming)
3. Add images/elements (while streaming still true)
4. Update with suggestions (still need streaming true)
5. Finally: updateCardSettings to set streaming_mode: false
```

### Sequence Numbers
- Each operation on a card gets incremented sequence number
- Sequence tracks state progression
- `updateCardElement` handles sequence internally via `getNextCardSequence()`

### Card Element Content
- Single markdown element per response card
- All suggestions appended to same element's content
- No separate action/button elements possible (API limitation 99992402)

## Related Issues

- **feishu_assistant-61u**: ✅ CLOSED - Documented API constraint (99992402)
- **feishu_assistant-kjl**: ✅ CLOSED - Implemented text-based alternative UI
- **feishu_assistant-8t6**: 🔄 CURRENT - Debugging LLM generation

## Session Notes

- Learned that streaming mode must stay active during all updates
- Order of operations is critical for Feishu API
- LLM generation fallback works but need to debug why main path fails
- Feature is architecturally sound, just needs LLM issue fixed
