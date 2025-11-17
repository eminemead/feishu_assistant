# DSPyground vs Production: Understanding the Architecture

## The Key Distinction

**DSPyground** (`dspyground.config.ts`) is a **development/optimization tool** - it's NOT used at runtime in production.

**Production** (`server.ts` + `manager-agent.ts`) is the **actual runtime** that handles Feishu WebSocket events.

---

## How Production Works (Current Flow)

```
Feishu User sends message
    ↓
Feishu SDK (WebSocket) → server.ts
    ↓
WebSocket event: "im.message.receive_v1"
    ↓
handle-app-mention.ts
    ↓
generate-response.ts
    ↓
manager-agent.ts (PRODUCTION AGENT)
    ↓
Uses @ai-sdk-tools/agents library
    ↓
Routes to specialist agents (okr-reviewer, alignment-agent, etc.)
    ↓
Returns response → Feishu card
```

### Production Code Path

1. **`server.ts`** (lines 256-286):
   - Establishes WebSocket connection with Feishu SDK
   - Receives events via `WSClient` (Subscription Mode)
   - Routes `im.message.receive_v1` events to handlers

2. **`handle-app-mention.ts`**:
   - Creates streaming Feishu card
   - Calls `generateResponse()` with user messages

3. **`generate-response.ts`**:
   - Simply calls `managerAgent()` from `manager-agent.ts`

4. **`manager-agent.ts`** (PRODUCTION):
   - Uses `@ai-sdk-tools/agents` Agent class
   - Has hardcoded `instructions` (lines 65-93)
   - Uses `handoffs` array to route to specialist agents
   - This is what actually runs in production!

---

## How DSPyground Works (Development Tool)

```
Developer runs: npx dspyground dev
    ↓
DSPyground UI starts (localhost:3000)
    ↓
Developer tests agent in chat interface
    ↓
Collects samples (positive/negative feedback)
    ↓
Runs optimization (GEPA algorithm)
    ↓
Gets optimized prompt
    ↓
Developer manually copies optimized prompt
    ↓
Pastes into manager-agent.ts instructions
    ↓
Deploys to production
```

### DSPyground Configuration (`dspyground.config.ts`)

- **Purpose**: Configuration for the DSPyground optimization tool
- **When used**: Only when running `npx dspyground dev`
- **What it does**:
  - Defines tools for testing (`searchWeb`, `mgr_okr_review`)
  - Defines system prompt to optimize
  - Configures optimization parameters (models, metrics, etc.)
  - Used by DSPyground UI to test and optimize prompts

- **NOT used in production**: The production code (`manager-agent.ts`) doesn't import or use `dspyground.config.ts`

---

## Why This Separation?

### 1. **Different Runtimes**

- **DSPyground**: Runs as a separate Node.js app (`npx dspyground dev`)
  - Has its own UI (React app)
  - Uses its own AI SDK setup
  - Designed for interactive testing and optimization

- **Production**: Runs as your Feishu bot server (`server.ts`)
  - Handles WebSocket connections
  - Uses `@ai-sdk-tools/agents` library
  - Optimized for real-time message handling

### 2. **Different Purposes**

- **DSPyground**: 
  - ✅ Prompt optimization (GEPA algorithm)
  - ✅ Sample collection and evaluation
  - ✅ Testing different prompt variations
  - ❌ NOT for production monitoring
  - ❌ NOT for handling real Feishu messages

- **Production**:
  - ✅ Handle real Feishu WebSocket events
  - ✅ Route to specialist agents
  - ✅ Stream responses to Feishu cards
  - ❌ NOT for prompt optimization
  - ❌ NOT for sample collection

### 3. **Different Architectures**

**DSPyground** uses:
- Vercel AI SDK (`ai` package) directly
- Its own tool execution system
- Its own prompt optimization engine (GEPA)

**Production** uses:
- `@ai-sdk-tools/agents` library (higher-level abstraction)
- Agent handoff system for routing
- Streaming responses to Feishu cards

---

## The Workflow: How They Work Together

### Step 1: Development (DSPyground)

```bash
# Start DSPyground UI
npx dspyground dev

# In the UI:
# 1. Test queries: "查看这个月的OKR设定情况"
# 2. Collect samples (mark as positive/negative)
# 3. Run optimization
# 4. Get optimized prompt
```

### Step 2: Integration (Manual Copy-Paste)

```typescript
// Copy optimized prompt from DSPyground History tab
// Paste into lib/agents/manager-agent.ts:

export const managerAgentInstance = new Agent({
  name: "Manager",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: `[OPTIMIZED PROMPT FROM DSPYGROUND]`, // ← Paste here
  handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent],
  tools: {
    searchWeb: searchWebTool,
  },
});
```

### Step 3: Production (Deploy)

```bash
# Deploy your server.ts to production
# Production uses manager-agent.ts (with optimized prompt)
# DSPyground config is NOT used at runtime
```

---

## Why Not Use DSPyground Config Directly in Production?

### Technical Reasons:

1. **Different Libraries**:
   - DSPyground uses Vercel AI SDK (`ai` package)
   - Production uses `@ai-sdk-tools/agents` (Agent class)
   - They're incompatible - can't directly import DSPyground config

2. **Different Execution Contexts**:
   - DSPyground runs in its own Node.js process
   - Production runs in your Feishu bot server
   - DSPyground doesn't handle WebSocket connections

3. **Different Tool Systems**:
   - DSPyground has its own tool execution
   - Production uses Agent handoffs to specialist agents
   - Tools are defined differently in each system

### Design Reasons:

1. **Separation of Concerns**:
   - Development tools ≠ Production runtime
   - Optimization ≠ Execution
   - Testing ≠ Real traffic

2. **Performance**:
   - Production needs to be fast and lightweight
   - DSPyground includes optimization overhead
   - Production shouldn't include unused optimization code

3. **Reliability**:
   - Production code should be stable and tested
   - DSPyground is for experimentation
   - You don't want optimization code affecting production

---

## Current State

### ✅ What's Configured:

- **DSPyground config** (`dspyground.config.ts`):
  - Tools: `searchWeb`, `mgr_okr_review`
  - System prompt (matches production)
  - Optimization settings

- **Production code** (`manager-agent.ts`):
  - Uses `@ai-sdk-tools/agents`
  - Has instructions (currently matches DSPyground config)
  - Routes to specialist agents

### ⚠️ The Gap:

- **DSPyground config** is NOT imported by production code
- After optimization, you must **manually copy** the optimized prompt
- No automatic sync between DSPyground and production

---

## Future Improvements (Optional)

If you want tighter integration, you could:

1. **Auto-sync Script**:
   ```typescript
   // scripts/sync-dspyground-prompt.ts
   // Reads optimized prompt from DSPyground data
   // Updates manager-agent.ts automatically
   ```

2. **Shared Prompt File**:
   ```typescript
   // lib/prompts/manager-prompt.ts
   export const MANAGER_PROMPT = `...`;
   
   // Import in both:
   // - dspyground.config.ts
   // - manager-agent.ts
   ```

3. **Build-time Integration**:
   - Generate `manager-agent.ts` from DSPyground output
   - Use a build script to sync prompts

But for now, **manual copy-paste is the intended workflow**.

---

## Summary

| Aspect | DSPyground (`dspyground.config.ts`) | Production (`manager-agent.ts`) |
|--------|-------------------------------------|----------------------------------|
| **Purpose** | Prompt optimization tool | Runtime agent execution |
| **When used** | Development (`npx dspyground dev`) | Production (WebSocket server) |
| **Runtime** | Separate Node.js app | Feishu bot server |
| **Library** | Vercel AI SDK (`ai`) | `@ai-sdk-tools/agents` |
| **Handles** | Testing, optimization | Real Feishu messages |
| **Output** | Optimized prompt | Feishu card responses |
| **Connection** | Manual copy-paste | Direct execution |

**Key Takeaway**: DSPyground is a **development tool** for optimizing prompts. Production uses the **optimized prompt** (manually copied), not the DSPyground config itself.

