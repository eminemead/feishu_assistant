# Feishu SDK vs MCP: Understanding the Equivalents

## Quick Answer

| Aspect | SDK | MCP |
|--------|-----|-----|
| **Package** | `@larksuiteoapi/node-sdk` | `@larksuiteoapi/lark-mcp` |
| **Use Case** | Direct API calls in backend code | Tools for AI agents/LLMs |
| **Integration** | Explicit TypeScript/Node.js code | Configuration + MCP protocol |
| **Target User** | Backend developers | AI agents & LLMs |
| **Who calls APIs?** | Your code decides | LLM/AI agent decides |

---

## 🎯 Two Different Tools, Same Feishu APIs

```
┌─────────────────────────────────────────────────────────────┐
│                    Feishu APIs (2,500+)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐              ┌─────────────────────┐      │
│  │  Node SDK    │              │   MCP Tool          │      │
│  │              │              │                     │      │
│  │ @larksuiteo  │              │ @larksuiteoapi/    │      │
│  │ api/node-sdk │              │ lark-mcp           │      │
│  │              │              │                     │      │
│  └──────────────┘              └─────────────────────┘      │
│       ↓                               ↓                      │
│  Your Code                     LLM/AI Agent                 │
│  (TypeScript)                  (Claude, GPT, etc)           │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Equivalent Concepts

### **SDK (Node SDK)**
```typescript
// YOU decide to call an API
import * as lark from '@larksuiteoapi/node-sdk';

const client = new lark.Client({ appId, appSecret });

// Explicit call
const result = await client.im.message.create({
  params: { receive_id_type: 'chat_id' },
  data: { receive_id: chatId, content: JSON.stringify({ text: 'Hello' }), msg_type: 'text' }
});
```

**Characteristics**:
- ✅ Full control & type safety
- ✅ Explicit error handling
- ✅ Complex business logic possible
- ❌ Requires you to code every scenario
- ❌ Not suitable for autonomous agents

### **MCP Tool (@larksuiteoapi/lark-mcp)**
```typescript
// LLM decides to call the tool
// Configuration only:
{
  "mcpServers": {
    "lark-mcp": {
      "command": "npx",
      "args": ["-y", "@larksuiteoapi/lark-mcp", "mcp", "-a", "APP_ID", "-s", "APP_SECRET"]
    }
  }
}

// LLM sees tool available: "im.v1.message.create"
// LLM decides when/how to use it based on user request
```

**Characteristics**:
- ✅ Autonomous decision-making
- ✅ Works with any AI agent (Claude, GPT, etc)
- ✅ No coding needed (config-driven)
- ❌ Less control over behavior
- ❌ Limited to what MCP tool supports

---

## 🔄 Side-by-Side Comparison

### **Scenario: Send a message to a group chat**

#### **Using Node SDK**
```typescript
// You write this code
async function sendMessageToGroup(chatId: string, message: string) {
  try {
    const result = await client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content: JSON.stringify({ text: message }),
        msg_type: 'text'
      }
    });
    console.log('Message sent:', result.data?.message_id);
    return result;
  } catch (error) {
    console.error('Failed to send message:', error);
    // Your error handling
  }
}

// Your bot calls it
await sendMessageToGroup('oc_xxxxx', 'Q4 OKR summary...');
```

#### **Using MCP Tool**
```
User: "Send the Q4 OKR summary to the finance group"
         ↓
LLM sees available tool: im.v1.message.create
         ↓
LLM decides to call it with parameters:
  - receive_id: "oc_xxxxx" (finance group)
  - content: "Q4 OKR summary..."
  - msg_type: "text"
         ↓
MCP executes the tool
         ↓
Returns result to LLM
```

---

## 🎁 What You Get in Each

### **Node SDK** (`@larksuiteoapi/node-sdk`)

**Installation**:
```bash
npm install @larksuiteoapi/node-sdk
```

**You get**:
- `client.im.*` - Messaging APIs
- `client.sheet.*` - Sheets APIs
- `client.doc.*` - Documents APIs
- `client.contact.*` - Contact APIs
- `client.calendar.*` - Calendar APIs
- `client.bitable.*` - Base APIs
- etc.

**Example**:
```typescript
// Read a sheet
const data = await client.sheet.spreadsheet.values({
  params: { spreadsheetToken: 'shtcnXXX', range: '0b**12!A1:B5' }
});

// Type-safe, full IDE support
console.log(data.data?.values); // ✅ TypeScript knows this exists
```

### **MCP Tool** (`@larksuiteoapi/lark-mcp`)

**Installation**:
```bash
npm install -g @larksuiteoapi/lark-mcp
```

**You get**:
- Tools with names like: `im.v1.message.create`, `sheet.spreadsheet.values`, etc.
- Registered in MCP protocol
- Available to any MCP client (Claude, Cursor, custom agent)

**Example** (Claude sees this tool available):
```
Tool: sheet.spreadsheet.values
Description: Read data from a specific range in a spreadsheet
Parameters:
  - spreadsheetToken (string): Feishu spreadsheet token
  - range (string): Range in A1:B5 format

Tool: im.v1.message.create
Description: Send message to a chat
Parameters:
  - receive_id (string): Chat ID
  - content (string): Message content
  - msg_type (string): Type of message
```

---

## 🤝 How to Use Both Together (Recommended)

**Hybrid Approach**:
```typescript
// lib/agents/okr-agent.ts

// Import SDK for complex/critical business logic
import * as lark from '@larksuiteoapi/node-sdk';
import { generateText } from 'ai'; // Vercel AI SDK with MCP

export async function runOKRAgent(request: string) {
  // For simple autonomous tasks → use MCP
  // User: "Send OKR summary to finance group"
  if (request.includes('send') && request.includes('OKR')) {
    // Let LLM use MCP tools to decide
    const result = await generateText({
      model: openai('gpt-4'),
      // MCP provides tools automatically via config
      messages: [{ role: 'user', content: request }]
    });
    return result.text;
  }
  
  // For complex validation logic → use SDK
  if (request.includes('validate')) {
    // You control the flow
    const docMetadata = await client.request({
      method: 'POST',
      url: '/open-apis/suite/docs-api/meta',
      data: { /* ... */ }
    });
    
    // Complex business logic here
    if (docMetadata.latest_modify_user === currentUser) {
      // Do something specific
    }
  }
}
```

---

## 📊 Comparison Matrix

| Feature | SDK | MCP |
|---------|-----|-----|
| **Type Safety** | ✅ Full TypeScript | ⚠️ JSON schema only |
| **Code Control** | ✅ Full | ❌ Determined by LLM |
| **Error Handling** | ✅ Try-catch | ⚠️ LLM tries to handle |
| **Complex Logic** | ✅ Easy | ❌ Difficult |
| **Learning Curve** | ⚠️ Moderate | ✅ Minimal |
| **Autonomous Agents** | ❌ No | ✅ Yes |
| **Installation** | `npm install` | `npm install -g` + config |
| **API Availability** | ~100 APIs exposed | ~200+ APIs in MCP |
| **Token Efficiency** | N/A | ✅ Good (tools on-demand) |
| **Direct File Upload** | ✅ Supported | ❌ Not supported |
| **Document Editing** | ✅ Supported | ⚠️ Read-only |

---

## 🏗️ Architecture Comparison

### **SDK-Only Approach** (Current)
```
User Message
    ↓
Bot Handler (lib/handle-messages.ts)
    ↓
Manager Agent
    ↓
Specialist Agent (OKR, P&L, Doc Tracking)
    ↓
Node SDK Client
    ↓
Feishu API
    ↓
Response
```

**You control every decision point**

### **MCP-Only Approach**
```
User Message
    ↓
MCP Agent (Claude/GPT)
    ↓
MCP Tool (im.v1.message.create, sheet.spreadsheet.values, etc)
    ↓
Feishu API
    ↓
Response
```

**LLM makes decisions autonomously**

### **Hybrid Approach** (Recommended)
```
User Message
    ↓
Manager Agent (decides routing)
    ↓
┌─────────────────────────────────────┐
│ Simple task?                        │
│ (e.g., "send message to group")    │
│ YES → Use MCP (autonomous)          │
│ NO  → Use SDK (explicit control)    │
└─────────────────────────────────────┘
    ↓
Either:
  - MCP Agent + MCP Tool
  - OR SDK Client
    ↓
Feishu API
```

---

## 💡 When to Use Each

### **Use SDK When**:
- ✅ Complex business logic needed
- ✅ Need full type safety
- ✅ File upload/download required
- ✅ Direct document editing needed
- ✅ Precise control is critical
- ✅ Error handling must be explicit

### **Use MCP When**:
- ✅ Simple, autonomous actions
- ✅ User just wants to "ask the agent"
- ✅ Reducing token/cost is important
- ✅ Integrating with Claude/GPT/Anthropic
- ✅ Multiple AI tools need same interface
- ✅ Minimal configuration desired

### **Use Both When** (Recommended):
- ✅ Your project has mixed requirements
- ✅ Some workflows are simple (use MCP)
- ✅ Some workflows are complex (use SDK)
- ✅ Want flexibility and control

---

## 🔌 Integration Points in Your Code

### **Current Setup** (SDK Only)
```
server.ts
├── EventDispatcher (MCP protocol not involved)
├── Manager Agent
│   ├── OKR Agent (uses SDK)
│   ├── P&L Agent (uses SDK)
│   └── Doc Tracking Agent (uses SDK)
└── lib/
    ├── feishu-utils.ts (SDK client)
    ├── doc-tracker.ts (SDK)
    └── ...
```

### **After Adding MCP**
```
server.ts
├── EventDispatcher (same as before)
├── Manager Agent
│   ├── Simple tasks → MCP Agent (autonomous)
│   ├── Complex tasks → Manager Agent (explicit)
│   │   ├── OKR Agent (uses SDK for complex logic)
│   │   ├── P&L Agent (uses SDK for complex logic)
│   │   └── Doc Tracking Agent (uses SDK)
│   └── MCP Configuration
│       ├── lark-mcp server (stdio)
│       ├── Tool list (im.*, sheet.*, doc.*)
│       └── Token management
└── lib/
    ├── feishu-utils.ts (SDK client)
    ├── mcp-client.ts (NEW - MCP interaction)
    ├── doc-tracker.ts (SDK)
    └── ...
```

---

## 📋 Summary Table

```
┌──────────────────────┬──────────────────────┬──────────────────────┐
│ Aspect               │ Node SDK              │ MCP Tool             │
├──────────────────────┼──────────────────────┼──────────────────────┤
│ What is it?          │ Library              │ Protocol Tool        │
│ Package              │ @larksuiteoapi/      │ @larksuiteoapi/      │
│                      │ node-sdk             │ lark-mcp             │
│ How to use           │ Import & call APIs   │ Config + protocol    │
│ Best for             │ Explicit control     │ Autonomous agents    │
│ Who decides?         │ Your code            │ LLM/AI agent         │
│ Learning curve       │ Moderate             │ Minimal              │
│ Type safety          │ Full                 │ JSON schema          │
│ Error handling       │ You control          │ LLM tries            │
│ Autonomous tasks     │ Not suitable         │ Perfect              │
│ Complex logic        │ Easy                 │ Difficult            │
│ File upload/download │ Yes                  │ No                   │
│ Doc editing          │ Yes                  │ Read-only            │
│ Installation         │ npm install          │ npm install -g       │
└──────────────────────┴──────────────────────┴──────────────────────┘
```

---

## 🎓 Your Project's Best Path

Given your Feishu Assistant architecture:

1. **Keep Node SDK** for:
   - OKR Agent (complex analysis)
   - P&L Analysis (data transformation)
   - Document tracking (polling, state management)

2. **Add MCP for**:
   - Simple message sending
   - Quick sheet reads
   - Button action handlers
   - Meeting coordination

3. **Configuration-driven**:
   - Create `.amp/mcp-config.json` with Feishu app credentials
   - Manager Agent routes based on complexity
   - Simple tasks → MCP, Complex → SDK

This gives you **best of both worlds**: autonomous agents for simple tasks, explicit control for complex business logic.
