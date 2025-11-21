# Button UI Investigation - Actionable Plan

**Date**: 2025-11-21  
**Status**: Ready for Implementation  
**Priority**: HIGH (bd-s5p)  

## The Core Problem

Feishu CardKit v2 returns error 99992402 when action elements (buttons) are added to streaming cards, regardless of:
- When buttons are added (during creation, mid-stream, after finalization)
- How they're added (in initial body, via cardElement.create API)
- Whether streaming is disabled after creation

## The NIO Chat Clue

User observation: **NIO Chat shows working buttons in streaming responses**, which means a solution exists.

This investigation focuses on discovering how NIO Chat achieves this.

---

## Investigation Plan (Prioritized)

### Phase 1: Hypothesis Testing (IMMEDIATE - Next Session)

Three hypotheses to test, in priority order:

#### **Hypothesis 1: Separate Message for Buttons** ⭐ MOST LIKELY
**Probability**: 90%  
**Effort**: LOW

**Theory**: NIO Chat streams the response in one card, then sends buttons in a completely separate message.

**Why likely**:
- Bypasses Feishu's restriction entirely
- Matches user observation: "buttons appear outside div container"
- Feishu allows action elements in non-streaming messages
- Simplest architectural solution

**Test approach**:
```typescript
1. Create streaming card (response content)
2. Stream response normally
3. Finalize card (disable streaming)
4. Send SEPARATE message with buttons
5. Observe: buttons appear after response, clickable
```

**Success criteria**: 
- ✅ Buttons render in separate message
- ✅ Buttons are clickable
- ✅ UX is acceptable (buttons below response)

**Implementation location**: `lib/finalize-card-with-buttons.ts`

---

#### **Hypothesis 2: Rich Text Links** ⭐ GOOD FALLBACK
**Probability**: 40%  
**Effort**: LOW

**Theory**: Markdown links or rich text elements work in streaming cards (different from action elements).

**Why possible**:
- Feishu might allow interactive text elements
- Links aren't technically "action" elements
- Could be embedded in response content

**Test approach**:
```typescript
1. Create streaming card
2. Update content with markdown links: [Button](action://...)
3. Stream normally
4. Observe: links render as clickable in response
```

**Success criteria**:
- ✅ Links render in streaming card
- ✅ Links are clickable
- ✅ Styling is button-like

**Implementation location**: `lib/test-rich-text-buttons.ts`

---

#### **Hypothesis 3: CardKit v3 API** 
**Probability**: 30%  
**Effort**: MEDIUM

**Theory**: Feishu released v3 API with streaming + button support.

**Why possible**:
- Feishu might have fixed this in v3
- Our SDK uses v1 client but could support v3 schema
- Error 99992402 mentions v2 schema specifically

**Test approach**:
```typescript
1. Try creating streaming card with schema: "3.0"
2. Include action elements at creation time
3. Observe: does v3 allow this?
```

**Success criteria**:
- ✅ Card created successfully with schema 3.0
- ✅ Buttons render during/after streaming
- ✅ No 99992402 error

**Implementation location**: `lib/test-cardkit-v3-schema.ts`

---

### Phase 2: Implementation (Based on Test Results)

**If Hypothesis 1 works** (MOST LIKELY):
- Update `finalize-card-with-buttons.ts` to send separate button message
- Keep streaming response card as-is
- Simple, low-risk implementation

**If Hypothesis 2 works**:
- Update response markdown to include links
- Embed button-like interactive text in response
- Keep single message, no changes to finalization

**If Hypothesis 3 works**:
- Update card schema from "2.0" to "3.0" everywhere
- Add action elements to streaming card creation
- Remove all workarounds

**If none work**:
- Fall back to non-streaming cards with buttons (Option 1 from alternatives)
- Trade UX for functionality

---

## Test Files Created (Ready to Use)

✅ **`lib/test-cardkit-v3-schema.ts`**
- Tests CardKit v3 schema support
- Executable: `testStreamingCardWithV3Schema()`

✅ **`lib/test-separate-message-buttons.ts`**
- Tests sending buttons as separate message
- Executable: `testStreamingCardWithSeparateButtons()`
- Requires conversation context

✅ **`lib/test-rich-text-buttons.ts`**
- Tests markdown links in streaming
- Executable: `testRichTextButtonsInStreamingCard()`

✅ **`lib/run-button-hypothesis-tests.ts`**
- Comprehensive test runner
- Orchestrates all hypothesis tests
- Generates recommendations based on results

---

## How to Run Tests (Next Session)

### Test v3 Schema (Simplest - No Context Needed)
```bash
# Can test immediately without starting full server
node -e "
  import('./lib/test-cardkit-v3-schema.ts').then(m => 
    m.testStreamingCardWithV3Schema().then(r => console.log(r))
  )
"
```

### Test All Hypotheses
```bash
# Requires Feishu client setup
# Best run with server running:
NODE_ENV=development bun run dev
# Then in separate terminal:
bun run test lib/run-button-hypothesis-tests.ts
```

### Manual Testing (Most Realistic)
```bash
# 1. Start server with devtools
NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev

# 2. In Feishu chat, trigger a response that should have buttons
#    (mention bot or send message)

# 3. Monitor server logs for button test output:
tail -f server.log | grep -i "hypothesis\|button\|v3"

# 4. Observe in Feishu whether buttons appear:
#    - During streaming?
#    - After streaming?
#    - In separate message?
#    - As links?
```

---

## Decision Tree

```
Running tests?
├─ v3 Schema works (schema 3.0 + streaming + buttons)? 
│  ├─ YES → Use v3, add buttons to all streaming cards
│  └─ NO → Continue
├─ Separate message works?
│  ├─ YES → Update finalization to send buttons separately ⭐ LIKELY
│  └─ NO → Continue
├─ Rich text links work?
│  ├─ YES → Embed links in response content
│  └─ NO → Fall back to non-streaming cards
```

---

## Expected Outcomes

**Best Case** (v3 works):
- Single streaming card with buttons
- Buttons appear immediately
- Clean UX, matches NIO Chat

**Good Case** (separate message works):
- Streaming response + separate button message
- Buttons appear right after response
- Acceptable UX, practical implementation

**Fallback** (neither works):
- Non-streaming cards with buttons
- No typewriter effect, but buttons work
- Trade-off: UX for functionality

---

## Files to Update After Tests

Depending on results:

**If v3 or separate message works**:
- ✏️ `lib/feishu-utils.ts` - Card creation logic
- ✏️ `lib/finalize-card-with-buttons.ts` - Finalization & button sending
- ✏️ `lib/card-button-utils.ts` - Button utilities
- 🗑️ Remove: `lib/add-buttons-to-card.ts`, `lib/add-direct-buttons-to-card.ts`, `lib/test-deferred-buttons.ts`
- 📝 Create: `lib/send-button-message.ts` or update finalization

**Documentation**:
- ✏️ `history/NIO_CHAT_INVESTIGATION.md` - Document findings
- ✏️ `docs/implementation/button-ui-implementation.md` - Update approach
- 📝 `history/BUTTON_INVESTIGATION_RESULTS.md` - Final report

---

## Success Criteria

Investigation complete when:
- [ ] One hypothesis confirmed or all ruled out
- [ ] Implementation approach documented
- [ ] Code changes made and tested
- [ ] bd-s5p updated with status
- [ ] User can see buttons in actual chat

---

## Estimated Timeline

- **Phase 1 (Testing)**: 2-4 hours
  - Hypothesis 3 test: 30 min (immediate, v3 schema)
  - Manual testing with server: 1-2 hours
  - Analyze results: 30 min
  
- **Phase 2 (Implementation)**: 1-3 hours
  - Code changes: 1-2 hours
  - Testing: 1 hour
  - Documentation: 30 min

- **Total**: 4-7 hours of focused work

---

## Key Insight for Next Session

The fact that **NIO Chat has working buttons** means one of these approaches works:
1. Separate message with buttons
2. Rich text/markdown links
3. Newer API version (v3)

This is **not** a fundamental Feishu limitation - it's a constraint of our current approach. One of these tests will reveal the solution.

**Recommended first action**: Run v3 schema test immediately (30 min, no context needed), then proceed to manual testing with actual responses.
