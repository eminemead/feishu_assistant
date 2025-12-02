# lark-mcp Integration Guide

**Status**: ✅ Installed & Tested  
**Package**: `@larksuiteoapi/lark-mcp@0.5.1`  
**Credentials**: ✅ Working (validated with project Feishu bot credentials)

## Overview

lark-mcp is the official Feishu/Lark OpenAPI MCP (Model Context Protocol) tool that exposes Feishu/Lark platform APIs as callable tools for AI agents. It enables seamless integration between AI systems and Feishu/Lark collaboration platform.

## Installation

Already installed in project:
```bash
bun add @larksuiteoapi/lark-mcp
```

## Available Document Tools

The `preset.doc.default` preset includes these document-focused capabilities:

### Core Document Operations

| Tool | Description | Use Case |
|------|-------------|----------|
| `docx.builtin.search` | Search documents across workspace | Find documents by keyword; implement knowledge base search |
| `docx.builtin.import` | Create new Feishu documents | Generate reports, meeting notes, analysis documents |
| `docx.v1.document.rawContent` | Retrieve document content in markdown | Read document content for analysis, Q&A |

### Supporting Tools (in same preset)

| Tool | Description |
|------|-------------|
| `wiki.v2.space.getNode` | Get Wiki page/node information |
| `wiki.v1.node.search` | Search wiki content |
| `drive.v1.permissionMember.create` | Add collaborator permissions |
| `contact.v3.user.batchGetId` | Resolve user emails/names to user IDs |

## Usage Examples

### 1. Search Documents

**Scenario**: Bot searches for meeting notes or reports

```typescript
const searchParams = {
  query: "Q4 OKR review",  // Search keyword
  limit: 5                  // Max results
};

// Returns matching documents with:
// - document_id, title, url
// - last_edit_time, owner
```

### 2. Import Document

**Scenario**: Bot generates analysis and saves as Feishu document

```typescript
const importParams = {
  title: "Q4 Financial Analysis - Dec 2024",
  content: `# Q4 Financial Analysis

## Revenue Summary
- Total Revenue: $2.5M (+15% YoY)
- Gross Margin: 68%

## Key Metrics
...`,
  folder_token: "optional_parent_folder_id"  // Optional
};

// Returns: document_id, url of created document
```

### 3. Get Document Content

**Scenario**: Bot reads existing document for further processing

```typescript
const getParams = {
  document_id: "docx_xxxxx",
  version: "optional_version_id"
};

// Returns: document content in markdown format
```

## Integration Patterns

### Pattern 1: Agent with Document Tools

```typescript
import { createAgent } from "@vercel/ai-sdk-tools/agents";
import { larkMcpTools } from "@larksuiteoapi/lark-mcp";

const agent = createAgent({
  model: model,
  tools: {
    ...larkMcpTools,  // Add lark-mcp document tools
    // other tools
  },
  systemPrompt: `You are a helpful assistant with access to Feishu documents.
  You can search, read, and create documents to help users.`
});
```

### Pattern 2: Feishu Bot Integration

Start lark-mcp as a background service and route bot messages through it:

```typescript
// Start MCP service
const mcp = spawn("npx", [
  "@larksuiteoapi/lark-mcp",
  "mcp",
  "-a", env.FEISHU_APP_ID,
  "-s", env.FEISHU_APP_SECRET,
  "-t", "preset.doc.default",
  "-m", "stdio"
]);

// Route bot messages to MCP for document operations
```

### Pattern 3: Workflow Automation

```
User Message → Bot Route → Determine Intent
  ↓
  ├─→ "search docs" → docx.builtin.search
  ├─→ "create document" → docx.builtin.import
  └─→ "read document" → docx.v1.document.rawContent
  ↓
Result → Format → Send back to Feishu
```

## Configuration

### Command Line (Direct)
```bash
npx @larksuiteoapi/lark-mcp mcp \
  -a YOUR_APP_ID \
  -s YOUR_APP_SECRET \
  -t preset.doc.default \
  -m stdio
```

### Environment Variables
```bash
export APP_ID=your_app_id
export APP_SECRET=your_app_secret
export LARK_TOOLS=preset.doc.default
```

### Configuration File (config.json)
```json
{
  "appId": "cli_xxxxx",
  "appSecret": "your_secret",
  "tools": ["preset.doc.default"],
  "mode": "stdio"
}
```

## Authentication Modes

### App Identity (Current)
- Uses App ID + App Secret
- Works with tenant-level resources
- No user login needed
- Good for: automation, batch operations

### User Identity (Beta)
- Requires OAuth login: `npx @larksuiteoapi/lark-mcp login`
- Token expires in 2 hours
- Access user private resources
- Good for: personal document operations

## Advanced Features

### Custom Tool Selection
Combine tools from multiple presets:
```bash
npx @larksuiteoapi/lark-mcp mcp \
  -a APP_ID \
  -s APP_SECRET \
  -t "docx.builtin.search,docx.builtin.import,im.v1.message.create"
```

### Transport Modes
- **stdio** (default): Used with Cursor, Claude, Trae
- **streamable** (HTTP): Deploy as service for remote access
- **sse** (deprecated): Legacy HTTP mode

### Tool Name Formats
```bash
-c snake    # docx.builtin.import (default)
-c camel    # docxBuiltinImport
-c kebab    # docx-builtin-import
```

### Language
```bash
-l en       # English (default)
-l zh       # Chinese (uses more tokens)
```

## Limitations

⚠️ **Current Constraints**:
- ❌ No file upload/download
- ❌ No direct document editing (import/read only)
- ❌ User tokens expire in 2 hours
- ❌ Document import can't set advanced formatting

✅ **Workarounds**:
- Use `docx.builtin.import` with markdown formatting
- Implement token refresh loop for user identity
- Combine with other Feishu APIs for extended functionality

## Real-World Use Cases

### 1. OKR Review Automation
```
Bot Flow:
  1. Search for "Q4 OKR" documents
  2. Read each OKR document
  3. Generate review analysis
  4. Import review as new document
  5. Share with team
```

### 2. Meeting Minutes Generation
```
Bot Flow:
  1. Get meeting transcript from Feishu
  2. Extract action items
  3. Generate formatted minutes
  4. Import as Feishu document
  5. Notify participants
```

### 3. Document Knowledge Base
```
Bot Flow:
  1. User asks question in Feishu chat
  2. Bot searches document knowledge base
  3. Returns relevant documents
  4. Provides summary
```

### 4. Automated Reporting
```
Bot Flow:
  1. Gather metrics from databases
  2. Generate analysis report
  3. Import as Feishu document with charts
  4. Schedule regular updates
```

## Testing

Run the test script to verify installation:

```bash
bun scripts/test-lark-mcp-simple.ts
```

Expected output:
```
✅ lark-mcp is successfully installed and configured
✓ Credentials are valid (App ID: cli_a...)
✓ Service initialized successfully
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 Not Found | Verify App ID/Secret; check Feishu developer console |
| Permission Denied | Add required permissions in Feishu app settings |
| Token Expired | User tokens last 2 hours; implement refresh logic |
| Garbled Output | Change terminal encoding: `chcp 65001` (Windows) |

## Next Steps

1. **Integrate into Bot**: Add lark-mcp tools to your agent's available actions
2. **Implement Workflows**: Build document automation workflows
3. **Monitor Usage**: Track API calls and quota usage
4. **Extend Capabilities**: Combine with other Feishu APIs (IM, Calendar, Tasks)

## Resources

- [Official NPM Package](https://www.npmjs.com/package/@larksuiteoapi/lark-mcp)
- [GitHub Repository](https://github.com/larksuite/lark-openapi-mcp)
- [Official Documentation](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction)
- [Feishu Open Platform](https://open.feishu.cn/)
- [MCP Protocol](https://modelcontextprotocol.io/)

## Project Integration Status

- ✅ Package installed
- ✅ Credentials validated
- ✅ Document preset working
- ⏳ Agent integration pending
- ⏳ Workflow automation pending
