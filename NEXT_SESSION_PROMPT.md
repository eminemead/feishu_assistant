# Next Session - Button UI Investigation Continuation

**Previous Session**: 2025-11-21 (Session Handoff created)  
**Current Session**: 2025-11-21 (Investigation plan created)  
**Issue**: bd-s5p (in_progress)  

## Your Task

Continue investigation of button UI in streaming cards. We've discovered that **NIO Chat shows working buttons in streaming responses**, meaning a solution exists outside our current approach.

## What We Know

### ❌ What Doesn't Work (Tested)
- Adding buttons at card creation: Error 99992402
- Adding buttons via cardElement.create during streaming: Error 99992402
- Adding buttons after disabling streaming_mode: Error 99992402
- Direct button elements (no action wrapper): No render
- Feishu CardKit v2 **blocks ALL action elements in streaming cards**

### ✅ What We Suspect Works (Not Yet Tested)
1. **Separate message for buttons** (90% likely)
   - Send streaming response in one card
   - Send buttons in completely separate message
   - Why: Feishu allows action elements in non-streaming messages

2. **Rich text links** (40% likely)
   - Embed markdown/rich text links in streaming response
   - Links might not trigger 99992402 (different from action elements)

3. **CardKit v3 schema** (30% likely)
   - Feishu might have released v3 that supports buttons in streaming
   - We're using v2 currently

## Your Investigation Steps

### Step 1: Run Quick v3 Test (30 min)
This tests Hypothesis 3 with no additional context needed:

```bash
# Just check: does CardKit v3 schema work with streaming + buttons?
# Test files are ready in lib/test-cardkit-v3-schema.ts

# If v3 works → Update all cards to schema 3.0, job mostly done ✅
# If v3 fails → Move to Step 2
```

### Step 2: Test with Real Streaming Response (1-2 hours)
Start the server and observe what happens when buttons are needed:

```bash
# Start server with devtools
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# In Feishu, trigger a bot response that should show buttons
# (mention @bot or send a message)

# Monitor logs for button output
tail -f server.log | grep -i "button\|hypothesis\|action"

# Watch Feishu chat for where buttons appear:
# - During streaming? (embedded in response)
# - After streaming? (separate message)
# - As links? (markdown interactive elements)
```

### Step 3: Confirm Hypothesis (30 min)
Based on what you observe:
- Do buttons appear during streaming? → Hypothesis 2 (rich text)
- Do buttons appear in separate message after? → Hypothesis 1 ⭐
- Did v3 schema work? → Hypothesis 3

### Step 4: Implement Solution (1-2 hours)
Once hypothesis confirmed, update code:
- If H1: Update `lib/finalize-card-with-buttons.ts` to send separate message
- If H2: Update response markdown to include links
- If H3: Change schema from "2.0" to "3.0" everywhere

### Step 5: Test & Document (1 hour)
- Test with actual chat responses
- Verify buttons work (appear, are clickable)
- Update investigation documents

## Test Files Ready to Use

- ✅ `lib/test-cardkit-v3-schema.ts` - v3 schema test
- ✅ `lib/test-separate-message-buttons.ts` - Separate message test
- ✅ `lib/test-rich-text-buttons.ts` - Rich text link test
- ✅ `lib/run-button-hypothesis-tests.ts` - Orchestrates all tests

## Investigation Documents

Read these to understand context:
- 📖 `history/BUTTON_INVESTIGATION_ACTION_PLAN.md` - Complete investigation plan
- 📖 `history/NIO_INVESTIGATION_HYPOTHESES.md` - Detailed hypothesis analysis
- 📖 `history/SESSION_HANDOFF.md` - What we tried and failed

## Expected Outcome

By end of session:
- [ ] One hypothesis confirmed (or all ruled out)
- [ ] Implementation approach decided
- [ ] Code changes started or completed
- [ ] bd-s5p status updated (ready for implementation)
- [ ] Documentation updated

## Quick Reference Commands

```bash
# Check issue status
bd show feishu_assistant-s5p --json

# Read investigation plan
cat history/BUTTON_INVESTIGATION_ACTION_PLAN.md

# Start server for testing
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Monitor logs
tail -100f server.log | grep -i "button\|action\|hypothesis"

# Build if needed
bun run build

# Run tests (when ready)
bun test lib/run-button-hypothesis-tests.ts
```

## Key Files to Watch

- `lib/feishu-utils.ts` - Card creation (where schema is defined)
- `lib/finalize-card-with-buttons.ts` - Where buttons should be added
- `lib/card-button-utils.ts` - Button utilities
- `server.log` - Debug output while streaming

## Success Looks Like

After implementation, a bot response should show:
1. **Streaming text content** (typewriter effect)
2. **Buttons below** (interactive, clickable)
3. **No 99992402 errors** in logs

## Next Milestones

- **H1 confirmed + implemented**: Non-streaming card + separate button message ✅
- **H2 confirmed + implemented**: Markdown links in streaming response ✅
- **H3 confirmed + implemented**: v3 schema with buttons in streaming card ✅
- **All failed**: Fall back to non-streaming cards (Option 1)

---

**Good luck! This is close - NIO Chat has solved it, we just need to discover how. 🔍**
