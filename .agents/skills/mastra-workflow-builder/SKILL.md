---
name: mastra-workflow-builder
description: Creates Mastra workflows for deterministic multi-step operations. Use when asked to "add workflow", "create workflow", or need orchestrated steps with charts/analysis.
---

# Mastra Workflow Builder

Creates workflows for deterministic multi-step operations executed via `execute_workflow` tool.

## When to Use Workflows vs Tools

| Use Workflow | Use Tool |
|--------------|----------|
| Multi-step orchestration | Single operation |
| Deterministic flow (query → chart → analyze) | Direct API call |
| Need charts + LLM analysis combined | Simple data fetch |
| Steps must run in sequence | Atomic action |

## Workflow Location

All workflows live in `lib/workflows/`. Name: `<name>-workflow.ts`

## Workflow Template

```typescript
/**
 * <Name> Workflow
 * 
 * Orchestrates: Step1 → Step2 → Step3
 * 
 * Uses Mastra v1 beta workflow pattern for deterministic multi-step processes.
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { generateText } from "ai";
import { getMastraModelSingle } from "../shared/model-router";

/**
 * Step 1: <Description>
 */
const step1 = createStep({
  id: "step-1-id",
  inputSchema: z.object({
    param: z.string().describe("Description"),
  }),
  outputSchema: z.object({
    result: z.any(),
    param: z.string(), // Pass through for next step
  }),
  execute: async ({ inputData }) => {
    const { param } = inputData;
    console.log(`[<Name> Workflow] Step 1: ${param}`);
    
    // Implementation
    const result = await someOperation(param);
    
    return { result, param };
  },
});

/**
 * Step 2: <Description>
 */
const step2 = createStep({
  id: "step-2-id",
  inputSchema: z.object({
    result: z.any(),
    param: z.string(),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { result, param } = inputData;
    console.log(`[<Name> Workflow] Step 2`);
    
    // Use LLM if needed (single-agent pattern)
    const model = getMastraModelSingle(false);
    const { text } = await generateText({
      model,
      prompt: `Analyze: ${JSON.stringify(result)}`,
      temperature: 0.3,
    });
    
    return { output: text };
  },
});

/**
 * <Name> Workflow
 */
export const <name>Workflow = createWorkflow({
  id: "<kebab-case-id>",
  description: "<Clear description>",
  inputSchema: z.object({
    param: z.string().describe("Description"),
    userId: z.string().optional().describe("Optional user ID for RLS"),
  }),
  outputSchema: z.object({
    output: z.string(),
  }),
})
  .then(step1)
  .then(step2)
  .commit();
```

## Registration Checklist

1. **Create workflow file**: `lib/workflows/<name>-workflow.ts`
2. **Export from index**: Add to `lib/workflows/index.ts`
3. **Register in registry**: Add to workflow registration in `lib/workflows/execute-workflow.ts`
4. **Run typecheck**: `bun run typecheck`

## Registration in execute-workflow.ts

```typescript
import { <name>Workflow } from "./<name>-workflow";

// In registerAllWorkflows():
registerWorkflow(
  {
    id: "<kebab-case-id>",
    name: "<Human Name>",
    description: "<Description>",
    tags: ["<tag1>", "<tag2>"],
  },
  <name>Workflow
);
```

## Key Patterns

### Step Output → Next Step Input
Each step's `outputSchema` must match next step's `inputSchema`:

```typescript
// Step 1 output
outputSchema: z.object({
  data: z.any(),
  period: z.string(),  // Pass through
})

// Step 2 input (must match)
inputSchema: z.object({
  data: z.any(),
  period: z.string(),
})
```

### Using Tools in Steps

```typescript
import { chartGenerationTool, ChartResponse } from "../tools/chart-generation-tool";

const chartStep = createStep({
  // ...
  execute: async ({ inputData }) => {
    const chart = await (chartGenerationTool.execute as any)({
      chartType: 'vega-lite',
      subType: 'bar',
      title: 'My Chart',
      data: inputData.data,
    }) as ChartResponse;
    
    return { chart: chart.markdown };
  },
});
```

### Using LLM (Single-Agent Pattern)

```typescript
import { generateText } from "ai";
import { getMastraModelSingle } from "../shared/model-router";

// In step execute:
const model = getMastraModelSingle(false); // false = not reasoning model
const { text } = await generateText({
  model,
  prompt: analysisPrompt,
  temperature: 0.3,
});
```

### Error Handling

```typescript
execute: async ({ inputData }) => {
  const { period, userId } = inputData;
  
  const result = await queryData(period, userId);
  
  if (result.error) {
    throw new Error(`Query failed: ${result.error}`);
  }
  
  if (result.data.length === 0) {
    throw new Error(`No data found for period "${period}"`);
  }
  
  return { data: result.data, period };
}
```

## Example: Complete OKR Pattern

See `lib/workflows/okr-analysis-workflow.ts`:
- Step 1: Query DB → Get metrics
- Step 2: Generate Charts → Create visualizations  
- Step 3: Analyze → LLM insights
- Step 4: Format → Combine into report

## Testing

Create `lib/workflows/__tests__/<name>-workflow.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { <name>Workflow } from "../<name>-workflow";

describe("<Name> Workflow", () => {
  it("should execute full workflow", async () => {
    const run = await <name>Workflow.createRun();
    const result = await run.start({
      inputData: { param: "test" },
    });
    
    expect(result).toBeDefined();
  });
});
```
