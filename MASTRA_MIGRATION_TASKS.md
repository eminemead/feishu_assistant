# Mastra Migration - Comprehensive Task Breakdown

**Epic ID**: `feishu_assistant-1mv`

This document provides a complete breakdown of all tasks for migrating from ai-sdk-tools to Mastra framework, organized by phase with dependencies, technical details, and self-documenting comments.

---

## Overview

Total tasks created: **21**
- Phase 1 (Setup): 5 tasks
- Phase 2 (Agent Migration): 6 tasks
- Phase 3 (Memory): 3 tasks
- Phase 4 (Observability): 3 tasks
- Phase 5 (Testing): 4 tasks
- Phase 6 (Cleanup): 3 tasks

**Execution Timeline**: 8-13 days (1-2 weeks)

---

## PHASE 1: Setup & Infrastructure (Foundation)

### Why This Phase Comes First
Before migrating agents, we need observability and a working memory backend. These are blocking dependencies for everything else.

### 1.1 Add Mastra observability configuration to server.ts
**Task ID**: `feishu_assistant-***`
**Priority**: P1 (Critical)
**Estimated Time**: 1 day
**Depends On**: None
**Blocks**: All other tasks

**What & Why**:
- Initialize Mastra's observability system in the server entrypoint
- server.ts is the only startup file, so this is the natural place
- Must happen before agents start (observability needs to be active)

**Key Implementation Details**:
1. Import Mastra observability modules
2. Create observability config object with environment detection
3. Initialize PinoLogger (structured logging)
4. Set up AI Tracing exporter (Langfuse)
5. Attach to Mastra instance

**Files Affected**:
- `server.ts` (main changes, 20-30 lines)

**Success Looks Like**:
- Server starts without errors
- No observability errors in logs
- Ready for agent initialization

---

### 1.2 Setup PinoLogger for structured logging
**Priority**: P1
**Estimated Time**: 1 day
**Depends On**: None
**Blocks**: Manager Agent migration

**Why This Matters**:
- Replace ad-hoc console.log with production-grade structured logging
- Enables log aggregation and querying (essential for production debugging)
- Provides context propagation (thread_id, user_id in every log line)

**Implementation Strategy**:
1. Create `lib/logger-config.ts` - central logger setup
2. Configure both file and console transports
3. Add structured metadata injection (agent name, tool name, user context)
4. Update all logging calls across codebase
5. Add log filtering by level (INFO, WARN, ERROR, DEBUG)

**Structured Log Format**:
```json
{
  "timestamp": "2025-12-02T12:48:49Z",
  "level": "info",
  "message": "Agent executed successfully",
  "agent": "Manager",
  "threadId": "abc-123",
  "userId": "user-456",
  "duration_ms": 1234,
  "model": "openrouter/openai/gpt-4"
}
```

**Files Affected**:
- `lib/logger-config.ts` (new, 100-150 lines)
- `lib/devtools-integration.ts` (integrate with logger)
- All agent files (update logging calls, ~50 total calls)

---

### 1.3 Configure Langfuse AI Tracing exporter
**Priority**: P1
**Estimated Time**: 1-2 days
**Depends On**: Add Mastra observability config
**Blocks**: Agent migration

**Why Langfuse**:
- Purpose-built for LLM observability (not generic like OTEL)
- Shows token counts, latency, model info - exactly what we need
- Dashboard makes debugging agent behavior intuitive
- Better analytics than custom devtools HTML

**Implementation Steps**:
1. Get Langfuse account + API keys
2. Create `lib/observability-config.ts` with Langfuse exporter setup
3. Configure real-time mode for development (instant feedback)
4. Configure batch mode for production (efficiency)
5. Set up sampling (100% in dev, 1% in prod to reduce costs)
6. Test in Langfuse dashboard

**Environment Variables Needed**:
```env
LANGFUSE_PUBLIC_KEY=your-key-here
LANGFUSE_SECRET_KEY=your-secret
LANGFUSE_BASE_URL=https://cloud.langfuse.com  # optional
NODE_ENV=development  # for real-time mode
```

**What Will Be Traced**:
- LLM calls (input/output tokens, latency, model used)
- Tool executions (function name, inputs, outputs)
- Agent state transitions
- Memory operations (queries, inserts, latency)
- Error events with full context

**Files Affected**:
- `lib/observability-config.ts` (new, 150-200 lines)
- `server.ts` (import and use config)
- `.env.example` (add Langfuse keys)

---

### 1.4 Verify PostgreSQL schema for Mastra memory backend
**Priority**: P1
**Estimated Time**: 1 day
**Depends On**: None
**Blocks**: Task 1.5 (connection pooling tests)

**Why This Matters**:
- Mastra memory requires PostgreSQL with specific schema
- Schema determines what data can be stored and how quickly we can query it
- Wrong schema = data loss or slow queries
- This is foundational for multi-turn conversations

**What Needs Verification**:
1. **Tables exist and have correct columns**:
   - `threads` (conversation contexts)
     - `id` (UUID primary key)
     - `user_id` (for RLS)
     - `thread_id` (Feishu thread identifier)
     - `metadata` (JSONB for flexible storage)
     - `created_at`, `updated_at`
   - `messages` (conversation history)
     - `id` (UUID)
     - `thread_id` (foreign key)
     - `role` (user/assistant)
     - `content` (TEXT, can be large)
     - `metadata` (JSONB)
     - `created_at`
   - `runs` (agent execution history, optional but recommended)
     - `id` (UUID)
     - `thread_id`
     - `agent_name`
     - `input`, `output` (JSONB)
     - `status` (running/completed/error)

2. **Indexes for performance** (critical for production):
   - `(user_id, thread_id)` - fastest queries for user conversations
   - `(thread_id)` - for single conversation queries
   - `(created_at DESC)` - for ordering messages
   - `(user_id)` - for RLS checks

3. **Row-Level Security (RLS)** policies:
   - Users can only read their own conversations
   - RLS policy: `threads.user_id = auth.uid()`
   - Prevents accidental data leaks

4. **Data types** are correct:
   - JSONB (not TEXT) for metadata - enables querying
   - TEXT (not VARCHAR) for content - handles large messages
   - UUID (not INT) for IDs - prevents collisions

**Migration Process**:
- Review existing schema in `lib/memory-mastra.ts`
- Check if Supabase migrations are up to date
- Run migrations if needed
- Test schema with sample data
- Document any customizations

**Files to Review**:
- `lib/memory-mastra.ts` (schema definition)
- `supabase/migrations/` (migration files)

---

### 1.5 Test Mastra memory connection pooling and transactions
**Priority**: P2 (Important but not blocking)
**Estimated Time**: 1-2 days
**Depends On**: Task 1.4 (schema verification)
**Blocks**: All agent migrations (indirectly - need to know pool works)

**Why Connection Pooling Matters**:
- Production can have 10-100 concurrent requests
- Without pooling, each request opens a new database connection
- Each connection takes ~100ms to establish and ~1s to get auth token
- This directly impacts agent response time (database is serial bottleneck)
- Proper pooling keeps connections alive, reuses them instantly

**What to Test**:
1. **Pool initialization**:
   - Max connections: 20 (configurable)
   - Min connections: 5 (configurable)
   - Idle timeout: 30s
   - Verify connections actually reused (not opened/closed every query)

2. **Concurrent load**:
   - 50 simultaneous queries
   - Verify pool doesn't exceed max size
   - No connection hangs
   - All queries complete successfully

3. **Performance**:
   - First query: ~50-100ms (includes connection)
   - Subsequent queries: <10ms (connection reused)
   - Measure with and without pooling

4. **Transaction handling**:
   - Insert + rollback works
   - Deadlock handling (PostgreSQL handles this automatically)
   - Query timeout enforcement
   - Connection drops handled gracefully

5. **Error recovery**:
   - Database down → connections timeout → agent returns error gracefully
   - Network flaky → retry logic works
   - No pool exhaustion (connections leak)

**Implementation**:
Create `scripts/test-memory-pooling.ts`:
```typescript
// Simulate 50 concurrent agents querying memory
const promises = Array(50).fill(null).map(() => 
  mastraMemory.getThread(userId, threadId)
);
const results = await Promise.all(promises);
// Verify all succeeded and pool size never exceeded 20
```

**Expected Results**:
- Pool size graph should plateau at max (not continuously grow)
- All queries complete without timeouts
- Query latency stable (not degrading under load)

**Files**:
- `scripts/test-memory-pooling.ts` (new, 200-300 lines)

---

## PHASE 2: Agent Migration (Core Work)

### Why This Phase Comes Second
- Phase 1 infrastructure is now ready
- Agents depend on working observability and memory
- Agent migration is straightforward (templates exist in `-mastra.ts` files)

### 2.1 Migrate Manager Agent to Mastra framework
**Priority**: P1 (Highest - orchestrator)
**Estimated Time**: 1-2 days
**Depends On**: All Phase 1 tasks
**Blocks**: All specialist agent migrations

**Why Manager Agent First**:
- It's the entry point for all requests
- Other agents are called by Manager
- Must work perfectly before other agents matter
- Has most complex routing logic (good validation)

**What's Changing**:
- **Before**: Two Agent instances (primary + fallback) for model fallback
  ```typescript
  let managerAgentPrimary = new Agent({ model: openAIModel, ... });
  let managerAgentFallback = new Agent({ model: claudeModel, ... });
  // Manual switching logic: if (rateLimited) use fallback
  ```

- **After**: One Agent with model array
  ```typescript
  let managerAgent = new Agent({ 
    model: [primaryModel, fallbackModel],  // Auto fallback by Mastra
    // ... rest same
  });
  ```

**Benefits of This Change**:
1. **Simpler code** - Remove 100+ lines of manual fallback logic
2. **Faster failure recovery** - Mastra retries automatically
3. **Better observability** - AI Tracing shows model selection
4. **Cleaner architecture** - One agent = one source of truth

**Key Implementation Tasks**:
1. Copy `lib/agents/manager-agent-mastra.ts` → `lib/agents/manager-agent.ts`
2. Remove agent initialization for fallback (keep only primary)
3. Change model from `getPrimaryModel()` to `[getPrimaryModel(), getFallbackModel()]`
4. Update `generateResponse.ts` import (if needed)
5. Test routing to all specialists (OKR, Alignment, P&L, DPA-PM)
6. Update tests in `test/agents/manager-agent.test.ts`

**Validation Checklist**:
- ✅ Agent initializes without errors
- ✅ Routes to OKR specialist for OKR questions
- ✅ Routes to Alignment specialist for alignment questions
- ✅ Routes to P&L specialist for P&L questions
- ✅ Routes to DPA-PM specialist for people questions
- ✅ Falls back to web search when no specialist matches
- ✅ Memory loading/saving works
- ✅ Error handling for model failures
- ✅ Tests pass

**Files Affected**:
- `lib/agents/manager-agent.ts` (replace, ~400 lines)
- `lib/generate-response.ts` (update 1 line)
- `test/agents/manager-agent.test.ts` (update tests)
- `lib/agents/manager-agent-mastra.ts` (delete after validation)

---

### 2.2 Migrate OKR Reviewer Agent to Mastra framework
**Priority**: P1
**Estimated Time**: 0.5 days
**Depends On**: Task 2.1 (Manager Agent done)
**Blocks**: E2E testing (critical path)

**What This Agent Does**:
- Analyzes OKR data from DuckDB
- Generates insightful reviews
- Tracks metric progress
- Identifies risks and opportunities

**Migration is Straightforward**:
- Pattern is identical to Manager Agent
- Copy from `-mastra.ts` file
- Update imports
- Same validation steps

**Files Affected**:
- `lib/agents/okr-reviewer-agent.ts` (replace)
- `lib/tools/okr-review-tool.ts` (no changes)
- `test/agents/okr-reviewer-agent.test.ts` (update tests)

---

### 2.3 Migrate Alignment Agent to Mastra framework
**Priority**: P1
**Estimated Time**: 0.5 days
**Depends On**: Task 2.1
**Blocks**: E2E testing

**Files Affected**:
- `lib/agents/alignment-agent.ts` (replace)
- `test/agents/*.test.ts` (update if exists)

---

### 2.4 Migrate P&L Agent to Mastra framework
**Priority**: P1
**Estimated Time**: 0.5 days
**Depends On**: Task 2.1
**Blocks**: E2E testing

**Files Affected**:
- `lib/agents/pnl-agent.ts` (replace)

---

### 2.5 Migrate DPA-PM Agent to Mastra framework
**Priority**: P1
**Estimated Time**: 0.5 days
**Depends On**: Task 2.1
**Blocks**: E2E testing

**Files Affected**:
- `lib/agents/dpa-pm-agent.ts` (replace)

---

### 2.6 Consolidate shared tools and verify compatibility
**Priority**: P2 (Low risk - tools already compatible)
**Estimated Time**: 0.5 days
**Depends On**: Task 2.1+ (parallel work)
**Blocks**: None (informational)

**Why This Matters**:
- Tools use universal `tool()` from `ai` package
- Should work with both frameworks without changes
- Still need to verify no surprises

**Tools to Verify**:
1. `lib/tools/search-web-tool.ts` - Web search via Exa
2. `lib/tools/okr-review-tool.ts` - OKR analysis via DuckDB
3. `lib/agents/okr-visualization-tool.ts` - Chart generation

**Verification Steps**:
1. Run agent with each tool
2. Verify tool executes correctly
3. Verify output format matches expectations
4. Check no errors in Langfuse traces

---

## PHASE 3: Memory & State Migration

### Why This Phase is Critical
- Agents are now working with Mastra
- But they're still using old ai-sdk-tools memory
- We need to migrate conversation history to new system
- Must verify RLS (security) still works

### 3.1 Transition conversation history to Mastra memory backend
**Priority**: P1
**Estimated Time**: 2 days
**Depends On**: All agent migrations
**Blocks**: Memory transition complete

**Why This is Complex**:
- Old system: ai-sdk-tools memory + Supabase
- New system: Mastra memory + PostgreSQL
- Data structures might be slightly different
- Must zero data loss (conversations are valuable)

**Migration Strategy**:
1. **Analyze existing data**:
   - Count conversations
   - Look at data shapes
   - Plan transformation logic

2. **Create migration script** (`scripts/migrate-memory.ts`):
   ```typescript
   // For each conversation in old system:
   // 1. Read thread context
   // 2. Read all messages
   // 3. Transform to Mastra format (if needed)
   // 4. Write to new system
   // 5. Log success/failures
   ```

3. **Validation**:
   - Compare record counts (old vs new)
   - Spot check 10 conversations for data integrity
   - Verify timestamps preserved
   - Verify user_id preserved (for RLS)

4. **Dual-read testing**:
   - Read same conversation from both systems
   - Verify results identical
   - Measure latency difference

5. **Rollback plan**:
   - Keep old data for 7 days (in case issues discovered)
   - Can re-run migration if needed

**Files**:
- `scripts/migrate-memory.ts` (new, 300-400 lines)
- `lib/agents/memory-integration.ts` (update to dual-read)

---

### 3.2 Verify Row-Level Security (RLS) for multi-user isolation
**Priority**: P2 (Security critical)
**Estimated Time**: 1 day
**Depends On**: Task 3.1 (data migrated)
**Blocks**: Production deployment

**Why RLS is Critical**:
- Without RLS, user A can see user B's conversations
- This is a data privacy violation
- Especially important in enterprise (Feishu is enterprise product)

**RLS Basics**:
```sql
-- Only return rows where user_id = current_user
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY threads_isolation ON threads
  USING (user_id = auth.uid());
```

**Testing Strategy**:
1. Create test users (A, B, C)
2. Each inserts own conversations
3. Verify A cannot see B's data
4. Verify B cannot see C's data
5. Verify admin can see all (if bypass exists)

**Performance Impact**:
- RLS adds ~5-10ms per query (PostgreSQL filtering)
- Should be negligible compared to network latency

**Files**:
- `test/integration/rls-isolation.test.ts` (new, 200+ lines)
- `supabase/migrations/` (verify RLS policies)

---

### 3.3 Run dual-read tests to verify memory consistency
**Priority**: P2
**Estimated Time**: 1 day
**Depends On**: Tasks 3.1 + 3.2
**Blocks**: None (validation only)

**Purpose**:
During transition, agents read from both old and new memory systems. We need to verify they return identical results before switching fully to new system.

**Test Scenarios**:
1. Single-message conversation
2. Multi-turn conversation (5+ messages)
3. Conversation with large messages (2000+ chars)
4. Conversation with metadata/tags
5. New conversation (test write path)

**What to Measure**:
- Are results identical?
- Is new system faster? slower?
- Any data transformations needed?
- Are there edge cases?

**Files**:
- `test/integration/memory-dual-read.test.ts` (new)

---

## PHASE 4: Observability Upgrade

### Why After Agents Work
- Agents are now migrated to Mastra
- Observability is built-in to Mastra
- Can now leverage AI Tracing features
- Can retire custom devtools code

### 4.1 Setup Langfuse tracing for all agents and tools
**Priority**: P1
**Estimated Time**: 1 day
**Depends On**: All agents migrated
**Blocks**: Task 4.3 (devtools retirement)

**What Gets Traced**:
1. **Agent execution**:
   - Agent name, instructions, model
   - Input query
   - Tool calls (which tools, inputs/outputs)
   - Output response
   - Duration, token usage

2. **Tool execution**:
   - Tool name, inputs, outputs
   - Success/failure
   - Duration

3. **Model calls**:
   - Model used (primary vs fallback)
   - Prompt tokens, completion tokens
   - Latency
   - Cost (if available)

4. **Memory operations**:
   - Get thread operation + latency
   - Save message operation + latency
   - Any errors

**Benefits Over Custom Devtools**:
| Feature | Custom Devtools | Langfuse AI Tracing |
|---------|-----------------|-------------------|
| Tracing LLM calls | ❌ No | ✅ Yes, detailed |
| Token counting | ⚠️ Manual | ✅ Automatic |
| Model analysis | ❌ No | ✅ Cost tracking |
| Real-time dashboard | ⚠️ HTML page | ✅ Cloud UI |
| Production use | ❌ Dev only | ✅ Production ready |
| Multiple users | ❌ No | ✅ Yes |
| Alerts/monitoring | ❌ No | ✅ Yes |

---

### 4.2 Configure real-time vs batch mode for tracing
**Priority**: P1
**Estimated Time**: 0.5 days
**Depends On**: Task 4.1
**Blocks**: None

**Real-Time Mode** (Development):
- Every trace is immediately flushed to Langfuse
- See results in dashboard within 1-2 seconds
- Useful for debugging (instant feedback)
- Higher network overhead (~10KB per trace)
- Trade-off: network cost for developer experience

**Batch Mode** (Production):
- Traces buffered in memory (10-100 traces)
- Flushed every 5-10 seconds
- Lower network overhead (batching reduces requests)
- Still fast enough to find issues
- Recommended for cost optimization

**Configuration**:
```typescript
const config = {
  development: {
    real_time: true,  // Instant feedback for devs
    sampling: 1.0,    // 100% in dev (small traffic)
  },
  production: {
    realtime: false,  // Batch for efficiency
    sampling: 0.01,   // 1% in prod (save costs)
  }
};
```

---

### 4.3 Deprecate custom devtools-integration.ts
**Priority**: P2
**Estimated Time**: 1 day
**Depends On**: Tasks 4.1 + 4.2 (Langfuse working)
**Blocks**: Code cleanup (Phase 6)

**What's Being Removed**:
- `lib/devtools-integration.ts` (~300 lines)
- `lib/devtools-page.html` (browser UI)
- All `devtoolsTracker.trackX()` calls in agent code (~30+ calls)
- `/devtools/api/*` endpoints in server.ts

**Why Safe to Remove**:
- Langfuse provides all the same information
- Plus much more (token counting, cost tracking, etc.)
- Better dashboard (Langfuse cloud vs local HTML)
- Production-ready observability

**Cleanup Checklist**:
- ✅ Remove import statements (5 files)
- ✅ Remove tracking calls (all agents + tools)
- ✅ Remove API endpoints (server.ts)
- ✅ Delete files
- ✅ Update documentation
- ✅ Verify no broken imports

**Impact**:
- Code reduction: ~500 lines removed
- Cleaner codebase
- No loss of functionality (all features in Langfuse)

---

## PHASE 5: Testing & Validation

### Critical for Production Safety
- Each phase tested locally
- Phase 5 is comprehensive validation before production
- Catches integration issues that unit tests miss

### 5.1 Write unit tests for all migrated agents
**Priority**: P1
**Estimated Time**: 2 days
**Depends On**: All agents migrated
**Blocks**: Integration tests

**Test Coverage Goals**:
- >80% code coverage
- All code paths tested
- Error cases covered
- Edge cases (empty input, very large input, etc.)

**Test Categories**:
1. **Initialization tests** (10 tests):
   - Agent creates successfully
   - Model array initialized
   - Tools registered
   - Memory initialized

2. **Execution tests** (15 tests):
   - Process valid query
   - Return structured response
   - Call correct tools
   - Handle errors gracefully

3. **Routing tests** (5 tests, Manager Agent):
   - Route OKR queries to OKR specialist
   - Route Alignment queries correctly
   - Fallback to web search

4. **Error handling** (10 tests):
   - Handle invalid input
   - Handle model failures
   - Handle tool execution errors
   - Graceful degradation

**Test Setup**:
```typescript
describe('Manager Agent with Mastra', () => {
  let agent: Agent;
  
  beforeEach(() => {
    // Initialize with test model (fast, deterministic)
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  it('routes OKR questions to OKR specialist', async () => {
    // ...
  });
});
```

**Files**:
- `test/agents/manager-agent.test.ts` (update)
- `test/agents/okr-reviewer-agent.test.ts` (update)
- Similar for other agents

---

### 5.2 Write integration tests for multi-turn conversations
**Priority**: P1
**Estimated Time**: 2 days
**Depends On**: Unit tests pass
**Blocks**: E2E tests

**What Integration Tests Verify**:
- Multiple turns work (conversation context preserved)
- Memory persistence (reload conversation later)
- Agent handoffs (manager → specialist → back)
- Complex scenarios (multi-step reasoning)

**Test Scenarios**:
1. **Simple multi-turn**:
   - User: "What are our Q4 OKRs?"
   - Bot: [Returns OKRs]
   - User: "What's the status?"
   - Bot: [Should know previous context]

2. **Agent handoff**:
   - User: "How's our alignment?" (goes to Alignment agent)
   - Bot: [Responds with alignment analysis]
   - User: "How's P&L?" (goes to P&L agent)
   - Bot: [Responds with P&L, context preserved]

3. **Tool execution**:
   - User: "Search for Q4 planning docs"
   - Bot: [Uses web search tool]
   - Bot: [Returns results]

4. **Error recovery**:
   - Mock tool failure
   - Verify agent handles gracefully
   - User can retry

**Files**:
- `test/integration/mastra-multiturn.test.ts` (new, 300+ lines)

---

### 5.3 Write E2E tests for full Feishu workflow
**Priority**: P2
**Estimated Time**: 1 day
**Depends On**: Integration tests pass
**Blocks**: Production rollout

**What E2E Tests Cover**:
Complete flow from user perspective:
1. User mentions bot in Feishu group
2. Feishu webhook sent to server
3. Server receives and parses mention
4. Extracts user/chat context
5. Loads memory (conversation history)
6. Calls appropriate agent
7. Formats response as interactive card
8. Sends back to Feishu
9. User sees response in chat
10. User clicks button (follow-up)
11. Server receives button action
12. Returns new response

**Test Scenarios**:
1. **Group mention**:
   - Mention bot in group
   - Verify response appears
   - Verify correct agent routed

2. **Direct message**:
   - DM the bot
   - Verify response
   - Different behavior from group?

3. **Button interaction**:
   - Response has buttons
   - User clicks button
   - Follow-up response appears

**Files**:
- `test/integration/end-to-end.test.ts` (update)

---

### 5.4 Performance regression testing
**Priority**: P1
**Estimated Time**: 2 days
**Depends On**: All agents + memory migrated
**Blocks**: Production rollout

**What We Measure**:
1. **Response latency** (user perspective):
   - Old system: baseline (e.g., 3.5 seconds)
   - New system: should be ≤ old (ideally better)
   - Acceptable: ±5% (±0.175 seconds)

2. **Agent overhead**:
   - LLM call latency (model dependent, not our code)
   - Tool execution latency
   - Memory queries latency

3. **Token counting**:
   - Mastra should count tokens identically
   - 100% accuracy required

4. **Memory operations**:
   - Load conversation: <50ms
   - Save message: <50ms
   - (PostgreSQL should be fast)

**Baseline Establishment**:
```bash
# Run with ai-sdk-tools (current production)
npm run test:perf
# Results: 
#   - Response latency: 3.5s average
#   - Memory query: 20ms average
#   - Tokens: 150 input, 200 output (accurate)
```

**Test with Mastra**:
```bash
# Run with Mastra agents
npm run test:perf
# Results: 
#   - Response latency: 3.4s average (✓ faster!)
#   - Memory query: 18ms average (✓ faster!)
#   - Tokens: 150 input, 200 output (✓ accurate)
```

**If Regression**:
1. Profile to identify bottleneck
2. Optimize (usually DB indexes or connection pooling)
3. Retest
4. Document findings

**Files**:
- `scripts/performance-test.ts` (new or update, 200+ lines)

---

## PHASE 6: Cleanup & Documentation

### Final Polish Before "Done"
- Remove old code
- Update documentation
- Final validation

### 6.1 Remove ai-sdk-tools dependencies from package.json
**Priority**: P2
**Estimated Time**: 0.5 days
**Depends On**: All tests passing
**Blocks**: Code cleanup complete

**What's Removed**:
```json
{
  "dependencies": {
    "@ai-sdk-tools/agents": "^1.0.8",      // ❌ REMOVE
    "@ai-sdk-tools/memory": "^1.0.8",      // ❌ REMOVE
    "@ai-sdk-tools/artifacts": "^1.0.8",   // ⚠️ CHECK (used elsewhere?)
    "@ai-sdk-tools/cache": "^1.0.8",       // ⚠️ CHECK (Mastra has caching)
    "@ai-sdk-tools/store": "^1.0.8",       // ❌ REMOVE
    "@ai-sdk-tools/devtools": "^1.0.8"     // ❌ REMOVE
  }
}
```

**Before Removing**:
1. Search codebase: `grep -r '@ai-sdk-tools' lib/ test/ server.ts`
2. Should return 0 results (all replaced with Mastra)
3. If results: update those files first

**Benefits**:
- Smaller bundle size (remove ~2MB)
- Fewer dependencies to maintain
- Clearer architecture (one framework)

---

### 6.2 Update documentation and code comments
**Priority**: P1
**Estimated Time**: 1 day
**Depends On**: Cleanup tasks
**Blocks**: Team readiness

**Documentation to Update**:

1. **Architecture docs** (`docs/architecture/agent-framework.md`):
   - Current: Describe ai-sdk-tools dual agent pattern
   - Target: Describe Mastra single agent with model array
   - Why: Explain benefits of migration
   - Diagram: Agent execution flow

2. **Setup docs** (`docs/setup/`):
   - Remove ai-sdk-tools references
   - Add Mastra installation
   - Add Langfuse integration guide
   - Add PostgreSQL setup guide

3. **Code comments**:
   - Manager agent: explain model array fallback
   - Specialist agents: explain tool definitions
   - Memory system: explain PostgreSQL backend
   - Observability: explain Langfuse tracing

4. **Troubleshooting**:
   - Common Mastra issues
   - Langfuse debugging
   - PostgreSQL connection issues
   - Performance tuning

**Files to Update**:
- `docs/architecture/agent-framework.md` (update)
- `docs/setup/mastra-setup.md` (new)
- `docs/setup/langfuse-guide.md` (new)
- `docs/setup/postgresql-setup.md` (new)
- `README.md` (update references)
- AGENTS.md (update if code conventions changed)
- All agent files (update code comments)

---

### 6.3 Final validation and production rollout
**Priority**: P0 (Critical - gates production)
**Estimated Time**: 2 days
**Depends On**: All other tasks
**Blocks**: Nothing (this is final step)

**Final Validation Checklist**:
- ✅ All unit tests passing
- ✅ All integration tests passing
- ✅ E2E tests passing
- ✅ Performance tests: no regression
- ✅ Code review approved
- ✅ Bundle size acceptable (<10% increase)
- ✅ Documentation complete and accurate
- ✅ Team trained on Mastra architecture
- ✅ Rollback procedure documented
- ✅ Monitoring/alerts configured

**Staging Deployment**:
1. Deploy to staging environment
2. Run smoke tests (basic functionality)
3. Monitor for 24 hours
4. Verify Langfuse traces appear
5. Verify memory persistence
6. Verify performance
7. Get sign-off from team

**Production Rollout Plan**:
1. **Blue-green deployment**:
   - Keep old system running (green)
   - Deploy new system (blue)
   - Switch traffic gradually

2. **Gradual rollout**:
   - 10% traffic → new system
   - Monitor metrics for 1 hour
   - If good: 50% traffic
   - Monitor for 1 hour
   - If good: 100% traffic

3. **Rollback plan**:
   - If issues appear: revert to green immediately
   - No user impact (using old system)
   - Investigate issues
   - Deploy fix
   - Try again

**Production Monitoring**:
- Error rate (should be <0.1%)
- Response latency (should be <5s)
- Token usage (should match expectations)
- Langfuse trace quality (should be complete)
- Memory queries (should be <50ms)

**Success Declaration**:
After 24 hours in production with no issues:
1. Declare migration successful
2. Schedule team retrospective
3. Document lessons learned
4. Plan next improvements
5. Archive old implementation (don't delete yet, keep for 30 days)

---

## Cross-Cutting Concerns

### Testing Strategy
- **Unit tests**: Each component works in isolation
- **Integration tests**: Components work together
- **E2E tests**: Full user flow works
- **Performance tests**: No regression
- **RLS tests**: Security maintained
- **Dual-read tests**: Data consistency during transition

### Rollback at Any Point
If critical issues discovered:
1. Revert changed files from git
2. Switch generate-response.ts back to old agents
3. Keep memory system (most stable part)
4. Keep observability (backward compatible)
5. Investigate and fix
6. Plan next attempt

### Monitoring During Transition
- Langfuse traces should appear for all requests
- Error rates should remain low
- Response times should be stable or improving
- Memory operations should be fast
- RLS should prevent data leaks

### Documentation Evolution
- Keep MASTRA_MIGRATION_PLAN.md (historical record)
- Keep this breakdown (architecture decisions)
- Archive old docs on ai-sdk-tools (for reference)
- Write new docs for Mastra (forward looking)

---

## Success Looks Like

✅ **Day 1-2**: Observability working (traces in Langfuse)
✅ **Day 3-4**: Manager agent working with Mastra
✅ **Day 5-6**: All specialists migrated and tested
✅ **Day 7-8**: Memory transitioned, RLS verified
✅ **Day 9-10**: Full test suite passing
✅ **Day 11-12**: Deployed to staging, monitoring 24h
✅ **Day 13**: Deployed to production
✅ **Day 14+**: Running smoothly in production

---

## Key Files Summary

### Core Changes
| File | Changes | Impact |
|------|---------|--------|
| `server.ts` | Add Mastra observability init | Observability enabled |
| `lib/agents/manager-agent.ts` | Replace with Mastra version | Routing simplified |
| `lib/agents/okr-reviewer-agent.ts` | Replace with Mastra version | Agent working |
| `lib/agents/alignment-agent.ts` | Replace with Mastra version | Agent working |
| `lib/agents/pnl-agent.ts` | Replace with Mastra version | Agent working |
| `lib/agents/dpa-pm-agent.ts` | Replace with Mastra version | Agent working |
| `lib/memory.ts` | Keep but phase out | Backward compatibility |
| `lib/memory-mastra.ts` | Already done | Memory working |

### Files to Create
| File | Purpose | Size |
|------|---------|------|
| `lib/logger-config.ts` | Structured logging | ~150 lines |
| `lib/observability-config.ts` | Langfuse setup | ~200 lines |
| `scripts/migrate-memory.ts` | Migrate old memory | ~300 lines |
| `scripts/performance-test.ts` | Perf baseline | ~200 lines |
| `test/integration/memory-dual-read.test.ts` | Verify consistency | ~200 lines |
| `test/integration/mastra-multiturn.test.ts` | Multi-turn test | ~300 lines |
| `test/integration/rls-isolation.test.ts` | Security test | ~200 lines |
| `docs/setup/mastra-setup.md` | Setup guide | ~500 lines |

### Files to Delete
| File | Reason |
|------|--------|
| `lib/devtools-integration.ts` | Replaced by Langfuse |
| `lib/devtools-page.html` | Replaced by Langfuse cloud |
| `lib/agents/manager-agent-mastra.ts` | Merged into main |
| `lib/agents/*-mastra.ts` | Merged into mains |

---

## Success Metrics

After migration:
- **Code quality**: Reduced from 1500 → 1000 LOC (agents)
- **Observability**: Better insights (LLM-specific tracing)
- **Performance**: No regression or better
- **Security**: RLS maintained
- **Maintainability**: Simpler architecture
- **Team velocity**: Faster feature development

---

**Migration Owner**: [Assign to team member]
**Target Completion**: 2 weeks from start
**Review Points**: After each phase (6 reviews total)
**Stakeholders**: Team leads, DevOps, Product

