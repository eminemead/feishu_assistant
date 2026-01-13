# Observability Stack Verification After AgentFS & Skill-Based Routing

## Status: ✅ **LIKELY WORKING** (needs verification)

## Current Architecture

### Observability Setup
- **Location**: `lib/observability-config.ts`
- **Configuration**: Mastra instance with observability enabled
- **Exporter**: Arize Phoenix (OSS)
- **Agents Registered**: `dpa_mom` (production)

### Agent Call Pattern
- **Required**: Retrieve agent from Mastra and call `agent.stream()` / `agent.generate()`

## Potential Issue

**Question**: Does Mastra observability trace direct `agent.stream()` calls, or only calls through an agent retrieved from the Mastra instance?

**Correct Pattern**:
```typescript
import { getMastraAsync } from "../observability-config";

const mastra = await getMastraAsync();
const agent = mastra.getAgent("dpa_mom");
const result = await agent.stream({ messages, executionContext });
```

> Note: `getMastraAsync()` is required because the production `dpa_mom` agent uses async memory init.

## Verification Steps

1. **Start Phoenix**:
   ```bash
   docker compose -f docker-compose.phoenix.yml up -d
   ```

2. **Send a test query** that routes to different agents:
   - OKR query: "分析OKR指标覆盖率"
   - DPA query: "dpa team status"
   - P&L query (skill injection): "分析损益"

3. **Check Phoenix Dashboard** (http://localhost:6006):
   - Look for traces with agent names
   - Verify spans show:
     - Manager agent routing decision
     - Specialist agent execution (OKR, DPA, etc.)
     - Skill injection traces (for P&L, Alignment)

4. **Check for Missing Traces**:
   - If only manager traces appear → direct calls not traced
   - If all agent traces appear → observability working correctly

## Expected Behavior

### ✅ Working Correctly
- All agent calls appear in Phoenix
- Spans show routing decisions
- Skill injection visible in traces
- Tool calls traced within agents

### ⚠️ Not Working
- Only manager agent traces appear
- Specialist agents missing from traces
- No routing decision spans

## Fix (if needed)

If direct calls aren't traced, update routing code to retrieve the agent from Mastra:

```typescript
// Instead of:
const okrAgent = getOkrReviewerAgent();
const result = await okrAgent.stream({ messages, executionContext });

// Use:
import { getMastraAsync } from "../observability-config";
const mastra = await getMastraAsync();
const okrAgent = mastra.getAgent("okrReviewer");
const result = await okrAgent.stream({ messages, executionContext });
```

## AgentFS Impact

**AgentFS**: ✅ No impact on observability
- AgentFS is a filesystem utility
- Doesn't affect agent execution or tracing
- Used for semantic layer, not agent calls

## Skill-Based Routing Impact

**Skill Injection**: ⚠️ May need verification
- Skills injected into manager agent messages
- Manager agent called directly (`managerAgentInstance!.stream()`)
- Should be traced if observability hooks into Agent instances

## Recommendations

1. **Immediate**: Run verification test (see steps above)
2. **If broken**: Update routing to use `mastra.agents.*` pattern
3. **If working**: Document that direct calls are traced automatically

