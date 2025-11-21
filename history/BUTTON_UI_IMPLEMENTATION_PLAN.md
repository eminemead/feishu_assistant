# Real Button UIs Implementation Plan (bd-ujn)

## Problem
Currently suggestions are rendered as **text** (markdown numbered list) because Feishu CardKit API doesn't support adding action elements after card creation (error 99992402).

Users must read suggestions and type responses instead of clicking buttons.

## Solution
Pre-generate button suggestions **before** streaming starts, include them in the initial card.

## Architecture Changes

### 1. New Flow
```
User message
  ↓
generateResponse() starts
  ↓
[PARALLEL] Start streaming + Pre-generate buttons
  ↓
createCardWithButtonsAndStreaming()
  - Initial card includes:
    * Markdown element (empty or placeholder)
    * Button elements (pre-generated suggestions)
  - Streaming fills markdown element
  ↓
Stream response text to markdown element
  ↓
Finalize card (disable streaming)
```

### 2. Key Changes

#### feishu-utils.ts
- Add `createCardWithButtonsAndStreaming()` function
- Card creation will include `action_elements` in the body
- Button format: use `button` tag with `click` action handler

#### Card Structure (Example)
```json
{
  "config": { "streaming_mode": true, ... },
  "body": {
    "elements": [
      { "tag": "markdown", "content": "", "element_id": "content" },
      { "tag": "button", "text": { "content": "Button 1" }, "id": "btn_1", ... },
      { "tag": "button", "text": { "content": "Button 2" }, "id": "btn_2", ... }
    ]
  }
}
```

#### handle-app-mention.ts
- After generating LLM response, generate buttons in parallel
- Pass buttons to card creation instead of text formatting

#### Button Callback Handling
- Buttons send `click` events (already handled in `handle-card-action.ts`)
- Need to map button IDs back to suggestion content

### 3. Implementation Steps

1. **Create button generation service**
   - Pre-generate suggestions before streaming
   - Return structured button objects (id, text, data)
   
2. **Modify card creation** 
   - Add `action_elements` support to `createStreamingCard()`
   - Or create new `createCardWithButtons()` variant
   
3. **Update response handler**
   - Generate buttons + stream content in parallel
   - Pass both to card creation
   
4. **Test button interactions**
   - Verify clicks trigger `handle-card-action`
   - Verify button data passes through correctly

## Files to Modify
- `lib/feishu-utils.ts` - Card creation with buttons
- `lib/tools/generate-followups-tool.ts` - Already generates suggestions
- `lib/handle-app-mention.ts` - Response generation flow
- `lib/finalize-card-with-buttons.ts` - Remove text-based suggestions (keep buttons)

## Expected Outcome
Users see real clickable buttons under assistant response, can click to trigger follow-up questions without typing.

## Blocking Issues
- None (buttons rendering issue bd-o07 is about different problem)
- Can work independently from other bugs
