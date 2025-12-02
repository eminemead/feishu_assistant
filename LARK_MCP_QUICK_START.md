# lark-mcp Quick Start

## What Was Done

✅ **Installed** `@larksuiteoapi/lark-mcp@0.5.1`  
✅ **Tested** document import & search with your Feishu bot credentials  
✅ **Validated** credentials are working  
✅ **Created** test script + full documentation  

## Test It Now

```bash
bun test:lark-mcp
```

Expected output:
```
✅ lark-mcp is successfully installed and configured
✓ Credentials are valid (App ID: cli_a...)
✓ Service initialized successfully
```

## Available Tools

| Tool | What It Does |
|------|-------------|
| `docx.builtin.search` | Search documents by keyword |
| `docx.builtin.import` | Create new Feishu documents |
| `docx.v1.document.rawContent` | Read document content |
| `wiki.v1.node.search` | Search wiki pages |
| `drive.v1.permissionMember.create` | Share documents with people |

## Quick Example

### Search Documents
```typescript
// Bot can now search Feishu docs
const results = await callTool("docx.builtin.search", {
  query: "Q4 OKR",
  limit: 5
});
// Returns: matching documents with links
```

### Create Document
```typescript
// Bot can create new Feishu documents
const doc = await callTool("docx.builtin.import", {
  title: "Q4 Financial Analysis",
  content: "# Analysis\n\nContent here..."
});
// Returns: document URL
```

## Full Documentation

- **Integration Guide**: `docs/LARK_MCP_INTEGRATION.md` (detailed setup)
- **Test Results**: `LARK_MCP_TEST_RESULTS.md` (complete findings)
- **Test Script**: `scripts/test-lark-mcp-simple.ts` (verification code)

## Next: Integrate Into Agent

To add to your AI agent:

```typescript
import { createAgent } from "@vercel/ai-sdk-tools/agents";

// Add lark-mcp tools to your agent
const agent = createAgent({
  model: yourModel,
  tools: {
    searchDocuments: { /* docx.builtin.search */ },
    createDocument: { /* docx.builtin.import */ },
    // ... other tools
  }
});
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Command not found" | Run `bun test:lark-mcp` (with bun, not npm) |
| Credentials error | Check `FEISHU_APP_ID` and `FEISHU_APP_SECRET` in `.env` |
| 404 errors | Verify app permissions in Feishu developer console |

## Key Features

- ✅ Document search across workspace
- ✅ Create/import new documents
- ✅ Read document content
- ✅ Share documents with permissions
- ✅ Works with existing Feishu bot credentials
- ✅ MCP protocol standard (Cursor, Claude, Trae compatible)

## Limitations

- ❌ No file uploads (markdown only)
- ❌ Can't edit existing documents
- ❌ No advanced document formatting

(All have practical workarounds - see full docs)

---

**Status**: Ready for integration  
**Credentials**: ✅ Verified with your bot  
**Next**: Add to agent workflow
