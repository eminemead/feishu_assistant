# DPA Mom Agent Output Formatting Proposal

**Date**: 2026-01-12  
**Issue**: Agent responses render messy/unprofessional on Feishu cards

---

## Problem Analysis

### Current State

The system prompt has minimal formatting guidance:
```
RESPONSE FORMAT:
- Use Markdown (Lark format) for Feishu cards
- Do not tag users (不要@用户)
- Current date: ${date}
- Be concise but comprehensive
```

### Observed Issues

1. **Wall of Text** - No length constraints, agent can ramble
2. **Inconsistent Structure** - Mix of `#`, `##`, `###` headings without hierarchy
3. **Code Block Rendering** - Vega-Lite/Mermaid JSON blobs render as raw text
4. **Bullet Point Chaos** - Mix of `-`, `*`, `1.` without consistency
5. **Emoji Overuse** - Can appear unprofessional (e.g., `📊🎯🚀💡🔥`)
6. **No Visual Breaks** - Long responses without `---` dividers
7. **Markdown Not Feishu-Optimized** - Standard markdown ≠ Lark markdown

### Feishu Card Markdown Limitations

From Feishu docs, the markdown component supports:
- ✅ `**bold**`, `*italic*`, `~~strikethrough~~`
- ✅ `[link](url)`
- ✅ Images `![alt](img_key)`
- ✅ User mentions `<at id=xxx></at>`
- ✅ Standard emoji 😁
- ✅ Line breaks (`\n`)
- ⚠️ Code blocks (render as monospace, but no syntax highlighting)
- ⚠️ Headers `#` (render but look different than web markdown)
- ❌ Tables (NOT supported in markdown component)
- ❌ Nested lists (poor rendering)

---

## Proposed Solutions

### 1. Enhanced System Prompt (Recommended)

Add these formatting rules to `getSystemPrompt()`:

```typescript
OUTPUT FORMATTING RULES (CRITICAL FOR FEISHU CARDS):

**Structure**:
- Start with a 1-2 sentence summary (TL;DR)
- Use **bold** for section titles (NOT ## headers - too large on Feishu cards)
- Keep total response under 800 characters for simple queries
- For analysis, max 1500 characters with clear sections
- Add --- divider after EVERY section's bullet list

**Text Formatting**:
- Use **bold** for key numbers, terms, and section titles (sparingly)
- Use bullet points (-) for lists, max 5 items per list
- After each title's bullet list, add a --- divider on a new line
- NO nested bullets (Feishu renders poorly)

**Avoid**:
- ❌ Code blocks with JSON (use plain text summaries instead)
- ❌ Tables (not supported in Feishu cards)
- ❌ More than 2-3 emoji per response
- ❌ @mentions (causes notification spam)
- ❌ Long URLs (use [短链接](url) format)
- ❌ ## headers (too large, use **bold** instead)

**Structure Templates**:

For DATA QUERIES (OKR metrics, etc.):
---
**📊 [Topic] - [Period]**

**Key Finding**: [1 sentence summary]

- **[Metric 1]**: [value] ([trend/context])
- **[Metric 2]**: [value]
- **[Metric 3]**: [value]

---

**💡 Insight**: [Brief actionable recommendation]

---

For TASK CONFIRMATIONS (GitLab issues, etc.):
---
**✅ [Action] Complete**

- **Title**: [title]
- **Link**: [链接](url)

---

[1-2 sentence summary of what was done]

---

For ERRORS/HELP:
---
**⚠️ [Issue Type]**

[1-2 sentence explanation]

**解决方法 / Next Steps**:
- [Option 1]
- [Option 2]

---
```

### 2. Output Post-Processor

Create `lib/utils/feishu-markdown-sanitizer.ts`:

```typescript
/**
 * Sanitize agent output for optimal Feishu card rendering
 */
export function sanitizeForFeishuCard(content: string): string {
  let result = content;

  // 1. Remove ### and deeper headers (replace with bold)
  result = result.replace(/^#{3,}\s*(.+)$/gm, '**$1**');
  
  // 2. Collapse multiple empty lines
  result = result.replace(/\n{3,}/g, '\n\n');
  
  // 3. Remove code blocks with JSON (keep simple code blocks)
  result = result.replace(/```(?:json|vega-lite|vega)\n[\s\S]*?```/g, 
    '[图表已生成 / Chart generated]');
  
  // 4. Truncate overly long responses
  if (result.length > 2000) {
    result = result.slice(0, 1900) + '\n\n*...(内容已截断 / truncated)*';
  }
  
  // 5. Fix nested bullets (flatten to single level)
  result = result.replace(/^(\s+)[-*]\s/gm, '- ');
  
  // 6. Limit emoji (keep only first 3)
  const emojis = result.match(/[\u{1F300}-\u{1F9FF}]/gu) || [];
  if (emojis.length > 4) {
    const keep = new Set(emojis.slice(0, 3));
    let emojiCount = 0;
    result = result.replace(/[\u{1F300}-\u{1F9FF}]/gu, (emoji) => {
      if (keep.has(emoji) && emojiCount < 3) {
        emojiCount++;
        return emoji;
      }
      return '';
    });
  }

  return result.trim();
}
```

### 3. Apply Post-Processor in Streaming

In `lib/agents/dpa-mom-agent.ts`, wrap the final output:

```typescript
import { sanitizeForFeishuCard } from '../utils/feishu-markdown-sanitizer';

// Before final update
const finalText = sanitizeForFeishuCard(displayText || rawText);
```

---

## Implementation Priority

| Task | Impact | Effort | Priority |
|------|--------|--------|----------|
| Update system prompt with formatting rules | High | Low | **P0** |
| Create sanitizeForFeishuCard() utility | Medium | Low | **P1** |
| Add char limit warning in streaming | Medium | Low | **P1** |
| Test with Chinese + English responses | Medium | Medium | **P2** |

---

## Example: Before vs After

### Before (messy)
```
# OKR Analysis Report
## Summary
Here are the OKR metrics for November:

### Company Performance
```json
{"$schema":"https://vega-lite.github.io/schema/vega-lite/v5.json"...}
```

#### Key Insights
The data shows that:
- 📊 NIO has 85.2% metric coverage which is good
  - This is up from last month
    - We should continue this trend
- 📈 Letao has 72.1% which needs improvement
- 🎯 Overall average is 78.6%
- 💡 Recommendation: focus on improving Letao's metrics
- 🚀 Keep up the momentum!
- 📊 The team is doing great work
- 🔥 Let's push for 90% next month!
```

### After (clean)
```
**📊 OKR Metrics - 11月**

**关键发现**: 整体指标覆盖率 78.6%，蔚来领先。

- **蔚来/NIO**: 85.2% (↑ vs 上月)
- **乐道/Letao**: 72.1% (需关注)
- **整体/Overall**: 78.6%

---

**💡 建议**: 重点提升乐道的指标覆盖率，目标 80%+

---
```

---

## Testing Checklist

- [ ] Test with OKR analysis queries (Chinese)
- [ ] Test with GitLab issue creation flow
- [ ] Test with error messages
- [ ] Test with multi-turn conversation
- [ ] Verify on Feishu mobile + desktop
- [ ] Check streaming rendering mid-response

---

## Notes

- Feishu cards have streaming mode that shows text character-by-character
- Long content causes scroll in card (poor UX)
- Mobile Feishu has narrower viewport - test responsive behavior
