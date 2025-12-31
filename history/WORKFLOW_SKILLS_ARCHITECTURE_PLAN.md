# Workflow-Based Skills Architecture - Migration Plan

**Created**: 2025-12-31  
**Epic**: `feishu_assistant-gva6`  
**Status**: Planning Complete, Ready for Implementation

---

## Executive Summary

Replace subagent routing with Mastra Workflows for deterministic tool execution. Skills become routing metadata; Workflows become execution engines.

### Why This Matters

Current architecture has gaps:
- `type: skill` injects instructions but Manager lacks skill-specific tools
- `type: subagent` works but agents decide tool order non-deterministically
- OKR analysis should ALWAYS: extract period → query DB → generate chart → analyze
- GitLab ops should ALWAYS: parse intent → execute glab → format response

Mastra Workflows provide:
- Deterministic step execution (`.then`, `.branch`, `.parallel`)
- Different models per step (fast for NLU, smart for analysis)
- Explicit tool execution in each step
- Type-safe input/output schemas

---

## Architecture Diagram

```
User Query → Skill Router → Workflow Executor → Response
                ↓
         skills/okr-analysis/SKILL.md
           type: workflow
           workflowId: okr-analysis
                ↓
         lib/workflows/okr-analysis-workflow.ts
           Step 1: extractPeriod (gpt-4o-mini)
           Step 2: queryStarrocks (tool)
           Step 3: generateChart (tool)
           Step 4: analyze (gpt-4o)
```

---

## Task Breakdown

### Epic: feishu_assistant-gva6
**Epic: Workflow-Based Skills Architecture** [P1]

---

### Phase 1: Workflow Core Infrastructure
**Parent**: `feishu_assistant-aqdv`

| ID | Task | Priority | Description |
|----|------|----------|-------------|
| feishu_assistant-j0hm | Create workflow directory structure | P2 | lib/workflows/ with index.ts, types.ts, register.ts |
| feishu_assistant-clgu | Extend skill types to support workflowId | P2 | Add type, workflowId, agentId to SkillMetadata |
| feishu_assistant-o55w | Update skill-based-router for workflow type | P2 | Add 'workflow' to RoutingDecision type |
| feishu_assistant-rwzg | Add workflow execution to manager-agent | P2 | Execute workflows when type='workflow' |

**Dependency Chain**: gva6 → aqdv → j0hm → clgu → o55w → rwzg

---

### Phase 2: OKR Analysis Workflow
**Parent**: `feishu_assistant-61ci`

| ID | Task | Priority | Description |
|----|------|----------|-------------|
| feishu_assistant-ji4t | Create OKR analysis workflow | P2 | 4-step workflow: extract → query → chart → analyze |
| feishu_assistant-kths | Update OKR skill to type=workflow | P2 | skills/okr-analysis/SKILL.md with workflowId |

**Key Implementation**:
```typescript
const okrAnalysisWorkflow = createWorkflow({
  id: 'okr-analysis',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ response: z.string() }),
})
  .then(extractPeriodStep)    // gpt-4o-mini
  .then(queryMetricsStep)     // StarRocks query
  .then(generateChartStep)    // chart_generation tool
  .then(analyzeStep)          // gpt-4o
  .commit();
```

---

### Phase 3: DPA Assistant Workflow
**Parent**: `feishu_assistant-0nj3`

| ID | Task | Priority | Description |
|----|------|----------|-------------|
| feishu_assistant-9apj | Create DPA assistant workflow | P2 | Intent classification + branching workflow |
| feishu_assistant-u6q2 | Create DPA assistant skill | P2 | skills/dpa-assistant/SKILL.md |

**Key Implementation**:
```typescript
const dpaAssistantWorkflow = createWorkflow({
  id: 'dpa-assistant',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ response: z.string() }),
})
  .then(classifyIntentStep)  // gpt-4o-mini
  .branch([
    [async ({ inputData }) => inputData.intent === 'gitlab_create', gitlabCreateStep],
    [async ({ inputData }) => inputData.intent === 'gitlab_list', gitlabListStep],
    [async ({ inputData }) => inputData.intent === 'chat_search', chatSearchStep],
    [async ({ inputData }) => inputData.intent === 'general_chat', generalChatStep],
  ])
  .then(formatResponseStep)
  .commit();
```

---

### Phase 4: Cleanup and Deprecation
**Parent**: `feishu_assistant-appv`

| ID | Task | Priority | Description |
|----|------|----------|-------------|
| feishu_assistant-wgj2 | Remove subagent routing from manager-agent | P2 | Delete if (type === 'subagent') block |
| feishu_assistant-gvt6 | Move deprecated agent files | P3 | lib/agents/deprecated/ |

---

### Phase 5: Testing and Validation
**Parent**: `feishu_assistant-mi8x`

| ID | Task | Priority | Description |
|----|------|----------|-------------|
| feishu_assistant-a2hi | Add workflow unit tests | P2 | Test workflow steps and execution |
| feishu_assistant-wtg0 | Add routing integration tests | P2 | Test workflow routing |
| feishu_assistant-4v64 | Update documentation | P3 | docs/ARCHITECTURE.md, skills/README.md |

---

## Execution Order

Based on dependencies, execute in this order:

```
Phase 1 (Sequential):
  1. feishu_assistant-j0hm: Create workflow directory structure
  2. feishu_assistant-clgu: Extend skill types
  3. feishu_assistant-o55w: Update router
  4. feishu_assistant-rwzg: Add workflow execution to manager

Phase 2 & 3 (Can parallelize after Phase 1):
  5a. feishu_assistant-ji4t: Create OKR workflow
  5b. feishu_assistant-9apj: Create DPA workflow
  6a. feishu_assistant-kths: Update OKR skill
  6b. feishu_assistant-u6q2: Create DPA skill

Phase 4 (After Phase 2 & 3):
  7. feishu_assistant-wgj2: Remove subagent routing
  8. feishu_assistant-gvt6: Move deprecated files

Phase 5 (After Phase 4):
  9. feishu_assistant-a2hi: Unit tests
  10. feishu_assistant-wtg0: Integration tests
  11. feishu_assistant-4v64: Documentation
```

---

## Success Criteria

1. ✅ OKR analysis uses workflow with guaranteed chart generation
2. ✅ GitLab ops use workflow with structured intent parsing
3. ✅ No 'subagent' routing type in codebase
4. ✅ Different models per workflow step working
5. ✅ Skills define workflowId, not agentId
6. ✅ All existing functionality preserved
7. ✅ Tests pass

---

## Commands for Next Session

```bash
# Check ready work
bd ready --json

# Start with Phase 1
bd update feishu_assistant-j0hm --status=in_progress

# After completing a task
bd close feishu_assistant-j0hm

# Sync at end of session
bd sync
```

---

## Key Design Decisions

### 1. Workflows Can Use Different Models Per Step

```typescript
const extractStep = createStep({
  execute: async ({ inputData }) => {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),  // Fast model
      prompt: `Extract period from: ${inputData.query}`,
    });
    return { period: text };
  },
});

const analyzeStep = createStep({
  execute: async ({ inputData }) => {
    const { text } = await generateText({
      model: openai('gpt-4o'),  // Smart model
      prompt: `Deep analysis of: ${JSON.stringify(inputData.data)}`,
    });
    return { analysis: text };
  },
});
```

### 2. Skills Define Routing, Workflows Define Execution

```yaml
# skills/okr-analysis/SKILL.md
---
name: "OKR Analysis"
type: "workflow"
workflowId: "okr-analysis"
keywords: ["okr", "分析", "覆盖率"]
---
```

### 3. No Subagent Concept After Migration

Before:
```typescript
type: 'workflow' | 'subagent' | 'skill' | 'general'
```

After:
```typescript
type: 'workflow' | 'skill' | 'general'
```

---

## Related Issues

- `feishu_assistant-hj1d`: Manager Agent Architecture Inconsistency (this migration addresses it)
- `feishu_assistant-lvna`: AgentFS + Just-Bash Migration (alternative approach, may be complementary)

---

## References

- Mastra Workflows: https://mastra.ai/docs/workflows
- Agent Skills Standard: https://agentskills.io
- This session conversation: Covered RuntimeContext, dynamic model selection, workflow branching

