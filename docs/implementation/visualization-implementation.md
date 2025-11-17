# Visualization Implementation Guide

## Answers to Your Questions

### a) Can we generate visualization plots (heatmap)?

**YES** ✅ - We can generate heatmaps similar to the okr_reviewer repo:

**Option 1: Python (Recommended - matches okr_reviewer repo)**
- Uses matplotlib + seaborn (same as okr_reviewer repo)
- Generates PNG heatmap showing has_metric_percentage by company and metric type
- Requires Python with: `pip install matplotlib seaborn pandas numpy`

**Option 2: Node.js**
- Could use `plotly-node` or `canvas` libraries
- Currently not implemented (Python approach preferred)

### b) Can we send PNG via Feishu OpenAPI?

**YES** ✅ - Feishu supports image uploads and sending:

1. **Upload Image**: Use `client.im.image.create()` to upload PNG
2. **Get image_key**: Returns an `image_key` that can be used in messages/cards
3. **Send Image**: 
   - As image message: `msg_type: "image"`
   - In card: Use `tag: "img"` element with `img_key`

### c) Can we verify via Node SDK?

**YES** ✅ - Verified using `@larksuiteoapi/node-sdk`:

```typescript
// Upload image
const resp = await client.im.image.create({
  data: {
    image_type: "card", // or "message"
    image: imageBuffer,
  },
});
const imageKey = resp.data.image_key;

// Send in card
{
  tag: "img",
  img_key: imageKey,
  mode: "fit_horizontal",
  preview: true
}
```

## Implementation Files Created

1. **`lib/feishu-image-utils.ts`** - Feishu image upload and sending utilities
2. **`lib/visualization/okr-heatmap.ts`** - Heatmap generation (Python-based)
3. **`lib/agents/okr-visualization-tool.ts`** - Enhanced tool with visualization option

## Usage Example

### Step 1: Add visualization tool to OKR Reviewer Agent

```typescript
import { okrVisualizationTool } from "./okr-visualization-tool";

export const okrReviewerAgent = new Agent({
  // ...
  tools: {
    mgr_okr_review: mgrOkrReviewTool,
    okr_visualization: okrVisualizationTool, // Add this
  },
});
```

### Step 2: Agent calls tool with visualization flag

The agent can call:
```typescript
okr_visualization({
  period: "10 月",
  generateVisualization: true
})
```

### Step 3: Handle visualization in response

In the response handler (e.g., `handle-messages.ts`), check for `image_key`:

```typescript
if (result.visualization?.image_key) {
  // Add image to card or send separately
  await addImageToCard(card.cardId, result.visualization.image_key);
}
```

## Complete Integration Flow

```
User Query: "显示10月的OKR指标覆盖率热力图"
    ↓
OKR Reviewer Agent routes query
    ↓
Agent calls okr_visualization tool with generateVisualization: true
    ↓
Tool:
  1. Queries DuckDB (analyzeHasMetricPercentage)
  2. Generates heatmap PNG (generateOKRHeatmap)
  3. Uploads to Feishu (uploadImageToFeishu)
  4. Returns analysis + image_key
    ↓
Agent receives response with image_key
    ↓
Response handler:
  1. Creates/updates card with text analysis
  2. Adds image element with image_key
    ↓
User sees card with heatmap visualization
```

## Prerequisites

### Python Dependencies
```bash
pip install matplotlib seaborn pandas numpy
```

### Node.js Dependencies
Already installed:
- `@larksuiteoapi/node-sdk` ✅

## Testing

1. **Test visualization generation**:
   ```typescript
   const analysis = await analyzeHasMetricPercentage("10 月");
   const imageBuffer = await generateOKRHeatmap(analysis);
   // Save to file to verify
   await fs.writeFile("test-heatmap.png", imageBuffer);
   ```

2. **Test image upload**:
   ```typescript
   const imageKey = await uploadImageToFeishu(imageBuffer);
   console.log("Image key:", imageKey);
   ```

3. **Test sending image**:
   ```typescript
   await sendImageMessage(chatId, "chat_id", imageKey);
   ```

## Notes

- **Python Required**: The visualization uses Python (matching okr_reviewer repo style)
- **Image Size**: Keep images reasonable size (< 10MB) for Feishu upload limits
- **Error Handling**: Visualization failures won't break the analysis - returns data without image
- **Card vs Message**: Images can be sent in cards (recommended) or as separate image messages

