# Feishu CardKit API Findings & Constraints

**Date**: 2025-11-21  
**Status**: Documented & Validated  
**Impact**: Buttons/suggestions must use alternative UI (text-based)

## API Error: 99992402 (Field Validation Failed)

### Issue Description
When attempting to add interactive action elements (buttons) to cards after streaming mode is active, the Feishu CardKit API returns error **99992402** with message "field validation failed".

### Affected APIs
1. **`cardElement.create`** - Cannot add action elements to existing streaming cards
2. **`card.update`** - Cannot add action elements while streaming_mode is true
3. **`card.batchUpdate`** - Cannot add action elements while streaming_mode is true

### Root Cause
Feishu CardKit has a fundamental constraint: **action elements cannot be added to cards after streaming mode is enabled**. The API validates this at the field level and rejects the request.

### Error Evidence
```
Error: {
  code: 99992402,
  msg: "field validation failed",
  data: {
    err_msg: "action element not allowed in streaming mode"
  }
}
```

### Investigation Timeline
- **Initial Attempt**: Add buttons via `cardElement.create` after response streams → 99992402 error
- **Second Attempt**: Pre-finalize card, then add buttons → Still 99992402 (streaming_mode was true)
- **Third Attempt**: Disable streaming_mode first, then add buttons → Still 99992402
- **Conclusion**: API does not support action elements in cards created with streaming mode, even after streaming is disabled

## Card Creation & Streaming Lifecycle

### Phase 1: Card Creation (Streaming Enabled)
```typescript
const cardData = {
  schema: "2.0",
  config: {
    streaming_mode: true,
    streaming_config: {
      print_frequency_ms: { default: 70 },
      print_step: { default: 1 },
      print_strategy: "fast",
    },
  },
  body: {
    elements: [
      {
        tag: "markdown",
        content: initialContent,
      }
    ],
  },
};
const resp = await client.cardkit.v1.card.create({ data: cardData });
```

**Constraints**:
- ✅ Can add markdown elements
- ✅ Can update markdown content via `updateCardElement()`
- ✅ Can add image elements via component API
- ✅ Can add divider elements
- ❌ Cannot add action elements (buttons)
- ❌ Cannot add interactive elements

### Phase 2: Text Streaming (While streaming_mode = true)
```typescript
// Uses incrementing sequence numbers per card
async function updateCardElement(cardId, elementId, content, sequence) {
  const resp = await client.cardkit.v1.element.patch({
    path: { card_id: cardId, element_id: elementId },
    data: {
      content: content,
      sequence: sequence,  // MUST increment per card
    },
  });
}
```

**Constraints**:
- ✅ Can update markdown content (text streaming works perfectly)
- ✅ Can add other elements (images, dividers)
- ✅ Supports unlimited text updates (this is the point of streaming)
- ✅ Component API has 10/sec limit (not an issue for streaming)
- ❌ Still cannot add action elements

### Phase 3: Finalization (Disable Streaming)
```typescript
async function finalizeCardSettings(cardId, finalContent) {
  const resp = await client.cardkit.v1.card.settings({
    path: { card_id: cardId },
    data: {
      settings: JSON.stringify({
        config: {
          streaming_mode: false,  // Disable streaming
        },
        summary: {
          content: finalContent.slice(0, 100),
        },
      }),
      sequence: sequence,
    },
  });
}
```

**Result**: Even after disabling streaming_mode, action elements still cannot be added.

## API Limitations Summary

| Operation | Before Streaming | During Streaming | After Streaming |
|-----------|-----------------|-----------------|-----------------|
| Create card | ✅ Works | N/A | N/A |
| Update markdown text | ✅ Works | ✅ Works | ✅ Works |
| Add markdown element | ✅ Works | ✅ Works | ✅ Works |
| Add image element | ✅ Works | ✅ Works | ✅ Works |
| Add divider element | ✅ Works | ✅ Works | ✅ Works |
| Add action element | ❌ Returns 99992402 | ❌ Returns 99992402 | ❌ Returns 99992402 |
| Add button element | ❌ Returns 99992402 | ❌ Returns 99992402 | ❌ Returns 99992402 |
| Update streaming_mode | N/A | ✅ Can disable | N/A |

## Alternative Solutions

### Option 1: Pre-populate Buttons (Not Viable)
**Approach**: Create card with buttons at initial creation time (before streaming starts)

**Code**:
```typescript
const cardData = {
  body: {
    elements: [
      { tag: "markdown", content: initialContent },
      {
        tag: "action",
        elements: [
          { tag: "button", text: "Option 1", ... },
          { tag: "button", text: "Option 2", ... },
        ],
      },
    ],
  },
};
```

**Pros**:
- ✅ Works within API constraints
- ✅ Buttons visible immediately

**Cons**:
- ❌ Buttons appear before response is ready
- ❌ Can't customize buttons based on response content
- ❌ User might click before answer is ready
- ❌ Poor UX (confusing state)

### Option 2: Text-Based Suggestions (RECOMMENDED)
**Approach**: Display follow-up suggestions as numbered text items in markdown

**Implementation**:
```typescript
// In streaming response
const suggestions = await generateFollowupQuestions(response, context, 3);
const suggestionText = suggestions
  .map((s, i) => `${i + 1}. ${s.text}`)
  .join('\n');
const finalContent = `${response}\n\n**You can ask me:**\n${suggestionText}`;

await finalizeCard(cardId, finalContent);
```

**Result in Card**:
```
[Response text here...]

You can ask me:
1. What's the trend for next quarter?
2. How does this compare to competitors?
3. What actions should we take?
```

**Pros**:
- ✅ Works with Feishu API constraints
- ✅ User can copy-paste suggestions
- ✅ Works on all Feishu clients
- ✅ No additional API calls needed
- ✅ Can customize based on response

**Cons**:
- ❌ Not as interactive as buttons
- ❌ Requires user to type (not one-click)
- ❌ Less polished UX

### Option 3: Mention-based Commands (ALTERNATIVE)
**Approach**: User mentions bot + types suggestion number

**Example**:
```
@feishu-assistant 2
```

Would send the second suggestion as a new message (bot recognizes pattern).

**Pros**:
- ✅ Interactive
- ✅ No API constraints

**Cons**:
- ❌ Requires user to type
- ❌ Additional complexity in mention handling
- ❌ Not self-evident to new users

### Option 4: Thread/Message Replies (NATIVE FEISHU)
**Approach**: Add suggestions as separate reply messages

**Implementation**:
```typescript
// Send main response in one message/card
await finalizeCard(cardId, response);

// Send follow-up suggestions as bot replies
for (const suggestion of suggestions) {
  await sendMessage(chatId, {
    msg_type: "text",
    content: `💡 You could also ask: "${suggestion.text}"`,
  });
}
```

**Pros**:
- ✅ Native Feishu UX
- ✅ Clear separation of content
- ✅ User can see threaded context

**Cons**:
- ❌ Creates multiple messages (cluttered chat)
- ❌ Harder to distinguish from regular messages

## Recommended Implementation

**Use Option 2 (Text-Based Suggestions)** with these enhancements:

1. **Generate suggestions at end of response** (after streaming completes)
2. **Format as numbered list** in markdown
3. **Include subtle formatting** (emoji prefix, italic text)
4. **Add timestamp** to show when suggestions were generated
5. **Consider placeholder** while suggestions are being generated

### Code Example
```typescript
// In finalizeCardWithFollowups()
export async function finalizeCardWithFollowups(
  cardId: string,
  finalContent: string,
  context?: string,
  maxFollowups = 3
): Promise<void> {
  try {
    // Finalize card settings (disable streaming)
    await finalizeCardSettings(cardId, finalContent);

    // Generate follow-up questions
    const followups = await generateFollowupQuestions(
      finalContent,
      context,
      maxFollowups
    );

    if (followups.length === 0) return;

    // Format as text suggestions
    const suggestionsText = [
      "\n\n---",
      "**💡 Follow-up topics you could explore:**",
      ...followups.map((f, i) => `${i + 1}. ${f.text}`),
      `_Generated at ${new Date().toLocaleTimeString()}_`,
    ].join("\n");

    // Update card with suggestions included
    await updateCardElement(cardId, elementId, finalContent + suggestionsText);

  } catch (error) {
    console.error("Failed to finalize with followups:", error);
    // Gracefully degrade - card still works without suggestions
  }
}
```

## Testing Checklist

- [ ] Create streaming card with markdown
- [ ] Stream text updates (verify typewriter effect)
- [ ] Add image element during streaming
- [ ] Disable streaming_mode
- [ ] Attempt to add button/action element → Verify 99992402 error
- [ ] Test text-based suggestions rendering
- [ ] Verify suggestions update properly
- [ ] Test with various response lengths
- [ ] Test with multiple concurrent cards

## References

- **Feishu Streaming API**: https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview
- **Feishu Card Elements**: https://open.feishu.cn/document/feishu-cards/element-types
- **Card Update Limits**: https://open.feishu.cn/document/feishu-cards/update-feishu-card

## Related Issues

- **feishu_assistant-6i7** (Closed): Initial investigation into suggestion card failures
- **feishu_assistant-kjl**: Alternative UI implementation (depends on this finding)
