# Factory Pattern Explained

## What is a Factory?

A **factory** is a function that creates instances of something. Think of it like a factory in real life - you give it instructions, and it produces a product.

## Simple Example

```typescript
// Factory function - creates tool instances
function createSearchWebTool(enableCaching: boolean) {
  // ... tool definition code ...
  return toolInstance;  // Returns a NEW instance each time
}

// Usage - each call creates a NEW instance
const tool1 = createSearchWebTool(true);   // Instance #1
const tool2 = createSearchWebTool(false);  // Instance #2 (different from #1)
```

## What Does "Shared Factory" Mean?

### The Factory Function is Shared ✅

**"Shared"** means the **factory function itself** is reused:
- Multiple places can import and use the same factory function
- The function definition is written once, used many times

**Example**:
```typescript
// lib/tools/search-web-tool.ts
export function createSearchWebTool(...) { ... }  // ← Factory function (shared)

// lib/agents/manager-agent.ts
import { createSearchWebTool } from "../tools";  // ← Uses shared factory
const tool = createSearchWebTool(true);          // ← Creates instance

// dspyground.config.ts
import { createSearchWebTool } from "./lib/tools";  // ← Uses same shared factory
const tool = createSearchWebTool(false);            // ← Creates different instance
```

### The Tool Instances are NOT Shared ❌

**"Shared"** does NOT mean the tool instances are shared:
- Each call to the factory creates a **new, separate instance**
- Instances are independent of each other
- Each agent gets its own tool instance

**Example**:
```typescript
// Manager Agent
const managerTool = createSearchWebTool(true);  // Instance A

// OKR Reviewer Agent (if it used this tool)
const okrTool = createSearchWebTool(true);      // Instance B (different from A)

// These are TWO SEPARATE instances, even though they came from the same factory
```

## Visual Analogy

### Real Factory Analogy

```
Factory Function (Shared):
  └─> createSearchWebTool()
      │
      ├─> Call 1: createSearchWebTool(true)
      │   └─> Produces: Tool Instance #1 (for Manager Agent)
      │
      ├─> Call 2: createSearchWebTool(false)
      │   └─> Produces: Tool Instance #2 (for DSPyground)
      │
      └─> Call 3: createSearchWebTool(true)
          └─> Produces: Tool Instance #3 (different from #1)
```

**Key Point**: The factory is shared (one function), but each call produces a separate instance.

## In Our Codebase

### What's Shared?

**The Factory Function** (`lib/tools/search-web-tool.ts`):
```typescript
// This function definition is SHARED
export function createSearchWebTool(
  enableCaching: boolean = true,
  enableDevtoolsTracking: boolean = true
) {
  // ... creates and returns a tool instance ...
}
```

**Used by**:
- Manager Agent (production)
- DSPyground Config (development)

### What's NOT Shared?

**The Tool Instances**:
```typescript
// Manager Agent creates its own instance
const managerSearchTool = createSearchWebTool(true, true);
// This instance belongs ONLY to Manager Agent

// DSPyground creates its own instance
const dspygroundSearchTool = createSearchWebTool(false, false);
// This instance belongs ONLY to DSPyground
// It's completely separate from managerSearchTool
```

## Why Use Factories?

### Benefits

1. **Reduce Duplication** ✅
   - Write tool definition once
   - Reuse the factory function
   - Don't duplicate tool creation code

2. **Flexible Configuration** ✅
   - Same factory, different configurations
   - Production: `createSearchWebTool(true, true)` (with caching & devtools)
   - Development: `createSearchWebTool(false, false)` (without caching/devtools)

3. **Maintainability** ✅
   - Update tool definition in one place
   - All users of the factory get the update
   - Single source of truth

### Without Factory Pattern

**Before (Duplicated)**:
```typescript
// manager-agent.ts
const searchTool = tool({
  description: "...",
  parameters: zodSchema(...),
  execute: async (...) => { ... }
});

// dspyground.config.ts
const searchTool = tool({  // ← Duplicated!
  description: "...",      // ← Same code repeated
  parameters: zodSchema(...),
  execute: async (...) => { ... }
});
```

**After (Factory Pattern)**:
```typescript
// lib/tools/search-web-tool.ts
export function createSearchWebTool(...) {
  return tool({ ... });  // ← Defined once
}

// manager-agent.ts
import { createSearchWebTool } from "../tools";
const searchTool = createSearchWebTool(true, true);  // ← Uses factory

// dspyground.config.ts
import { createSearchWebTool } from "./lib/tools";
const searchTool = createSearchWebTool(false, false);  // ← Uses same factory
```

## Common Misconceptions

### ❌ Wrong: "Shared means agents share tool instances"

**Incorrect Understanding**:
```
Manager Agent ←→ OKR Reviewer Agent
     (sharing the same tool instance)
```

**Reality**:
```
Manager Agent: createSearchWebTool() → Instance A
OKR Reviewer: createOkrReviewTool() → Instance B
(They use DIFFERENT factories and create DIFFERENT instances)
```

### ✅ Correct: "Shared means the factory function is reused"

**Correct Understanding**:
```
Factory Function (createSearchWebTool)
  ├─> Used by Manager Agent → Creates Instance A
  └─> Used by DSPyground → Creates Instance B
(The factory is shared, but instances are separate)
```

## Summary

### "Shared Factory" Means:

1. **The factory function** is shared/reused
   - Written once in `lib/tools/`
   - Imported and used by multiple places
   - Single source of truth

2. **The tool instances** are NOT shared
   - Each call creates a new instance
   - Instances are independent
   - Each agent has its own instance

3. **The benefit** is code reuse
   - Don't duplicate tool definitions
   - Update in one place
   - Flexible configuration

### Key Takeaway

**"Shared Factory" = Shared function that creates separate instances**

Think of it like:
- **Factory** = Recipe (shared, written once)
- **Instance** = Dish (created each time, separate)

The recipe is shared, but each time you follow it, you get a separate dish!

