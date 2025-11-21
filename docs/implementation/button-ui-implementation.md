# Real Button UIs Implementation (bd-ujn)

**Status**: ✅ Implemented  
**Date**: 2025-11-21  
**Branch**: feature/button-uis  

## Problem Solved

Previously, follow-up suggestions were displayed as **numbered text** in markdown:

```
You can ask me:
1. What's the trend?
2. Compare competitors?
3. What actions?
```

Users had to read and manually type suggestions. Goal: **Real clickable buttons** users can tap to trigger follow-ups.

## Solution: Pre-generate Buttons at Card Creation

Feishu CardKit has a hard constraint: **buttons cannot be added to streaming cards after creation**. But buttons CAN be included in the initial card creation.

**New Flow:**
```
User message: "What's our OKR status?"
  ↓
Generate button suggestions based on question (parallel)
  ↓
Create streaming card WITH buttons included
  ↓
Stream response text to markdown element
  ↓
Buttons remain visible throughout and after streaming
```

## Implementation Details

### 1. New Module: `lib/generate-buttons-parallel.ts`

Generates button suggestions asynchronously:

```typescript
export async function generateButtonSuggestions(
  context: string,
  maxButtons: number = 3
): Promise<ButtonSuggestion[]>
```

- Takes user question as context
- Returns array of `ButtonSuggestion` objects:
  ```typescript
  {
    id: "btn_followup_1",
    text: "Show Q4 trends",
    value: "Show Q4 trends",
    type: "primary" | "default"
  }
  ```
- Graceful fallback to empty array if generation fails

### 2. Updated: `lib/feishu-utils.ts`

Enhanced `StreamingCardConfig` interface:

```typescript
export interface StreamingCardConfig {
  title?: string;
  initialContent?: string;
  elementId?: string;
  buttons?: Array<{
    id?: string;
    text: string;
    value?: string;
    type?: "default" | "primary" | "danger";
  }>;
}
```

Modified `createStreamingCard()` to include buttons in card.body.elements:

```json
{
  "body": {
    "elements": [
      { "tag": "markdown", "content": "", "element_id": "md_..." },
      {
        "tag": "action",
        "actions": [
          {
            "tag": "button",
            "text": { "content": "Button 1", "tag": "plain_text" },
            "type": "primary",
            "value": "Button 1"
          },
          ...
        ]
      }
    ]
  }
}
```

### 3. Updated: `lib/handle-app-mention.ts`

Changed response generation flow:

**Before:**
```typescript
const card = await createAndSendStreamingCard(chatId, "chat_id", {});
await generateResponse(messages, updateCard, ...);
await finalizeCardWithFollowups(card.cardId, ...);
```

**After:**
```typescript
const buttons = await generateButtonSuggestions(cleanText, 3);
const card = await createAndSendStreamingCard(
  chatId,
  "chat_id",
  { buttons: buttons.length > 0 ? buttons : undefined },
  { replyToMessageId: messageId, replyInThread: true }
);
await generateResponse(messages, updateCard, ...);
await finalizeCardWithFollowups(...);  // Still runs, but buttons already exist
```

## User Experience

### Before (Text-based suggestions)
```
[Card Response]
Response text here...

You can ask me:
1. What's the trend?
2. Compare competitors?
3. What actions?

[User must type one of these]
```

### After (Button-based suggestions)
```
[Card Response]
Response text here...

[Show Q4 trends] [Compare competitors] [What actions?]

[User clicks one button]
```

**Benefits:**
- ✅ One-click interaction (no typing)
- ✅ Buttons visible from start (not after response completes)
- ✅ Visual hierarchy (primary button highlighted)
- ✅ More polished UX

## Button Click Handling

Existing infrastructure handles button clicks:

1. **User clicks button** → Feishu sends `card.action.trigger` webhook
2. **`handle-card-action.ts`** receives callback
3. **Button value** (the suggestion text) is extracted
4. **`handle-button-followup.ts`** treats click as new user message
5. **Cycle repeats** with new response + new buttons

See `lib/handle-card-action.ts` lines 75-94 for click handler.

## Configuration & Tuning

### Button Count
- Default: 3 buttons (can adjust in `handle-app-mention.ts`)
- Based on Feishu card width limitations

### Button Generation Timeout
- If `generateButtonSuggestions()` times out, card still created without buttons
- Graceful degradation ensures streaming always works

### Button Types
- `primary`: First button (most likely suggestion)
- `default`: Secondary/tertiary buttons
- `danger`: Not used (reserved for destructive actions)

## API Constraints Worked Around

| Constraint | Solution |
|-----------|----------|
| Cannot add buttons to streaming cards after creation | Pre-generate buttons before card creation |
| Cannot modify buttons while streaming_mode=true | Buttons are immutable during streaming (by design) |
| Cannot generate buttons from response content | Generate from question context instead |

## Testing Checklist

- [ ] Buttons appear on card creation
- [ ] Button text matches generated suggestions
- [ ] First button is "primary" style (darker/highlighted)
- [ ] Clicking button sends suggestion as new message
- [ ] Response generates with streaming while buttons visible
- [ ] Buttons remain clickable after streaming completes
- [ ] Card finalizes without errors
- [ ] Multiple cards can have buttons simultaneously
- [ ] Graceful degradation if button generation fails

## Metrics & Monitoring

Track in devtools:
- `button_generation_time` (ms)
- `button_count_per_card`
- `button_click_rate` (clicks / messages)
- `suggestion_usage_rate` (followups from buttons vs new questions)

## Future Improvements

1. **Dynamic Button Updates**: Once Feishu API allows, update buttons based on response content
2. **Button Analytics**: Track which buttons are clicked most (optimization signal)
3. **Smart Button Ordering**: ML model to predict best suggestions based on response
4. **Button Caching**: Cache generated buttons for similar questions
5. **Multi-language Buttons**: Localize button text based on user locale

## Related Issues

- **bd-ujn**: Real suggestion button UIs (THIS ISSUE)
- **bd-o07**: Buttons not rendering (RESOLVED by this implementation)
- **bd-zba**: Text repeating in cards (separate issue)
- **feishu_assistant-6i7**: Original button investigation (closed)

## References

- Feishu Card Button API: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/interactive-components/button
- Feishu Streaming Cards: https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview
- Card Callbacks: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication

## Rollout Plan

1. **Phase 1** (now): Enable button generation for all responses
2. **Phase 2** (pending): Monitor button click rates and suggestion accuracy
3. **Phase 3** (pending): Add button analytics and metrics
4. **Phase 4** (future): Implement dynamic button updates (API dependent)
