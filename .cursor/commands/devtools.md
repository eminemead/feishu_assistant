# Analyze Model Traces

Fetch and analyze recent model traces from the devtools API to debug agent/tool issues.

## Steps

1. **Fetch trace data** from local devtools endpoints:
   - `curl -s http://localhost:3000/devtools/api/events` — all events
   - `curl -s http://localhost:3000/devtools/api/stats` — summary stats
   - `curl -s http://localhost:3000/devtools/api/sessions` — session data

2. **Analyze and report**:
   - Total events, breakdown by type (agent_call, tool_call, error, response)
   - **Errors**: List each error with tool/agent name, error message, and relevant params
   - **Latency**: Flag any responses > 10s, show duration stats
   - **Tool usage**: Which tools were called, success/failure rates
   - **Timeline**: Chronological flow of the most recent interaction

3. **Suggest fixes** if errors found:
   - For tool errors: check params, env vars, external service availability
   - For timeouts: suggest caching, batching, or async patterns
   - For agent errors: check model availability, token limits

## Output Format

```
## Trace Analysis Summary

**Time Range**: [start] → [end] ([duration])
**Total Events**: N | Errors: N | Avg Response Time: Xms

### Recent Errors (if any)
1. [tool/agent] — [error message]
   - Params: ...
   - Suggestion: ...

### Tool Performance
| Tool | Calls | Errors | Avg Duration |
|------|-------|--------|--------------|
| ...  | ...   | ...    | ...          |

### Latest Interaction Timeline
1. [timestamp] agent_call: ...
2. [timestamp] tool_call: ...
...
```

## Notes

- Server must be running (`bun run dev`) for endpoints to work
- If Phoenix is running (`docker compose -f docker-compose.phoenix.yml up -d`), deeper traces available at http://localhost:6006
- Events are in-memory; restart clears them
