# DPA Mom Agent Tools Overview

## Summary

The `dpa_mom` agent has access to **3 tools** that enable comprehensive support for the DPA (Data Product & Analytics) team:

1. **GitLab CLI Tool** (`gitlab_cli`) - GitLab repository and issue management
2. **Feishu Chat History Tool** (`feishu_chat_history`) - Access group chat histories
3. **Feishu Docs Tool** (`feishu_docs`) - Read Feishu documents (Docs, Sheets, Bitable)

---

## Tool Details

### 1. GitLab CLI Tool (`gitlab_cli`)

**File**: `lib/tools/gitlab-cli-tool.ts`

**Purpose**: Access GitLab repository and issue management via `glab` CLI

**Capabilities**:
- **Issues**: List, view, create, close issues
- **Merge Requests**: List, view, create MRs
- **Repository**: View repo info, clone operations
- **CI/CD**: View pipelines, jobs
- **API**: Direct API calls

**Parameters**:
- `command` (required): The glab command to execute (e.g., `"issue list"`, `"mr view 456"`)
- `args` (optional): Additional arguments/flags (e.g., `"--state=opened"`, `"--assignee=username"`)

**Example Usage**:
```typescript
// List all issues
{ command: "issue list" }

// View specific issue
{ command: "issue view", args: "123" }

// List merge requests
{ command: "mr list" }

// View repository info
{ command: "repo view" }

// View CI/CD pipelines
{ command: "ci view" }
```

**Return Format**:
```typescript
{
  success: boolean;
  output?: string;      // stdout output
  error?: string;       // stderr if failed
  command: string;      // Full command executed
}
```

**Implementation Notes**:
- Uses `glab` CLI (GitLab CLI tool)
- 30-second timeout per command
- 10MB max buffer size
- Devtools tracking enabled by default

---

### 2. Feishu Chat History Tool (`feishu_chat_history`)

**File**: `lib/tools/feishu-chat-history-tool.ts`

**Purpose**: Access Feishu group chat histories and message threads

**Capabilities**:
- Retrieve chat history from group chats
- Search messages by time range
- Get context from previous conversations
- Supports both group chats (`oc_xxxxx`) and private chats (`ou_xxxxx`)

**Parameters**:
- `chatId` (required): Feishu chat ID (e.g., `"oc_xxxxx"` for group chat)
- `limit` (optional): Max messages to retrieve (default: 50, max: 100)
- `startTime` (optional): Start time filter (Unix timestamp in seconds, e.g., `"1703001600"`)
- `endTime` (optional): End time filter (Unix timestamp in seconds)

**Example Usage**:
```typescript
// Get recent messages
{ chatId: "oc_abc123" }

// Get messages with limit
{ chatId: "oc_abc123", limit: 100 }

// Get messages in time range
{ 
  chatId: "oc_abc123",
  startTime: "1703001600",  // 2023-12-20
  endTime: "1703088000"     // 2023-12-21
}
```

**Return Format**:
```typescript
{
  success: boolean;
  chatId: string;
  messageCount?: number;
  messages?: Array<{
    messageId: string;
    sender: {
      id: string;
      type: string;
      name: string;
    };
    content: string;
    createTime: string;
    isBot: boolean;
  }>;
  error?: string;
}
```

**Implementation Notes**:
- Messages are returned in reverse order (oldest first)
- Parses message content using `parseMessageContent` utility
- Uses Feishu SDK `client.im.message.list` API
- Devtools tracking enabled by default

---

### 3. Feishu Docs Tool (`feishu_docs`)

**File**: `lib/tools/feishu-docs-tool.ts`

**Purpose**: Read and access Feishu documents (Docs, Sheets, Bitable)

**Capabilities**:
- Read Feishu Docs content (rich text documents)
- Get document metadata (name, owner, last modified, size, etc.)
- Access Sheets information (metadata and sheet list)
- Extract text content from documents
- Supports document tokens or URLs (auto-extracts token from URL)

**Parameters**:
- `docToken` (required): Document token or URL (e.g., `"doccnxxxxx"` or full Feishu doc URL)
- `docType` (optional): Document type - `"doc"` | `"sheet"` | `"bitable"` (default: `"doc"`)
- `action` (optional): Action to perform - `"read"` | `"metadata"` (default: `"read"`)

**Example Usage**:
```typescript
// Read a document
{ docToken: "doccnxxxxx" }

// Read from URL (auto-extracts token)
{ docToken: "https://example.feishu.cn/docs/doccnxxxxx" }

// Get document metadata
{ docToken: "doccnxxxxx", action: "metadata" }

// Read a sheet
{ docToken: "shtcnxxxxx", docType: "sheet" }

// Get sheet metadata
{ docToken: "shtcnxxxxx", docType: "sheet", action: "metadata" }
```

**Return Format** (for `read` action):
```typescript
{
  success: boolean;
  docToken: string;
  docType: "doc" | "sheet" | "bitable";
  content?: string;        // Text content (for docs)
  title?: string;          // Document title
  sheets?: Array<{         // For sheets only
    sheetId: string;
    title: string;
  }>;
  message?: string;        // Additional info
  error?: string;
}
```

**Return Format** (for `metadata` action):
```typescript
{
  success: boolean;
  docToken: string;
  docType: string;
  metadata?: {
    name: string;
    token: string;
    type: string;
    size: number;
    createdAt: string;
    updatedAt: string;
    ownerId: string;
  };
  error?: string;
}
```

**Implementation Notes**:
- Auto-extracts document token from Feishu URLs
- For Docs: Extracts text content recursively from document structure
- For Sheets: Returns metadata and sheet list (full content reading requires more complex API)
- For Bitable: Not yet implemented (returns error)
- Uses Feishu SDK APIs:
  - `client.docx.v1.document.content` for Docs
  - `client.sheets.v2.spreadsheet.get` for Sheets
  - `client.drive.v1.file.get` for metadata
- Devtools tracking enabled by default

---

## Tool Configuration in DPA Mom Agent

**File**: `lib/agents/dpa-mom-agent.ts`

**Initialization** (lines 57-60):
```typescript
const gitlabCliTool = createGitLabCliTool(true);
const feishuChatHistoryTool = createFeishuChatHistoryTool(true);
const feishuDocsTool = createFeishuDocsTool(true);
```

**Agent Setup** (lines 103-107):
```typescript
tools: {
  gitlab_cli: gitlabCliTool,
  feishu_chat_history: feishuChatHistoryTool,
  feishu_docs: feishuDocsTool,
}
```

**Agent Instructions** (lines 82-90):
The agent is instructed to:
- Use `gitlab_cli` to check GitLab issues and merge requests when asked about project status
- Use `feishu_chat_history` to retrieve chat history to understand context and previous discussions
- Use `feishu_docs` to read Feishu documents to answer questions about team documentation
- Use tools proactively to gather information before responding

---

## Tool Factory Pattern

All tools follow a **factory pattern**:
- Each tool is created via a factory function (e.g., `createGitLabCliTool()`)
- Tools are **NOT shared** between agents - each agent has its own instances
- Factory functions accept `enableDevtoolsTracking` parameter (default: `true`)
- Tools are scoped to the agent that creates them

**Benefits**:
- Agent independence
- Per-agent tool configuration
- Devtools tracking per agent
- Easy testing and mocking

---

## Devtools Integration

All tools support devtools tracking via `trackToolCall()`:
- Tracks tool usage, parameters, and results
- Enables monitoring and debugging
- Integrated with devtools infrastructure

**Tracking includes**:
- Tool name
- Input parameters
- Execution time
- Success/failure status
- Error messages (if any)

---

## Usage Guidelines for dpa_mom Agent

The agent is instructed to use tools proactively:

1. **GitLab CLI**: 
   - Check project status
   - View issues and merge requests
   - Monitor CI/CD pipelines

2. **Feishu Chat History**:
   - Understand conversation context
   - Retrieve previous discussions
   - Get team communication history

3. **Feishu Docs**:
   - Read team documentation
   - Access shared knowledge
   - Get document information

---

## Current Limitations

1. **Feishu Docs Tool**:
   - Bitable reading not yet implemented
   - Sheet content reading requires more complex API (only metadata available)

2. **GitLab CLI Tool**:
   - Requires `glab` CLI to be installed
   - 30-second timeout per command
   - Limited to commands available via `glab`

3. **Feishu Chat History Tool**:
   - Max 100 messages per request
   - Requires valid chat ID

---

## Future Enhancements

Potential improvements:
- Full Bitable support in Feishu Docs tool
- Enhanced sheet content reading
- Additional GitLab operations
- Caching for frequently accessed documents/chats
- Batch operations for multiple documents/chats

