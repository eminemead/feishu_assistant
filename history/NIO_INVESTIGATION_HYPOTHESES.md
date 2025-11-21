# NIO Chat Streaming + Buttons - Investigation Hypotheses

**Date**: 2025-11-21  
**Goal**: Identify the most likely approaches NIO Chat uses to show buttons in streaming cards

## Key Constraint
Feishu CardKit v2 returns error 99992402 when action elements are added to streaming cards, regardless of:
- When they're added (creation, during, after streaming)
- How they're added (in initial body, via API)
- Whether streaming is later disabled

## Most Likely Hypotheses (Ranked by Probability)

### Hypothesis 1: Buttons Added in SEPARATE Message After Streaming (HIGH PROBABILITY)
**Theory**: NIO Chat streams the response card, then sends buttons in a completely separate message.

**Why likely**:
- Bypasses Feishu's streaming + action element restriction entirely
- Feishu allows action elements in non-streaming messages/cards
- Explains why buttons appear to be "outside" the streaming card
- Matches user observation: "buttons appear outside div container"

**Implementation approach**:
1. Create streaming card with `streaming_mode: true`
2. Stream response content
3. Finalize card and disable streaming
4. Send SEPARATE interactive message with buttons

**How to detect**:
- Monitor Network tab in DevTools - look for TWO separate card/message API calls
- One call with streaming_mode enabled (the response)
- One separate call with action elements (the buttons)
- Timeline: buttons appear AFTER streaming finishes

**Pros**:
- ✅ Guaranteed to work (buttons in separate message)
- ✅ Clean separation of concerns
- ✅ Buttons clearly visible after response ready
- ✅ Matches Feishu's design patterns

**Cons**:
- ❌ Creates two separate messages (visual clutter)
- ❌ Buttons are detached from response content

---

### Hypothesis 2: Interactive Text/Links Instead of Action Elements (MEDIUM PROBABILITY)
**Theory**: NIO Chat uses rich text with embedded links/interactive elements that don't qualify as "action" elements.

**Why possible**:
- Feishu might allow interactive text elements in streaming cards
- Rich text is different from action elements
- Links/interactive text might bypass the 99992402 validation

**Implementation approach**:
1. Create streaming card with `streaming_mode: true`
2. Stream response with embedded markdown links: `[Button Text](action://call-handler)`
3. Links rendered as clickable elements in response

**How to detect**:
- Monitor Network: single card creation call with streaming_mode
- Inspect card JSON: look for rich_text elements or markdown links instead of action elements
- Timeline: buttons visible during streaming (no separate update)

**Pros**:
- ✅ Single message (clean UX)
- ✅ Buttons visible during streaming

**Cons**:
- ❌ Links might not look like buttons (styling limited)
- ❌ Rich text links might not trigger proper action handlers

---

### Hypothesis 3: Feishu CardKit v3 API (LOWER PROBABILITY)
**Theory**: NIO Chat uses newer CardKit v3 API that allows action elements in streaming cards.

**Why possible but less likely**:
- Feishu might have released v3 with this support
- Our SDK might default to v2 if not explicitly requested
- Error 99992402 specifically mentions v2 schema validation

**Implementation approach**:
1. Create streaming card with `schema: "3.0"` instead of `"2.0"`
2. Include action elements at card creation
3. Streaming mode + buttons both work in v3

**How to detect**:
- Monitor Network: inspect card creation payload
- Look for `"schema": "3.0"` or similar version indicator
- Check if their SDK version is much newer than ours

**Pros**:
- ✅ Single message, buttons during streaming
- ✅ Clean implementation

**Cons**:
- ❌ We're already using v2 - would require SDK upgrade
- ❌ Less likely if error explicitly mentions v2

---

### Hypothesis 4: Deferred Button Addition via Polling/Callback (LOWER PROBABILITY)
**Theory**: NIO Chat adds buttons via background polling or webhook callback after streaming completes.

**Why less likely**:
- More complex implementation
- Would still hit 99992402 error based on our testing
- Adds polling/callback infrastructure

**Implementation approach**:
1. Create streaming card with `streaming_mode: true`
2. Stream response
3. After finalization, poll or wait for callback
4. Attempt button addition (might still fail with 99992402)

**How to detect**:
- Monitor Network tab continuously after streaming ends
- Look for additional API calls 5-30 seconds after finalization
- Check if buttons appear via refresh or background update

---

### Hypothesis 5: Custom Component API Instead of Card API (LOWEST PROBABILITY)
**Theory**: NIO Chat bypasses the standard Card API entirely and uses Feishu's Component API.

**Why unlikely**:
- Component API is newer and less documented
- Would require significant implementation changes
- Might not be available to third-party bots

---

## Investigation Priority

1. **Hypothesis 1** (Separate Message) - Easiest to verify, highest probability of success
2. **Hypothesis 2** (Rich Text Links) - Second easiest, good fallback
3. **Hypothesis 3** (CardKit v3) - Worth checking if v1/v3 available
4. **Hypothesis 4** (Polling) - Only investigate if 1-3 fail
5. **Hypothesis 5** (Component API) - Last resort

## Next Steps

1. Start with Hypothesis 1: Monitor NIO Chat for separate message/card calls
2. If confirmed, implement: Stream card + separate buttons message
3. If not confirmed, move to Hypothesis 2: Check for rich text links
4. Document findings and implement solution based on most likely hypothesis

## Key Question to Answer

**"When does NIO Chat's button message appear relative to the streaming response?"**

- During streaming? → Hypothesis 2 (rich text) or 3 (v3 API)
- Right after streaming? → Hypothesis 1 (separate message) or 4 (callback)
- Immediately on first response? → Could be any (but 1 is most likely)
