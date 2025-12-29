---
name: "Feishu Document Handling"
description: "Document tracking and management workflows for Feishu/Lark documents"
version: "1.0.0"
tags: ["feishu", "document", "tracking", "lark"]
keywords: ["feishu", "lark", "document", "doc", "tracking", "change", "update", "文档", "文档追踪"]
tools: ["feishu_docs", "document_semantic_search"]
---

# Feishu Document Handling Skill

This skill enables document tracking, change detection, and semantic search for Feishu/Lark documents.

## Purpose

Help users:
- Track document changes and updates
- Search documents semantically
- Monitor document activity
- Manage document workflows

## Instructions

When handling document-related queries:

1. **Document Tracking**
   - Use document tracking tools to monitor changes
   - Detect and report document updates
   - Track document versions and history

2. **Semantic Search**
   - Use semantic search to find relevant documents
   - Understand query intent beyond keyword matching
   - Return ranked results with context

3. **Change Detection**
   - Identify what changed in documents
   - Highlight significant modifications
   - Provide diff summaries

4. **Document Management**
   - Help organize documents
   - Support document workflows
   - Assist with document sharing and permissions

5. **Response Format**
   - Use Markdown formatting (Lark Markdown)
   - Include document links when available
   - Provide clear summaries of changes
   - Support both Chinese and English

## Examples

**Example 1**: Track Changes
```
User: "What documents changed this week?"
AI: [Queries document tracking system, lists changed documents with summaries]
```

**Example 2**: Semantic Search
```
User: "Find documents about OKR planning"
AI: [Uses semantic search, returns relevant documents ranked by relevance]
```

**Example 3**: Change Details
```
User: "What changed in document X?"
AI: [Retrieves document history, shows diff summary, highlights key changes]
```

## Key Concepts

- **Document Tracking**: Monitoring document changes over time
- **Semantic Search**: Finding documents by meaning, not just keywords
- **Change Detection**: Identifying modifications in document content
- **Document Snapshot**: Point-in-time capture of document state

## Best Practices

- Always verify document permissions before accessing
- Provide context for document changes
- Use semantic search for better relevance
- Support both specific document queries and broad searches

