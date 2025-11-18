# Test Suite for Feishu Assistant v0.1

This directory contains tests for the agent features to ensure they work as specified.

> 📚 **Documentation**: See [docs/testing/](../docs/testing/) for additional testing documentation.

## Test Structure

```
test/
├── agents/              # Agent-specific tests
│   ├── manager-agent.test.ts
│   ├── okr-reviewer-agent.test.ts
│   └── agent-handoffs.test.ts
├── integration/        # End-to-end and integration tests
│   ├── end-to-end.test.ts
│   └── memory-integration.test.ts
└── helpers/            # Test utilities and mocks
    ├── mocks.ts
    └── test-utils.ts
```

## Running Tests

### Run all tests
```bash
bun test
```

### Run specific test file
```bash
bun test test/agents/manager-agent.test.ts
```

### Run tests with coverage
```bash
bun test --coverage
```

### Run tests in watch mode
```bash
bun test --watch
```

## Test Categories

### 1. Manager Agent Tests (`manager-agent.test.ts`)
- **Routing Logic**: Tests that queries are correctly routed to specialist agents
- **Fallback Behavior**: Tests web search and general query handling
- **Status Updates**: Tests callback functionality for status updates
- **Error Handling**: Tests graceful error handling
- **Chinese Language Support**: Tests routing with Chinese keywords

### 2. OKR Reviewer Agent Tests (`okr-reviewer-agent.test.ts`)
- **Agent Configuration**: Verifies agent setup (name, matchOn, tools)
- **Tool Execution**: Tests the `mgr_okr_review` tool functionality
- **Agent Instructions**: Verifies instructions contain required information

### 3. Agent Handoffs Tests (`agent-handoffs.test.ts`)
- **Manager Configuration**: Verifies all agents are registered
- **Specialist Configuration**: Verifies each specialist agent's matchOn patterns
- **Event Handling**: Tests handoff event logging
- **Keyword Matching**: Tests keyword-based routing logic

### 4. End-to-End Integration Tests (`end-to-end.test.ts`)
- **OKR Workflow**: Complete flow from user query to OKR analysis
- **General Query Workflow**: Non-specialist query handling
- **Multi-turn Conversation**: Context maintenance across messages
- **Error Handling**: End-to-end error scenarios

### 5. Memory Integration Tests (`memory-integration.test.ts`)
- **Memory Provider**: Tests memory provider creation and configuration
- **Helper Functions**: Tests conversation ID and user scope ID generation
- **Memory Configuration**: Validates memory configuration structure
- **Execution Context**: Tests execution context setup with memory identifiers
- **Integration Points**: Verifies all integration points are properly connected

## Test Environment Setup

### Required Environment Variables

For tests that make actual API calls (integration tests), you need:

```env
OPENROUTER_API_KEY=your-key-here
EXA_API_KEY=your-key-here
```

### Database Requirements

For OKR Reviewer agent tests that test DuckDB functionality:

- DuckDB database file at: `/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db`
- Required tables: `okr_metrics_*` (timestamped tables) and `employee_fellow`

**Note**: Tests are designed to handle missing databases gracefully. If the database is not available, those specific tests will skip or handle errors appropriately.

## Test Strategy for v0.1

### What We're Testing

1. **Agent Routing**: Verify that queries are correctly routed to the right specialist agents
2. **Agent Configuration**: Ensure all agents are properly configured with correct names, matchOn patterns, and tools
3. **Tool Execution**: Test that tools (like `mgr_okr_review`) execute correctly
4. **Error Handling**: Ensure graceful error handling throughout the system
5. **Integration**: End-to-end flows work correctly

### What We're NOT Testing (Yet)

1. **LLM Response Quality**: We don't test the quality of LLM-generated responses (this requires manual review)
2. **Performance**: Load testing and performance benchmarks are not included
3. **Security**: Security testing is out of scope for v0.1
4. **UI/UX**: Feishu card rendering and formatting are not tested

## Writing New Tests

### Example Test Structure

```typescript
import { describe, it, expect } from "bun:test";
import { yourFunction } from "../../lib/your-module";

describe("Your Feature", () => {
  it("should do something", () => {
    const result = yourFunction();
    expect(result).toBeDefined();
  });
});
```

### Best Practices

1. **Use descriptive test names**: Test names should clearly describe what is being tested
2. **Test one thing per test**: Each test should verify a single behavior
3. **Use appropriate timeouts**: API calls may take time, use longer timeouts (30s) for integration tests
4. **Mock external dependencies**: When possible, mock external services to make tests faster and more reliable
5. **Handle missing dependencies**: Tests should gracefully handle missing databases or API keys

## Continuous Integration

To run tests in CI/CD:

```bash
# Install dependencies
bun install

# Run tests
bun test

# Check exit code
echo $?
```

## Troubleshooting

### Tests fail with "API key not found"
- Ensure environment variables are set
- For CI/CD, set them in your CI environment

### Tests fail with "Database not found"
- OKR Reviewer tests require the DuckDB database
- Tests should handle this gracefully, but you may need to set up the database for full testing

### Tests timeout
- Increase timeout for slow API calls: `it("test", async () => { ... }, 60000)`
- Check network connectivity
- Verify API keys are valid

## Future Improvements

- [ ] Add unit tests with mocked LLM responses
- [ ] Add performance benchmarks
- [ ] Add security tests
- [ ] Add visual regression tests for Feishu cards
- [ ] Add load testing
- [ ] Add test coverage reporting

