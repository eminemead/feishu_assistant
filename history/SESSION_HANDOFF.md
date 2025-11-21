# Button UI Investigation - Session Handoff

**Date**: 2025-11-21  
**Status**: In Progress  
**Issue**: bd-ujn (closed), bd-s5p (in_progress)

## What We Accomplished

### Tested Approaches (Failed)
1. **Pre-generation at card creation**: Error 99992402
2. **Add buttons via cardElement.create while streaming**: Error 99992402
3. **Add buttons after disabling streaming_mode**: Error 99992402 (deferred)
4. **Direct button elements (no action wrapper)**: No buttons rendered

### Key Finding
**Feishu CardKit v2 blocks ALL action elements in streaming cards**, regardless of:
- When we try to add them (creation, during streaming, after)
- How we add them (in body, via API, different structure)
- Whether streaming is disabled

## Critical User Research Insight

**NIO Chat shows working streaming + buttons** → means solution exists outside our current approach.

User confirmed: Buttons appear to be **outside a div container** (direct elements?)

## Next Session - Priority Tasks

### 1. Reverse Engineer NIO Chat (HIGH PRIORITY)
- [ ] Capture NIO Chat card JSON structure (browser DevTools → Network)
- [ ] Examine button element structure
- [ ] Check if they use different schema/API version
- [ ] Document findings in `history/NIO_CHAT_RESEARCH.md`

### 2. Alternative Element Structures (MEDIUM PRIORITY)
- [ ] Test interactive text/links (if they bypass action element restriction)
- [ ] Try rich text elements with embedded buttons
- [ ] Investigate form elements during streaming
- [ ] Test button elements outside action/div structure

### 3. Fallback Implementation (LOW PRIORITY)
If investigation yields no results, implement one of:
- **Option 1**: Non-streaming cards with buttons (trade UX for buttons)
- **Option 2**: Separate message with buttons (visual clutter but streaming works)

## Reference Files

**Investigation Documents**:
- `history/BUTTON_UI_ALTERNATIVES.md` - 6 alternative approaches ranked
- `history/BUTTON_UI_TEST_RESULTS.md` - Detailed test results + conclusion
- `history/BUTTON_UI_IMPLEMENTATION_PLAN.md` - Original approach (for context)

**Test Code**:
- `lib/test-deferred-buttons.ts` - Deferred button test (failed)
- `lib/add-direct-buttons-to-card.ts` - Direct button test (failed)
- `lib/add-buttons-to-card.ts` - Earlier attempt via cardElement.create (failed)

**Modified Files**:
- `lib/finalize-card-with-buttons.ts` - Updated with test logic

## Known Constraints

- Error 99992402: "field validation failed" - Feishu CardKit v2 rejects action elements in streaming cards
- Cannot modify/update action elements even after streaming disabled
- No workaround found via Larksuite SDK (which we're using)

## Quick Commands for Next Session

```bash
# Check issue status
bd show feishu_assistant-ujn feishu_assistant-s5p --json

# Read investigation docs
cat history/BUTTON_UI_TEST_RESULTS.md
cat history/BUTTON_UI_ALTERNATIVES.md

# Start server for testing
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Check logs for button test output
tail -100 server.log | grep -i "button\|direct"
```

## Next Session Prompt

**For next session**: Continue investigation of button UI with NIO Chat reverse engineering. User confirmed buttons exist in streaming cards but outside div containers. Need to capture their card structure to understand how they bypass Feishu's 99992402 constraint.

**Session goal**: Determine exact NIO Chat approach → implement same pattern for our bot.

## Questions for Investigation

1. Does NIO Chat use v3 schema instead of v2?
2. Are buttons rendered as rich text elements instead of action elements?
3. Is there an undocumented API or parameter that allows action elements?
4. Are buttons sent in a separate update after initial card creation?
5. Do they use component API instead of card API?

---

**Commit**: `7746e2d` - test: button UI investigation (direct element approach failed)
