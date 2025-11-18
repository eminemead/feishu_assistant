# Devtools Quick Start Guide

## Enable & Run

```bash
# Option 1: Set in .env
ENABLE_DEVTOOLS=true
NODE_ENV=development

# Option 2: Run directly
ENABLE_DEVTOOLS=true NODE_ENV=development bun dist/server.js
```

## Access Dashboard

Open your browser to:
```
http://localhost:3000/devtools
```

---

## What You'll See

### 1. Real-Time Events List
Each event shows:
- **Event Type**: agent_call, tool_call, response, error, etc.
- **Agent/Tool**: Which component triggered it
- **Timestamp**: When it happened
- **Token Usage**: 📊 Input/Output/Total tokens (if applicable)
- **Duration**: How long it took

### 2. Filtering Panel
- **Type Filter**: Choose event type(s)
- **Agent Filter**: Choose agent (Manager, OKR Reviewer, etc.)
- **Tool Filter**: Choose tool (mgr_okr_review, searchWeb, etc.)
- **Search**: Full-text search across all events
- **Clear Buttons**: Reset filters or clear all events

### 3. Stats Dashboard
Shows in real-time:
- **Total Events**: How many events captured
- **Total Tokens**: Cumulative token usage
- **Est. Cost**: Estimated cost based on model pricing
- **Errors**: Count of errors

### 4. Event Details Panel
Click any event to see:
- **Full metadata**: Agent, type, timestamp, duration
- **Token breakdown**: Input, output, total (if captured)
- **Cost estimation**: Per-event cost estimate
- **Routing info**: Strategy (LLM/programmatic), match score
- **Model info**: Which model was used
- **Full data**: JSON of all event data

---

## Using API Endpoints Directly

### Get Events with Filters
```bash
# Last 50 events
curl http://localhost:3000/devtools/api/events?limit=50

# All Manager agent events
curl http://localhost:3000/devtools/api/events?agent=Manager

# All tool_call events
curl http://localhost:3000/devtools/api/events?type=tool_call

# Search for "OKR"
curl http://localhost:3000/devtools/api/events?search=OKR

# Combine filters
curl http://localhost:3000/devtools/api/events?agent=Manager&type=response
```

### Get Tool Sessions
```bash
# All sessions
curl http://localhost:3000/devtools/api/sessions

# OKR visualization sessions only
curl http://localhost:3000/devtools/api/sessions?tool=mgr_okr_visualization
```

### Get Statistics
```bash
curl http://localhost:3000/devtools/api/stats
```

### Clear Events
```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

---

## Understanding the Data

### Event Types
- **agent_call**: Agent started processing a query
- **tool_call**: Tool was invoked
- **tool_session_start**: Multi-step tool session started
- **tool_session_complete**: Multi-step tool session finished
- **agent_handoff**: Agent routed to another agent
- **response**: Final response from agent
- **stream_metrics**: Streaming performance metrics
- **error**: An error occurred
- **custom**: Custom application event

### Token Usage
- **Input Tokens**: Tokens in your prompt
- **Output Tokens**: Tokens in the response
- **Total Tokens**: Sum of input + output
- **Cost**: Estimated cost based on model pricing

### Sessions
Multi-step tools like OKR visualization create sessions:
- **analyze** → **generate_viz** → **upload**

Each step is tracked with timing and duration.

### Routing Metadata
When a handoff occurs, you can see:
- **routingStrategy**: "llm" or "programmatic"
- **matchScore**: 0-1 confidence (0.95 = 95% confident)
- **alternativesConsidered**: Other agents & their scores

---

## Example Workflows

### Debug Why OKR Reviewer Was Called
1. Open dashboard
2. Filter by `agent=Manager` and `type=agent_handoff`
3. Click the handoff event
4. See routing metadata with score and alternatives

### Check Tool Performance
1. Open dashboard
2. Filter by `tool=mgr_okr_visualization`
3. Look for `tool_session_start` events
4. See duration of each step (analyze, render, upload)
5. Identify bottleneck

### Analyze Token Usage
1. Filter by `agent=Manager` and `type=response`
2. Check "Total Tokens" in stats
3. View individual event token counts
4. See estimated costs

### Find Errors
1. Filter by `type=error`
2. Click error event
3. See full error message and context
4. Copy error for debugging

---

## Troubleshooting

### Devtools Not Showing Events?
```bash
# Check if devtools is enabled
curl http://localhost:3000/devtools/api/stats

# If you get 404, enable it:
export ENABLE_DEVTOOLS=true
# Then restart server
```

### Events Not Appearing in Real-Time?
- Dashboard auto-refreshes every 1 second
- Check network tab (F12 → Network) to see API calls
- Try refreshing the page manually

### Too Many Events?
- Use filters to narrow down
- Clear old events: Click "Clear Events" button
- Limit results: Use `?limit=50` in API

### Cost Estimation Wrong?
- Pricing is estimated for default models
- Update pricing in `lib/devtools-integration.ts` → `calculateCost()`
- Cost shown is per-event, check stats for total

---

## Production Considerations

### For Development
✅ Enable devtools (uses memory, disk)  
✅ Full event history (up to 1000 events)  
✅ Real-time UI updates  

### For Production
❌ Disable devtools (set `ENABLE_DEVTOOLS=false`)  
- Zero overhead when disabled
- UI not served
- No events tracked
- No memory usage

---

## API Response Examples

### /devtools/api/events
```json
{
  "events": [
    {
      "id": "1731902345123-abc123",
      "timestamp": 1731902345123,
      "type": "response",
      "agent": "Manager",
      "data": { "text": "...", "responseLength": 1024 },
      "duration": 2543,
      "usage": {
        "promptTokens": 250,
        "completionTokens": 125,
        "totalTokens": 375
      },
      "metadata": {
        "agent": "Manager",
        "model": "kat-coder-pro",
        "costEstimate": 0.00012
      }
    }
  ]
}
```

### /devtools/api/sessions
```json
{
  "sessions": [
    {
      "id": "session_1731902345123_abc123",
      "toolName": "mgr_okr_visualization",
      "startTime": 1731902345123,
      "endTime": 1731902347123,
      "duration": 2000,
      "status": "completed",
      "events": [...]
    }
  ]
}
```

### /devtools/api/stats
```json
{
  "totalEvents": 42,
  "toolCalls": 8,
  "agentHandoffs": 5,
  "errors": 0,
  "avgToolDuration": 523,
  "uniqueAgents": ["Manager", "OKR Reviewer"],
  "uniqueTools": ["mgr_okr_review", "searchWeb"],
  "eventStats": {
    "byType": { "response": 10, "agent_call": 5, ... },
    "byAgent": { "Manager": 15, "OKR Reviewer": 10 },
    "byTool": { "mgr_okr_review": 8, "searchWeb": 3 },
    "timeRange": { "start": 1731902345123, "end": 1731902365123 }
  }
}
```

---

## Tips & Tricks

1. **Use Browser DevTools**: F12 → Network tab shows all API calls
2. **Export Data**: Copy JSON from stats endpoint to analyze offline
3. **Real-time Monitoring**: Keep dashboard open during testing
4. **Find Slow Operations**: Sort by duration in events list
5. **Cost Analysis**: Total cost in stats × number of users = daily cost estimate

---

## Next Steps

- **Phase 2**: Add routing metadata (match scores, alternatives)
- **Phase 3**: Add flow visualization (graph of agent handoffs)
- **Phase 4**: Add performance benchmarks and alerts

For more details, see:
- `/docs/implementation/phase1-devtools-execution-complete.md` - What was implemented
- `/docs/implementation/devtools-optimization-plan.md` - Full feature roadmap
- `/AGENTS.md` - Architecture overview

