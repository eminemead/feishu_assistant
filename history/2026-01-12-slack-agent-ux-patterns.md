# Slack AI Agent UX Patterns - Inspiration for Feishu

**Source**: Slack Developer Documentation (docs.slack.dev)

---

## Key Patterns from Slack AI Assistants

### 1. Status Updates with Personality

Slack recommends **fun loading messages** while the AI is thinking:

```javascript
await setStatus({
  status: 'thinking...', 
  loading_messages: [
    'Teaching the hamsters to type faster…',
    'Untangling the internet cables…',
    'Consulting the office goldfish…',
    'Polishing up the response just for you…',
    'Convincing the AI to stop overthinking…',
  ],
});
```

**Feishu Adaptation**: Our "🤔 Thinking..." is boring. Could rotate through:
- 🧠 思考中...
- 📊 正在分析数据...
- 🔍 搜索相关信息...
- ✨ 整理回复内容...

### 2. Suggested Prompts (Quick Actions)

Slack provides **pre-defined prompts** when a thread starts:

```javascript
const prompts = [
  { title: "Code Example", message: "Show me an example of..." },
  { title: "Code Review", message: "What are best practices for..." },
  { title: "Debug Help", message: "How do I debug..." },
];
await setSuggestedPrompts({ prompts, title: "Here are some questions you can ask:" });
```

**Feishu Adaptation**: Our follow-up buttons could be smarter:
- Context-aware suggestions based on what was just discussed
- "显示更多详情", "导出报表", "创建任务"

### 3. Markdown → Platform Format Conversion

Slack explicitly **converts markdown to Slack-compatible format**:

```javascript
await say(convertMarkdownToSlack(modelResponse.choices[0].message.content));
```

**Key insight**: Don't assume LLM output renders well. Always post-process.

### 4. Clear Error Messages

Slack uses friendly, clear error patterns:

```javascript
// Good
await say("I'm sorry, I ran into an error processing your request. Please try again.");
await say(":warning: Sorry, something went wrong during processing your request");

// Not: "Error: ECONNRESET at tcp_socket..."
```

### 5. Block Kit Layouts for Structured Data

Slack strongly prefers **structured blocks** over raw text:

```json
[
  {
    "type": "header",
    "text": { "type": "plain_text", "text": "New request" }
  },
  {
    "type": "section",
    "fields": [
      { "type": "mrkdwn", "text": "*Type:*\nPaid Time Off" },
      { "type": "mrkdwn", "text": "*Created by:*\n<example.com|Fred>" }
    ]
  },
  {
    "type": "section",
    "text": { "type": "mrkdwn", "text": "<https://example.com|View request>" }
  }
]
```

**Feishu Equivalent**: Use card components with explicit sections, not just raw markdown.

### 6. System Prompt Structure

Slack's recommended system prompt pattern:

```javascript
const DEFAULT_SYSTEM_CONTENT = `You're an assistant in a Slack workspace.
Users will ask you to help them write something or think about a topic.
You'll respond in a professional way.
When you include markdown, convert to Slack-compatible format.
When a prompt has special syntax like <@USER_ID>, keep them as-is.`;
```

**Key principles**:
- State the context (workspace assistant)
- Define scope (write, think, help)
- Set tone (professional)
- Platform-specific rules (formatting, mentions)

---

## Patterns to Adopt for Feishu DPA Mom

### A. Response Structure (Slack-inspired)

```
┌─────────────────────────────────────┐
│ ## 📊 标题 / Title                   │  ← Clear header with emoji
├─────────────────────────────────────┤
│ **关键发现**: 一句话摘要              │  ← TL;DR upfront
├─────────────────────────────────────┤
│ • **指标1**: 数值 (趋势)             │  ← Structured key-value
│ • **指标2**: 数值                    │
├─────────────────────────────────────┤
│ ---                                 │  ← Visual separator
│ **💡 建议**: 可执行的下一步           │  ← Actionable insight
└─────────────────────────────────────┘
```

### B. Loading States (Rotate)

Instead of static "🤔 Thinking...", rotate through:
1. `🧠 分析请求中...`
2. `📊 查询数据...`
3. `✨ 生成回复...`

### C. Error Templates

```
## ⚠️ 出错了

抱歉，处理请求时遇到问题。

**可能原因**:
- 网络连接不稳定
- 服务暂时不可用

**建议**:
- 稍后重试
- 简化您的问题
```

### D. Greeting / Thread Start

When user first messages, provide orientation:
```
👋 你好！我是 DPA Mom，团队的 AI 助手。

我可以帮你：
• 📊 查看 OKR 指标
• 📝 创建 GitLab 任务
• 🔍 搜索聊天记录

试试问我："本月 OKR 覆盖率如何？"
```

---

## Implementation Priority

| Pattern | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Response structure templates | High | Done ✅ | - |
| Rotating loading messages | Medium | Low | P1 |
| Better error templates | Medium | Low | P1 |
| First-message greeting | Low | Low | P2 |
| Suggested follow-up prompts | Medium | Medium | P2 |

---

## References

- [Slack AI Apps Concepts](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps)
- [Slack Code Assistant Tutorial](https://docs.slack.dev/tools/bolt-js/tutorials/code-assistant)
- [Block Kit Reference](https://docs.slack.dev/reference/block-kit/blocks)
- [Rich Text Block](https://docs.slack.dev/reference/block-kit/blocks/rich-text-block)
