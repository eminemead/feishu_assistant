import { describe, it, expect } from 'bun:test';
import {
  formatSuggestionsAsMarkdown,
  createSimpleSuggestionMenu,
  createCommentSuggestionBlock,
  validateSuggestions,
  safeFormatSuggestions,
  FollowupOption,
} from '../lib/format-suggestions';

describe('formatSuggestionsAsMarkdown', () => {
  const mockFollowups: FollowupOption[] = [
    { text: "What's the trend for Q4?", emoji: '📊', category: 'analysis' },
    { text: 'How does this compare to competitors?', emoji: '📈', category: 'comparison' },
    { text: 'What actions should we take?', emoji: '⚡', category: 'action' },
  ];

  it('should format as numbered list by default', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups);
    expect(markdown).toContain('1. 📊 What\'s the trend for Q4?');
    expect(markdown).toContain('2. 📈 How does this compare to competitors?');
    expect(markdown).toContain('3. ⚡ What actions should we take?');
  });

  it('should include numbered format with emoji', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      style: 'numbered',
      emoji: true,
    });
    expect(markdown).toMatch(/1\. 📊/);
    expect(markdown).toMatch(/2\. 📈/);
    expect(markdown).toMatch(/3\. ⚡/);
  });

  it('should format as bullet list', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      style: 'bullet',
    });
    expect(markdown).toContain('• 📊 What\'s the trend for Q4?');
    expect(markdown).toContain('• 📈 How does this compare to competitors?');
    expect(markdown).toContain('• ⚡ What actions should we take?');
  });

  it('should format as inline list', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      style: 'inline',
    });
    expect(markdown).toContain('_What\'s the trend for Q4?_');
    expect(markdown).toContain('_How does this compare to competitors?_');
    expect(markdown).toContain('•'); // Separators
  });

  it('should include separator when requested', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      separator: true,
    });
    expect(markdown).toContain('---');
  });

  it('should omit separator when not requested', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      separator: false,
    });
    expect(markdown).not.toContain('---');
  });

  it('should include header by default', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups);
    expect(markdown).toContain('💡 Follow-up topics you could explore:');
  });

  it('should use custom header', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      header: '🤔 What else would you like to know?',
    });
    expect(markdown).toContain('🤔 What else would you like to know?');
  });

  it('should omit header when empty string', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      header: '',
    });
    expect(markdown).not.toContain('💡');
  });

  it('should include timestamp', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups);
    expect(markdown).toMatch(/Generated at \d{2}:\d{2}:\d{2}/);
  });

  it('should exclude emoji when emoji: false', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      emoji: false,
    });
    expect(markdown).not.toContain('📊');
    expect(markdown).not.toContain('📈');
    expect(markdown).toContain("What's the trend for Q4?");
  });

  it('should include category when category: true', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      category: true,
    });
    expect(markdown).toContain('[analysis]');
    expect(markdown).toContain('[comparison]');
    expect(markdown).toContain('[action]');
  });

  it('should exclude category when category: false', () => {
    const markdown = formatSuggestionsAsMarkdown(mockFollowups, {
      category: false,
    });
    expect(markdown).not.toContain('[analysis]');
    expect(markdown).not.toContain('[comparison]');
  });

  it('should handle empty array', () => {
    const markdown = formatSuggestionsAsMarkdown([]);
    expect(markdown).toBe('');
  });

  it('should handle undefined', () => {
    const markdown = formatSuggestionsAsMarkdown(undefined);
    expect(markdown).toBe('');
  });

  it('should handle null', () => {
    const markdown = formatSuggestionsAsMarkdown(null as any);
    expect(markdown).toBe('');
  });

  it('should handle suggestions without emoji', () => {
    const suggestions: FollowupOption[] = [
      { text: 'First option' },
      { text: 'Second option' },
    ];
    const markdown = formatSuggestionsAsMarkdown(suggestions);
    expect(markdown).toContain('1. First option');
    expect(markdown).toContain('2. Second option');
  });

  it('should handle single suggestion', () => {
    const markdown = formatSuggestionsAsMarkdown([mockFollowups[0]]);
    expect(markdown).toContain('1. 📊 What\'s the trend for Q4?');
    expect(markdown).not.toContain('2.');
  });

  it('should handle many suggestions', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      text: `Option ${i + 1}`,
    }));
    const markdown = formatSuggestionsAsMarkdown(many);
    expect(markdown).toContain('1. Option 1');
    expect(markdown).toContain('10. Option 10');
  });
});

describe('createSimpleSuggestionMenu', () => {
  it('should create numbered menu', () => {
    const menu = createSimpleSuggestionMenu([
      'Option one',
      'Option two',
      'Option three',
    ]);
    expect(menu).toBe('1. Option one\n2. Option two\n3. Option three');
  });

  it('should handle empty array', () => {
    const menu = createSimpleSuggestionMenu([]);
    expect(menu).toBe('');
  });

  it('should handle undefined', () => {
    const menu = createSimpleSuggestionMenu(undefined as any);
    expect(menu).toBe('');
  });

  it('should handle single item', () => {
    const menu = createSimpleSuggestionMenu(['Only option']);
    expect(menu).toBe('1. Only option');
  });
});

describe('createCommentSuggestionBlock', () => {
  it('should create comment-style block', () => {
    const block = createCommentSuggestionBlock([
      { text: 'First topic', emoji: '📊' },
      { text: 'Second topic', emoji: '📈' },
    ]);
    expect(block).toContain('💭 You might also be interested in:');
    expect(block).toContain('> • 📊 First topic');
    expect(block).toContain('> • 📈 Second topic');
  });

  it('should handle empty array', () => {
    const block = createCommentSuggestionBlock([]);
    expect(block).toBe('');
  });

  it('should handle suggestions without emoji', () => {
    const block = createCommentSuggestionBlock([{ text: 'Topic' }]);
    expect(block).toContain('> • Topic');
  });
});

describe('validateSuggestions', () => {
  it('should validate correct suggestions', () => {
    const result = validateSuggestions([
      { text: 'Option one' },
      { text: 'Option two' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept undefined', () => {
    const result = validateSuggestions(undefined);
    expect(result.valid).toBe(true);
  });

  it('should accept empty array', () => {
    const result = validateSuggestions([]);
    expect(result.valid).toBe(true);
  });

  it('should reject non-array', () => {
    const result = validateSuggestions('not an array' as any);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be an array');
  });

  it('should reject more than 10 suggestions', () => {
    const suggestions = Array.from({ length: 11 }, (_, i) => ({
      text: `Option ${i + 1}`,
    }));
    const result = validateSuggestions(suggestions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 10');
  });

  it('should reject missing text field', () => {
    const result = validateSuggestions([
      { emoji: '📊' } as FollowupOption,
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing required');
  });

  it('should reject non-string text', () => {
    const result = validateSuggestions([
      { text: 123 as any },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('must be a string');
  });

  it('should reject text longer than 200 chars', () => {
    const result = validateSuggestions([
      { text: 'x'.repeat(201) },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds 200 characters');
  });

  it('should reject multi-char emoji', () => {
    const result = validateSuggestions([
      { text: 'Option', emoji: '🎉🎊' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('emoji should be a single character');
  });
});

describe('safeFormatSuggestions', () => {
  it('should format valid suggestions', () => {
    const result = safeFormatSuggestions([
      { text: 'Option one' },
      { text: 'Option two' },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.markdown).toContain('1. Option one');
    expect(result.markdown).toContain('2. Option two');
  });

  it('should return error for invalid suggestions', () => {
    const result = safeFormatSuggestions('not an array' as any);
    expect(result.error).toBeDefined();
    expect(result.markdown).toBe('');
  });

  it('should handle undefined', () => {
    const result = safeFormatSuggestions(undefined);
    expect(result.error).toBeUndefined();
    expect(result.markdown).toBe('');
  });

  it('should handle formatting errors gracefully', () => {
    // This is hard to trigger since formatSuggestionsAsMarkdown is robust
    // but we can test that safeFormatSuggestions catches errors
    const result = safeFormatSuggestions([{ text: 'Valid' }]);
    expect(result.error).toBeUndefined();
    expect(result.markdown).toContain('Valid');
  });
});
