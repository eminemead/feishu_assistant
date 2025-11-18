# Tool Factories Pattern

## Overview

This document explains the tool factories pattern used in the Feishu assistant codebase.

## Key Principle: Agent Independence

**Architecture Rule**: Each agent has its own tool instances scoped to that agent only. Tools are **NOT shared between agents**.

```
Manager Agent:
  - Tools: { searchWeb }  ← Only Manager has this

OKR Reviewer Agent:
  - Tools: { mgr_okr_review }  ← Only OKR Reviewer has this

Alignment Agent:
  - Tools: {}  ← No tools yet
```

## What Are Tool Factories?

Tool factories are **functions that create tool instances**, not shared tool instances themselves.

**Location**: `lib/tools/`

**Purpose**: Reduce duplication between:
- Production code (agents)
- Development tools (dspyground.config.ts)

**NOT for**: Sharing tools between agents (agents remain independent)

## Structure

```
lib/tools/
├── index.ts              # Exports all tool factories
├── search-web-tool.ts    # Factory for Manager's searchWeb tool
└── okr-review-tool.ts   # Factory for OKR Reviewer's mgr_okr_review tool
```

## Usage Pattern

### Production Agents

**Manager Agent** (`lib/agents/manager-agent.ts`):
```typescript
import { createSearchWebTool } from "../tools";

// Create tool instance with caching and devtools tracking
const searchWebTool = createSearchWebTool(true, true);

export const managerAgentInstance = new Agent({
  tools: {
    searchWeb: searchWebTool,  // Scoped to Manager Agent only
  },
});
```

**OKR Reviewer Agent** (`lib/agents/okr-reviewer-agent.ts`):
```typescript
import { createOkrReviewTool } from "../tools";

// Create tool instance with caching (1 hour TTL) and devtools tracking
const mgrOkrReviewTool = createOkrReviewTool(
  true,  // enableCaching
  true,  // enableDevtoolsTracking
  60 * 60 * 1000  // cacheTTL: 1 hour
);

export const okrReviewerAgent = new Agent({
  tools: {
    mgr_okr_review: mgrOkrReviewTool,  // Scoped to OKR Reviewer Agent only
  },
});
```

### Development Tools

**DSPyground Config** (`dspyground.config.ts`):
```typescript
import { createSearchWebTool, createOkrReviewTool } from './lib/tools'

// Create tools without caching (not needed during optimization)
const searchWebTool = createSearchWebTool(false, false);
const mgrOkrReviewTool = createOkrReviewTool(false, false);

export default {
  tools: {
    searchWeb: searchWebTool,
    mgr_okr_review: mgrOkrReviewTool,
  },
};
```

## Benefits

### 1. Reduces Duplication ✅
- Tool definitions written once
- Used by both production and development
- Single source of truth for tool schemas

### 2. Maintains Agent Independence ✅
- Each agent creates its own tool instance
- Tools remain scoped to individual agents
- No cross-agent tool access

### 3. Flexible Configuration ✅
- Production: Enable caching and devtools tracking
- Development: Disable caching and devtools
- Custom TTL for different use cases

## Important Notes

### ❌ NOT Shared Between Agents

**Wrong Understanding**:
```
Manager Agent ←→ OKR Reviewer Agent  ❌ (Doesn't happen)
```

**Correct Understanding**:
```
Production (agents) ←→ Development (dspyground)  ✅ (This is what's shared)
```

### ✅ Tool Instances Are Agent-Specific

Each agent creates its own tool instance:
- Manager Agent creates `searchWebTool` instance
- OKR Reviewer Agent creates `mgrOkrReviewTool` instance
- These instances are separate and independent

### ✅ Tool Definitions Are Reused

The tool **definitions** (schema, description, execute logic) are reused:
- Same definition used in production and development
- Same definition ensures consistency
- But each creates its own instance

## Adding New Tools

### Step 1: Create Tool Factory

Create `lib/tools/my-tool.ts`:
```typescript
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { cached } from "../cache";
import { trackToolCall } from "../devtools-integration";

export function createMyTool(
  enableCaching: boolean = true,
  enableDevtoolsTracking: boolean = true
) {
  const executeFn = enableDevtoolsTracking
    ? trackToolCall("myTool", async (params) => {
        // Tool implementation
      })
    : async (params) => {
        // Tool implementation
      };

  const toolBase = tool({
    description: "Tool description",
    parameters: zodSchema(z.object({ /* ... */ })),
    execute: executeFn,
  });

  return enableCaching ? cached(toolBase as any) : toolBase;
}
```

### Step 2: Export from Index

Add to `lib/tools/index.ts`:
```typescript
export { createMyTool } from "./my-tool";
```

### Step 3: Use in Agent

In your agent file:
```typescript
import { createMyTool } from "../tools";

const myTool = createMyTool(true, true);

export const myAgent = new Agent({
  tools: {
    myTool: myTool,  // Scoped to this agent only
  },
});
```

## Architecture Compliance

This pattern:
- ✅ Maintains agent independence
- ✅ Keeps tools scoped to individual agents
- ✅ Reduces code duplication
- ✅ Provides flexibility for different environments

This pattern does NOT:
- ❌ Share tool instances between agents
- ❌ Violate agent independence principle
- ❌ Create cross-agent dependencies

## Related Documentation

- [Agent Architecture](./agent-architecture.md) - Overall agent architecture
- [Tool Sharing Architecture Evaluation](./tool-sharing-architecture-evaluation.md) - Detailed evaluation
- [Redundancy Fixes Summary](../implementation/redundancy-fixes-summary.md) - Implementation details

