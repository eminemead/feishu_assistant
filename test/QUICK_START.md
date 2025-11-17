# Quick Start: Testing Agent Features

## Run Tests

```bash
# Run all tests
bun test

# Run tests in watch mode (for development)
bun test:watch

# Run specific test file
bun test test/agents/manager-agent.test.ts
```

## What Gets Tested

### ✅ Manager Agent
- Routes queries to correct specialist agents
- Falls back to web search for general queries
- Handles Chinese language queries
- Provides status updates

### ✅ OKR Reviewer Agent  
- Agent configuration
- Tool execution (mgr_okr_review)
- Error handling

### ✅ Agent Handoffs
- All agents are properly registered
- Keyword matching works
- Handoff events are logged

### ✅ End-to-End Integration
- Complete workflows from query to response
- Multi-turn conversations
- Error handling

## Test Results Summary

After running `bun test`, you should see:
- ✅ All configuration tests pass (fast, no API calls)
- ✅ Integration tests may take longer (make actual API calls)
- ⚠️ Some tests may skip if dependencies are missing (expected)

## Prerequisites

Set environment variables for integration tests:
```env
OPENROUTER_API_KEY=your-key
EXA_API_KEY=your-key  # Optional
```

## Troubleshooting

- **Tests timeout**: Increase timeout or check network/API keys
- **Import errors**: Run `bun install`
- **Database errors**: OKR tests handle missing DB gracefully

See `TESTING.md` for detailed documentation.

