# Agent Architecture

This document provides an overview of the multi-agent architecture. For detailed information, see the linked documents below.

## Overview

The system follows a **Manager Agent → Specialist Agent → Tool** pattern using the `@ai-sdk-tools/agents` library.

## Architecture Pattern

1. **Manager Agent** - Orchestrates and routes queries
2. **Specialist Agents** - Handle domain-specific tasks
3. **Tools** - Specialized functions for each agent

## Documentation

- [Routing Logic](./routing-logic.md) - How queries are routed to specialist agents
- [Handoff System](./handoff-setup.md) - Agent handoff mechanism
- [Agent README](../../lib/agents/README.md) - Detailed agent implementation guide

## Quick Reference

### Manager Agent
- Routes queries to appropriate specialist agents
- Uses keyword matching and semantic analysis
- Falls back to web search for general queries

### Specialist Agents
- **OKR Reviewer**: OKR metrics and manager performance analysis
- **Alignment Agent**: Alignment tracking (under development)
- **P&L Agent**: Profit & loss analysis (under development)
- **DPA PM Agent**: Product management tasks (under development)

For implementation details, see [lib/agents/README.md](../../lib/agents/README.md).

