---
name: "Agent Routing"
description: "Routes user queries to appropriate specialist agents based on query patterns"
version: "1.0.0"
tags: ["routing", "classification", "orchestration"]
keywords: ["route", "classify", "agent", "specialist"]
routing_rules:
  dpa_mom:
    keywords: ["dpa", "data team", "ae", "da", "dpa_mom", "mom", "ma"]
    priority: 1
    enabled: true
    type: "subagent"
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
    keywords: ["okr", "objective", "key result", "manager review", "has_metric", "覆盖率", "指标覆盖率", "经理评审", "目标", "关键结果", "okr指标", "vau", "okr分析"]
    priority: 4
    enabled: true
    type: "subagent"
---

# Agent Routing Skill

Routes user queries to appropriate specialist agents based on keyword matching and semantic analysis.

## Routing Rules

### DPA Mom (Priority 1 - Highest)
- **Keywords**: dpa, data team, ae, da, dpa_mom, mom, ma
- **Status**: Active
- **Type**: Subagent (context isolation)
- **Agent**: `dpa_mom`

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

### OKR Reviewer (Priority 4 - Lowest)
- **Keywords**: okr, objective, key result, manager review, has_metric, 覆盖率, 指标覆盖率, 经理评审, 目标, 关键结果, okr指标, 指标, okr分析, 分析, 图表, 可视化, visualization, chart, analysis
- **Status**: Active
- **Type**: Subagent (context isolation)
- **Agent**: `okr_reviewer`

## Routing Logic

1. **Keyword Matching**: Check query against each agent's keywords (case-insensitive, word boundary matching)
2. **Score Calculation**: Score = (matches / total_keywords) * priority_weight
   - Priority weight: 1 / priority (lower number = higher priority)
3. **Confidence**: Confidence = min(score * 2, 1.0) if score > 0.3, else 0.5
4. **Selection**: Choose agent with highest score, fallback to "general" if no match

## Priority Order

When multiple agents match, priority determines the winner:
1. DPA Mom (priority 1) - Highest
2. P&L Agent (priority 2)
3. Alignment Agent (priority 3)
4. OKR Reviewer (priority 4) - Lowest

## Examples

**Example 1**: DPA Query
```
Query: "Show me DPA team issues"
→ Matches: ["dpa", "team"]
→ Score: 2/7 = 0.286
→ Route: dpa_mom (confidence: 0.572)
```

**Example 2**: P&L Query
```
Query: "What's the profit for Q4?"
→ Matches: ["profit"]
→ Score: 1/7 = 0.143
→ Route: pnl_agent (confidence: 0.5, but wins due to priority)
```

**Example 3**: OKR Query
```
Query: "What's the OKR coverage for Q4?"
→ Matches: ["okr", "coverage"]
→ Score: 2/19 = 0.105
→ Route: okr_reviewer (confidence: 0.5)
```

**Example 4**: Ambiguous Query
```
Query: "Help me with analysis"
→ Matches: ["analysis"] (OKR)
→ Score: 1/19 = 0.053
→ Route: general (confidence: 0.5, too low)
```

## Best Practices

- Keep keywords specific to avoid false positives
- Update keywords based on user feedback
- Test routing decisions with real queries
- Monitor routing confidence scores
- Priority order ensures DPA Mom queries are handled first, OKR last

