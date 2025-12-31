---
name: "DPA Assistant"
description: "DPA team assistant with intent-based workflow routing for GitLab ops, chat search, doc reading, and general conversation"
version: "1.0.0"
type: "workflow"
workflowId: "dpa-assistant"
tags: ["dpa", "gitlab", "feishu", "chat", "docs", "assistant"]
keywords: ["dpa", "gitlab", "glab", "issue", "mr", "merge request", "聊天记录", "文档", "帮助"]
---

# DPA Assistant

Workflow-based DPA team assistant that routes queries to specialized execution paths.

## Capabilities

### 1. GitLab Operations
- **Create Issues**: "create issue", "new bug", "报个bug", "创建issue"
- **List Issues/MRs**: "show issues", "list MRs", "查看issue", "我的MR"

### 2. Feishu Integration
- **Chat Search**: Search chat history for messages
- **Doc Reading**: Read and summarize Feishu documents

### 3. General Assistance
- Answer questions about the team
- Provide help and guidance
- General conversation

## Workflow Architecture

```
Query → Intent Classification (fast model)
         ↓
    ┌────┴────┐
    │ Branch  │
    └────┬────┘
         ↓
  ┌──────┼──────┬──────┬──────┐
  ↓      ↓      ↓      ↓      ↓
gitlab  gitlab  chat   doc   general
create  list   search  read   chat
  ↓      ↓      ↓      ↓      ↓
  └──────┴──────┴──────┴──────┘
         ↓
    Format Response
```

## Intent Classification

| Intent | Triggers | Action |
|--------|----------|--------|
| `gitlab_create` | create issue, new bug, 报bug | Execute glab issue create |
| `gitlab_list` | show issues, list MRs, 查看 | Execute glab issue/mr list |
| `chat_search` | find messages, 查找聊天 | Search Feishu chat history |
| `doc_read` | read doc, Feishu URL | Read Feishu document |
| `general_chat` | everything else | Conversational agent |

## Models Used

- **Intent Classification**: Fast model (gpt-4o-mini equivalent)
- **General Chat**: Smart model (gpt-4o/claude equivalent)
- **Tool Execution**: No model needed

## Example Queries

```
"帮我创建一个issue，标题是数据管道失败"
→ gitlab_create → glab issue create

"show me my open MRs"
→ gitlab_list → glab mr list --assignee=@me

"查找昨天关于部署的聊天记录"
→ chat_search → Search chat history

"帮我看看这个文档 https://feishu.cn/docs/xxx"
→ doc_read → Read document content

"DPA团队的目标是什么？"
→ general_chat → Conversational response
```

## Migration from DPA Mom Agent

This workflow replaces the previous `dpa_mom` subagent with:
- Deterministic intent classification
- Explicit tool execution paths
- Better cost control (fast model for classification)
- Preserved conversational ability for general queries

