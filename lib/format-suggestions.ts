/**
 * Utility to format follow-up suggestions as markdown text
 * Used as alternative to buttons (API constraint: 99992402)
 */

export interface FollowupOption {
  text: string;
  id?: string;
  emoji?: string;
  category?: string;
}

export interface SuggestionFormat {
  style?: 'numbered' | 'bullet' | 'inline';
  separator?: boolean;
  emoji?: boolean;
  category?: boolean;
  header?: string;
}

const DEFAULT_FORMAT: SuggestionFormat = {
  style: 'numbered',
  separator: true,
  emoji: true,
  category: false,
  header: '💡 Follow-up topics you could explore:',
};

/**
 * Format follow-up suggestions as markdown text for Feishu cards
 * 
 * @param suggestions Array of follow-up options
 * @param format Formatting options (uses sensible defaults)
 * @returns Markdown string ready for card content
 * 
 * @example
 * ```typescript
 * const suggestions = [
 *   { text: 'Show Q4 trends', emoji: '📊' },
 *   { text: 'Compare with competitors', emoji: '📈' }
 * ];
 * 
 * const markdown = formatSuggestionsAsMarkdown(suggestions);
 * // Output:
 * // "\n---\n\n💡 Follow-up topics you could explore:\n
 * // 1. 📊 Show Q4 trends\n
 * // 2. 📈 Compare with competitors\n
 * // _Generated at 14:32:15_"
 * ```
 */
export function formatSuggestionsAsMarkdown(
  suggestions: FollowupOption[] | undefined,
  format: SuggestionFormat = {}
): string {
  // Merge with defaults
  const config = { ...DEFAULT_FORMAT, ...format };

  // Handle empty array
  if (!suggestions || suggestions.length === 0) {
    return '';
  }

  const lines: string[] = [];

  // Add separator if requested
  if (config.separator) {
    lines.push('\n---\n');
  } else {
    lines.push('\n');
  }

  // Add header if provided
  if (config.header) {
    lines.push(`**${config.header}**\n`);
  }

  // Format suggestions based on style
  switch (config.style) {
    case 'numbered':
      suggestions.forEach((s, i) => {
        const emoji = config.emoji && s.emoji ? `${s.emoji} ` : '';
        const category = config.category && s.category ? ` [${s.category}]` : '';
        lines.push(`${i + 1}. ${emoji}${s.text}${category}`);
      });
      break;

    case 'bullet':
      suggestions.forEach((s) => {
        const emoji = config.emoji && s.emoji ? `${s.emoji} ` : '';
        const category = config.category && s.category ? ` [${s.category}]` : '';
        lines.push(`• ${emoji}${s.text}${category}`);
      });
      break;

    case 'inline':
      const items = suggestions
        .map((s) => {
          const emoji = config.emoji && s.emoji ? `${s.emoji} ` : '';
          return `${emoji}_${s.text}_`;
        })
        .join(' • ');
      lines.push(items);
      break;
  }

  // Add timestamp
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  lines.push(`\n_Generated at ${timestamp}_`);

  return lines.join('\n');
}

/**
 * Create a simple text-based suggestion menu
 * Useful for quick, minimal formatting
 * 
 * @example
 * ```typescript
 * createSimpleSuggestionMenu([
 *   'Show quarterly trends',
 *   'Compare with budget'
 * ]);
 * // Output: "1. Show quarterly trends\n2. Compare with budget"
 * ```
 */
export function createSimpleSuggestionMenu(suggestions: string[]): string {
  if (!suggestions || suggestions.length === 0) {
    return '';
  }

  return suggestions
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n');
}

/**
 * Create a comment-style suggestion block
 * Emphasizes suggestions as separate from main response
 * 
 * @example
 * ```typescript
 * createCommentSuggestionBlock([
 *   { text: 'What about Q4?' },
 *   { text: 'Show previous year' }
 * ]);
 * ```
 */
export function createCommentSuggestionBlock(
  suggestions: FollowupOption[]
): string {
  if (!suggestions || suggestions.length === 0) {
    return '';
  }

  const block = [
    '---',
    '> **💭 You might also be interested in:**',
  ];

  suggestions.forEach((s) => {
    block.push(`> • ${s.emoji ? s.emoji + ' ' : ''}${s.text}`);
  });

  return block.join('\n');
}

/**
 * Validate suggestion array for formatting
 */
export function validateSuggestions(
  suggestions: FollowupOption[] | undefined
): { valid: boolean; error?: string } {
  if (!suggestions) {
    return { valid: true }; // Empty is valid
  }

  if (!Array.isArray(suggestions)) {
    return { valid: false, error: 'Suggestions must be an array' };
  }

  if (suggestions.length === 0) {
    return { valid: true };
  }

  if (suggestions.length > 10) {
    return {
      valid: false,
      error: 'Maximum 10 suggestions allowed (got ' + suggestions.length + ')',
    };
  }

  // Check each suggestion
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];

    if (!s.text) {
      return {
        valid: false,
        error: `Suggestion ${i + 1}: missing required 'text' field`,
      };
    }

    if (typeof s.text !== 'string') {
      return {
        valid: false,
        error: `Suggestion ${i + 1}: 'text' must be a string`,
      };
    }

    if (s.text.length > 200) {
      return {
        valid: false,
        error: `Suggestion ${i + 1}: text exceeds 200 characters (got ${s.text.length})`,
      };
    }

    if (s.emoji && s.emoji.length > 2) {
      return {
        valid: false,
        error: `Suggestion ${i + 1}: emoji should be a single character`,
      };
    }
  }

  return { valid: true };
}

/**
 * Safe wrapper: validates before formatting
 */
export function safeFormatSuggestions(
  suggestions: FollowupOption[] | undefined,
  format?: SuggestionFormat
): { markdown: string; error?: string } {
  const validation = validateSuggestions(suggestions);

  if (!validation.valid) {
    return {
      markdown: '',
      error: validation.error,
    };
  }

  try {
    const markdown = formatSuggestionsAsMarkdown(suggestions, format);
    return { markdown };
  } catch (error) {
    return {
      markdown: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
