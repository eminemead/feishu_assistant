# P0: Manager Agent Architecture Inconsistency - Routing vs Fallback

**Priority**: P0 (Critical Architectural Issue)  
**Status**: Open - Awaiting Design Decision  
**Created**: 2025-01-XX  
**Related Files**: 
- `lib/agents/manager-agent.ts`
- `lib/agents/manager-agent-mastra.ts`
- `lib/generate-response.ts`

---

## Problem Statement

The Manager Agent has conflicting roles that create architectural inconsistency:

1. **Documented Role**: Orchestrator that routes queries to specialist agents
2. **Actual Role**: Fallback handler for queries that don't match any specialist

The Manager agent's instructions describe routing logic, but routing is performed in code **before** the Manager is ever invoked. This creates confusion and makes the Manager's routing instructions completely redundant.

---

## Current Architecture

### Routing Flow (Hardcoded in Code)

```typescript
// lib/agents/manager-agent.ts lines 226-635

// 1. Check specialists FIRST (hardcoded priority order)
if (shouldRouteToOkr) { 
  // Route to OKR Reviewer
  return okrAgent.stream(...);
}
if (shouldRouteToAlignment) { 
  // Route to Alignment Agent
  return alignmentAgent.stream(...);
}
if (shouldRouteToPnl) { 
  // Route to P&L Agent
  return pnlAgent.stream(...);
}
if (shouldRouteToDpaMom) { 
  // Route to DPA Mom Agent
  return dpaMomAgent.stream(...);
}

// 2. Manager ONLY called if nothing matched
// Line 637: "No specialist matched - use manager agent for web search"
console.log(`[Manager] No specialist match, using manager agent...`);
return managerAgentInstance.stream(...);
```

### Priority Order (Hardcoded)

1. **OKR Reviewer** (checked first)
2. **Alignment Agent** (checked second)
3. **P&L Agent** (checked third)
4. **DPA Mom Agent** (checked fourth)
5. **Manager Agent** (fallback only)

**Problem**: If a query matches multiple patterns, the first match wins (no scoring).

---

## Manager Agent Instructions (Redundant)

The Manager agent's instructions say:

```
You are a Feishu/Lark AI assistant that routes queries to specialist agents.

路由规则（按以下顺序应用）：
1. OKR Reviewer: 路由关于OKR、目标、关键结果...
2. Alignment Agent: 路由关于对齐...
3. P&L Agent: 路由关于损益...
4. DPA Mom Agent: 路由关于DPA...
5. Fallback: 如果没有匹配的专家，使用网络搜索...
```

**But**: These routing rules are **never used** because routing happens in code before the Manager is called.

---

## Architectural Issues

### 1. **Role Confusion**
- Manager instructions describe routing behavior
- Manager never performs routing (code does it)
- Manager only handles non-routed queries

### 2. **Hardcoded Priority Order**
- Routing priority is hardcoded in code order
- No way to change priority without code changes
- No confidence scoring (first match wins)
- Example: Query "OKR analysis and profit metrics" → Always routes to OKR, even if P&L might be more relevant

### 3. **Redundant Instructions**
- Manager's routing instructions are never executed
- Wastes tokens and creates confusion
- Instructions should reflect actual behavior (fallback handler)

### 4. **Inconsistent with Documentation**
- Documentation says "Manager Agent → Specialist Agent" pattern
- Reality: Code routes directly to specialists, Manager is fallback
- Architecture docs don't match implementation

---

## Comparison: Newer vs Older Implementation

### Newer (`manager-agent.ts`)
- ✅ Uses native Mastra model fallback (better resilience)
- ✅ Uses current APIs (`getMastraModel()`)
- ❌ Simple boolean routing (no scoring)
- ❌ Hardcoded priority order
- ❌ Manager as fallback only

### Older (`manager-agent-mastra.ts`)
- ❌ Uses deprecated APIs (`getPrimaryModel()`)
- ❌ Single model (no fallback)
- ✅ Workflow-based routing with scoring
- ✅ Confidence metrics
- ✅ Manager as fallback (same issue)

**Both have the same architectural problem**: Manager is fallback, not orchestrator.

---

## Proposed Solutions (For Future Debate)

### Option 1: Manager as True Orchestrator

**Change**: Manager decides routing, specialists execute

```typescript
// Manager decides routing
const routingDecision = await managerAgent.decideRouting(query);
if (routingDecision.specialist) {
  routeToSpecialist(routingDecision.specialist);
} else {
  managerAgent.handleGeneral(query);
}
```

**Pros**:
- Matches documented architecture
- Manager instructions become meaningful
- Can use LLM for nuanced routing decisions
- More flexible than hardcoded regex

**Cons**:
- Extra LLM call for routing (latency + cost)
- More complex error handling
- Manager needs routing tool/function

---

### Option 2: Manager as Pure Fallback (Current Behavior)

**Change**: Update Manager instructions to reflect actual role

```typescript
// Manager instructions should say:
"You are a general assistant. Handle queries that don't match specialists.
Use web search for information. Provide helpful guidance."
```

**Pros**:
- Matches current implementation
- No architectural changes needed
- Simple and fast

**Cons**:
- Manager name is misleading (should be "General Agent" or "Fallback Agent")
- Routing logic stays hardcoded in code
- No LLM-based routing decisions

---

### Option 3: Hybrid Approach

**Change**: Code does initial routing, Manager handles edge cases

```typescript
// Code does fast regex routing
const quickRoute = checkSpecialistPatterns(query);
if (quickRoute) {
  return routeToSpecialist(quickRoute);
}

// Manager handles ambiguous queries
const managerDecision = await managerAgent.handleAmbiguous(query);
if (managerDecision.specialist) {
  return routeToSpecialist(managerDecision.specialist);
} else {
  return managerAgent.handleGeneral(query);
}
```

**Pros**:
- Fast path for clear matches
- LLM routing for ambiguous cases
- Best of both worlds

**Cons**:
- More complex logic
- Need to define "ambiguous" threshold
- Two routing mechanisms to maintain

---

### Option 4: Scoring-Based Routing (Like Older Version)

**Change**: Keep code-based routing but add scoring

```typescript
// Calculate scores for all specialists
const scores = {
  okr: calculateOkrScore(query),
  alignment: calculateAlignmentScore(query),
  pnl: calculatePnlScore(query),
  dpaMom: calculateDpaMomScore(query),
};

// Route to highest score (or Manager if all scores below threshold)
const maxScore = Math.max(...Object.values(scores));
if (maxScore > THRESHOLD) {
  routeToSpecialist(getHighestScoringAgent(scores));
} else {
  managerAgent.handleGeneral(query);
}
```

**Pros**:
- Better handling of multi-match queries
- No LLM call needed
- Can add confidence metrics
- More nuanced than boolean matching

**Cons**:
- Still hardcoded in code
- Manager still just fallback
- Need to tune scoring thresholds

---

## Questions for Future Debate

1. **Should Manager be orchestrator or fallback?**
   - Current: Fallback (but instructions say orchestrator)
   - Which matches the intended architecture?

2. **Should routing be code-based or LLM-based?**
   - Current: Code-based (fast, but rigid)
   - Alternative: LLM-based (flexible, but slower/costlier)

3. **How to handle multi-match queries?**
   - Current: First match wins (OKR always beats P&L)
   - Alternative: Scoring, confidence thresholds, or LLM decision?

4. **Should priority order be configurable?**
   - Current: Hardcoded in code
   - Alternative: Config file, database, or LLM-determined?

5. **What should Manager instructions actually say?**
   - Current: Describes routing (never executed)
   - Should match actual behavior (fallback handler)

---

## Impact Assessment

### Current State
- ✅ **Works**: System functions correctly
- ❌ **Confusing**: Instructions don't match behavior
- ❌ **Rigid**: Hardcoded priority order
- ❌ **Inconsistent**: Docs vs implementation

### If Fixed
- ✅ Clearer architecture
- ✅ Better handling of edge cases
- ✅ More maintainable code
- ✅ Instructions match behavior

---

## Recommended Next Steps

1. **Immediate**: Document current behavior accurately
   - Update Manager instructions to reflect fallback role
   - Update architecture docs to match implementation

2. **Short-term**: Add scoring to routing
   - Improve multi-match handling
   - Add confidence metrics
   - Make priority order more nuanced

3. **Long-term**: Architectural decision
   - Decide: Orchestrator vs Fallback
   - Decide: Code-based vs LLM-based routing
   - Refactor accordingly

---

## Related Issues

- Duplicate agent implementations (`*-mastra.ts` vs `*.ts`)
- Hardcoded routing patterns (should be configurable?)
- Manager agent instructions redundancy

---

## References

- `lib/agents/manager-agent.ts` (lines 109-139, 226-635)
- `lib/agents/manager-agent-mastra.ts` (similar structure)
- `docs/architecture/agent-architecture.md`
- `MASTRA_MIGRATION_PLAN.md`

---

**Note**: This issue is created for architectural debate. No immediate action required, but should be resolved before adding more agents or changing routing logic.

