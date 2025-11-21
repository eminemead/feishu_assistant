# NIO Chat Reverse Engineering - Streaming + Buttons Investigation

**Date**: 2025-11-21  
**Goal**: Understand how NIO Chat implements buttons in streaming cards  
**Status**: IN PROGRESS

## Research Strategy

### Phase 1: Capture Card Structure
**Method**: Browser DevTools + Network monitoring
**Objectives**:
1. [ ] Capture raw card JSON from NIO Chat when streaming response with buttons
2. [ ] Identify button element structure (action elements vs. alternatives)
3. [ ] Determine if buttons are added during, after, or separate from stream
4. [ ] Check for any custom parameters or schema versions

**Tools**:
- Chrome DevTools Network tab (filter for `/card` or streaming endpoints)
- JavaScript console to inspect DOM + intercept API calls
- Feishu CardKit documentation comparison

### Phase 2: API Call Analysis
**Objectives**:
1. [ ] Identify exact endpoints used (card.create, cardElement.create, etc.)
2. [ ] Examine request/response timing relative to streaming
3. [ ] Check for custom headers or parameters not in standard SDK
4. [ ] Determine if buttons use different element type

**Questions to Answer**:
- Are buttons added in a separate API call after streaming completes?
- Is there a different card schema version (v3 vs v2)?
- Do they use `cardElement` API instead of building in initial card?
- Are buttons rendered as rich text elements instead of action elements?

### Phase 3: Implementation Testing
Once NIO approach identified:
1. [ ] Replicate their exact method in our codebase
2. [ ] Test with our streaming implementation
3. [ ] Verify error handling and edge cases

## Key Clues from User Research

**From Session Handoff**:
- "Buttons appear to be **outside a div container** (direct elements?)"
- This suggests buttons might NOT be nested in body div structure
- Possible they're at root level of card or added separately

## Investigation Steps

### Step 1: Monitor NIO Chat Network Calls
```
1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Filter by XHR/Fetch requests
4. Filter by hostname containing "larksuite", "feishu", or "nio"
5. Trigger a response that shows buttons
6. Capture the card creation/update request
7. Examine full JSON payload
```

### Step 2: Analyze Card Structure
```json
Expected findings:
- Root-level "buttons" or "actions" array?
- Different element type for buttons (not action element)?
- Separate card update after streaming completes?
- Custom "extension" or "components" field?
```

### Step 3: Check SDK Differences
- Are they using different SDK version?
- Are they patching/wrapping Larksuite SDK?
- Are they using direct API calls instead of SDK?

## Success Criteria

✅ Investigation complete when:
1. Have captured actual NIO Chat card JSON with working buttons
2. Identified the exact mechanism (timing, element type, API call)
3. Created hypothesis for replication in our code
4. Tested hypothesis and verified it works

## Findings

*(To be filled during investigation)*

### NIO Chat Card Structure
```
[Captured JSON to go here]
```

### Key Differences from Our Approach
```
[Analysis to go here]
```

### Replication Plan
```
[Implementation strategy to go here]
```

## Fallback Options (if NIO investigation fails)

If we can't replicate NIO's approach:
1. **Non-streaming cards**: Remove streaming, add buttons at creation
2. **Separate message**: Stream content, send buttons in separate message
3. **Hybrid**: Use non-streaming for responses with actions, streaming for narrative responses

## Next Actions

- [ ] Start Chrome DevTools monitoring
- [ ] Capture NIO Chat card in streaming state
- [ ] Document findings in this file
- [ ] Create implementation based on findings
- [ ] Test and iterate
