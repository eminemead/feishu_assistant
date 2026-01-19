---
name: mastra-tool-builder
description: Creates Mastra tools for the DPA Mom agent. Use when asked to "add tool", "create tool", or "new capability" for the Feishu assistant.
---

# Mastra Tool Builder

Creates tools for the single `dpa_mom` agent following project conventions.

## Tool Location

All tools live in `lib/tools/`. Name: `<name>-tool.ts` (e.g., `gitlab-cli-tool.ts`)

## Tool Template

```typescript
/**
 * <Name> Tool
 * 
 * <One-line purpose>
 * 
 * NOTE: This is a tool factory for creating tool instances.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { devtoolsTracker } from "../devtools-integration";

/**
 * Result type (export for use in workflows)
 */
export interface <Name>Result {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Creates the <Name> tool
 * 
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 */
export function create<Name>Tool(enableDevtoolsTracking: boolean = true) {
  return createTool({
    id: "<snake_case_id>",
    description: `<Clear description with examples>

Examples:
- "..." → ...
- "..." → ...`,
    inputSchema: z.object({
      // Define inputs with .describe()
      param: z.string().describe("Description of param"),
    }),
    execute: async (inputData, context) => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { success: false, error: "Aborted" };
      }
      
      const startTime = Date.now();
      
      try {
        // Implementation here
        const result = { success: true, output: "..." };
        
        if (enableDevtoolsTracking) {
          devtoolsTracker.trackToolCall("<snake_case_id>", inputData, startTime);
        }
        
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
```

## Registration Checklist

1. **Create tool file**: `lib/tools/<name>-tool.ts`
2. **Export from index**: Add to `lib/tools/index.ts`
3. **Register in agent factory**: Add to `lib/agents/dpa-mom-agent-factory.ts` tools array
4. **Run typecheck**: `bun run typecheck`

## Key Conventions

| Pattern | Example |
|---------|---------|
| Tool ID | `snake_case` (e.g., `gitlab_cli`, `feishu_docs`) |
| File name | `kebab-case-tool.ts` |
| Factory function | `create<PascalCase>Tool()` |
| Result interface | `export interface <Name>Result` |
| Devtools tracking | Always include with `enableDevtoolsTracking` param |
| Abort signal | Check `context?.abortSignal?.aborted` |

## Example: Minimal Tool

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function createPingTool() {
  return createTool({
    id: "ping",
    description: "Simple ping test",
    inputSchema: z.object({
      message: z.string().describe("Message to echo"),
    }),
    execute: async ({ message }) => ({
      success: true,
      output: `Pong: ${message}`,
    }),
  });
}
```

## Guardrails (if needed)

For tools with security constraints (like `gitlab-cli-tool.ts`):

```typescript
const ALLOWED_REPO = "dpa/dpa-mom/task";

function enforceGuardrail(input: string): string {
  // Sanitize and enforce scope
  console.log(`[ToolName] Guardrail: "${input}" → "${sanitized}"`);
  return sanitized;
}
```

## Testing

Create `lib/tools/__tests__/<name>-tool.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { create<Name>Tool } from "../<name>-tool";

describe("<Name> Tool", () => {
  const tool = create<Name>Tool(false); // Disable tracking in tests

  it("should execute successfully", async () => {
    const result = await (tool.execute as any)({ param: "test" });
    expect(result.success).toBe(true);
  });
});
```
