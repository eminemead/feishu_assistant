# Devtools Walkthrough: Step-by-Step Guide

This guide walks you through using the AI SDK Devtools to monitor and debug your agent system.

## Prerequisites

- Server running in development mode (or `ENABLE_DEVTOOLS=true`)
- Access to the server (localhost or remote)
- Terminal/command line access
- Optional: Browser for UI access

---

## Step 1: Start Your Server

Start your Feishu assistant server:

```bash
# Development mode (devtools enabled by default)
bun dev

# Or explicitly enable devtools
export ENABLE_DEVTOOLS=true
bun dev
```

You should see:
```
🔧 AI SDK Devtools: Enabled
🔧 Devtools available at: http://localhost:3000/devtools
🔧 Devtools API: http://localhost:3000/devtools/api/events
Server is running on port 3000
```

---

## Step 2: Access the Devtools UI

Open your browser and navigate to:

```
http://localhost:3000/devtools
```

You'll see:
- **Status**: Connected indicator
- **Server URL**: Shows the server address
- **Monitoring Info**: What's being tracked

> **Note**: The current UI is a placeholder. The real power is in the API endpoints!

---

## Step 3: Generate Some Activity

To see devtools in action, you need to trigger some agent activity. Send a message to your Feishu bot:

### Example Queries to Test:

1. **OKR Query** (routes to OKR Reviewer):
   ```
   "查看这个月的OKR设定情况"
   ```

2. **General Query** (uses web search):
   ```
   "今天天气怎么样？"
   ```

3. **Another OKR Query**:
   ```
   "指标覆盖率是多少？"
   ```

Each query will generate multiple events:
- `agent_call` - Manager agent receives query
- `agent_handoff` - Routes to specialist (if applicable)
- `tool_call` - Tool execution (searchWeb, mgr_okr_review, etc.)
- `response` - Final response generated
- `error` - Any errors (if they occur)

---

## Step 4: View Events via API

### Get All Events

```bash
curl http://localhost:3000/devtools/api/events
```

**Response:**
```json
{
  "events": [
    {
      "id": "1234567890-abc123",
      "timestamp": 1234567890,
      "type": "agent_call",
      "agent": "Manager",
      "data": {
        "query": "查看这个月的OKR设定情况"
      }
    },
    {
      "id": "1234567891-def456",
      "timestamp": 1234567891,
      "type": "agent_handoff",
      "agent": "Manager → okr_reviewer",
      "data": {
        "fromAgent": "Manager",
        "toAgent": "okr_reviewer",
        "reason": "Query: 查看这个月的OKR设定情况..."
      }
    },
    {
      "id": "1234567892-ghi789",
      "timestamp": 1234567892,
      "type": "tool_call",
      "tool": "mgr_okr_review",
      "data": {
        "params": [{ "period": "12 月" }]
      },
      "duration": 234
    },
    {
      "id": "1234567893-jkl012",
      "timestamp": 1234567893,
      "type": "response",
      "agent": "Manager",
      "data": {
        "responseLength": 250,
        "routedAgent": "okr_reviewer",
        "queryLength": 15
      },
      "duration": 1234
    }
  ]
}
```

### Get Last 10 Events

```bash
curl "http://localhost:3000/devtools/api/events?limit=10"
```

### Filter by Event Type

**Get only tool calls:**
```bash
curl "http://localhost:3000/devtools/api/events?type=tool_call"
```

**Get only errors:**
```bash
curl "http://localhost:3000/devtools/api/events?type=error"
```

**Get only agent handoffs:**
```bash
curl "http://localhost:3000/devtools/api/events?type=agent_handoff"
```

### Filter by Agent

**Get all Manager agent events:**
```bash
curl "http://localhost:3000/devtools/api/events?agent=Manager"
```

**Get all OKR Reviewer events:**
```bash
curl "http://localhost:3000/devtools/api/events?agent=okr_reviewer"
```

### Combine Filters

**Get last 5 tool calls:**
```bash
curl "http://localhost:3000/devtools/api/events?type=tool_call&limit=5"
```

---

## Step 5: View Statistics

Get overall statistics:

```bash
curl http://localhost:3000/devtools/api/stats
```

**Response:**
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

**What to look for:**
- **totalEvents**: Total number of events tracked
- **toolCalls**: Number of tool executions
- **agentHandoffs**: Number of routing decisions
- **errors**: Number of errors (should be 0 in healthy system)
- **avgToolDuration**: Average tool execution time in milliseconds
- **lastEventTime**: Timestamp of most recent event

---

## Step 6: Monitor in Real-Time

### Watch Events Live (Terminal)

Use `watch` command to poll the API:

```bash
# Watch all events (updates every 2 seconds)
watch -n 2 'curl -s http://localhost:3000/devtools/api/events | jq ".events | length"'

# Watch statistics
watch -n 2 'curl -s http://localhost:3000/devtools/api/stats | jq'
```

### Monitor Specific Event Types

```bash
# Watch for errors
watch -n 2 'curl -s "http://localhost:3000/devtools/api/events?type=error" | jq ".events | length"'

# Watch tool calls
watch -n 2 'curl -s "http://localhost:3000/devtools/api/events?type=tool_call" | jq ".events | length"'
```

---

## Step 7: Clear Events

Clear all tracked events:

```bash
curl -X POST http://localhost:3000/devtools/api/clear
```

**Response:**
```json
{
  "success": true
}
```

> **Use case**: Clear events periodically to avoid memory buildup, or start fresh for a new testing session.

---

## Step 8: Check Server Console Logs

The devtools also log to the server console. Watch your server terminal for:

```
[Devtools] agent_call: { agent: 'Manager', tool: undefined, duration: undefined, error: undefined }
[Devtools] agent_handoff: { agent: 'Manager → okr_reviewer', tool: undefined, duration: undefined, error: undefined }
[Devtools] tool_call: { agent: undefined, tool: 'mgr_okr_review', duration: 234, error: undefined }
[Devtools] response: { agent: 'Manager', tool: undefined, duration: 1234, error: undefined }
```

---

## Practical Examples

### Example 1: Debug Routing Issue

**Problem**: Query should route to OKR Reviewer but doesn't.

**Steps:**
1. Send the query to Feishu bot
2. Check handoff events:
   ```bash
   curl "http://localhost:3000/devtools/api/events?type=agent_handoff" | jq
   ```
3. Look for the query in handoff events
4. Check if it routed correctly or stayed with Manager

### Example 2: Find Slow Tools

**Problem**: Responses are slow.

**Steps:**
1. Get tool call events:
   ```bash
   curl "http://localhost:3000/devtools/api/events?type=tool_call" | jq '.events[] | {tool: .tool, duration: .duration}'
   ```
2. Identify tools with high duration
3. Check statistics for average:
   ```bash
   curl http://localhost:3000/devtools/api/stats | jq '.avgToolDuration'
   ```

### Example 3: Monitor Error Rate

**Problem**: Check if system is healthy.

**Steps:**
1. Get error count:
   ```bash
   curl "http://localhost:3000/devtools/api/events?type=error" | jq '.events | length'
   ```
2. Get total events:
   ```bash
   curl http://localhost:3000/devtools/api/stats | jq '.totalEvents'
   ```
3. Calculate error rate: `errors / totalEvents`

### Example 4: Track Agent Usage

**Problem**: See which agents are used most.

**Steps:**
1. Get all agent calls:
   ```bash
   curl "http://localhost:3000/devtools/api/events?type=agent_call" | jq '.events[] | .agent' | sort | uniq -c
   ```
2. Get handoff patterns:
   ```bash
   curl "http://localhost:3000/devtools/api/events?type=agent_handoff" | jq '.events[] | .data.toAgent' | sort | uniq -c
   ```

---

## Using with jq for Better Output

Install `jq` for JSON formatting:

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Pretty Print Events

```bash
curl -s http://localhost:3000/devtools/api/events | jq '.events[0]'
```

### Extract Specific Fields

```bash
# Get just timestamps and types
curl -s http://localhost:3000/devtools/api/events | jq '.events[] | {timestamp, type, agent, tool}'

# Get tool durations
curl -s "http://localhost:3000/devtools/api/events?type=tool_call" | jq '.events[] | {tool: .tool, duration: .duration}'
```

### Filter Events

```bash
# Events in last hour (assuming timestamps are in milliseconds)
curl -s http://localhost:3000/devtools/api/events | jq --arg now $(date +%s)000 '.events[] | select(.timestamp > ($now | tonumber) - 3600000)'
```

---

## Browser-Based Monitoring

### Simple HTML Dashboard

Create a simple HTML file to monitor events:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Devtools Monitor</title>
  <script>
    async function loadEvents() {
      const response = await fetch('http://localhost:3000/devtools/api/events?limit=20');
      const data = await response.json();
      
      const container = document.getElementById('events');
      container.innerHTML = data.events.map(e => `
        <div style="border: 1px solid #333; padding: 10px; margin: 5px;">
          <strong>${e.type}</strong> - ${e.agent || e.tool || 'N/A'}
          ${e.duration ? `(${e.duration}ms)` : ''}
          <br>
          <small>${new Date(e.timestamp).toLocaleString()}</small>
        </div>
      `).join('');
    }
    
    // Refresh every 2 seconds
    setInterval(loadEvents, 2000);
    loadEvents();
  </script>
</head>
<body>
  <h1>Devtools Events Monitor</h1>
  <div id="events"></div>
</body>
</html>
```

---

## Common Workflows

### Workflow 1: Development Debugging

1. Start server: `bun dev`
2. Open devtools: `http://localhost:3000/devtools`
3. Send test query to Feishu bot
4. Check events: `curl http://localhost:3000/devtools/api/events | jq`
5. Debug routing/tool issues
6. Clear events: `curl -X POST http://localhost:3000/devtools/api/clear`
7. Repeat

### Workflow 2: Performance Monitoring

1. Start server with devtools enabled
2. Run load test (send multiple queries)
3. Get statistics: `curl http://localhost:3000/devtools/api/stats | jq`
4. Analyze tool durations: `curl "http://localhost:3000/devtools/api/events?type=tool_call" | jq '.events[] | .duration'`
5. Identify bottlenecks
6. Optimize slow tools

### Workflow 3: Error Investigation

1. Notice error in production/logs
2. Get error events: `curl "http://localhost:3000/devtools/api/events?type=error" | jq`
3. Examine error context: `jq '.events[0].data'`
4. Check related events around same timestamp
5. Fix issue
6. Monitor for recurrence

---

## Tips & Best Practices

1. **Clear events regularly** - Prevents memory buildup
2. **Use filters** - Don't fetch all events if you only need specific types
3. **Monitor statistics** - Quick health check without parsing all events
4. **Watch console logs** - Real-time feedback during development
5. **Combine with Feishu logs** - Cross-reference with Feishu message logs
6. **Set up monitoring script** - Automate health checks

---

## Troubleshooting

### No Events Showing

**Check:**
1. Is devtools enabled? Look for `🔧 AI SDK Devtools: Enabled` in server logs
2. Have you sent any queries? Events only appear when agents are used
3. Check server console for `[Devtools]` logs

### API Returns Empty

**Check:**
1. Events might have been cleared
2. Server might have restarted (events are in-memory)
3. Try sending a new query to generate events

### Can't Access /devtools

**Check:**
1. Server is running
2. Correct port (default: 3000)
3. Devtools enabled (development mode or `ENABLE_DEVTOOLS=true`)

---

## Next Steps

- **Enhanced UI**: Build a better dashboard using the API
- **Persistence**: Add database storage for historical data
- **Alerting**: Set up alerts for errors or slow responses
- **Metrics**: Aggregate metrics over time windows

See [Devtools Observability Guide](./devtools-observability.md) for production enhancements.

