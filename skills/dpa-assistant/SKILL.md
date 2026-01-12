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

## Command Syntax (Slash Commands)

For explicit intent control, use slash commands:

| Command | Action | Example |
|---------|--------|---------|
| `/创建` `/新` | Create GitLab issue | `/创建 数据管道失败` |
| `/查看` `/列表` | List issues/MRs | `/查看 my issues` |
| `/总结 #N` | Summarize issue | `/总结 #123` |
| `/关闭 #N [url]` | Close with deliverable | `/关闭 #45 http://superset.nevint.com/...` |
| `/关联 #N` | Link thread to issue | `/关联 #456` |
| `/总结反馈 @user...` | Summarize user(s) feedback | `/总结反馈 @张三 @李四` |
| `/搜索` | Search chat history | `/搜索 部署讨论` |
| `/文档` | Read Feishu doc | `/文档 https://feishu.cn/docs/xxx` |
| `/帮助` | Show commands | `/帮助` |

Without `/` prefix, the bot uses AI to understand intent (may occasionally misinterpret).

## Capabilities

### 1. GitLab Operations
- **Create Issues**: "create issue", "new bug", "报个bug", "创建issue"
- **List Issues/MRs**: "show issues", "list MRs", "查看issue", "我的MR"
- **Link Thread to Issue**: "link to #123", "跟踪issue 456", "绑定issue" (re-engagement UX)
- **Thread Auto-Sync**: Replies in linked threads auto-post to GitLab

### 2. Feishu Integration
- **Chat Search**: Search chat history for messages
- **Doc Reading**: Read and summarize Feishu documents

### 3. General Assistance
- Answer questions about the team
- Provide help and guidance
- General conversation

### 4. Feedback Collection
- **Summarize User Feedback**: "总结 @xxx @yyy 的反馈", supports multiple users
- **Batch Feedback**: Collect feedback from multiple users in one command
- **Create Issue from Feedback**: Confirmation button after summary to create GitLab issue

## Workflow Architecture

```
Query → Intent Classification (fast model)
         ↓
    ┌────┴────┐
    │ Branch  │
    └────┬────┘
         ↓
  ┌──────┼──────┬──────┬──────┬──────┬──────┬──────┐
  ↓      ↓      ↓      ↓      ↓      ↓      ↓      ↓
gitlab  gitlab  gitlab  gitlab  chat   doc  feedback general
create  list   update  relink search  read  summary  chat
  ↓      ↓      ↓      ↓      ↓      ↓      ↓      ↓
  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘
         ↓
    Format Response
```

## Intent Classification

| Intent | Triggers | Action |
|--------|----------|--------|
| `gitlab_create` | create issue, new bug, 报bug | Execute glab issue create |
| `gitlab_list` | show issues, list MRs, 查看 | Execute glab issue/mr list |
| `gitlab_relink` | link to #123, 跟踪issue, 绑定 | Link current thread to existing issue |
| `gitlab_summarize` | summarize #12, status #12, 总结 | Fetch issue + comments, LLM summary |
| `gitlab_thread_update` | 补充, 更新, also (in linked thread) | Add note to linked issue |
| `feedback_summarize` | 总结 @user1 @user2 反馈 | Summarize user(s) feedback from chat history |
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

"link to #456"
→ gitlab_relink → Link this thread to issue #456
→ Future replies auto-sync as GitLab comments

"总结 @张三 @李四 的反馈"
→ feedback_summarize → Summarize users' messages (supports multiple)
→ Option to create GitLab issue from summary
```

## Migration from DPA Mom Agent

This workflow replaces the previous `dpa_mom` subagent with:
- Deterministic intent classification
- Explicit tool execution paths
- Better cost control (fast model for classification)
- Preserved conversational ability for general queries

