# Artifacts Integration Evaluation

## Overview

This document evaluates whether and how we can leverage [`@ai-sdk-tools/artifacts`](https://ai-sdk-tools.dev/artifacts) in our Feishu assistant.

## What Are Artifacts?

`@ai-sdk-tools/artifacts` is a module from the AI SDK Tools ecosystem that enables:

- **Structured Artifacts**: Type-safe artifact schemas with Zod validation
- **Real-time Streaming**: Live updates from AI tools to React components
- **Typed Context**: Shared, validated context across tools
- **React Integration**: `useArtifact` hook for consuming artifacts in React
- **Error Handling**: Built-in error handling with timeouts and cancellation
- **Global State**: Built on `@ai-sdk-tools/store` for global state access

## Current Architecture

Our Feishu assistant:

- **Backend Service**: Node.js/Bun server using Hono framework
- **AI SDK**: Vercel AI SDK v5 with `@ai-sdk-tools/agents` for multi-agent orchestration
- **Messaging**: Feishu Open Platform API for sending messages/cards
- **Streaming**: Feishu streaming cards for real-time text updates
- **Visualizations**: Python-based heatmap generation, uploaded as images to Feishu
- **Tools**: Specialized tools (OKR review, visualization) that return structured data

## Can We Leverage Artifacts?

### ✅ **YES - With Adaptations**

While artifacts are designed for React frontends, they can be leveraged in our backend context with some adaptations:

### Use Case 1: Structured Tool Outputs (Recommended)

**Benefit**: Better type safety and validation for tool outputs

**Implementation**:
```typescript
import { createArtifact } from '@ai-sdk-tools/artifacts';
import { z } from 'zod';

// Define artifact schema for OKR analysis
const okrAnalysisArtifact = createArtifact({
  name: 'okr_analysis',
  schema: z.object({
    period: z.string(),
    summary: z.array(z.object({
      company: z.string(),
      average_has_metric_percentage: z.number(),
      metrics: z.array(z.object({
        metric_type: z.string(),
        has_metric_percentage: z.number(),
      })),
    })),
    visualization: z.object({
      image_key: z.string().optional(),
      generated: z.boolean(),
    }).optional(),
  }),
});

// In tool execution:
export const okrVisualizationTool = tool({
  // ...
  execute: async ({ period, generateVisualization }) => {
    const analysis = await analyzeHasMetricPercentage(period);
    
    // Create artifact instance
    const artifact = okrAnalysisArtifact.create({
      period: analysis.period,
      summary: analysis.summary,
      // ... other fields
    });
    
    // Stream updates as analysis progresses
    if (generateVisualization) {
      artifact.update({ visualization: { generated: false } });
      const imageBuffer = await generateOKRHeatmap(analysis);
      const imageKey = await uploadImageToFeishu(imageBuffer, "card");
      artifact.update({ 
        visualization: { image_key: imageKey, generated: true } 
      });
    }
    
    artifact.complete();
    return artifact.data; // Return final artifact data
  },
});
```

**Pros**:
- Type-safe tool outputs
- Validation ensures data consistency
- Can track progress/updates during tool execution
- Better error handling

**Cons**:
- Adds dependency overhead
- May be overkill for simple tools

### Use Case 2: Real-time Progress Updates

**Benefit**: Better progress tracking for long-running operations

**Implementation**:
```typescript
// In tool execution:
const artifact = okrAnalysisArtifact.create({ period });
artifact.update({ status: 'querying_database' });
const data = await queryDatabase();
artifact.update({ status: 'analyzing_data', summary: data });
artifact.update({ status: 'generating_visualization' });
const viz = await generateVisualization();
artifact.update({ status: 'uploading_image', visualization: { generated: false } });
const imageKey = await uploadImageToFeishu(viz);
artifact.update({ status: 'complete', visualization: { image_key: imageKey, generated: true } });
artifact.complete();
```

**Pros**:
- Fine-grained progress tracking
- Can update Feishu cards with progress
- Better user experience for long operations

**Cons**:
- Current card streaming already handles this
- May add complexity without significant benefit

### Use Case 3: Future Web Dashboard (High Potential)

**Benefit**: If we build a web dashboard for monitoring/analytics

**Implementation**:
```typescript
// Backend: Stream artifacts
const artifact = okrAnalysisArtifact.create({ period });
// ... tool execution with updates
artifact.complete();

// Frontend: React component
import { useArtifact } from '@ai-sdk-tools/artifacts';

function OKRAnalysisDashboard() {
  const { data, status, error, progress } = useArtifact('okr_analysis');
  
  if (status === 'loading') return <Loading />;
  if (error) return <Error error={error} />;
  
  return (
    <div>
      <ProgressBar value={progress} />
      <OKRHeatmap data={data.summary} />
      {data.visualization?.image_key && (
        <img src={getFeishuImageUrl(data.visualization.image_key)} />
      )}
    </div>
  );
}
```

**Pros**:
- Perfect fit for React dashboards
- Real-time updates from backend
- Type-safe data flow
- Excellent developer experience

**Cons**:
- Requires building a web frontend
- Need WebSocket/SSE for real-time updates

### Use Case 4: Cross-Tool Data Sharing

**Benefit**: Share validated data between tools/agents

**Implementation**:
```typescript
// Manager agent calls OKR tool
const okrResult = await okrReviewerAgent.run([...]);
// Store as artifact
const artifact = okrAnalysisArtifact.create(okrResult);
// Pass to visualization tool
const vizResult = await visualizationTool.run({ 
  artifactId: artifact.id 
});
```

**Pros**:
- Type-safe data passing
- Validation ensures data integrity
- Can track data lineage

**Cons**:
- Current architecture already handles this
- May add unnecessary abstraction

## Recommendations

### ✅ **Immediate Value: Use Case 1 (Structured Tool Outputs)**

**Action Items**:
1. Install `@ai-sdk-tools/artifacts` and `@ai-sdk-tools/store`
2. Define artifact schemas for major tool outputs (OKR analysis, visualizations)
3. Refactor tools to use artifacts for type safety and validation
4. Keep current Feishu card streaming mechanism

**Benefits**:
- Better type safety
- Data validation
- Consistent tool outputs
- Minimal architectural changes

**Implementation Effort**: Low-Medium

### 🔮 **Future Value: Use Case 3 (Web Dashboard)**

**Action Items**:
1. Plan web dashboard architecture
2. Set up WebSocket/SSE for artifact streaming
3. Build React components using `useArtifact` hook
4. Integrate with existing Feishu backend

**Benefits**:
- Rich interactive dashboards
- Real-time analytics
- Better visualization capabilities
- Enhanced user experience

**Implementation Effort**: High (requires new frontend)

### ⚠️ **Not Recommended: Use Case 2 & 4**

- **Use Case 2**: Current card streaming already provides progress updates
- **Use Case 4**: Current agent handoff system already handles data sharing

## Integration Plan

### Phase 1: Proof of Concept (Low Risk)

1. **Install dependencies**:
   ```bash
   bun add @ai-sdk-tools/artifacts @ai-sdk-tools/store
   ```

2. **Create artifact schema** for OKR analysis:
   ```typescript
   // lib/artifacts/okr-analysis-artifact.ts
   import { createArtifact } from '@ai-sdk-tools/artifacts';
   import { z } from 'zod';
   
   export const okrAnalysisArtifact = createArtifact({
     name: 'okr_analysis',
     schema: z.object({
       period: z.string(),
       table_used: z.string(),
       summary: z.array(z.object({
         company: z.string(),
         average_has_metric_percentage: z.number(),
         metrics: z.array(z.object({
           metric_type: z.string(),
           has_metric_percentage: z.number(),
           total: z.number(),
           nulls: z.number(),
         })),
       })),
       total_companies: z.number(),
       overall_average: z.number(),
       visualization: z.object({
         image_key: z.string().optional(),
         generated: z.boolean(),
         error: z.string().optional(),
       }).optional(),
     }),
   });
   ```

3. **Refactor OKR visualization tool** to use artifacts:
   ```typescript
   // lib/agents/okr-visualization-tool.ts
   import { okrAnalysisArtifact } from '../artifacts/okr-analysis-artifact';
   
   export const okrVisualizationTool = tool({
     // ...
     execute: async ({ period, generateVisualization }) => {
       const artifact = okrAnalysisArtifact.create({ period });
       
       try {
         const analysis = await analyzeHasMetricPercentage(period);
         artifact.update(analysis);
         
         if (generateVisualization) {
           artifact.update({ visualization: { generated: false } });
           const imageBuffer = await generateOKRHeatmap(analysis);
           const imageKey = await uploadImageToFeishu(imageBuffer, "card");
           artifact.update({ 
             visualization: { image_key: imageKey, generated: true } 
           });
         }
         
         artifact.complete();
         return artifact.data;
       } catch (error: any) {
         artifact.fail(error);
         throw error;
       }
     },
   });
   ```

4. **Test** with existing Feishu card streaming

### Phase 2: Expand to Other Tools (If Phase 1 succeeds)

- Apply artifacts to other tools (P&L, Alignment, DPA PM)
- Create shared artifact schemas
- Document artifact usage patterns

### Phase 3: Web Dashboard (Future)

- Design dashboard architecture
- Set up artifact streaming infrastructure
- Build React components
- Integrate with Feishu backend

## Conclusion

**Can we leverage artifacts?** ✅ **YES**

**Should we leverage artifacts?** ✅ **YES, but selectively**

**Recommended Approach**:
1. **Start with Use Case 1** (structured tool outputs) for immediate type safety benefits
2. **Keep current Feishu card streaming** - it works well for our use case
3. **Plan for Use Case 3** (web dashboard) if we need richer analytics UI
4. **Skip Use Case 2 & 4** - current solutions are sufficient

**Key Insight**: Artifacts excel in React frontends, but can still provide value in backend tooling for type safety and validation. The real power will be unlocked if/when we build a web dashboard.

## References

- [AI SDK Tools Artifacts Documentation](https://ai-sdk-tools.dev/artifacts)
- [AI SDK Tools Store Documentation](https://ai-sdk-tools.dev/store)
- Current implementation: `lib/agents/okr-visualization-tool.ts`
- Current streaming: `lib/feishu-utils.ts` (card streaming)

