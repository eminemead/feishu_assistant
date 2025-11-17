# AI SDK Devtools Setup

The AI SDK Devtools integration provides real-time monitoring and debugging for your multi-agent system. It tracks agent calls, tool usage, handoffs, and performance metrics during development.

## Overview

The devtools integration works seamlessly with `@ai-sdk-tools/agents` to provide:

- **Real-time monitoring** of agent activity
- **Tool call tracking** with performance metrics
- **Agent handoff tracking** to see routing decisions
- **Error tracking** with detailed context
- **Performance metrics** (response times, token usage)

## Quick Start

### 1. Enable Devtools

Devtools are automatically enabled in development mode (`NODE_ENV=development`). You can also explicitly enable them:

```bash
export ENABLE_DEVTOOLS=true
bun dev
```

### 2. Access Devtools UI

Once the server is running, open your browser to:

```
http://localhost:3000/devtools
```

### 3. View API Data

The devtools API endpoints are available at:

- **Events**: `GET /devtools/api/events`
- **Statistics**: `GET /devtools/api/stats`
- **Clear Events**: `POST /devtools/api/clear`

## 📖 Complete Walkthrough

For a detailed step-by-step guide with examples, see:

👉 **[Devtools Walkthrough](./devtools-walkthrough.md)** - Complete guide with practical examples, API usage, and debugging workflows.

## What's Being Tracked

### Agent Calls

Every time the manager agent processes a query:

```typescript
devtoolsTracker.trackAgentCall("Manager", query);
```

Tracks:
- Agent name
- Query text
- Timestamp

### Tool Calls

All tool executions are tracked with performance metrics:

```typescript
trackToolCall("searchWeb", async (params) => {
  // Tool execution
});
```

Tracks:
- Tool name
- Parameters
- Duration
- Success/failure

### Agent Handoffs

When the manager routes to a specialist agent:

```typescript
devtoolsTracker.trackAgentHandoff("Manager", "okr_reviewer", reason);
```

Tracks:
- Source agent
- Target agent
- Routing reason

### Errors

All errors are tracked with full context:

```typescript
devtoolsTracker.trackError("Manager", error, { query, duration });
```

Tracks:
- Agent name
- Error message
- Stack trace
- Context data

### Responses

Response tracking includes performance metrics:

```typescript
devtoolsTracker.trackResponse("Manager", response, duration, metadata);
```

Tracks:
- Agent name
- Response length
- Duration
- Metadata (routed agent, query length, etc.)

## API Usage

### Get Events

```bash
# Get all events
curl http://localhost:3000/devtools/api/events

# Get last 50 events
curl http://localhost:3000/devtools/api/events?limit=50

# Filter by type
curl http://localhost:3000/devtools/api/events?type=tool_call

# Filter by agent
curl http://localhost:3000/devtools/api/events?agent=Manager
```

### Get Statistics

```bash
curl http://localhost:3000/devtools/api/stats
```

Response:
```json
{
  "totalEvents": 150,
  "toolCalls": 45,
  "agentHandoffs": 30,
  "errors": 2,
  "avgToolDuration": 234,
  "lastEventTime": 1234567890
}
```

### Clear Events

```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

## Integration Points

### Manager Agent

The manager agent tracks:
- All incoming queries
- Routing decisions
- Handoffs to specialist agents
- Response generation
- Errors

### Tools

Tools are automatically tracked when wrapped with `trackToolCall`:

```typescript
const searchWebToolExecute = trackToolCall(
  "searchWeb",
  async (params) => {
    // Tool implementation
  }
);
```

Currently tracked tools:
- `searchWeb` (Manager agent)
- `mgr_okr_review` (OKR Reviewer agent)

## Development vs Production

### Development Mode

- Devtools are **enabled by default**
- UI available at `/devtools`
- API endpoints active
- Console logging enabled
- Events stored in memory (last 1000 events)

### Production Mode

- Devtools are **disabled by default**
- No UI or API endpoints
- No performance overhead
- Zero production impact

To enable in production (not recommended):

```bash
export ENABLE_DEVTOOLS=true
```

## Architecture

```
┌─────────────────┐
│  Feishu User    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   server.ts     │
│  (WebSocket)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ manager-agent   │─────▶│ devtools-tracker │
└────────┬────────┘      └──────────────────┘
         │                       │
         ▼                       │
┌─────────────────┐              │
│ Specialist      │              │
│ Agents          │              │
└────────┬────────┘              │
         │                       │
         ▼                       ▼
┌─────────────────┐      ┌──────────────────┐
│  Tools          │      │  /devtools API  │
└─────────────────┘      └──────────────────┘
```

## Event Types

### `agent_call`

Triggered when an agent processes a query.

```json
{
  "id": "1234567890-abc123",
  "timestamp": 1234567890,
  "type": "agent_call",
  "agent": "Manager",
  "data": {
    "query": "查看这个月的OKR设定情况"
  }
}
```

### `tool_call`

Triggered when a tool is executed.

```json
{
  "id": "1234567891-def456",
  "timestamp": 1234567891,
  "type": "tool_call",
  "tool": "searchWeb",
  "data": {
    "params": { "query": "weather" }
  },
  "duration": 234
}
```

### `agent_handoff`

Triggered when routing to a specialist agent.

```json
{
  "id": "1234567892-ghi789",
  "timestamp": 1234567892,
  "type": "agent_handoff",
  "agent": "Manager → okr_reviewer",
  "data": {
    "fromAgent": "Manager",
    "toAgent": "okr_reviewer",
    "reason": "Query: 查看这个月的OKR设定情况..."
  }
}
```

### `error`

Triggered when an error occurs.

```json
{
  "id": "1234567893-jkl012",
  "timestamp": 1234567893,
  "type": "error",
  "agent": "Manager",
  "error": "Database connection failed",
  "data": {
    "stack": "Error: Database...",
    "query": "查看OKR",
    "duration": 5000
  }
}
```

### `response`

Triggered when an agent generates a response.

```json
{
  "id": "1234567894-mno345",
  "timestamp": 1234567894,
  "type": "response",
  "agent": "Manager",
  "data": {
    "responseLength": 250,
    "routedAgent": "okr_reviewer",
    "queryLength": 15
  },
  "duration": 1234
}
```

## Best Practices

### 1. Use in Development Only

Keep devtools disabled in production to avoid:
- Performance overhead
- Memory usage
- Security concerns

### 2. Monitor Key Metrics

Focus on:
- **Tool call duration** - Identify slow tools
- **Error rate** - Catch issues early
- **Handoff accuracy** - Verify routing logic

### 3. Clear Events Regularly

Clear events periodically to avoid memory buildup:

```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

### 4. Filter Events

Use query parameters to filter events:

```bash
# Only tool calls
curl http://localhost:3000/devtools/api/events?type=tool_call

# Only Manager agent
curl http://localhost:3000/devtools/api/events?agent=Manager

# Last 10 events
curl http://localhost:3000/devtools/api/events?limit=10
```

## Troubleshooting

### Devtools Not Showing

1. **Check environment**:
   ```bash
   echo $NODE_ENV
   # Should be "development" or set ENABLE_DEVTOOLS=true
   ```

2. **Check server logs**:
   Look for: `🔧 Devtools available at: http://localhost:3000/devtools`

3. **Check port**:
   Ensure the server is running on the expected port

### No Events Showing

1. **Verify tracking is enabled**:
   Check console logs for `[Devtools]` messages

2. **Check agent integration**:
   Ensure `devtoolsTracker` is imported and used

3. **Test with a query**:
   Send a message to the Feishu bot and check events

### Performance Issues

1. **Limit event history**:
   Events are automatically limited to 1000, but you can reduce:
   ```typescript
   // In devtools-integration.ts
   private maxEvents = 500; // Reduce from 1000
   ```

2. **Disable in production**:
   Ensure `NODE_ENV !== "development"` in production

## Next Steps

1. **Monitor agent performance** during development
2. **Identify slow tools** and optimize them
3. **Track routing accuracy** to improve handoff logic
4. **Debug errors** with full context and stack traces

## Using Devtools for Observability

The devtools can also be used as an **observability tool** for production monitoring! See:

📊 **[Using Devtools as Observability Tool](./devtools-observability.md)** - Complete guide on using devtools for production observability, including persistence, metrics aggregation, and alerting.

## Related Documentation

- [Agent Architecture](./../architecture/agent-architecture.md)
- [Routing Logic](./../architecture/routing-logic.md)
- [DSPyground Setup](./dspyground-setup.md)
- [Devtools Observability](./devtools-observability.md) - Using devtools for production observability

