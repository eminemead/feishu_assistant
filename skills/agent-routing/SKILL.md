---
name: "Agent Routing (Deprecated)"
description: "DEPRECATED - Unified agent now handles tool selection directly"
version: "4.0.0"
tags: ["deprecated", "routing"]
keywords: []
---

# Agent Routing Skill

> **⚠️ DEPRECATED (Jan 2026)**: Routing is now handled by the unified Feishu Assistant agent.
> The agent decides tool selection itself using LLM-based reasoning.
> Workflows are invoked via the `execute_workflow` tool when deterministic multi-step execution is needed.

## Current Architecture

The system now uses a **single unified agent** with all tools attached. See:
- `lib/agents/feishu-assistant-agent.ts` - Unified agent
- `lib/tools/execute-workflow-tool.ts` - Workflow execution tool

## Available Workflows

The agent can invoke these via `execute_workflow` tool:

| Workflow ID | Purpose |
|-------------|---------|
| `dpa-assistant` | GitLab issue creation with confirmation |
| `okr-analysis` | Complete OKR analysis with charts |
| `document-tracking` | Document change monitoring |

## Historical Information

Previously this skill defined keyword-based routing rules that were processed by `lib/routing/query-router.ts`. That system has been removed in favor of LLM-based tool selection by the unified agent.
