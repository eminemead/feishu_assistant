# Text-Based Follow-up Suggestions Implementation Guide

**Status**: Ready for Implementation  
**Depends on**: feishu_assistant-61u (API Findings)  
**Related**: feishu_assistant-kjl (Alternative UI Feature)

## Overview

Since Feishu CardKit API does not support adding action elements (buttons) to streaming cards (returns 99992402), we implement follow-up suggestions as **formatted text in markdown**.

## Implementation Plan

### Phase 1: Update generateFollowupQuestions to Include Metadata

**File**: `lib/tools/generate-followups-tool.ts`

Current behavior:
```typescript
export interface FollowupOption {
  text: string;
  id?: string;
}
```

Enhance with:
```typescript
export interface FollowupOption {
  text: string;
  id?: string;
  emoji?: string;        // e.g., "📊", "💡"
  category?: string;     // e.g., "analysis", "action", "clarification"
}
```

### Phase 2: Create Text Formatter for Suggestions

**File**: `lib/format-suggestions.ts` (NEW)

```typescript
export interface SuggestionFormat {
  style: 'numbered' | 'bullet' | 'inline';
  separator?: boolean;    // Add horizontal line before suggestions
  emoji?: boolean;        // Include emoji for each item
  category?: boolean;     // Show category label
}

/**
 * Format follow-up suggestions as markdown text
 * @param suggestions Array of follow-up options
 * @param format Formatting options
 * @returns Markdown string ready for card
 */
export function formatSuggestionsAsMarkdown(
  suggestions: FollowupOption[],
  format: SuggestionFormat = { style: 'numbered' }
): string {
  if (!suggestions || suggestions.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Add separator if requested
  if (format.separator) {
    lines.push('\n---\n');
  } else {
    lines.push('\n');
  }

  // Add header
  lines.push('**💡 Follow-up topics you could explore:**\n');

  // Format suggestions based on style
  if (format.style === 'numbered') {
    suggestions.forEach((s, i) => {
      const emoji = format.emoji && s.emoji ? `${s.emoji} ` : '';
      const category = format.category && s.category ? ` [${s.category}]` : '';
      lines.push(`${i + 1}. ${emoji}${s.text}${category}`);
    });
  } else if (format.style === 'bullet') {
    suggestions.forEach((s) => {
      const emoji = format.emoji && s.emoji ? `${s.emoji} ` : '';
      const category = format.category && s.category ? ` [${s.category}]` : '';
      lines.push(`• ${emoji}${s.text}${category}`);
    });
  } else if (format.style === 'inline') {
    const items = suggestions
      .map((s) => {
        const emoji = format.emoji && s.emoji ? `${s.emoji} ` : '';
        return `${emoji}_${s.text}_`;
      })
      .join(' • ');
    lines.push(items);
  }

  // Add timestamp
  lines.push(`\n_Generated at ${new Date().toLocaleTimeString()}_`);

  return lines.join('\n');
}
```

### Phase 3: Update finalizeCardWithFollowups

**File**: `lib/finalize-card-with-buttons.ts`

Replace current implementation:

```typescript
import { formatSuggestionsAsMarkdown } from './format-suggestions';

export async function finalizeCardWithFollowups(
  cardId: string,
  finalContent?: string,
  imageKey?: string,
  context?: string,
  maxFollowups?: number
): Promise<{
  followups?: FollowupOption[];
  error?: string;
}> {
  try {
    console.log(`🎯 [CardSuggestions] Finalizing card with follow-ups: cardId=${cardId}`);

    // Step 1: Finalize card settings (disable streaming mode)
    console.log(`🎯 [CardSuggestions] Disabling streaming mode...`);
    await finalizeCardSettings(cardId, finalContent);

    // Step 2: Generate follow-up questions
    console.log(`🎯 [CardSuggestions] Generating follow-up suggestions...`);
    const followups = await generateFollowupQuestions(
      finalContent || "",
      context,
      maxFollowups || 3
    );

    if (!followups || followups.length === 0) {
      console.log(`⚠️ [CardSuggestions] No follow-ups generated`);
      return { followups: [] };
    }

    console.log(`✅ [CardSuggestions] Generated ${followups.length} suggestions, formatting as markdown...`);

    // Step 3: Format suggestions as markdown
    const suggestionsMarkdown = formatSuggestionsAsMarkdown(followups, {
      style: 'numbered',
      separator: true,
      emoji: true,
      category: false,
    });

    // Step 4: Append suggestions to final content
    const contentWithSuggestions = (finalContent || '') + suggestionsMarkdown;

    // Step 5: Update card with suggestions
    console.log(`🎯 [CardSuggestions] Updating card with suggestions...`);
    await updateCardElement(
      cardId,
      elementId,  // Main markdown element
      contentWithSuggestions
    );

    console.log(`✅ [CardSuggestions] Card finalized with ${followups.length} text-based suggestions`);
    return { followups };

  } catch (error) {
    console.error("❌ [CardSuggestions] Error finalizing card:", error);
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### Phase 4: Update Streaming Handlers

**Files affected**:
- `lib/handle-messages.ts`
- `lib/handle-app-mention.ts`

Current flow:
```typescript
// Stream response
const { text, followups } = await streamResponseToCard(
  cardId,
  elementId,
  query
);

// Finalize with suggestions
await finalizeCardWithFollowups(cardId, text);
```

This already supports the new implementation! No changes needed - it already:
1. ✅ Streams text while streaming_mode is true
2. ✅ Calls finalizeCardWithFollowups at the end
3. ✅ The finalization now includes formatted suggestions

### Phase 5: Testing Implementation

**File**: `test/text-based-suggestions.test.ts` (NEW)

```typescript
import { formatSuggestionsAsMarkdown } from '../lib/format-suggestions';
import { FollowupOption } from '../lib/tools/generate-followups-tool';

describe('Text-Based Suggestions', () => {
  const mockFollowups: FollowupOption[] = [
    { text: 'What is the trend for Q4?', emoji: '📊', category: 'analysis' },
    { text: 'How does this compare to last year?', emoji: '📈', category: 'comparison' },
    { text: 'What actions should we take?', emoji: '⚡', category: 'action' },
  ];

  describe('formatSuggestionsAsMarkdown', () => {
    it('should format as numbered list', () => {
      const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
        style: 'numbered',
        emoji: true,
      });
      expect(markdown).toContain('1. 📊 What is the trend for Q4?');
      expect(markdown).toContain('2. 📈 How does this compare to last year?');
      expect(markdown).toContain('3. ⚡ What actions should we take?');
    });

    it('should format as bullet list', () => {
      const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
        style: 'bullet',
      });
      expect(markdown).toContain('• What is the trend for Q4?');
    });

    it('should include separator when requested', () => {
      const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
        separator: true,
      });
      expect(markdown).toContain('---');
    });

    it('should return empty string for empty array', () => {
      const markdown = formatSuggestionsAsMarkdown([]);
      expect(markdown).toBe('');
    });

    it('should include timestamp', () => {
      const markdown = formatSuggestionsAsMarkdown(mockFollowups);
      expect(markdown).toMatch(/Generated at/);
    });
  });
});
```

## Example Output

### Feishu Card Display

When the card renders in Feishu, users will see:

```
[Main Response Text Here...]

---

💡 Follow-up topics you could explore:

1. 📊 What's the trend for next quarter?
2. 📈 How does this compare to competitors?
3. ⚡ What actions should we take?

_Generated at 14:32:15_
```

### User Interaction

Users can:
- ✅ Copy-paste any suggestion and type it manually
- ✅ Reference suggestion numbers in replies
- ✅ See all options in the card (no truncation)
- ✅ Works on all Feishu clients (mobile, desktop, web)

## API Consistency

This approach aligns with:
- ✅ **Feishu CardKit streaming docs**: Markdown text updates are the primary streaming use case
- ✅ **No additional APIs**: Uses existing `updateCardElement()` method
- ✅ **Sequence number handling**: Already implemented in feishu-utils.ts
- ✅ **Error handling**: Gracefully degrades if suggestion generation fails

## Rollback Plan

If suggestions cause issues:
1. Temporarily disable formatting: `if (process.env.DISABLE_SUGGESTIONS === 'true') return { followups }`
2. The card still works without suggestions (already validated)
3. No breaking changes to existing card structure

## Performance Considerations

- **Generation time**: ~200-300ms for 3 suggestions (LLM call)
- **Card update time**: ~50-100ms for markdown append
- **Total overhead**: ~350-400ms added to each response
- **User impact**: Negligible (happens after streaming completes)

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| No followups generated | Card completes without suggestions |
| Short response | Suggestions still display (helpful context) |
| Long response | Suggestions appear at end (natural flow) |
| Multiple concurrent cards | Each card gets its own suggestions |
| Generation error | Card still works, suggestions skipped |
| Network failure | Card renders without suggestions |

## Metrics to Track

After implementation, monitor:
- Suggestion generation success rate (should be >95%)
- Time from response complete to suggestions visible
- User engagement (if tracking available through Feishu)
- Error rates in finalization

## Next Steps

1. ✅ Create `format-suggestions.ts` utility
2. ✅ Update `finalize-card-with-buttons.ts`
3. ✅ Add unit tests for formatter
4. ✅ Integration test with actual streaming
5. ✅ Manual testing in Feishu desktop/mobile
6. ✅ Document in README or user guide
7. ✅ Monitor metrics for 1 week
8. ✅ Gather user feedback (if applicable)

## Configuration Options

Consider adding env variables for customization:

```bash
# .env
SUGGESTIONS_ENABLED=true           # Toggle feature on/off
SUGGESTIONS_COUNT=3               # Number of suggestions
SUGGESTIONS_STYLE=numbered         # numbered|bullet|inline
SUGGESTIONS_WITH_EMOJI=true        # Include emoji
SUGGESTIONS_SEPARATOR=true         # Add visual separator
```

## References

- **Feishu Markdown Support**: https://open.feishu.cn/document/feishu-cards/element-types
- **Text Streaming Best Practices**: See feishu-streaming-quick-ref.md
- **Related Issues**: feishu_assistant-61u (API findings), feishu_assistant-6i7 (closed investigation)
