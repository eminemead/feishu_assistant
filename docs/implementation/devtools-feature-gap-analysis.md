# AI SDK Devtools Feature Gap Analysis

## Summary

Your current devtools implementation (`lib/devtools-integration.ts`) is a **custom tracker** that captures agent calls, tool calls, handoffs, errors, and responses. The official `@ai-sdk-tools/devtools` package is a **React-based UI component** with stream interception and real-time event capture capabilities.

**Key difference**: Official devtools automatically intercept AI SDK streams; yours is manually instrumented.

---

## Features You're NOT Using

### 1. **Stream Interception (StreamInterceptor)**
- **What**: Automatically captures events from Vercel AI SDK streams without manual instrumentation
- **How**: Patches fetch calls to intercept Server-Sent Events (SSE)
- **You currently**: Manually call `devtoolsTracker.trackToolCall()`, `trackResponse()`, etc.
- **Benefit**: Zero-instrumentation monitoring—works even if you forget to add tracking calls

```typescript
// Official devtools - automatic
const interceptor = new StreamInterceptor({
  onEvent: (event) => console.log(event),
  endpoints: ['/api/chat'], // auto-capture from these endpoints
  enabled: true
});
interceptor.patch();

// Your current approach - manual
devtoolsTracker.trackToolCall(toolName, params, startTime);
```

### 2. **Real-Time React Component (AIDevtools)**
- **What**: Drop-in React component that renders a full devtools UI
- **Features**:
  - Positioned panel (bottom, right, overlay)
  - Event filtering by type, tool name, search
  - Performance metrics (tokens/sec, response times)
  - Theme support (light/dark/auto)
  - Configurable maxEvents, throttling
- **You currently**: Custom HTML page at `/devtools` with manual fetch polling
- **Benefit**: Professional UI with filtering, visualization, state inspection

### 3. **Advanced Event Types**
Your tracker supports: `agent_call`, `tool_call`, `agent_handoff`, `error`, `response`

Official devtools supports **24+ event types**:
- `tool-call-start`, `tool-call-result`, `tool-call-error`
- `message-start`, `message-chunk`, `message-complete`
- `text-start`, `text-delta`, `text-end`
- `reasoning-start`, `reasoning-delta`, `reasoning-end` (for reasoning models)
- `agent-start`, `agent-step`, `agent-finish`, `agent-handoff`, `agent-complete`, `agent-error`
- `finish-step`, `finish`, `stream-done`
- `custom-data`, `unknown`

### 4. **Agent Flow Visualization**
- **What**: Visual graph showing agent nodes, tool calls, and handoffs with routing strategy
- **Data**: AgentNode, AgentHandoff, ToolNode with metadata
- **Metadata includes**:
  - `routingStrategy` ("programmatic" | "llm")
  - `matchScore` for LLM routing
  - `round` and `totalRounds` for multi-round execution
  - `model` used for each agent
- **You**: Only track agent-to-agent handoffs, no flow visualization

### 5. **Tool Call Session Grouping**
- **What**: Automatically groups related events into sessions
- ```typescript
  interface ToolCallSession {
    id: string;
    toolName: string;
    status: "running" | "completed" | "error";
    startTime: number;
    endTime?: number;
    duration?: number;
    startEvent: AIEvent;
    endEvent?: AIEvent;
  }
  ```
- **Provides**: `groupEventsIntoSessions()` utility that pairs start/result events
- **You**: Store flat list of events, no session grouping

### 6. **Event Filtering & Querying**
```typescript
interface UseAIDevtoolsReturn {
  filterEvents(filterTypes?: AIEventType[], searchQuery?: string, toolNames?: string[]): AIEvent[];
  getUniqueToolNames(): string[];
  getEventStats(): {
    byType: Record<AIEventType, number>;
    byTool: Record<string, number>;
    timeRange: { start: number; end: number };
  };
}
```
- **You**: Have `getEventsByType()` and `getEventsByAgent()`, but no search or stats

### 7. **Language Model Usage Tracking**
```typescript
interface AIEvent {
  data: any & {
    usage: LanguageModelUsage; // input_tokens, output_tokens, total_tokens
  };
}
```
- **You**: Don't track token usage per event
- **Official**: Built-in token accounting per event for cost analysis

### 8. **State Management Integration**
```typescript
useCurrentState(): {
  isStoreAvailable: boolean;
  availableStoreIds: string[];
  currentStates: Record<string, unknown>;
}
```
- **What**: Integrates with `@ai-sdk-tools/store` (Zustand-based state management)
- **UI**: StateDataExplorer component to inspect store state in devtools
- **You**: No state management integration

### 9. **Configurable Throttling**
```typescript
throttle?: {
  enabled: boolean;
  interval: number; // ms between event batches
  excludeTypes?: AIEventType[];
  includeTypes?: AIEventType[];
}
```
- **Why**: Prevents devtools UI from lagging with high-frequency events
- **You**: No throttling; stores all events up to maxEvents

### 10. **Stream Capture Configuration**
```typescript
streamCapture?: {
  enabled: boolean;
  endpoint: string;  // where to capture from
  autoConnect: boolean; // auto-setup on init
}
```
- **You**: Hardcoded endpoint polling in HTML

---

## What You ALREADY Have That's Good

✅ **Custom tracking wrapper** (`trackToolCall()`, `withDevtoolsTracking()`)  
✅ **Event history with max size limit**  
✅ **Per-agent event filtering** (`getEventsByAgent()`)  
✅ **Error tracking with stack traces**  
✅ **Basic statistics** (`getStats()`)  

---

## Migration Strategy: Quick Wins

### Option A: Keep Custom Tracker + Add Official UI (Hybrid)
**Effort**: Low | **Benefit**: Good | **Time**: 2-3 hours

1. Keep your `devtools-integration.ts` as-is (it works)
2. Add `@ai-sdk-tools/devtools` React component as frontend
3. Create adapter to convert your `DevtoolsEvent` to `AIEvent` format
4. Pros: Minimal code changes, get professional UI
5. Cons: Duplicate tracking logic

### Option B: Migrate to Official Devtools (Full)
**Effort**: Medium | **Benefit**: Best | **Time**: 4-6 hours

1. Remove custom tracking calls from tools/agents
2. Use `StreamInterceptor` to auto-capture from agent endpoints
3. Add `useAIDevtools()` hook and `<AIDevtools />` component
4. Implement metadata enrichment (routing strategy, agent name)
5. Pros: Zero-instrumentation, best features, official support
6. Cons: More refactoring needed

### Option C: Augment Current (Minimal)
**Effort**: Very Low | **Benefit**: Incremental | **Time**: 1 hour

1. Add token usage tracking to your events
2. Add event search/filtering
3. Add throttling to prevent UI lag
4. Update HTML devtools page with better UI

---

## Recommended: Hybrid Approach

Since you have a **server-side backend** (Hono) and not a React frontend, I'd recommend:

```typescript
// Keep your tracker but extend it
export interface AIEvent {
  // ... your existing fields
  usage?: LanguageModelUsage; // add token tracking
  metadata?: {
    toolName?: string;
    agent?: string;
    duration?: number;
    routingStrategy?: "programmatic" | "llm";
    model?: string;
  };
}

// Use StreamInterceptor for auto-capture
import { StreamInterceptor } from '@ai-sdk-tools/devtools';

const interceptor = new StreamInterceptor({
  onEvent: (event) => devtoolsTracker.addEvent(event),
  endpoints: ['/api/agent', '/api/chat'], // your endpoints
  enabled: process.env.ENABLE_DEVTOOLS === 'true'
});

// For the UI, either:
// A) Use official React devtools in a separate dev dashboard
// B) Keep your HTML page but upgrade styling/filtering
```

---

## Missing Event Types for You to Capture

Based on official devtools, add these to your `DevtoolsEvent['type']`:

```typescript
type DevtoolsEvent['type'] = 
  | 'agent_call'        // existing
  | 'tool_call'         // existing
  | 'agent_handoff'     // existing
  | 'error'             // existing
  | 'response'          // existing
  | 'tool-call-start'   // NEW - before tool executes
  | 'tool-call-result'  // NEW - successful tool result
  | 'tool-call-error'   // NEW - tool failed
  | 'message-start'     // NEW - model message streaming started
  | 'message-chunk'     // NEW - received text chunk
  | 'message-complete'  // NEW - message fully streamed
  | 'text-start'        // NEW - if using streamText
  | 'text-delta'        // NEW - text chunk
  | 'text-end'          // NEW - text complete
  | 'finish'            // NEW - stream finished
  | 'custom-data';      // NEW - custom app events
```

---

## Code Example: Adding Token Tracking to Your Current Tracker

```typescript
// lib/devtools-integration.ts

import { LanguageModelUsage } from 'ai';

export interface DevtoolsEvent {
  id: string;
  timestamp: number;
  type: 'agent_call' | 'tool_call' | 'agent_handoff' | 'error' | 'response';
  agent?: string;
  tool?: string;
  data?: any;
  duration?: number;
  error?: string;
  usage?: LanguageModelUsage; // ADD THIS
  metadata?: {
    agent?: string;
    model?: string;
    routingStrategy?: "programmatic" | "llm";
    toolName?: string;
  };
}

trackResponse(agent: string, response: string, duration: number, metadata?: any) {
  if (!this.isEnabled) return;
  
  this.addEvent({
    id: this.generateId(),
    timestamp: Date.now(),
    type: 'response',
    agent,
    data: { 
      responseLength: response.length,
      ...metadata 
    },
    duration,
    usage: metadata?.usage, // capture token counts
    metadata: {
      agent,
      model: metadata?.model,
    },
  });
}
```

---

## Next Steps

1. **Read**: Official devtools README more thoroughly
2. **Decide**: Hybrid vs Full migration
3. **Prototype**: Try StreamInterceptor with one agent endpoint
4. **Measure**: Compare event capture before/after
5. **Document**: Update AGENTS.md with new devtools approach

