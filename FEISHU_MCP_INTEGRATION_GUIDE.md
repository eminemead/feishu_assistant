# Feishu/Lark OpenAPI MCP Integration Guide

**Current Status**: ❌ **NOT INTEGRATED** in this project  
**MCP Tool**: `@larksuiteoapi/lark-mcp` (Beta v0.4.0+)  
**GitHub**: https://github.com/larksuite/lark-openapi-mcp  
**Official Docs**: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction

---

## 🎯 What is Feishu OpenAPI MCP?

**Model Context Protocol (MCP)** is a protocol from Anthropic that allows LLMs and AI agents to:
- Call external tools through a standardized interface
- Access Feishu/Lark APIs without raw HTTP requests
- Receive structured responses for decision-making

**Feishu's OpenAPI MCP Tool** wraps all 2,500+ Feishu APIs as standardized MCP tools that AI assistants can call directly.

### Key Difference: SDK vs MCP
| Aspect | Node SDK | MCP Tool |
|--------|----------|----------|
| **Target** | Backend developers | AI agents/LLMs |
| **Integration** | Manual code + TypeScript | Automatic tool discovery |
| **Complexity** | Requires explicit API calls | LLM decides which API to call |
| **Use Case** | Bot logic, workflows | AI-powered reasoning |

---

## ✅ MCP Capabilities Available

### **Supported API Categories**
- ✅ **Messaging**: Send messages, cards, create groups
- ✅ **Documents**: Read docs, sheets, Bitable
- ✅ **Calendar**: Create events, query free/busy
- ✅ **Contacts**: Get user info, list departments
- ✅ **Base/Bitable**: Create tables, records, views
- ✅ **Approvals**: Create/approve workflows
- ✅ **Tasks**: Create tasks, update status
- ✅ **Sheets**: Read/write cells, formulas, formatting
- ✅ **Wiki**: Create/manage knowledge bases
- ✅ **Permissions**: Grant access to files

### **Special Features**
- 🆕 **Genesis AI System** (Enhanced version only): Auto-generate Lark Base applications from natural language
- 🔐 **Dual Auth**: Both `tenant_access_token` (app) and `user_access_token` (user identity)
- 🌐 **Two Transport Modes**:
  - `stdio` (default) - For Trae, Cursor, Claude integration
  - `sse` (HTTP) - For remote/web-based integration

### **⚠️ Limitations**
- ❌ File upload/download not supported
- ❌ Direct document editing not supported (read-only)
- ❌ Grayscale (limited access) APIs not included
- ⚠️ Non-preset APIs not optimized for AI understanding

---

## 🚀 How to Integrate MCP in This Project

### **Option 1: Local MCP with AI Tools (Best for Development)**

#### **Installation**
```bash
npm install -g @larksuiteoapi/lark-mcp
# or
npx @larksuiteoapi/lark-mcp --version
```

#### **Configuration (for Claude/Cursor/Trae)**

Add to your `.codeium_config` or MCP settings:
```json
{
  "mcpServers": {
    "lark-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@larksuiteoapi/lark-mcp",
        "mcp",
        "-a", "YOUR_APP_ID",
        "-s", "YOUR_APP_SECRET"
      ]
    }
  }
}
```

#### **With User Authentication (OAuth)**
```bash
# First, login to get user token
npx @larksuiteoapi/lark-mcp login -a YOUR_APP_ID -s YOUR_APP_SECRET

# Then add to config with oauth flag
{
  "mcpServers": {
    "lark-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@larksuiteoapi/lark-mcp",
        "mcp",
        "-a", "YOUR_APP_ID",
        "-s", "YOUR_APP_SECRET",
        "--oauth",
        "--token-mode", "user_access_token"
      ]
    }
  }
}
```

### **Option 2: SSE Mode (HTTP Server)**

For web-based integration or calling from a service:

```bash
# Start MCP HTTP server on port 3000
npx @larksuiteoapi/lark-mcp mcp \
  -a YOUR_APP_ID \
  -s YOUR_APP_SECRET \
  -m sse \
  -p 3000
```

Then call via HTTP:
```typescript
const response = await fetch('http://localhost:3000/sse', {
  headers: {
    'Content-Type': 'application/json'
  }
});
```

### **Option 3: Selective Tools (Reduce Token Usage)**

Only enable the tools you need:
```json
{
  "mcpServers": {
    "lark-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@larksuiteoapi/lark-mcp",
        "mcp",
        "-a", "YOUR_APP_ID",
        "-s", "YOUR_APP_SECRET",
        "-t", "im.v1.message.create,im.v1.chat.create,sheet.spreadsheet.values"
      ]
    }
  }
}
```

### **Preset Tool Collections**
```bash
# Default tools (all common APIs)
-t preset.default

# Lightweight (fewer tokens)
-t preset.light

# Messaging only
-t preset.im.default

# Base/Bitable
-t preset.base.default
-t preset.base.batch

# Documents & Sheets
-t preset.doc.default

# Calendar
-t preset.calendar.default

# Tasks
-t preset.task.default

# Genesis (AI-powered Base creation) - Enhanced version only
-t preset.genesis.default
```

---

## 📚 Available MCP Tools Reference

### **Messaging Tools**
```
im.v1.message.create       # Send message/card
im.v1.message.list         # Get message list
im.v1.chat.create          # Create group
im.v1.chat.members.create  # Add member to group
im.v1.chat.members.list    # List group members
```

### **Sheet Tools**
```
sheet.spreadsheet.create   # Create spreadsheet
sheet.spreadsheet.values   # Read/write cells
sheet.spreadsheet.style    # Set cell formatting
sheet.spreadsheet.merge_cells
sheet.spreadsheet.unmerge_cells
```

### **Doc Tools**
```
doc.v2.content             # Read document
doc.v2.rawContent          # Read plain text
doc.v2.batchUpdate         # Edit document
docx.document.create       # Create Doc
```

### **Base/Bitable Tools**
```
bitable.app.create         # Create Base
bitable.table.create       # Create table
bitable.record.create      # Add record
bitable.record.update      # Update record
bitable.record.list        # Query records
```

### **Contact Tools**
```
contact.user.get           # Get user info
contact.user.list          # List users
contact.department.get     # Get department
```

### **Calendar Tools**
```
calendar.event.create      # Create event
calendar.freebusy.query    # Check availability
```

**Full list**: https://github.com/larksuite/lark-openapi-mcp/blob/main/docs/reference/tool-presets/tools-en.md

---

## 🔌 Integration Patterns

### **Pattern 1: Agent with MCP Tools**
```typescript
// Your Vercel AI SDK agent automatically gets MCP tools
// via your MCP server configuration

const result = await generateText({
  model: openai("gpt-4"),
  tools: [
    // MCP tools auto-discovered and exposed here
    {
      name: "im.v1.message.create",
      description: "Send a message",
      inputSchema: { /* ... */ }
    }
  ],
  messages: [
    {
      role: "user",
      content: "Send a message to chat XYZ saying 'hello'"
    }
  ]
});
```

### **Pattern 2: Feishu Bot + MCP**
The bot receives a message → MCP agent processes it → Takes actions via Feishu APIs

```typescript
// In your bot message handler:
import { generateText } from 'ai';

async function handleBotMessage(message: string, chatId: string) {
  const result = await generateText({
    model: openai("gpt-4"),
    // MCP provides tools automatically
    messages: [
      {
        role: "user",
        content: `User said: "${message}". Respond and take any needed actions.`
      }
    ]
  });
  
  // Send response back to Feishu
  await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      content: JSON.stringify({ text: result.text }),
      msg_type: 'text'
    }
  });
}
```

---

## 🎯 Use Cases for Your Project

### **1. OKR Review Agent** ✅ Perfect fit
```
User: "Summarize Q4 OKR progress"
Agent:
  → Calls doc.v2.content() to read OKR document
  → Processes with LLM
  → Calls im.v1.message.create() to send summary card
```

### **2. P&L Analysis Agent** ✅ Perfect fit
```
User: "Generate P&L chart and send to finance group"
Agent:
  → Calls sheet.spreadsheet.values() to read sales data
  → Processes/calculates in code
  → Generates chart image
  → Calls im.v1.message.create() with card attachment
```

### **3. Document Tracking Agent** ⚠️ Partial fit
```
User: "Tell me who last modified the OKR doc"
Agent:
  → Currently must use Node SDK (not MCP) for metadata
  → MCP doesn't expose Drive API metadata
  → Workaround: Fallback to Node SDK for this
```

### **4. Meeting Alignment Agent** ✅ Perfect fit
```
User: "Create a calendar event for all team leads"
Agent:
  → Calls contact.user.list() to find leads
  → Calls calendar.event.create() to schedule
  → Sends confirmation via im.v1.message.create()
```

---

## 🔧 Implementation Steps

### **Step 1: Install MCP Tool**
```bash
npm install -g @larksuiteoapi/lark-mcp
```

### **Step 2: Set Up Configuration**
Create `.amp/mcp-servers.json`:
```json
{
  "mcpServers": {
    "lark-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@larksuiteoapi/lark-mcp",
        "mcp",
        "-a", "${FEISHU_APP_ID}",
        "-s", "${FEISHU_APP_SECRET}",
        "-t", "preset.default"
      ]
    }
  }
}
```

### **Step 3: Update Vercel AI Agent Config**
In your agent initialization (likely in `lib/agents/manager-agent.ts` or similar):
```typescript
import { createMCPClient } from '@anthropic-sdk/mcp-sdk';

const mcpClient = await createMCPClient({
  serverUrl: 'stdio://npx -y @larksuiteoapi/lark-mcp mcp ...'
});

// Register MCP tools with your agent
const mcpTools = await mcpClient.listTools();
for (const tool of mcpTools) {
  registerTool(tool);
}
```

### **Step 4: Update Agent Prompts**
Add to your agent system prompts:
```
You now have access to Feishu API tools via MCP:
- Use im.v1.message.create to send messages
- Use sheet.spreadsheet.values to read/write spreadsheet data
- Use doc.v2.content to read documents
- Use contact.user.* to get organization info
...
```

---

## 📊 Comparison: Node SDK vs MCP

| Feature | Node SDK | MCP Tool |
|---------|----------|----------|
| **Manual API calls** | ✅ Full control | ❌ LLM decides |
| **Type safety** | ✅ Full TS types | ❌ JSON schema only |
| **Error handling** | ✅ Explicit try-catch | ⚠️ LLM might not handle well |
| **Complex logic** | ✅ Easy to code | ❌ LLM struggles |
| **Automation** | ❌ Need explicit code | ✅ LLM can plan |
| **One-shot tasks** | ⚠️ Requires coding | ✅ Just ask AI |

### **Hybrid Approach (Recommended)**
```typescript
// Use MCP for high-level agent reasoning
// Use Node SDK for critical business logic

if (shouldUseMCP(userRequest)) {
  // Simple task → let MCP agent handle it
  return await mcpAgent.run(userRequest);
} else {
  // Complex logic → use Node SDK directly
  return await complexWorkflow();
}
```

---

## 🚀 Advanced Features (Enhanced Version)

The [Enhanced MCP](https://github.com/ShunsukeHayashi/lark-openapi-mcp-enhanced) adds:

### **Genesis AI System**
Auto-generate Lark Base apps from natural language:
```
User: "Create a project tracking base with tasks, timeline, and team members"
Genesis AI:
  → Analyzes requirements
  → Creates tables (Tasks, Timeline, Team)
  → Sets up relationships
  → Creates views (Kanban, Gantt)
  → Generates automation rules
```

### **Built-in Tools**
- `genesis.builtin.create_table` - Generate tables from descriptions
- `genesis.builtin.create_dashboard` - Create analysis dashboards
- `genesis.builtin.create_automation` - Set up workflows
- `genesis.builtin.create_filter_view` - Create data filters

### **Rate Limiting**
Built-in protection against API quota exhaustion.

---

## ⚙️ Environment Setup

### **For .env**
```
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=your_secret_here
FEISHU_MCP_MODE=stdio  # or 'sse'
FEISHU_MCP_PORT=3000   # if using SSE
```

### **For Development**
```bash
# Terminal 1: Start MCP server
npx @larksuiteoapi/lark-mcp mcp -a $FEISHU_APP_ID -s $FEISHU_APP_SECRET

# Terminal 2: Run your agent
bun run dev
```

---

## 📋 Supported Languages/Domains

### **Domains**
- Feishu (China): `https://open.feishu.cn` (default)
- Lark (International): `https://open.larksuite.com`
- Custom (KA): Any custom domain

### **Languages**
- `-l en` (English, default)
- `-l zh` (Chinese, may use more tokens)

---

## ❌ Current Integration Status

**Your project currently**:
- ✅ Uses Node SDK (`@larksuiteoapi/node-sdk`)
- ❌ Does NOT use MCP tool
- ❌ No MCP server configured

**Benefits of adding MCP**:
- 🤖 AI agents can autonomously use Feishu APIs
- 🚀 Faster to add new agent capabilities
- 💡 LLMs can reason about complex workflows
- 📉 Reduces need for explicit backend code

---

## 🎓 Example: Adding MCP to Your Project

### **Scenario: Make OKR Agent Self-Healing**

**Before (Node SDK only)**:
```typescript
// Agent must have explicit instructions about what to do
// Developer must code each scenario
const response = await okrAgent.run({
  request: "Summarize OKR progress",
  // Developer must specify: read doc, format response, send to chat
});
```

**After (With MCP)**:
```typescript
// Agent can autonomously decide what APIs to call
// Just give it the goal
const response = await mcpAgent.run({
  request: "Summarize OKR progress and notify the team"
  // Agent automatically:
  // → Reads doc.v2.content(docToken)
  // → Summarizes with LLM
  // → Sends im.v1.message.create() to chat
});
```

---

## 📚 Additional Resources

- **GitHub**: https://github.com/larksuite/lark-openapi-mcp
- **Official Docs**: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction
- **Sample Repo**: https://github.com/larksuite/lark-samples/tree/main/mcp_larkbot_demo
- **Tool List**: https://github.com/larksuite/lark-openapi-mcp/blob/main/docs/reference/tool-presets/tools-en.md
- **Enhanced Version**: https://github.com/ShunsukeHayashi/lark-openapi-mcp-enhanced

---

## ✅ Next Steps

To integrate MCP into this project:

1. **Install** `@larksuiteoapi/lark-mcp`
2. **Configure** MCP server in `.amp/mcp-servers.json`
3. **Update** Vercel AI SDK agent to use MCP tools
4. **Refactor** agents to leverage autonomous API calling
5. **Test** with simple scenarios first (send message, read sheet)
6. **Scale** to complex multi-step workflows

**Recommended for**: OKR Agent, P&L Analysis, Meeting Alignment  
**Less suitable for**: Real-time document tracking (use Node SDK polling instead)
