# Arize Phoenix Migration Summary

## Overview
Updated all planning documents to use **Arize Phoenix (OSS)** instead of Langfuse for observability.

## Why Arize Phoenix?
- ✅ **Simple Deployment**: Single Docker container (vs Langfuse requiring ClickHouse + Redis + S3)
- ✅ **Open Source**: ELv2 license, free for self-hosting
- ✅ **OpenTelemetry-based**: Vendor-neutral, easy to migrate later
- ✅ **Mastra Integration**: `@mastra/arize` package available
- ✅ **Production-Ready**: Full tracing, evaluation, and debugging capabilities

## Files Updated

### ✅ Plan Files
1. **`.cursor/plans/mastra_v1_beta_upgrade_strategy_02e4ad64.plan.md`**
   - Updated todo: `setup-langfuse-observability` → `setup-arize-phoenix-observability`
   - Updated Section 3: Enhanced Observability with implementation example
   - Updated Phase 5: Enhanced Observability

2. **`MASTRA_MIGRATION_PLAN.md`**
   - Updated observability references throughout
   - Updated Phase 4: Observability Upgrade
   - Updated configuration & docs section

3. **`MASTRA_MIGRATION_TASKS.md`**
   - Updated Task 1.3: Configure Arize Phoenix exporter (detailed implementation)
   - Updated Phase 4.1: Setup Phoenix tracing
   - Updated all references throughout the document

## Implementation Details

### Package to Install
```bash
bun add @mastra/arize
```

### Environment Variables
```env
PHOENIX_ENDPOINT=http://localhost:6006/v1/traces
PHOENIX_API_KEY=your-api-key  # Optional for local instances
PHOENIX_PROJECT_NAME=feishu-assistant
```

### Quick Start
```bash
# Run Phoenix (single container - much simpler than Langfuse!)
docker run -p 6006:6006 arizephoenix/phoenix

# Your app will send traces to http://localhost:6006
```

### Code Example
```typescript
import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/core/observability";
import { ArizeExporter } from "@mastra/arize";

export const mastra = new Mastra({
  name: "feishu-assistant",
  observability: {
    logger: new PinoLogger({
      level: process.env.NODE_ENV === "production" ? "info" : "debug"
    }),
    configs: {
      arize: {
        serviceName: "feishu-assistant",
        exporters: [
          new ArizeExporter({
            endpoint: process.env.PHOENIX_ENDPOINT || "http://localhost:6006/v1/traces",
            apiKey: process.env.PHOENIX_API_KEY, // Optional for local
            projectName: process.env.PHOENIX_PROJECT_NAME || "feishu-assistant",
          }),
        ],
      },
    },
  },
});
```

## Files Still Needing Updates

### ⚠️ Beads Issues (`.beads/issues.jsonl`)
The following issues in the beads database still reference Langfuse and should be updated via `bd edit`:

1. **`feishu_assistant-1mv`** (Epic) - Update description:
   - "Consolidated observability (Langfuse)" → "Consolidated observability (Arize Phoenix OSS)"
   - "Native AI Tracing with multiple exporter options (Langfuse, Braintrust, OTEL)" → "Native AI Tracing with Arize Phoenix OSS"
   - Phase 4: "Configure Langfuse exporter" → "Configure Arize Phoenix exporter"
   - External References: Update Langfuse link

2. **`feishu_assistant-2jh`** (Task) - Update:
   - "Verify Langfuse traces" → "Verify Phoenix traces"
   - "Verify Langfuse data quality" → "Verify Phoenix data quality"

3. **`feishu_assistant-2s8`** (Task) - Update:
   - "Verify traces in Langfuse" → "Verify traces in Phoenix"
   - "docs/setup/langfuse-observability.md" → "docs/setup/arize-phoenix-observability.md"
   - "Configure Langfuse exporter" → "Configure Arize Phoenix exporter"

4. **`feishu_assistant-2wu`** (Task) - Update title and description:
   - Title: "Setup Langfuse tracing" → "Setup Arize Phoenix tracing"
   - All Langfuse references → Phoenix

5. **`feishu_assistant-2xz`** (Task) - Update:
   - "Exporter configuration (Langfuse)" → "Exporter configuration (Arize Phoenix)"
   - "Configure Langfuse exporter" → "Configure Arize Phoenix exporter"

6. **`feishu_assistant-4y1`** (Task) - Update:
   - "Configure Langfuse exporter" → "Configure Arize Phoenix exporter"

7. **`feishu_assistant-9no`** (Task) - Update title:
   - "Configure Langfuse AI Tracing exporter" → "Configure Arize Phoenix AI Tracing exporter"

### Update Commands
```bash
# Update epic description
bd edit feishu_assistant-1mv

# Update individual tasks
bd edit feishu_assistant-2jh
bd edit feishu_assistant-2s8
bd edit feishu_assistant-2wu
bd edit feishu_assistant-2xz
bd edit feishu_assistant-4y1
bd edit feishu_assistant-9no
```

## Next Steps

1. ✅ Plan files updated
2. ⚠️ Update beads issues via `bd edit` (see above)
3. ⏭️ When implementing: Install `@mastra/arize` and configure Phoenix
4. ⏭️ Deploy Phoenix container
5. ⏭️ Test tracing in Phoenix dashboard

## Benefits Over Langfuse

| Aspect | Langfuse | Arize Phoenix |
|--------|----------|--------------|
| **Deployment** | ClickHouse + Redis + S3 | Single Docker container |
| **Complexity** | High (3 services) | Low (1 container) |
| **License** | MIT (OSS) | ELv2 (OSS) |
| **OpenTelemetry** | ❌ No | ✅ Yes (OpenInference) |
| **Setup Time** | 1-2 hours | 5 minutes |
| **Maintenance** | High | Low |

## References

- [Arize Phoenix Documentation](https://phoenix.arize.com/)
- [Mastra Arize Integration](https://arize.com/docs/phoenix/integrations/mastra/mastra-tracing)
- [Phoenix Self-Hosting Guide](https://phoenix.arize.com/how-to-host-phoenix-persistence/)
