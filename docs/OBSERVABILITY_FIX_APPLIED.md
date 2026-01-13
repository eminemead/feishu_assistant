# Observability Fix Applied

**Date**: 2025-01-XX  
**Status**: ✅ **COMPLETED**

## Changes Made

### Updated `lib/agents/manager-agent-mastra.ts`

**Before** (Direct agent calls - NOT TRACED):
```typescript
import { getOkrReviewerAgent } from "./okr-reviewer-agent";
import { getDpaMomAgent } from "./dpa-mom-agent";
// ...
const okrAgent = getOkrReviewerAgent();
const dpaMomAgent = getDpaMomAgent();
```

**After** (Through Mastra instance - TRACED):
```typescript
import { getMastraAsync } from "../observability-config";
// ...
const mastra = await getMastraAsync();
const okrAgent = mastra.getAgent("okrReviewer");
const dpaMomAgent = mastra.getAgent("dpa_mom");
```

### All Agent Calls Updated

1. ✅ DPA Mom Agent: `mastra.getAgent("dpa_mom")`
2. ✅ OKR Reviewer Agent: `mastra.getAgent("okrReviewer")`
3. ✅ Alignment Agent: `mastra.getAgent("alignment")`
4. ✅ P&L Agent: `mastra.getAgent("pnl")`

### Why This Works

- **Phoenix logs are entirely based on what the Mastra instance emits**
- When agents are retrieved via `mastra.getAgent()`, Mastra's observability hooks into the calls
- All agent executions are now automatically traced and sent to Phoenix

## Verification

Run the verification script:
```bash
bun run scripts/verify-observability.ts
```

Then check Phoenix dashboard:
```bash
open http://localhost:6006
```

You should now see traces for:
- Manager agent routing decisions
- Specialist agent executions (OKR, DPA, P&L, Alignment)
- Skill injection traces
- Tool calls within agents

## Notes

- `getManagerAgent()` export is kept for backward compatibility (used in `observability-config.ts`)
- No circular dependency issues - Mastra is created after agents are initialized
- All routing paths now use Mastra instance for observability

