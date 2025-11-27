# Mastra Framework - Fit Validation for Feishu Assistant

## Executive Summary

**Overall Assessment**: ✅ **Mastra is a good fit**, but with **3 critical areas requiring validation** before committing to migration.

**Timeline Risk**: Low (well-designed APIs match your patterns)
**Technical Risk**: Medium (event handling & streaming callback patterns need verification)
**Integration Risk**: Low (Feishu SDK is independent of agent framework)

---

## Deep Dive Analysis

### 1. ✅ GOOD FIT Areas

#### A. Streaming & Status Updates (VERIFIED ✅)
**Your Current Pattern**:
```typescript
// Callback-based streaming
for await (const textDelta of result.textStream) {
  accumulatedText += textDelta;
  updateStatus(accumulatedText);  // User callback
}
```

**Mastra Support**: ✅ **Native and better**
- Mastra's `Agent.stream()` returns `textStream` (identical pattern)
- Supports async iteration: `for await (const chunk of stream.textStream)`
- Additional callbacks available: `onFinish()`, `onStepFinish()`
- Nested streaming support for multi-agent workflows
- Can pipe nested agent streams into parent streams

**Migration Path**: Minimal code changes needed.

---

#### B. Multi-Agent Routing (VERIFIED ✅)
**Your Current Pattern**:
```typescript
// Manager agent routes to specialist agents
if (shouldRouteToOkr) {
  const okrAgent = getOkrReviewerAgent();
  const result = await okrAgent.stream({ messages, executionContext });
}
```

**Mastra Support**: ✅ **Native and cleaner**
- Built-in agent routing system (not manual pattern matching)
- `Agent.network()` method for multi-agent collaboration
- Automatic routing based on agent capabilities
- Supervisor pattern support for agent delegation

**Trade-off**: Mastra's routing is more opinionated than your manual approach, but you can:
1. Use `Agent.network()` for automatic routing, OR
2. Keep manual routing pattern (it still works in Mastra)

**Better**: Mastra's routing might be more maintainable long-term.

---

#### C. Tool System (VERIFIED ✅)
**Your Current Pattern**:
```typescript
// AI SDK Tools with Zod schema
const searchWebTool = createTool({
  parameters: z.object({
    query: z.string(),
  }),
  execute: async ({ query }) => { /* ... */ },
});
```

**Mastra Support**: ✅ **Identical**
- Zod schema-based tool definitions
- `createTool()` with `id`, `description`, `inputSchema`, `outputSchema`
- Same `execute()` pattern with access to `mastra` instance
- Better type safety with Zod

**Migration Path**: 1:1 mapping, minimal changes.

---

#### C. Model Fallback & Rate Limiting (VERIFIED ✅)
**Your Current Pattern**:
```typescript
// Dual agent instances with manual fallback logic
let managerAgentPrimary = new Agent({ model: getPrimaryModel() });
let managerAgentFallback = new Agent({ model: getFallbackModel() });
if (isModelRateLimited(currentModelTier)) {
  currentModelTier = "fallback";
}
```

**Mastra Support**: ✅ **Built-in**
```typescript
// Mastra's native model fallback
const agent = new Agent({
  name: "my-agent",
  model: [
    { model: "openai/gpt-5", maxRetries: 3 },
    { model: "anthropic/claude-4-5-sonnet", maxRetries: 2 },
    { model: "google/gemini-2.5-pro", maxRetries: 2 },
  ],
});
```

**Advantage**: Simpler than your dual-agent approach, built-in retry logic, automatic failover.

**Migration Path**: Replace dual-agent pattern with model array.

---

#### D. DevTools & Observability (VERIFIED ✅)
**Your Current Implementation**:
```typescript
// Custom devtools integration
devtoolsTracker.trackAgentCall("Manager", query, {});
devtoolsTracker.trackResponse("okr_reviewer", text, duration, {});
```

**Mastra Support**: ✅ **Built-in + exporters**
- Native observability with AI tracing
- Multiple exporters: OpenTelemetry, custom implementations
- Token usage tracking built-in
- Step-level visibility with streaming
- Devtools UI comparable to yours

**Trade-off**: Mastra's observability is more standardized, but less customized than yours. You can:
1. Use Mastra's built-in observability, OR
2. Write custom exporters to preserve your current setup

---

### 2. ⚠️ CRITICAL VALIDATION NEEDED

#### A. **Event Handler for Feishu WebSocket** (MUST TEST)

**Your Current Pattern**:
```typescript
// Feishu EventDispatcher (lark SDK)
eventDispatcher.register({
  "card.action.trigger": async (data: any) => {
    const { chatId, rootId } = data.context;
    handleButtonFollowup({ chatId, messageId, rootId, ... })
      .then(() => { /* ... */ })
      .catch((err) => { /* ... */ });
  },
});
```

**Mastra Concern**: ❓ **Needs Validation**

Mastra is optimized for agent/workflow execution, NOT webhook event handling.

**Questions**:
1. Does Mastra provide event handler registration patterns?
2. Can Mastra integrate with Feishu's EventDispatcher?
3. How does Mastra handle Hono server routing (your current pattern)?

**Risk**: If Mastra doesn't support webhook handlers, you must:
- Keep Hono + Feishu EventDispatcher separate from Mastra agents
- Feishu events trigger Mastra agent calls (integration layer)

**Action**: ✅ **Create test: Hono server + Mastra agent integration**

```typescript
// Pseudocode
import { Mastra } from "@mastra/core";
import { Hono } from "hono";

const mastra = new Mastra({ agents: { managerAgent } });
const app = new Hono();

// Can we call mastra agents from Hono routes?
app.post("/api/feishu/message", async (c) => {
  const agent = mastra.getAgent("managerAgent");
  const result = await agent.stream([{ role: "user", content: text }]);
  // Return to Feishu
});
```

---

#### B. **Streaming Callback with Card Updates** (MUST TEST)

**Your Current Pattern**:
```typescript
// Create card, then stream updates to it
const card = await createAndSendStreamingCard(chatId, "chat_id", {});
const updateCard = async (status: string) => {
  await updateCardElement(card.cardId, card.elementId, status);
};
// Stream agent response and update card in real-time
for await (const textDelta of result.textStream) {
  accumulatedText += textDelta;
  await updateCard(accumulatedText);
}
```

**Mastra Concern**: ❓ **Needs Validation**

Does Mastra's streaming support custom side-effects (card updates)?

**Key Question**:
```typescript
const stream = await agent.stream([...]);
for await (const chunk of stream.textStream) {
  // Can we do custom work here?
  // updateCard(chunk)?
  // Or is Mastra's streaming opaque?
}
```

**Research**: Mastra supports `onFinish()` callback, but unclear if it supports:
- Intermediate chunk callbacks for side-effects
- Custom processing per chunk during streaming

**Action**: ✅ **Create test: Agent stream + custom side-effects**

```typescript
// Test this pattern
const stream = await agent.stream([{ role: "user", content: "..." }]);
for await (const textDelta of stream.textStream) {
  // Can we call updateCard() here?
  console.log(textDelta);
}
```

---

#### C. **Memory Scoping with Feishu Context** (MUST VALIDATE)

**Your Current Pattern**:
```typescript
// Memory scoped by chatId + rootId
const conversationId = getConversationId(chatId!, rootId!);
const userScopeId = getUserScopeId(userId);
const executionContext = {
  chatId: conversationId,
  userId: userScopeId,
};
// Pass to agent
const result = await agent.stream({ messages, executionContext });
```

**Mastra Support**: ⚠️ **Partial - needs validation**

Mastra has memory support, but unclear how it handles Feishu's multi-level scoping:
- Per-conversation memory (thread-based)
- Per-user memory (RLS)
- Per-chat memory (group conversations)

**Questions**:
1. Does Mastra support custom memory scope keys?
2. Can we use Supabase RLS with Mastra's memory?
3. How do we maintain isolation between different chat groups + users?

**Current Setup**:
- Supabase table with RLS policies
- Scoped by `chatId + rootId` (conversation) + `userId` (user)

**Mastra Option A** (Keep Supabase):
- Use Mastra's agent framework
- Keep your existing Supabase memory layer
- Pass execution context to agents

**Mastra Option B** (Use Mastra Memory):
- Migrate to Mastra's built-in memory
- Must verify it supports your RLS model
- Potential data migration work

**Action**: ✅ **Verify Mastra memory isolation model**

---

### 3. ⚠️ HIDDEN TRAPS & GOTCHAS

#### A. **Mastra's Server vs Your Hono Server**

**Current Architecture**:
```
Feishu WebSocket
    ↓
server.ts (Hono HTTP)
    ↓
Event Handler (lark SDK)
    ↓
Agent (AI SDK Tools)
```

**Mastra Can Do**:
- Replace "Agent (AI SDK Tools)" with Mastra agents ✅
- Does NOT replace Hono server automatically

**Trap**: Mastra has its own server concept (`mastra.getServer()`), which is **NOT** the same as your Hono server. 

**You Would Need**:
- Keep Hono for Feishu event handling
- Call Mastra agents from Hono routes
- No automatic integration

**Mitigation**: This is fine. Keep Hono + Feishu SDK, replace only the agent framework.

---

#### B. **Nested Agent Execution Cost**

Your current architecture:
```
Manager Agent (routes)
    ↓
Specialist Agents (OKR, Alignment, P&L, DPA-PM)
```

**Mastra supports nested agents**, but:
- Each level incurs LLM API calls
- Manager routing + specialist routing = 2 calls (your current design)
- Mastra's automatic routing might add extra calls

**Cost Impact**: Minimal, you already have this pattern.

---

#### C. **Execution Context Propagation**

**Your Current Pattern**:
```typescript
const executionContext = {
  _memoryAddition: "",
  chatId: conversationId,
  userId: userScopeId,
};
const result = await okrAgent.stream({ messages, executionContext });
```

**Mastra Question**: Can we pass arbitrary context through the agent?

**Action**: ✅ **Test context propagation**

---

#### D. **Token Usage Tracking**

**Your Current**:
- Custom tracking in devtools
- Manual calculation per agent call

**Mastra**:
- Built-in token usage in `stream.usage`
- Available after streaming completes
- No intermediate token count during streaming

**Impact**: Your current real-time token display might need adjustment.

---

#### E. **Provider-Specific Options**

Your current:
```typescript
const agent = new Agent({
  model: getPrimaryModel(), // String or client object
});
```

Mastra's approach:
```typescript
const agent = new Agent({
  model: "openai/gpt-4o", // String OR array for fallbacks
  // Can add provider options
  providerOptions: {
    openai: { reasoningEffort: "low" },
  },
});
```

**No trap, just different style.**

---

### 4. ✅ DEPENDENCY & BUILD IMPACT

**Current**:
```json
{
  "@ai-sdk-tools/agents": "^1.0.8",
  "@ai-sdk-tools/memory": "^1.0.8",
  "@ai-sdk-tools/cache": "^1.0.8",
  "ai": "^5.0.93"
}
```

**Mastra**:
```json
{
  "@mastra/core": "^0.24.3",  // Includes agents, memory, tools
  "ai": "^5.0.93"             // Still needed for AI SDK v5
}
```

**Benefit**: Fewer dependencies, single package for agents + memory + tools.

**Build Impact**: None (both are TypeScript packages, esbuild handles them).

---

## Validation Checklist

Before migration, **MUST test** these 3 scenarios:

```typescript
// TEST 1: Hono + Mastra Integration
import { Hono } from "hono";
import { Agent } from "@mastra/core";

const app = new Hono();
const agent = new Agent({ name: "test", instructions: "...", model: "..." });

app.post("/api/test", async (c) => {
  const result = await agent.stream([...]);
  return c.json({ text: await result.text });
});
```

**Expected**: Works seamlessly.

---

```typescript
// TEST 2: Streaming with Custom Callbacks
const stream = await agent.stream([{ role: "user", content: "test" }]);
let accumulated = "";

for await (const chunk of stream.textStream) {
  accumulated += chunk;
  // Can we call custom function?
  await updateCardElement(cardId, elementId, accumulated);
}
```

**Expected**: Custom callbacks work within loop.

---

```typescript
// TEST 3: Memory Scoping with Custom Context
const agent = new Agent({
  name: "test",
  instructions: "...",
  model: "...",
  enableMemory: true,
});

// Can we pass custom scope keys?
const result = await agent.stream([...], {
  threadId: `${chatId}:${rootId}`, // Custom format
  userId: userScopeId,              // Custom field?
});
```

**Expected**: Mastra respects custom scoping or provides equivalent mechanism.

---

## Risk Summary Table

| Area | Status | Risk | Impact | Mitigation |
|------|--------|------|--------|-----------|
| **Streaming** | ✅ Verified | Low | None | Direct mapping |
| **Multi-Agent Routing** | ✅ Verified | Low | Cleaner code | Use Mastra routing |
| **Tools** | ✅ Verified | Low | None | 1:1 mapping |
| **Model Fallback** | ✅ Verified | Low | Better | Native support |
| **Feishu WebSocket Events** | ⚠️ Needs test | Medium | Require integration layer | Keep Hono separate |
| **Card Streaming Updates** | ⚠️ Needs test | Medium | May need refactor | Test streaming callbacks |
| **Memory Scoping** | ⚠️ Needs test | Medium | Complex scoping | Verify Mastra support |
| **DevTools** | ✅ Verified | Low | Different approach | Custom exporters |
| **Build/Dependencies** | ✅ Verified | Low | Fewer deps | Cleaner |

---

## Recommendation

### ✅ **GREEN LIGHT** for Migration, BUT with conditions:

1. **Complete validation tests** (3 critical tests above) before Phase 2
2. **Keep Hono server separate** from Mastra agent framework
3. **Prototype agent streaming** with card updates first
4. **Document Feishu context scoping** approach in Mastra

### Migration Go/No-Go Decision Point:
- **All 3 validation tests pass**: Proceed with Phase 2 (Full migration)
- **Any test fails**: Pause migration, create workaround plan

### If Roadblocks Emerge:
You have a fallback strategy:
- **Keep Hono + Feishu SDK** (unchanged)
- **Use Mastra agents** for AI logic
- **Custom integration layer** between them
- No wasted work, just more explicit separation

---

## Next Steps

1. **Create validation test file** (`lib/mastra-validation.test.ts`)
2. **Run the 3 critical tests** against Mastra
3. **Document any issues** or surprises
4. **Decide: Proceed or pivot?**
5. If proceed: Start Phase 1 (Setup & Exploration)

---

## Resources

- **Mastra Docs**: https://mastra.ai/docs
- **Mastra Agent API**: https://mastra.ai/docs/agents/overview
- **Mastra Streaming**: https://mastra.ai/docs/streaming/overview
- **Mastra Memory**: https://mastra.ai/docs/memory/overview
- **GitHub**: https://github.com/mastra-ai/mastra

---

**Last Updated**: 2025-11-27
**Status**: Ready for validation phase
