# Testing Guide for Feishu Assistant v0.1

This guide explains how to test if the agent features are working as specified.

## Quick Start

### Run All Tests
```bash
bun test
```

### Run Tests in Watch Mode (for development)
```bash
bun test:watch
```

### Run Tests with Coverage
```bash
bun test:coverage
```

## Test Structure

The test suite is organized into:

1. **Agent Tests** (`test/agents/`)
   - `manager-agent.test.ts` - Tests routing and orchestration
   - `okr-reviewer-agent.test.ts` - Tests OKR analysis functionality
   - `agent-handoffs.test.ts` - Tests agent handoff mechanism

2. **Integration Tests** (`test/integration/`)
   - `end-to-end.test.ts` - Complete workflow tests

3. **Test Helpers** (`test/helpers/`)
   - `mocks.ts` - Mock utilities for external dependencies
   - `test-utils.ts` - Common test utilities

## What Gets Tested

### ✅ Manager Agent
- [x] Routes OKR queries to OKR Reviewer agent
- [x] Routes P&L queries to P&L agent
- [x] Routes alignment queries to Alignment agent
- [x] Routes DPA PM queries to DPA PM agent
- [x] Falls back to web search for general queries
- [x] Handles Chinese language queries
- [x] Provides status updates during handoffs
- [x] Handles errors gracefully

### ✅ OKR Reviewer Agent
- [x] Has correct configuration (name, matchOn patterns)
- [x] Has `mgr_okr_review` tool available
- [x] Tool executes with period parameter
- [x] Handles errors gracefully
- [x] Instructions contain required information

### ✅ Agent Handoffs
- [x] All specialist agents registered in manager
- [x] Each agent has correct matchOn patterns
- [x] Handoff events are logged
- [x] Keyword matching works correctly

### ✅ End-to-End Integration
- [x] Complete OKR workflow from query to response
- [x] General query handling
- [x] Multi-turn conversation context
- [x] Error handling throughout the system

## Prerequisites

### Environment Variables

For tests that make actual API calls, you need:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
EXA_API_KEY=your-exa-api-key  # Optional, for web search tests
```

### Database (for OKR tests)

The OKR Reviewer agent tests require a DuckDB database:
- Path: `/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db`
- Tables: `okr_metrics_*` (timestamped) and `employee_fellow`

**Note**: Tests are designed to handle missing databases gracefully. If the database is not available, those specific tests will skip or handle errors appropriately.

## Running Specific Tests

### Run a Single Test File
```bash
bun test test/agents/manager-agent.test.ts
```

### Run Tests Matching a Pattern
```bash
bun test --grep "OKR"
```

### Run Tests with Verbose Output
```bash
bun test --verbose
```

## Understanding Test Results

### ✅ Passing Tests
- Green checkmarks indicate tests passed
- All assertions were met
- Agent features are working as expected

### ⚠️ Skipped Tests
- Some tests may skip if dependencies are missing (e.g., database)
- This is expected behavior for v0.1
- Check test output for skip reasons

### ❌ Failing Tests
- Red X marks indicate failures
- Check error messages for details
- Common issues:
  - Missing environment variables
  - Network/API issues
  - Database not available
  - Code changes that broke functionality

## Manual Testing Checklist

While automated tests verify functionality, you should also manually test:

### Manager Agent Routing
- [ ] Send "Show OKR metrics" → Should route to OKR Reviewer
- [ ] Send "What's the profit?" → Should route to P&L Agent
- [ ] Send "Check alignment" → Should route to Alignment Agent
- [ ] Send "Product management tasks" → Should route to DPA PM Agent
- [ ] Send "What's the weather?" → Should use web search

### OKR Reviewer Agent
- [ ] Send "Analyze OKR metrics for 10月" → Should execute tool and return analysis
- [ ] Send "What is the has_metric percentage?" → Should return company breakdown
- [ ] Send Chinese query "显示OKR指标覆盖率" → Should work correctly

### Error Handling
- [ ] Send empty message → Should handle gracefully
- [ ] Send malformed query → Should return helpful response
- [ ] Test with invalid period → Should handle error

### Multi-turn Conversations
- [ ] Ask about OKR, then ask follow-up → Should maintain context
- [ ] Switch topics mid-conversation → Should route correctly

## Troubleshooting

### Tests Timeout
**Problem**: Tests take too long or timeout

**Solutions**:
- Check network connectivity
- Verify API keys are valid
- Increase timeout: `it("test", async () => { ... }, 60000)`

### "API key not found" Errors
**Problem**: Tests fail because API keys are missing

**Solutions**:
- Set `OPENROUTER_API_KEY` in your environment
- Create `.env` file with required keys
- For CI/CD, set environment variables in your CI platform

### Database Errors
**Problem**: OKR tests fail with database errors

**Solutions**:
- Ensure DuckDB database exists at expected path
- Verify database has required tables
- Tests should handle missing database gracefully
- Consider using mock database for unit tests

### Import Errors
**Problem**: Cannot find module errors

**Solutions**:
- Run `bun install` to install dependencies
- Check that `tsconfig.json` includes test files
- Verify file paths are correct

## CI/CD Integration

To run tests in CI/CD:

```yaml
# Example GitHub Actions
- name: Install dependencies
  run: bun install

- name: Run tests
  run: bun test
  env:
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    EXA_API_KEY: ${{ secrets.EXA_API_KEY }}
```

## Next Steps

After running tests:

1. **Review Results**: Check which tests passed/failed
2. **Fix Issues**: Address any failing tests
3. **Manual Verification**: Test critical paths manually in Feishu
4. **Documentation**: Update docs if behavior changed
5. **Deploy**: If all tests pass, proceed with deployment

## Test Coverage Goals

For v0.1, we aim for:
- ✅ All agent routing logic tested
- ✅ All tools tested (where possible)
- ✅ Error handling tested
- ✅ Integration flows tested
- ⏳ LLM response quality (manual review)
- ⏳ Performance benchmarks (future)
- ⏳ Security testing (future)

## Questions?

If you encounter issues or have questions:
1. Check `test/README.md` for detailed test documentation
2. Review test output for specific error messages
3. Verify environment setup matches requirements
4. Check that all dependencies are installed

