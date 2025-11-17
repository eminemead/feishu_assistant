# Agent Architecture

This directory contains the multi-agent architecture implementation for the Feishu assistant using [`@ai-sdk-tools/agents`](https://ai-sdk-tools.dev/docs/agents).

## Architecture Overview

The system follows a **Manager Agent → Specialist Agent → Tool** pattern using the `@ai-sdk-tools/agents` library:

1. **Manager Agent** (`manager-agent.ts`): 
   - **ONLY responsible for orchestration/routing**
   - Uses `Agent` class with `handoffs` array to route queries to specialist agents
   - Routes based on `matchOn` patterns (keywords) defined in specialist agents
   - Falls back to web search tool if no specialist matches
   - Does NOT have access to specialist tools
2. **Specialist Agents**: 
   - Each uses the `Agent` class from `@ai-sdk-tools/agents`
   - Handle specific domains (OKR, alignment, P&L, DPA PM)
   - Use `matchOn` for keyword-based routing
   - Each agent has its own tools scoped to that agent only
3. **Tools**: 
   - Specialized functions available only to their dedicated specialist agent
   - Example: `mgr_okr_review` tool is only available to the OKR Reviewer agent

## Agents

### Manager Agent
- **File**: `manager-agent.ts`
- **Purpose**: Routes user queries to appropriate specialist agents
- **Routing Strategy**: 
  - First tries keyword-based matching
  - Falls back to LLM-based semantic routing
  - If no match, uses web search or asks for clarification

### OKR Reviewer Agent
- **File**: `okr-reviewer-agent.ts`
- **Purpose**: Analyzes OKR metrics and manager performance
- **Tools**:
  - `mgr_okr_review`: Analyzes `has_metric_percentage` per city company from DuckDB
- **Keywords**: okr, objective, key result, metrics, manager review, has_metric, 覆盖率, 指标

### Alignment Agent
- **File**: `alignment-agent.ts`
- **Status**: Placeholder (pending specification)
- **Keywords**: alignment, 对齐, 目标对齐

### P&L Agent
- **File**: `pnl-agent.ts`
- **Status**: Placeholder (pending specification)
- **Keywords**: pnl, profit, loss, 损益, 利润, 亏损

### DPA PM Agent
- **File**: `dpa-pm-agent.ts`
- **Status**: Placeholder (pending specification)
- **Keywords**: dpa, pm, product management, 产品管理

## Usage

The manager agent is automatically used by `generate-response.ts` when processing user messages. Specialist agents are invoked based on query analysis.

## Adding New Agents

1. Create a new agent file using the `Agent` class from `@ai-sdk-tools/agents`
2. Define `matchOn` patterns for keyword-based routing
3. Add the agent to the `handoffs` array in `manager-agent.ts`
4. Define any tools the agent needs using the `tool()` function from AI SDK

Example:
```typescript
import { Agent } from "@ai-sdk-tools/agents";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const myAgent = new Agent({
  name: "my_agent",
  model: openrouter("kwaipilot/kat-coder-pro:free"),
  instructions: "Agent instructions here...",
  matchOn: ["keyword1", "keyword2"], // Keywords for routing
  tools: {
    // Tools specific to this agent
  },
});
```

## Tools

Tools are defined using the AI SDK v5 `tool()` function with:
- `description`: What the tool does
- `parameters`: Zod schema defining input parameters (wrapped with `zodSchema()`)
- `execute`: Async function that performs the tool's action

Example:
```typescript
import { tool, zodSchema } from "ai";
import { z } from "zod";

export const myTool = tool({
  description: "Tool description",
  parameters: zodSchema(z.object({
    param: z.string().describe("Parameter description"),
  })),
  execute: async ({ param }: { param: string }) => {
    // Tool implementation
    return { result: "..." };
  },
});
```

## Benefits of @ai-sdk-tools/agents

- **Built-in handoff management**: Automatic routing between agents
- **Pattern-based routing**: `matchOn` for efficient keyword matching
- **Event handling**: Track agent handoffs and execution
- **Memory integration**: Can add `@ai-sdk-tools/memory` for persistent context
- **Provider flexibility**: Use different models for different agents

