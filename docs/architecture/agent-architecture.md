# Agent Architecture

This document describes the unified single-agent architecture.

## Overview

The system uses a **Single Unified Agent + Workflows** pattern using Mastra framework.

**Key Change (Jan 2026)**: Replaced multi-agent routing with a single unified agent (`dpa-mom-agent.ts`) that has all tools. The agent decides tool selection itself; deterministic multi-step operations use the `execute_workflow` tool.

## Architecture Pattern

```
User Query → DPA Mom Agent → [Direct Tool Use OR execute_workflow]
                    ↓
              Tool Selection (by LLM)
                    ↓
         ┌─────────┴─────────┐
    Direct Tools         Workflows
    - gitlab_cli         - dpa-assistant
    - feishu_docs        - okr-analysis  
    - mgr_okr_review     - document-tracking
    - chart_generation
```

## Key Components

### DPA Mom Agent (`lib/agents/dpa-mom-agent.ts`)
- The caring chief-of-staff for the DPA (Data Product & Analytics) team
- Single unified agent with all tools attached
- Native Mastra memory for conversation persistence
- Streaming with batched updates for Feishu cards
- Handles DPA team coordination, OKR review, GitLab operations, and document tracking

### Tools Available
| Tool | Purpose |
|------|---------|
| `gitlab_cli` | GitLab operations via glab CLI |
| `feishu_chat_history` | Search Feishu group chat histories |
| `feishu_docs` | Read Feishu documents |
| `mgr_okr_review` | Fetch OKR metrics data |
| `chart_generation` | Generate Mermaid/Vega-Lite charts |
| `okr_visualization` | Generate OKR heatmaps |
| `okr_chart_streaming` | Comprehensive OKR analysis with charts |
| `execute_workflow` | Execute deterministic workflows |

### Workflows (`lib/workflows/`)
Used for deterministic multi-step operations:
- **dpa-assistant**: GitLab issue creation with confirmation
- **okr-analysis**: Complete OKR analysis pipeline
- **document-tracking**: Document change monitoring

## When Agent Uses Workflows vs Direct Tools

| Scenario | Approach |
|----------|----------|
| GitLab issue creation | `execute_workflow("dpa-assistant")` |
| Complete OKR analysis | `execute_workflow("okr-analysis")` |
| Simple GitLab query | Direct `gitlab_cli` tool |
| Chat history search | Direct `feishu_chat_history` tool |
| Quick OKR data lookup | Direct `mgr_okr_review` tool |

## Documentation

- [Agent README](../../lib/agents/README.md) - Detailed implementation guide
- [Workflow Index](../../lib/workflows/index.ts) - Available workflows

## Migration from Multi-Agent (Historical)

Previously used Manager → Specialist routing. Removed in Jan 2026:
- `manager-agent-mastra.ts` - Deleted (replaced by `dpa-mom-agent.ts`)
- `query-router.ts` - Deleted (agent handles tool selection)
- `skill-injector.ts` - Deleted (no longer needed)
- Specialist agents consolidated into unified agent

For implementation details, see [lib/agents/dpa-mom-agent.ts](../../lib/agents/dpa-mom-agent.ts).

