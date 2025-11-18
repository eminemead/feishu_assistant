# Build Optimization Improvements

## Current Issues

### 1. Memory Exhaustion
- TypeScript compiler runs out of memory during build
- Takes ~5+ minutes and crashes with SIGABRT
- This is a known issue with complex TypeScript projects

### 2. Build Process
- Currently using `bun tsc` (TypeScript compiler)
- No parallelization
- No build caching beyond incremental compilation

## Optimization Strategies

### Strategy 1: Use Bun's Native Transpiler (Recommended)

**Bun has a built-in TypeScript transpiler** that's much faster than `tsc`:

**Benefits**:
- ✅ **10-100x faster** than TypeScript compiler
- ✅ **Lower memory usage**
- ✅ **No separate compilation step needed** for development
- ✅ **Still type-checks** (can use `bun --typecheck`)

**Implementation**:
```json
{
  "scripts": {
    "build": "bun build ./server.ts --outdir ./dist --target node",
    "build:typecheck": "bun --typecheck",
    "build:full": "bun tsc && bun build ./server.ts --outdir ./dist --target node"
  }
}
```

### Strategy 2: Optimize TypeScript Compiler Options

**Current optimizations** (already applied):
- ✅ `incremental: true`
- ✅ `skipLibCheck: true`
- ✅ `isolatedModules: true`

**Additional optimizations**:
```json
{
  "compilerOptions": {
    "maxNodeModuleJsDepth": 1,        // Limit depth for node_modules
    "preserveWatchOutput": true,       // Better watch mode
    "assumeChangesOnlyAffectDirectDependencies": true  // Faster incremental
  }
}
```

### Strategy 3: Use Project References (For Large Projects)

**When to use**: If codebase grows significantly

**Benefits**:
- Parallel compilation of independent modules
- Better caching
- Faster rebuilds

**Structure**:
```
tsconfig.base.json      # Base config
tsconfig.agents.json    # Agents project
tsconfig.server.json    # Server project
```

### Strategy 4: Development vs Production Builds

**Development**: Use Bun's fast transpiler
**Production**: Use TypeScript for full type checking

```json
{
  "scripts": {
    "dev": "bun server.ts",                    // No build needed!
    "build:dev": "bun build ./server.ts",      // Fast transpile
    "build:prod": "bun tsc",                   // Full type check
    "build": "bun run build:prod"              // Default to prod
  }
}
```

## Recommended Implementation

### Option A: Use Bun Build (Fastest)

**Best for**: Development and most builds

```json
{
  "scripts": {
    "build": "bun build ./server.ts --outdir ./dist --target node --minify",
    "build:dev": "bun build ./server.ts --outdir ./dist --target node",
    "build:typecheck": "bun --typecheck",
    "build:watch": "bun build ./server.ts --outdir ./dist --target node --watch"
  }
}
```

**Pros**:
- ✅ Extremely fast (10-100x faster)
- ✅ Low memory usage
- ✅ Built-in watch mode
- ✅ Minification support

**Cons**:
- ⚠️ May not catch all TypeScript errors (use `--typecheck` separately)
- ⚠️ Different output format (may need adjustments)

### Option B: Optimize TypeScript Compiler

**Best for**: When you need full TypeScript checking

```json
{
  "compilerOptions": {
    "maxNodeModuleJsDepth": 1,
    "assumeChangesOnlyAffectDirectDependencies": true,
    "preserveWatchOutput": true
  }
}
```

**Add to package.json**:
```json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' bun tsc",
    "build:fast": "bun tsc --incremental --skipLibCheck"
  }
}
```

### Option C: Hybrid Approach (Recommended)

**Use Bun for development, TypeScript for production**:

```json
{
  "scripts": {
    "dev": "bun server.ts",                              // No build!
    "build": "bun run build:typecheck && bun run build:transpile",
    "build:typecheck": "bun --typecheck",                // Fast type check
    "build:transpile": "bun build ./server.ts --outdir ./dist --target node",
    "build:watch": "bun --watch server.ts",              // Watch mode
    "build:clean": "rm -rf dist .tsbuildinfo && bun run build"
  }
}
```

## Implementation Plan

### Phase 1: Quick Win - Use Bun Build
1. Update `package.json` scripts
2. Test build output
3. Verify runtime behavior

### Phase 2: Optimize TypeScript (If Needed)
1. Add memory options
2. Optimize compiler flags
3. Test incremental builds

### Phase 3: Add Build Scripts
1. Separate dev/prod builds
2. Add watch mode
3. Add type checking script

## Expected Improvements

### Current Performance
- Build time: ~5+ minutes (crashes)
- Memory: Out of memory
- Incremental: Not working due to crashes

### After Optimization (Bun Build)
- Build time: **<5 seconds** (10-100x faster)
- Memory: **Low** (no crashes)
- Incremental: **Instant** (Bun's watch mode)

### After Optimization (TypeScript)
- Build time: **30-60 seconds** (with memory fix)
- Memory: **Manageable** (with increased limit)
- Incremental: **1-3 seconds** (with proper caching)

## Testing

After implementing optimizations:

```bash
# Test Bun build
time bun run build

# Test incremental build
time bun run build  # Second run should be faster

# Test watch mode
bun run build:watch
```

## Recommendations

**For this project, I recommend**:

1. **Use Bun Build** for most builds (fastest, lowest memory)
2. **Add type checking** as separate step (`bun --typecheck`)
3. **Keep TypeScript config** for IDE support
4. **Use watch mode** for development (`bun --watch`)

This gives you:
- ✅ Fast builds (<5 seconds)
- ✅ Low memory usage
- ✅ Type safety (via separate typecheck)
- ✅ Great developer experience

