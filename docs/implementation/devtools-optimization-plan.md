# Devtools Optimization: Targeted Recommendations for Your Architecture

## Your Codebase Context

**Architecture**: Server-side Node.js (Hono) + multi-agent system  
**Setup**: Feishu webhook → Manager agent → Specialist agents (OKR, Alignment, P&L, DPA) → Tools  
**Streaming**: Dual-stream pattern (textStream + fullStream) with batched updates  
**Observability**: Custom devtools tracker + manual instrumentation  
**State**: Supabase memory provider + conversation history + working memory

---

## Critical Missing Observability Gaps

Based on your codebase analysis, you have **5 major blind spots**:

### 1. **Agent Routing Decisions Are Hard to Debug**
**Problem**: Your Manager agent uses `Agent.stream()` with fullStream to detect handoffs, but:
- You only detect handoff via event inspection (lines 246-258 in manager-agent.ts)
- No visibility into routing scores or LLM decision reasoning
- Can't see why Manager picked OKR vs P&L vs Alignment
- If handoff fails silently, no way to know

**Current code**:
```typescript
// manager-agent.ts:250-257
if (event.type === 'agent-handoff' || event.type === 'handoff' || 
    (event.agent && event.agent !== 'Manager')) {
  routedAgent = event.to || event.agent || event.agentName;
  updateStatus?.(`Routing to ${routedAgent}...`);
  devtoolsTracker.trackAgentHandoff("Manager", routedAgent, ...);
}
```

**Why it's incomplete**: You only log the handoff, not:
- The routing score (if LLM routing was used)
- The instructions that triggered the handoff
- Confidence level
- Alternative agents considered

### 2. **Multi-Step Tool Execution Is Not Grouped**
**Problem**: Your OKR visualization tool does 3 sequential steps:
1. Analyze metrics (DuckDB query)
2. Generate heatmap (PNG rendering)
3. Upload to Feishu (image_key)

Currently each step fires separate events. You can't see:
- Which events belong to the same "tool session"
- Overall tool duration (start → end)
- Where time is spent (analysis vs render vs upload)

**Current code** (okr-visualization-tool.ts):
```typescript
// No session grouping - each artifact.update() is a separate event
artifact.update({ status: 'analyzing' });
artifact.update({ status: 'generating_viz', visualization: { generated: false } });
artifact.update({ status: 'uploading', visualization: { generated: false } });
artifact.update({ status: 'complete', visualization: { image_key: imageKey } });
```

### 3. **Token Usage Not Tracked**
**Problem**: You have `health-monitor.ts` but it doesn't track:
- Tokens per agent call
- Costs (if models charge differently)
- Token % used in context window
- No way to optimize prompts or routing based on usage

Official devtools has `usage: LanguageModelUsage` in every event.

### 4. **Agent Flow Is Invisible**
**Problem**: You have 4 specialist agents but no visualization of:
- Which agents were called and in what order
- How many times each agent was used in a session
- Agent execution timeline
- Handoff reasons/patterns

Your custom tracker logs handoffs but doesn't build a graph.

### 5. **Streaming Is Unoptimized**
**Problem**: You batch updates manually (BATCH_DELAY_MS = 100ms):
```typescript
// manager-agent.ts:279-280
const BATCH_DELAY_MS = 100;
const MIN_CHARS_PER_UPDATE = 10;
```

You don't have:
- Throttling configuration (you hardcode 100ms)
- Metrics on "events per second" (to detect lag)
- Real-time event filtering
- Stream performance tracking

---

## Recommended Prioritized Features to Add

### **TIER 1: Highest ROI (Do First)**

#### 1.1 **StreamInterceptor for Auto-Capture** ⭐⭐⭐
**What**: Automatically capture Agent.stream() events without manual instrumentation  
**Time**: 30 minutes  
**ROI**: Eliminates manual tracking code, catches missed events

```typescript
// lib/devtools-integration.ts
import { StreamInterceptor } from '@ai-sdk-tools/devtools';

const interceptor = new StreamInterceptor({
  onEvent: (event) => {
    // Your event handler
    devtoolsTracker.addEvent(event);
  },
  endpoints: [
    '/api/agent',      // your agent endpoints
    '/api/chat',
    '/api/generate'
  ],
  enabled: process.env.ENABLE_DEVTOOLS === 'true',
  debug: process.env.NODE_ENV === 'development'
});

// Start interceptor on server init
interceptor.patch();
```

**Benefits**:
- Zero instrumentation: Remove all manual `trackToolCall()` calls
- Catches stream events automatically
- Works with any AI SDK tool

**Code to remove**:
```typescript
// DELETE from tools:
const startTime = Date.now();
devtoolsTracker.trackToolCall(toolName, params, startTime);
try {
  const result = await fn(...args);
  return result;
} catch (error) {
  devtoolsTracker.trackError(...);
}

// Interceptor handles this automatically
```

---

#### 1.2 **Token Usage Tracking** ⭐⭐⭐
**What**: Add `usage: LanguageModelUsage` to every event  
**Time**: 15 minutes  
**ROI**: Understand cost/performance tradeoffs, optimize prompts

```typescript
// lib/devtools-integration.ts
import { LanguageModelUsage } from 'ai';

export interface DevtoolsEvent {
  // ... existing fields
  usage?: LanguageModelUsage;  // ADD THIS
  metadata?: {
    agent?: string;
    model?: string;
    costEstimate?: number;      // ADD THIS
  };
}

// In manager-agent.ts, when you have the result:
const result = selectedAgent.stream({ messages, executionContext });

// Capture usage from response
for await (const part of result.fullStream) {
  if (part && part.usage) {
    devtoolsTracker.addEvent({
      type: 'response',
      agent: 'Manager',
      data: { text: accumulatedText },
      usage: part.usage,  // NOW YOU HAVE TOKEN COUNTS
      metadata: {
        model: currentModelTier === 'fallback' ? 'gemini-2.5-flash' : 'kat-coder-pro',
        costEstimate: calculateCost(part.usage, currentModelTier),
      }
    });
  }
}
```

**Benefits**:
- See token costs per call
- Identify expensive agents/routing decisions
- Cost optimization insights

---

#### 1.3 **Session Grouping for Tool Calls** ⭐⭐⭐
**What**: Group start/end events into sessions (OKR viz is perfect example)  
**Time**: 45 minutes  
**ROI**: See multi-step tool execution as one cohesive operation

```typescript
// lib/devtools-integration.ts
import { groupEventsIntoSessions, ToolCallSession } from '@ai-sdk-tools/devtools';

getSessionsForTool(toolName: string): ToolCallSession[] {
  const sessionEvents = this.events.filter(e => 
    e.metadata?.toolName === toolName || e.tool === toolName
  );
  return groupEventsIntoSessions(sessionEvents).sessions;
}

getToolExecutionSummary(toolName: string) {
  const sessions = this.getSessionsForTool(toolName);
  return sessions.map(s => ({
    toolName: s.toolName,
    status: s.status,           // running | completed | error
    duration: s.duration,
    startTime: s.startTime,
    endTime: s.endTime,
    eventCount: s.events.length,
  }));
}
```

**Apply to OKR visualization**:
```typescript
// okr-visualization-tool.ts - wrap steps in session
const sessionId = `okr_viz_${Date.now()}`;

devtoolsTracker.startSession(sessionId, 'mgr_okr_visualization');

try {
  // Step 1: Analyze
  const analysis = await analyzeHasMetricPercentage(period);
  devtoolsTracker.addToSession(sessionId, 'analyze_complete', { analysis });

  // Step 2: Generate
  const imageBuffer = await generateOKRHeatmap(analysis);
  devtoolsTracker.addToSession(sessionId, 'render_complete', { size: imageBuffer.length });

  // Step 3: Upload
  const imageKey = await uploadImageToFeishu(imageBuffer, "card");
  devtoolsTracker.completeSession(sessionId, { imageKey });
} catch (e) {
  devtoolsTracker.failSession(sessionId, e);
}
```

---

### **TIER 2: Important Context (Do Second)**

#### 2.1 **Agent Routing Metadata** ⭐⭐
**What**: Capture routing decision context in handoff events  
**Time**: 1 hour  
**ROI**: Debug why agents are routed (or not routed) to specific specialists

```typescript
// Extend handoff tracking:
devtoolsTracker.trackAgentHandoff(
  "Manager",
  routedAgent,
  {
    reason: `Query: "${query.substring(0, 50)}"`,
    routingStrategy: "llm",  // or "programmatic"
    matchScore: 0.95,        // confidence (0-1)
    alternativesConsidered: [
      { agent: 'Alignment', score: 0.3 },
      { agent: 'P&L', score: 0.2 }
    ],
    instructionsMatched: 'OKR Reviewer: Route queries about OKR, objectives, key results...'
  }
);

// Or if using manager's matchOn patterns:
interface AgentNode {
  agent: string;
  matchedPatterns: string[];
  confidence: number;
}
```

**Benefits**:
- See why Manager routed to OKR vs P&L
- Identify routing errors early
- Understand agent selection patterns

---

#### 2.2 **Advanced Event Filtering** ⭐⭐
**What**: Add search/filtering to your devtools UI  
**Time**: 1.5 hours  
**ROI**: Faster debugging (filter by agent, tool, time range)

```typescript
// lib/devtools-integration.ts
filterEvents(options: {
  agents?: string[];
  tools?: string[];
  types?: string[];
  timeRange?: { start: number; end: number };
  searchQuery?: string;
}): DevtoolsEvent[] {
  return this.events.filter(e => {
    if (options.agents && !options.agents.includes(e.agent || '')) return false;
    if (options.tools && !options.tools.includes(e.tool || '')) return false;
    if (options.types && !options.types.includes(e.type)) return false;
    if (options.timeRange && (e.timestamp < options.timeRange.start || e.timestamp > options.timeRange.end)) return false;
    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      return JSON.stringify(e).toLowerCase().includes(query);
    }
    return true;
  });
}

// Update HTML devtools UI:
// Add filters dropdown for agents, tools, types
// Add timestamp range picker
// Add search box
```

---

#### 2.3 **Stream Performance Metrics** ⭐⭐
**What**: Track streaming speed and detect bottlenecks  
**Time**: 1 hour  
**ROI**: Optimize batch timing, identify slow updates

```typescript
// Track streaming metrics:
interface StreamMetrics {
  tokensPerSecond: number;
  charsPerSecond: number;
  updateFrequency: number;  // events per second
  averageChunkSize: number;
}

trackStreamingMetrics(metrics: StreamMetrics) {
  devtoolsTracker.addEvent({
    type: 'stream_metrics',
    data: metrics,
    metadata: {
      batchDelayMs: 100,  // your BATCH_DELAY_MS
      minCharsPerUpdate: 10
    }
  });
}

// In manager-agent.ts during textStream processing:
let chunkCount = 0;
let totalChars = 0;
const streamStartTime = Date.now();

for await (const chunk of result.textStream) {
  totalChars += chunk.length;
  chunkCount++;
  // ... existing code ...
}

const streamDuration = Date.now() - streamStartTime;
this.trackStreamingMetrics({
  tokensPerSecond: estimateTokens(totalChars) / (streamDuration / 1000),
  charsPerSecond: totalChars / (streamDuration / 1000),
  updateFrequency: chunkCount / (streamDuration / 1000),
  averageChunkSize: totalChars / chunkCount,
});
```

---

### **TIER 3: Nice-to-Have (Do Third)**

#### 3.1 **Agent Flow Visualization** ⭐
**What**: Build graph of agent handoffs and tool calls  
**Time**: 2-3 hours  
**ROI**: Visual debugging of complex agent flows

Use official devtools `AgentFlowVisualization` component:
```typescript
import { AgentFlowVisualization } from '@ai-sdk-tools/devtools';

// In a separate React dashboard or HTML page
<AgentFlowVisualization events={devtoolsTracker.getEvents()} />
```

---

#### 3.2 **Configurable Throttling** ⭐
**What**: Make batch timing configurable in devtools  
**Time**: 30 minutes  
**ROI**: Dynamic optimization of streaming performance

```typescript
interface StreamConfig {
  batchDelayMs: number;
  minCharsPerUpdate: number;
  maxCharsPerUpdate?: number;
  excludeEventTypes?: string[];
}

// Initialize with env vars:
const streamConfig: StreamConfig = {
  batchDelayMs: parseInt(process.env.STREAM_BATCH_DELAY || '100'),
  minCharsPerUpdate: parseInt(process.env.STREAM_MIN_CHARS || '10'),
};

// Apply in manager-agent.ts:
const BATCH_DELAY_MS = streamConfig.batchDelayMs;
const MIN_CHARS_PER_UPDATE = streamConfig.minCharsPerUpdate;
```

---

#### 3.3 **Health Monitor Integration** ⭐
**What**: Connect health-monitor.ts to devtools events  
**Time**: 45 minutes  
**ROI**: System health dashboard

```typescript
// health-monitor.ts should subscribe to devtools events:
devtoolsTracker.onEvent((event) => {
  if (event.type === 'agent_call') {
    healthMonitor.trackAgentCall(event.agent, event.duration, true);
  }
  if (event.type === 'error') {
    healthMonitor.trackError('OTHER', event.error);
  }
});

// Then expose via API:
app.get('/health/metrics', (c) => {
  return c.json(healthMonitor.getMetrics());
});

// Add to devtools UI:
// GET /devtools/api/health → returns health metrics
```

---

## Implementation Roadmap (Recommended)

### **Phase 1: Auto-Capture (Week 1)**
- [ ] Add StreamInterceptor (30 min)
- [ ] Remove manual tracking calls from tools (30 min)
- [ ] Test with one agent endpoint (30 min)
- **Effort**: 1.5 hours | **Benefit**: Auto-capture, less code

### **Phase 2: Tokens & Sessions (Week 1-2)**
- [ ] Add token usage tracking (15 min)
- [ ] Implement session grouping (45 min)
- [ ] Update devtools UI to show sessions (30 min)
- **Effort**: 1.5 hours | **Benefit**: Cost insights, tool execution visibility

### **Phase 3: Routing & Filtering (Week 2-3)**
- [ ] Add routing metadata to handoffs (1 hour)
- [ ] Implement advanced filtering (1.5 hours)
- [ ] Update devtools UI filters (1 hour)
- **Effort**: 3.5 hours | **Benefit**: Debug routing decisions, faster queries

### **Phase 4: Visualization (Week 3-4)**
- [ ] Add stream performance metrics (1 hour)
- [ ] Integrate AgentFlowVisualization component (2-3 hours)
- [ ] Add configurable throttling (30 min)
- **Effort**: 3.5-4 hours | **Benefit**: Visual debugging, optimization

### **Total Time**: ~8-10 hours over 4 weeks | **Team Size**: 1 engineer

---

## Quick Wins: Low-Hanging Fruit

If you have **2 hours this week**, do:

1. **StreamInterceptor** (30 min)
   - Add to `lib/devtools-integration.ts`
   - Remove manual tracking from 1-2 tools
   - See if auto-capture works

2. **Token tracking** (15 min)
   - Update `DevtoolsEvent` interface
   - Add `usage` field to events in manager-agent.ts

3. **Session grouping for OKR viz** (45 min)
   - Wrap OKR visualization steps
   - Test grouping logic

4. **Update AGENTS.md** (15 min)
   - Document new devtools features

---

## Code Changes Summary

### Files to Modify
1. **lib/devtools-integration.ts**
   - Add StreamInterceptor initialization
   - Add token usage field
   - Add session management
   - Add filtering functions

2. **lib/agents/manager-agent.ts**
   - Capture usage from stream results
   - Pass metadata to handoff tracking
   - Update streaming metrics collection

3. **lib/agents/okr-visualization-tool.ts**
   - Wrap steps in sessions
   - Add progress tracking

4. **lib/devtools-page.html**
   - Add filters (agent, tool, time range)
   - Show token costs
   - Display sessions

5. **AGENTS.md**
   - Document devtools features
   - Update startup instructions

### Files to Remove/Simplify
- `trackToolCall()` wrappers in tools (interceptor replaces)
- Manual `devtoolsTracker.trackXxx()` calls (auto-captured)

---

## Why This Matters for Your Use Case

You have a **production Feishu integration** with complex routing. When something goes wrong:

- **Without these features**: "Query to Manager failed. Unknown reason."
- **With StreamInterceptor + routing metadata**: "Query routed to OKR (score 0.95), used 245 tokens, failed at analyze step with timeout"
- **With sessions + visualization**: Visual flow showing Manager → OKR → timeout

This is the difference between 1-hour debugging and 5-minute debugging.

---

## Next Steps

1. Review this doc with your team
2. Prioritize by impact (Tier 1 first)
3. Start with StreamInterceptor POC
4. Integrate one feature at a time
5. Update AGENTS.md after each phase

