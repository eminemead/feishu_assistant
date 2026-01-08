# Routing Logic Documentation

> **⚠️ DEPRECATED (Jan 2026)**: This document describes the old multi-agent routing system.
> The system now uses a **single unified agent** that handles tool selection itself.
> See [agent-architecture.md](./agent-architecture.md) for the current architecture.

---

## Historical Implementation (Deprecated)

The routing logic was previously handled by keyword-based matching and LLM semantic routing:

### 1. **Keyword-Based Matching (`matchOn`)**

Each specialist agent defines keywords/phrases that trigger routing:

```typescript
// OKR Reviewer Agent
matchOn: ["okr", "objective", "key result", "metrics", "manager review", "has_metric", "覆盖率", "指标"]

// P&L Agent  
matchOn: ["pnl", "profit", "loss", "损益", "利润", "亏损"]

// Alignment Agent
matchOn: ["alignment", "对齐", "目标对齐"]

// DPA PM Agent
matchOn: ["dpa", "pm", "product management", "产品管理"]
```

The library performs **case-insensitive keyword matching** against the user's query.

### 2. **Agent Registration (`handoffs`)**

The manager agent registers all specialist agents in the `handoffs` array:

```typescript
handoffs: [okrReviewerAgent, alignmentAgent, pnlAgent, dpaPmAgent]
```

The order matters - agents are checked in this order.

### 3. **LLM-Based Semantic Routing**

If keyword matching doesn't find a clear match, the library uses the LLM to semantically understand the query and route it to the most appropriate agent based on:
- The agent's `instructions` (describes what the agent does)
- The agent's `name` 
- The query's semantic meaning

### 4. **Fallback Behavior**

If no specialist agent matches:
- The manager agent can use its own tools (e.g., `searchWeb`)
- Or provide guidance about available specialists

## Routing Flow

```
User Query
    ↓
Manager Agent receives query
    ↓
Check matchOn patterns (keyword matching)
    ↓
[Match found?] → Yes → Route to specialist agent
    ↓ No
LLM semantic analysis
    ↓
[Match found?] → Yes → Route to specialist agent  
    ↓ No
Use manager's tools (searchWeb) or provide guidance
```

## Current Limitations

1. **Implicit Logic**: Routing happens automatically - hard to debug or control
2. **No Explicit Priority**: All agents checked equally (except order in handoffs array)
3. **No Custom Routing Rules**: Can't add custom logic like "if query contains X AND Y, route to Z"
4. **Limited Visibility**: Hard to see why a query was routed to a specific agent

## Potential Improvements

### Option 1: Enhanced Instructions (Current Approach)

Make the manager agent's instructions more explicit about routing:

```typescript
instructions: `You are a Feishu/Lark AI assistant that routes queries to specialist agents.

ROUTING RULES:
1. If query mentions OKR, objectives, key results, metrics, manager review, has_metric, 覆盖率, or 指标 → Route to OKR Reviewer
2. If query mentions profit, loss, P&L, 损益, 利润, or 亏损 → Route to P&L Agent
3. If query mentions alignment, 对齐, or 目标对齐 → Route to Alignment Agent
4. If query mentions DPA, PM, product management, or 产品管理 → Route to DPA PM Agent
5. Otherwise → Use web search or provide guidance

Available specialists:
- OKR Reviewer: For OKR metrics, manager reviews, has_metric percentage analysis
- Alignment Agent: For alignment tracking (under development)
- P&L Agent: For profit & loss analysis (under development)
- DPA PM Agent: For product management tasks (under development)`
```

### Option 2: Explicit Routing Function

Add a custom routing function before calling the agent:

```typescript
function determineRouting(query: string): string | null {
  const lowerQuery = query.toLowerCase();
  
  // OKR keywords (highest priority)
  const okrKeywords = ["okr", "objective", "key result", "metrics", "manager review", "has_metric", "覆盖率", "指标"];
  if (okrKeywords.some(kw => lowerQuery.includes(kw))) {
    return "okr_reviewer";
  }
  
  // P&L keywords
  const pnlKeywords = ["pnl", "profit", "loss", "损益", "利润", "亏损"];
  if (pnlKeywords.some(kw => lowerQuery.includes(kw))) {
    return "pnl_agent";
  }
  
  // ... etc
  
  return null; // Let LLM decide
}
```

### Option 3: Hybrid Approach

Combine explicit keyword matching with LLM fallback:

```typescript
export async function managerAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void
): Promise<string> {
  const lastMessage = messages[messages.length - 1];
  const query = typeof lastMessage.content === 'string' ? lastMessage.content : '';
  
  // Try explicit routing first
  const explicitRoute = determineRouting(query);
  if (explicitRoute) {
    updateStatus?.(`Routing to ${explicitRoute}...`);
    // Route directly to specialist
  }
  
  // Otherwise, use manager agent with LLM routing
  return await managerAgentInstance.generate({ messages, ... });
}
```

## Recommendations

For v0.1, the current approach is acceptable, but consider:

1. **Improve Instructions**: Make routing rules more explicit in manager agent instructions
2. **Add Logging**: Log routing decisions for debugging
3. **Test Coverage**: Add tests that verify routing for edge cases
4. **Documentation**: Document expected routing behavior for each agent

## Testing Routing

To test if routing works correctly:

1. **Keyword Tests**: Verify queries with exact keywords route correctly
2. **Semantic Tests**: Verify queries without keywords but with semantic meaning route correctly  
3. **Edge Cases**: Test ambiguous queries, queries matching multiple agents, etc.
4. **Fallback Tests**: Verify queries that don't match any agent use web search

