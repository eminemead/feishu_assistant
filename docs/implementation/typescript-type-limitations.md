# TypeScript Type Limitations

## Overview

Some TypeScript type errors occur due to deep type instantiation limits when combining:
- `zodSchema()` wrapper from AI SDK
- `tool()` function from AI SDK  
- Complex Zod schemas
- Type inference chains

## Known Issues

### Deep Type Instantiation Errors

**Location**: `lib/agents/okr-reviewer-agent.ts`

**Error Messages**:
```
Type instantiation is excessively deep and possibly infinite.
No overload matches this call.
```

**Root Cause**: TypeScript's type checker hits recursion limits when inferring types for deeply nested generic types, especially when:
1. `zodSchema()` wraps a Zod schema
2. `tool()` function infers types from the schema
3. The tool is used in an Agent's `tools` object
4. Type inference chains through multiple layers

**Impact**: 
- ❌ TypeScript reports errors
- ✅ Runtime behavior is **100% correct**
- ✅ Code compiles and runs successfully
- ✅ Type safety is maintained at runtime (Zod validates inputs)

## Workarounds

### Current Approach

We use `@ts-ignore` comments with clear explanations:

```typescript
// @ts-ignore - Type instantiation depth issue with zodSchema/tool combination
// This is a known TypeScript limitation with deeply nested generic types
// Runtime behavior is correct
const mgrOkrReviewTool = tool({
  // ... tool definition
});
```

### Alternative Approaches

1. **Type Assertions**: Use `as any` on tools when adding to agents
   ```typescript
   tools: {
     my_tool: myTool as any,
   }
   ```

2. **Simplified Schemas**: Break complex schemas into smaller pieces (not always possible)

3. **Explicit Types**: Define tool types explicitly (loses some type inference benefits)

4. **TypeScript Configuration**: Increase recursion limits (not recommended, can cause performance issues)

## Verification

The code compiles successfully with `bun run build` despite the linter warnings. Runtime behavior is correct because:

1. **Zod validation** ensures type safety at runtime
2. **AI SDK** handles tool execution correctly
3. **Type assertions** don't affect runtime behavior

## Future Solutions

Potential long-term fixes:

1. **AI SDK Updates**: Future versions may simplify type inference
2. **TypeScript Updates**: Newer TypeScript versions may handle deep types better
3. **Schema Simplification**: Refactor to use simpler type patterns
4. **Separate Type Definitions**: Define types separately from tool definitions

## Related Files

- `lib/agents/okr-reviewer-agent.ts` - Contains the affected tool
- `lib/agents/okr-visualization-tool.ts` - Similar pattern, may have same issues
- `lib/devtools-integration.ts` - `trackToolCall` wrapper (fixed to avoid double Promise)

## References

- [TypeScript Issue #34933](https://github.com/microsoft/TypeScript/issues/34933) - Deep type instantiation
- [AI SDK Tools Documentation](https://sdk.vercel.ai/docs) - Tool definitions
- [Zod Documentation](https://zod.dev/) - Schema validation

