# Button UI Investigation - Session Summary (2025-11-21)

**Session**: Investigation planning and framework creation  
**Issue**: bd-s5p (in_progress)  
**Status**: Investigation ready for next phase  

## What Happened This Session

### Context
Previous session (handoff) discovered that:
- Feishu CardKit v2 blocks ALL action elements in streaming cards (error 99992402)
- But NIO Chat shows working buttons → solution exists

### Our Contribution
Created comprehensive investigation framework with three prioritized hypotheses.

---

## Three Hypotheses (Priority Order)

### **Hypothesis 1: Separate Message for Buttons** ⭐ MOST LIKELY
**Probability**: 90%  
**Implementation**: Stream response card, then send buttons in separate message

```typescript
// Pattern:
1. Create streaming card (streaming_mode: true)
2. Stream response content
3. Finalize card (streaming_mode: false)
4. Send separate message with action elements (NO streaming)
// Result: Buttons appear below response
```

**Why likely**:
- Feishu allows action elements in non-streaming messages
- Bypasses 99992402 entirely
- User observation: "buttons appear outside div container"
- Clean architectural separation

**Success file**: `lib/send-follow-up-buttons-message.ts` (ready to use)

---

### **Hypothesis 2: Rich Text Links** 
**Probability**: 40%  
**Implementation**: Embed markdown links in streaming response

```typescript
// Pattern:
// In streaming card content, include:
// [Option 1](action://followup?text=Option%201)
// [Option 2](action://followup?text=Option%202)
```

**Why possible**:
- Links are different from "action" elements
- Might not trigger 99992402 validation
- Single message (no clutter)

**Success file**: `lib/test-rich-text-buttons.ts` (ready to test)

---

### **Hypothesis 3: CardKit v3 Schema**
**Probability**: 30%  
**Implementation**: Use `schema: "3.0"` instead of `"2.0"`

```typescript
// Pattern:
// cardData = { schema: "3.0", ... }
// v3 might allow action elements in streaming cards
```

**Why possible**:
- Feishu might have fixed this in v3
- SDK supports custom schemas
- Error 99992402 mentions v2 specifically

**Success file**: `lib/test-cardkit-v3-schema.ts` (ready to test)

---

## Files Created (Investigation Framework)

### Test Files (Ready to Execute)
- ✅ **`lib/test-cardkit-v3-schema.ts`** - v3 schema test
- ✅ **`lib/test-separate-message-buttons.ts`** - Separate message test
- ✅ **`lib/test-rich-text-buttons.ts`** - Rich text links test
- ✅ **`lib/run-button-hypothesis-tests.ts`** - Orchestrates all tests

### Implementation Template
- ✅ **`lib/send-follow-up-buttons-message.ts`** - Production implementation for H1

### Investigation Documents
- ✅ **`history/BUTTON_INVESTIGATION_ACTION_PLAN.md`** - Complete strategy
- ✅ **`history/NIO_INVESTIGATION_HYPOTHESES.md`** - Detailed analysis
- ✅ **`history/NIO_CHAT_INVESTIGATION.md`** - Research approach
- ✅ **`NEXT_SESSION_PROMPT.md`** - Next session guide

---

## Key Insights

### What We Know Won't Work
❌ Adding buttons to streaming cards (v2 schema)
❌ Button workarounds (all hit 99992402)

### What Likely Will Work
✅ Separate message with buttons (H1)
✅ Rich text links in response (H2)
✅ v3 schema with buttons (H3)

### The NIO Chat Clue
User confirmed: **NIO Chat shows working buttons in streaming**

This means:
- It's NOT a fundamental Feishu limitation
- Solution exists and is in production use
- We just need to discover which approach they use

---

## Next Session Roadmap

### Phase 1: Testing (2-3 hours)
1. **Quick test**: v3 schema (30 min - no context needed)
2. **Manual test**: Real streaming response (1-2 hours)
3. **Analysis**: Confirm hypothesis (30 min)

### Phase 2: Implementation (1-2 hours)
1. Based on test results, implement solution
2. Code changes to finalize-card-with-buttons.ts or card creation
3. Remove old workarounds

### Phase 3: Testing & Documentation (1 hour)
1. Test with actual chat
2. Verify buttons work
3. Update documentation

**Total**: 4-6 hours focused work

---

## Quick Start for Next Session

```bash
# Read the investigation plan
cat history/BUTTON_INVESTIGATION_ACTION_PLAN.md

# Read next session guide
cat NEXT_SESSION_PROMPT.md

# Check issue status
bd show feishu_assistant-s5p --json

# Start server
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# Run tests (in separate terminal)
bun test lib/test-cardkit-v3-schema.ts
```

---

## Success Criteria (When to Stop Investigating)

✅ Investigation complete when:
- [ ] One hypothesis confirmed OR all ruled out
- [ ] Implementation approach documented
- [ ] Code changes made (or plan documented if failed)
- [ ] bd-s5p marked ready-for-implementation
- [ ] User can see working buttons in chat

---

## Risk Assessment

### Low Risk
- Tests are isolated (don't affect running system)
- Can run in parallel with other work
- Clear decision tree (which hypothesis to implement)

### Mitigations
- Tests documented before implementation
- Fallback option ready (non-streaming cards)
- Full git history preserved

---

## Estimated Effort

**Investigation**: 4-6 hours  
**Implementation**: 2-4 hours  
**Testing**: 1-2 hours  

**Total to Feature Complete**: 7-12 hours

---

## Success Story (What Winning Looks Like)

1. **Next session**: Run tests, hypothesis confirmed
2. **Implementation**: Update finalization code
3. **Testing**: Real chat response shows:
   - ✅ Streaming text (typewriter effect)
   - ✅ Buttons appear (interactive, clickable)
   - ✅ No errors in logs
4. **Documentation**: Update docs with working approach
5. **Closure**: Users can click buttons to continue conversation

---

## Artifacts Summary

```
investigation/
├── BUTTON_INVESTIGATION_ACTION_PLAN.md   # Main strategy
├── NIO_INVESTIGATION_HYPOTHESES.md       # Hypothesis details
├── NIO_CHAT_INVESTIGATION.md             # Research approach
├── SESSION_HANDOFF.md                    # Previous session work
├── INVESTIGATION_SESSION_SUMMARY.md      # This file
└── NEXT_SESSION_PROMPT.md                # Next session guide

tests/
├── lib/test-cardkit-v3-schema.ts         # H3 test
├── lib/test-separate-message-buttons.ts  # H1 test
├── lib/test-rich-text-buttons.ts         # H2 test
└── lib/run-button-hypothesis-tests.ts    # Test orchestrator

implementation/
└── lib/send-follow-up-buttons-message.ts # H1 production code
```

---

## What to Do If Tests Fail

If none of the hypotheses work:

1. **Fallback to Option 1**: Non-streaming cards with buttons
   - Remove streaming_mode, add buttons at creation
   - Trade UX (no typewriter) for functionality (buttons work)
   - Implementation: 1-2 hours
   - Status: Guaranteed to work

2. **Fallback to Option 2**: Separate message with text buttons
   - Stream response
   - Send text-based button suggestions (current approach)
   - No interactive buttons, but works
   - Status: Currently implemented

3. **Further investigation**: 
   - Check Feishu API documentation
   - Inspect NIO Chat more carefully
   - Contact Feishu support (if possible)

---

## Conclusion

We've created a solid investigation framework targeting the most likely solutions. The key insight is that **NIO Chat proves this is solvable** - we just need to discover their approach.

**Next session**: Run tests, implement solution, ship feature.

🚀 **Ready for next phase!**
