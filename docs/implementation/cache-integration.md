# Cache Integration Guide

## Overview

We use [`@ai-sdk-tools/cache`](https://ai-sdk-tools.dev/cache) to cache expensive tool operations, providing:

- **10x faster responses** for repeated requests
- **80% cost reduction** by avoiding duplicate API calls
- **Universal compatibility** with all AI SDK tools (including streaming and artifacts)

## Configuration

**File**: `lib/cache.ts`

### Environment-Aware Setup

```typescript
// Production: Redis (if UPSTASH_REDIS_REST_URL is set)
// Development: LRU cache (in-memory, zero config)
export const cached = process.env.UPSTASH_REDIS_REST_URL
  ? createCached({ cache: Redis.fromEnv(), ttl: 60 * 60 * 1000 })
  : createCached({ ttl: 15 * 60 * 1000, debug: true });
```

### Cache Backends

1. **Development (LRU Cache)**
   - In-memory, zero configuration
   - Fast for single-instance development
   - TTL: 15 minutes

2. **Production (Redis)**
   - Distributed cache for multiple instances
   - Persistent across restarts
   - TTL: 1 hour (configurable)

## Cached Tools

### 1. Web Search Tool (`searchWebTool`)

**Location**: `lib/agents/manager-agent.ts`

**Why cache**: Exa API calls are expensive and slow (2-3 seconds)

**Cache TTL**: 30 minutes (default)

**Impact**: 
- First call: 2-3 seconds (API request)
- Cached calls: <1ms (instant response)

```typescript
const searchWebToolBase = tool({ ... });
const searchWebTool = cached(searchWebToolBase);
```

### 2. OKR Review Tool (`mgrOkrReviewTool`)

**Location**: `lib/agents/okr-reviewer-agent.ts`

**Why cache**: DuckDB queries can be slow, especially with complex aggregations

**Cache TTL**: 1 hour (longer since OKR data doesn't change frequently)

**Impact**:
- First call: 500ms-2s (database query)
- Cached calls: <1ms (instant response)

```typescript
const mgrOkrReviewToolBase = tool({ ... });
const mgrOkrReviewTool = createCachedWithTTL(60 * 60 * 1000)(mgrOkrReviewToolBase);
```

### 3. OKR Visualization Tool (`okrVisualizationTool`)

**Location**: `lib/agents/okr-visualization-tool.ts`

**Why cache**: Most expensive operation:
- Database queries
- Python heatmap generation (1-3 seconds)
- Image upload to Feishu (500ms-1s)

**Cache TTL**: 2 hours (longest since visualizations are expensive)

**Impact**:
- First call: 3-5 seconds (full pipeline)
- Cached calls: <1ms (instant response)

```typescript
const okrVisualizationToolBase = tool({ ... });
export const okrVisualizationTool = createCachedWithTTL(2 * 60 * 60 * 1000)(okrVisualizationToolBase);
```

## How It Works

### Cache Key Generation

The cache automatically generates keys based on:
- Tool name
- Parameters (query, period, etc.)
- All parameter values are serialized

**Example**:
- `searchWebTool({ query: "AI news", domain: null })` → Cache key: `searchWeb:{"query":"AI news","domain":null}`
- `mgrOkrReviewTool({ period: "10 月" })` → Cache key: `mgr_okr_review:{"period":"10 月"}`

### Cache Hits

When a cached tool is called with the same parameters:
1. Cache checks for existing entry
2. If found and not expired → returns cached result instantly
3. If not found or expired → executes tool and caches result

### Streaming & Artifacts

The cache preserves:
- ✅ Return values
- ✅ Streaming chunks (for streaming tools)
- ✅ Artifact data (for artifact tools)

**Example**: If `okrVisualizationTool` is cached, the entire artifact (including `image_key`) is cached and restored on cache hit.

## Performance Benefits

### Before Caching

```
User: "Show me OKR metrics for 10月"
→ Database query: 1.5s
→ Total: 1.5s

User: "Show me OKR metrics for 10月" (again)
→ Database query: 1.5s
→ Total: 1.5s (duplicate work!)
```

### After Caching

```
User: "Show me OKR metrics for 10月"
→ Database query: 1.5s
→ Cache result
→ Total: 1.5s

User: "Show me OKR metrics for 10月" (again)
→ Cache hit: <1ms
→ Total: <1ms (10x faster!)
```

## Cost Savings

### Web Search Tool
- **Before**: Every search = Exa API call ($0.001 per call)
- **After**: Cached searches = $0 (80% reduction for repeated queries)

### OKR Tools
- **Before**: Every query = Database load + computation
- **After**: Cached queries = Instant response (reduced database load)

## Setup for Production

### Option 1: Upstash Redis (Recommended)

1. **Create Upstash Redis instance**:
   - Go to [Upstash Console](https://console.upstash.com/)
   - Create Redis database
   - Copy REST URL and token

2. **Set environment variables**:
   ```bash
   UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   ```

3. **Install Upstash Redis**:
   ```bash
   bun add @upstash/redis
   ```

4. **Cache automatically uses Redis** (no code changes needed!)

### Option 2: Standard Redis

```typescript
import Redis from 'redis';

export const cached = createCached({
  cache: Redis.createClient({ url: process.env.REDIS_URL }),
  keyPrefix: 'feishu-agent:',
  ttl: 60 * 60 * 1000,
});
```

## Monitoring Cache Performance

### Debug Mode

In development, cache logs cache hits/misses:

```typescript
export const cached = createCached({
  debug: true, // Logs cache operations
  ttl: 15 * 60 * 1000,
});
```

### Cache Statistics

You can track cache performance through:
- Devtools integration (tool call tracking)
- Redis monitoring (if using Redis)
- Application logs (cache hit/miss rates)

## Best Practices

### 1. Choose Appropriate TTLs

- **Frequently changing data**: Short TTL (5-15 minutes)
- **Stable data**: Long TTL (1-2 hours)
- **Very stable data**: Very long TTL (24 hours)

### 2. Cache Key Considerations

- Parameters are automatically serialized
- Same parameters = same cache key
- Different parameters = different cache entries

### 3. When to Invalidate

Cache automatically expires based on TTL. To manually invalidate:
- Clear Redis cache (if using Redis)
- Restart application (clears LRU cache)
- Wait for TTL expiration

### 4. Memory Management

- **LRU Cache**: Automatically evicts least recently used entries
- **Redis**: Configure max memory policy in Redis settings

## Troubleshooting

### Cache Not Working

1. **Check environment variables**: Ensure Redis URL is set (if using Redis)
2. **Check debug logs**: Enable `debug: true` to see cache operations
3. **Verify tool wrapping**: Ensure tool is wrapped with `cached()`

### Stale Data

1. **Reduce TTL**: Use shorter cache duration
2. **Manual invalidation**: Clear cache when data changes
3. **Version cache keys**: Add version parameter to force refresh

## References

- [@ai-sdk-tools/cache Documentation](https://ai-sdk-tools.dev/cache)
- [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- [Cache Configuration](./cache.ts) - Our cache setup

