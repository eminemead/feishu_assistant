# Mastra Framework Migration Plan

## Overview
Rewrite agent framework from AI SDK Tools (`@ai-sdk-tools/*`) to Mastra framework while maintaining existing functionality.

## Current Architecture (AI SDK Tools)

### Dependencies
```json
{
  "@ai-sdk-tools/agents": "^1.0.8",
  "@ai-sdk-tools/artifacts": "^1.0.8",
  "@ai-sdk-tools/cache": "^1.0.8",
  "@ai-sdk-tools/memory": "^1.0.8",
  "@ai-sdk-tools/store": "^1.0.8",
  "@ai-sdk-tools/devtools": "^1.0.8",
  "ai": "^5.0.93"
}
```

### Core Components

#### 1. **Agent Pattern** (lib/agents/)
- **Manager Agent** (`manager-agent.ts`)
  - Routes user queries to specialist agents
  - Manual routing based on keyword patterns
  - Fallback to web search
  - Handles rate-limit retry logic with model switching (primary ↔ fallback)

- **Specialist Agents** (5 agents)
  - `okr-reviewer-agent.ts` - OKR metrics & analysis
  - `alignment-agent.ts` - Goal alignment tracking
  - `pnl-agent.ts` - Profit & loss analysis
  - `dpa-pm-agent.ts` - Product management tasks
  - All use `Agent` class from `@ai-sdk-tools/agents`

#### 2. **Memory System** (`lib/memory.ts`)
- Supabase-backed conversation history
- RLS for user isolation
- Conversation scoped by `chatId + rootId`
- User scoped by user ID or chat ID

#### 3. **Tool System** (`lib/tools/`)
- Web search tool (Exa API integration)
- OKR visualization tool
- Card generation tools
- All integrated via AI SDK tool definitions

#### 4. **DevTools Integration** (`lib/devtools-integration.ts`)
- Event tracking (agent calls, responses, errors)
- Token usage tracking
- Cost estimation
- Devtools UI at `/devtools`

#### 5. **Artifact System** (`lib/artifacts/`)
- Generation of structured content (cards, charts)
- Streaming support for long-form content

## Mastra Framework Overview

### What Mastra Provides
- **Agent Framework**: Similar to AI SDK Tools but more opinionated
- **Tools & Steps**: Cleaner tool definition and execution
- **Memory & Storage**: Built-in abstractions for persistent state
- **Routing**: Built-in routing between agents
- **Streaming**: Native streaming support
- **Integrations**: Pre-built connectors for external services

### Key Differences
| Feature | AI SDK Tools | Mastra |
|---------|--------------|--------|
| Agent Class | `Agent` | `Agent` (different API) |
| Tool Definition | Zod schema + execute fn | Steps/Tools with built-in validation |
| Memory | External (Supabase) | Built-in memory store |
| Routing | Manual pattern matching | Built-in routing system |
| DevTools | Custom implementation | Built-in devtools integration |
| Artifacts | Custom system | Built-in artifacts |

## Migration Strategy

### Phase 1: Setup & Exploration
- [ ] Add Mastra to dependencies
- [ ] Study Mastra agent API and routing
- [ ] Create test agent in Mastra
- [ ] Compare API patterns with current AI SDK Tools usage

### Phase 2: Core Agent Migration
- [ ] Migrate manager agent
  - [ ] Replace `Agent` class initialization
  - [ ] Adapt routing logic to Mastra routing system
  - [ ] Update tool definitions (searchWeb)
  - [ ] Test basic message passing
  
- [ ] Migrate okr-reviewer-agent
  - [ ] Adapt tool definitions
  - [ ] Test OKR queries and responses
  - [ ] Verify visualization output

### Phase 3: Memory & Storage Migration
- [ ] Evaluate Mastra memory system
- [ ] Decide: Keep Supabase OR switch to Mastra's memory
- [ ] Migrate memory integration
- [ ] Test conversation history persistence
- [ ] Verify RLS and user isolation

### Phase 4: Tool System Migration
- [ ] Migrate web search tool
- [ ] Migrate OKR visualization tool
- [ ] Migrate card generation tools
- [ ] Adapt tool definitions to Mastra format

### Phase 5: DevTools & Monitoring
- [ ] Adapt devtools integration to Mastra
- [ ] Maintain token usage tracking
- [ ] Maintain cost estimation
- [ ] Test devtools UI

### Phase 6: Testing & Validation
- [ ] Unit tests for agents
- [ ] Integration tests with Feishu
- [ ] Load testing with concurrent agents
- [ ] Regression testing against AI SDK version

### Phase 7: Complete Remaining Agents
- [ ] Migrate alignment-agent
- [ ] Migrate pnl-agent
- [ ] Migrate dpa-pm-agent

### Phase 8: Cleanup & Optimization
- [ ] Remove AI SDK Tools dependencies
- [ ] Optimize Mastra implementation
- [ ] Performance profiling
- [ ] Documentation updates

## Key Decisions to Make

### 1. Memory System
**Option A: Keep Supabase**
- Pros: Existing RLS, familiar system, minimal changes
- Cons: Don't leverage Mastra's memory system

**Option B: Switch to Mastra Memory**
- Pros: Integrated, simpler, fewer dependencies
- Cons: Need to adapt RLS model, potential data migration

**Recommendation**: Keep Supabase initially, evaluate Mastra memory later

### 2. Routing Strategy
**Option A: Use Mastra's built-in routing**
- Pros: Less custom code, framework handles it
- Cons: May need to adapt our keyword-based approach

**Option B: Keep manual routing pattern**
- Pros: Exact control, matches current behavior
- Cons: Doesn't leverage Mastra's routing system

**Recommendation**: Use Mastra's routing where possible, keep custom logic where needed

### 3. Rate Limit Handling
Current system has sophisticated model fallback:
- Primary model → Fallback model switching
- Exponential backoff with configurable delays
- Per-tier rate limit tracking

**Ensure Mastra approach can handle this.**

### 4. Streaming & Status Updates
Current system streams text deltas:
```typescript
for await (const textDelta of result.textStream) {
  accumulatedText += textDelta;
  updateStatus(accumulatedText);  // User-provided callback
}
```

**Verify Mastra supports this callback pattern.**

## File Structure Changes

### Before (AI SDK Tools)
```
lib/agents/
├── manager-agent.ts         (Agent class)
├── okr-reviewer-agent.ts    (Agent class)
├── alignment-agent.ts       (Agent class)
├── pnl-agent.ts            (Agent class)
├── dpa-pm-agent.ts         (Agent class)
└── types.ts                (re-exports Agent type)
```

### After (Mastra)
```
lib/agents/
├── manager-agent.ts         (Mastra Agent)
├── okr-reviewer-agent.ts    (Mastra Agent)
├── alignment-agent.ts       (Mastra Agent)
├── pnl-agent.ts            (Mastra Agent)
├── dpa-pm-agent.ts         (Mastra Agent)
├── types.ts                (updated types)
└── mastra-init.ts          (Mastra setup/config)
```

## Testing Plan

### Unit Tests
- Test each agent in isolation
- Mock tools and external services
- Verify tool execution and response format

### Integration Tests
- Test agent routing (manager → specialist)
- Test memory persistence
- Test concurrent agent calls
- Test rate limit handling and fallback

### Feishu Integration Tests
- Test app mention handling
- Test button callbacks
- Test card generation
- Test message threading

### Regression Tests
- Compare Mastra responses with AI SDK responses
- Verify token usage tracking
- Verify cost calculations

## Success Criteria

- [ ] All agents migrate to Mastra
- [ ] All existing tests pass
- [ ] No regression in agent responses
- [ ] Memory and persistence work correctly
- [ ] DevTools integration maintained
- [ ] Token usage tracking accurate
- [ ] Documentation updated
- [ ] Performance comparable or better

## Timeline Estimate

- **Phase 1**: 2-3 hours (setup & exploration)
- **Phase 2**: 4-6 hours (core agent migration)
- **Phase 3**: 2-3 hours (memory migration)
- **Phase 4**: 2-3 hours (tools migration)
- **Phase 5**: 1-2 hours (devtools)
- **Phase 6**: 3-4 hours (testing)
- **Phase 7**: 2-3 hours (remaining agents)
- **Phase 8**: 1-2 hours (cleanup)

**Total**: ~18-26 hours

## Resources Needed

- Mastra documentation
- Mastra GitHub examples
- API comparison guide (AI SDK Tools → Mastra)
- Current test suite
- Feishu API reference (unchanged)

## Risk Mitigation

1. **Keep main branch stable** - All work on `mastra` branch
2. **Frequent testing** - Don't skip phases 1-2 testing
3. **Preserve memory** - Ensure no data loss during migration
4. **Monitor devtools** - Ensure observability isn't lost
5. **Fallback plan** - Can always revert to AI SDK Tools if critical issues arise

## Next Steps

1. Create this plan as documented
2. Start Phase 1 (Setup & Exploration)
3. Review Mastra agent API
4. Create simple test agent to validate approach
5. Document findings and API differences
6. Decision point: Proceed with full migration?
