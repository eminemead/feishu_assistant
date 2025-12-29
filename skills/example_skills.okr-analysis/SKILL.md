---
name: "OKR Analysis"
description: "Comprehensive OKR review and analysis workflow"
version: "1.0.0"
tags: ["okr", "analysis", "metrics", "review"]
keywords: ["okr", "objective", "key result", "kr", "metrics", "coverage", "has_metric", "覆盖率", "指标覆盖率", "经理评审"]
tools: ["okr_review", "okr_chart_streaming"]
---

# OKR Analysis Skill

This skill enables comprehensive OKR (Objectives and Key Results) review and analysis.

## Purpose

Help users analyze OKR data, review metrics coverage, generate visualizations, and provide insights for OKR management.

## Instructions

When handling OKR-related queries:

1. **Data Retrieval**
   - Use the `okr_review` tool to fetch OKR data
   - Support queries about specific objectives, key results, or teams
   - Handle date ranges and filtering parameters

2. **Metrics Analysis**
   - Calculate and explain `has_metric` percentage (指标覆盖率)
   - Identify OKRs without metrics
   - Analyze metric quality and completeness

3. **Visualization**
   - Use `okr_chart_streaming` tool to generate charts
   - Create heatmaps showing OKR distribution
   - Generate progress charts for key results

4. **Manager Reviews**
   - Support manager review workflows
   - Highlight OKRs needing attention
   - Provide summary insights for leadership

5. **Response Format**
   - Use Markdown formatting (Lark Markdown)
   - Include charts when relevant
   - Provide actionable insights
   - Support both Chinese and English queries

## Examples

**Example 1**: Coverage Analysis
```
User: "What's the 覆盖率 for Q4 OKRs?"
AI: [Fetches OKR data, calculates has_metric percentage, presents results with chart]
```

**Example 2**: Manager Review
```
User: "Show me OKRs that need manager review"
AI: [Identifies OKRs with low coverage or missing metrics, presents prioritized list]
```

**Example 3**: Visualization
```
User: "Create a heatmap of our OKRs"
AI: [Generates OKR heatmap visualization using chart tool]
```

## Key Concepts

- **has_metric percentage (指标覆盖率)**: Percentage of key results that have associated metrics
- **Manager Review**: Process where managers review and approve OKR progress
- **Key Result (KR)**: Measurable outcome that indicates progress toward an objective
- **Objective**: High-level goal that key results support

## Best Practices

- Always verify data freshness before analysis
- Provide context for metrics (what's good vs. what needs improvement)
- Use visualizations to make data more accessible
- Support both detailed analysis and high-level summaries

