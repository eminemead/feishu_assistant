---
name: "Agent Routing"
description: "Routes user queries to appropriate specialist agents or workflows based on query patterns"
version: "3.0.0"
tags: ["routing", "classification", "orchestration", "workflow"]
keywords: ["route", "classify", "agent", "specialist", "workflow"]
routing_rules:
  dpa_assistant:
    keywords: ["dpa", "data team", "dpa_mom", "gitlab", "glab", "create issue", "new issue", "创建issue", "提issue", "建issue", "报bug", "new bug"]
    priority: 1
    enabled: true
    type: "workflow"
    workflowId: "dpa-assistant"
  pnl_agent:
    keywords: ["pnl", "profit", "loss", "损益", "利润", "亏损", "ebit"]
    priority: 2
    enabled: true
    type: "skill"
  alignment_agent:
    keywords: ["alignment", "对齐", "目标对齐"]
    priority: 3
    enabled: true
    type: "skill"
  okr_reviewer:
    keywords: ["okr", "objective", "key result", "manager review", "has_metric", "覆盖率", "指标覆盖率", "经理评审", "目标", "关键结果", "okr指标", "vau", "okr分析", "图表", "可视化", "visualization", "chart"]
    priority: 4
    enabled: true
    type: "workflow"
    workflowId: "okr-analysis"
---

# Agent Routing Skill

Routes user queries to appropriate specialist agents or workflows based on keyword matching and semantic analysis.

## Execution Types

### Workflow (Deterministic) ✅ Preferred
Workflows execute multi-step pipelines with guaranteed step ordering:
- Intent classification → Branch → Execute → Format Response
- Different models per step (fast for classification, smart for generation)
- Full observability and traceability
- Cost optimization through model selection

### Skill (Legacy)
Skills inject instructions into manager agent:
- Simple but limited
- No access to specialized tools
- Being replaced by workflows

## Routing Rules

### DPA Assistant (Priority 1 - Highest)
- **Keywords**: dpa, data team, dpa_mom, gitlab, glab, 创建issue, 提issue, 建issue
- **Status**: Active
- **Type**: Workflow (deterministic, intent-based)
- **Workflow**: `dpa-assistant`
- **Intents**:
  - `gitlab_create`: Create GitLab issues
  - `gitlab_list`: List/view GitLab issues/MRs
  - `chat_search`: Search Feishu chat history
  - `doc_read`: Read Feishu documents
  - `general_chat`: Conversational AI

### P&L Agent (Priority 2)
- **Keywords**: pnl, profit, loss, 损益, 利润, 亏损, ebit
- **Status**: Active
- **Type**: Skill (injected into manager)
- **Agent**: `pnl_agent`

### Alignment Agent (Priority 3)
- **Keywords**: alignment, 对齐, 目标对齐
- **Status**: Active
- **Type**: Skill (injected into manager)
- **Agent**: `alignment_agent`

### OKR Reviewer (Priority 4)
- **Keywords**: okr, objective, key result, manager review, has_metric, 覆盖率, 指标覆盖率, 经理评审, 目标, 关键结果, okr指标, 图表, 可视化, visualization, chart
- **Status**: Active
- **Type**: Workflow (deterministic multi-step)
- **Workflow**: `okr-analysis`
- **Steps**:
  1. Query OKR data from StarRocks
  2. Generate charts (bar, pie, heatmap)
  3. Analyze with OKR Reviewer agent
  4. Format final response

## Routing Logic

1. **Keyword Matching**: Check query against each rule's keywords (case-insensitive, word boundary matching)
2. **Score Calculation**: Score = (matches / total_keywords) * priority_weight
   - Priority weight: 1 / priority (lower number = higher priority)
3. **Confidence**: Confidence = min(score * 2, 1.0) if score > 0.3, else 0.5
4. **Selection**: Choose rule with highest score, fallback to "general" if no match
5. **Execution**:
   - If type="workflow" and workflowId exists → Execute workflow
   - If type="skill" → Inject instructions into manager
   - Otherwise → General manager response

## Priority Order

When multiple rules match, priority determines the winner:
1. DPA Assistant (priority 1) - Highest
2. P&L Agent (priority 2)
3. Alignment Agent (priority 3)
4. OKR Reviewer (priority 4) - Lowest

## Examples

**Example 1**: DPA Query
```
Query: "帮我在gitlab上创建issue"
→ Matches: ["gitlab", "创建issue"]
→ Score: 2/8 = 0.25
→ Route: dpa-assistant (workflow)
→ Intent: gitlab_create
→ Execution: glab issue create
```

**Example 2**: P&L Query
```
Query: "What's the profit for Q4?"
→ Matches: ["profit"]
→ Score: 1/7 = 0.143
→ Route: pnl_agent (skill, confidence: 0.5)
```

**Example 3**: OKR Query (Workflow)
```
Query: "分析10月OKR指标覆盖率"
→ Matches: ["okr", "覆盖率", "指标"]
→ Score: 3/15 = 0.2
→ Route: okr-analysis (workflow)
→ Execution:
   Step 1: queryOkrData → Fetch from StarRocks
   Step 2: generateCharts → Create visualizations
   Step 3: analyze → OKR Reviewer generates insights
   Step 4: formatResponse → Combine into report
```

**Example 4**: DPA Chat Query
```
Query: "DPA team help me find the chat about login"
→ Matches: ["dpa", "team"]
→ Route: dpa-assistant (workflow)
→ Intent: chat_search
→ Execution: Feishu chat history tool
```

## Best Practices

- Prefer workflows for multi-step tasks requiring guaranteed output
- Keep keywords specific to avoid false positives
- Update keywords based on user feedback
- Test routing decisions with real queries
- Monitor routing confidence scores
- Priority order ensures DPA queries are handled first

## Adding New Workflows

1. Create workflow in `lib/workflows/`
2. Register in `initializeWorkflows()`
3. Add routing rule with `type: "workflow"` and `workflowId`
4. Update this SKILL.md documentation
