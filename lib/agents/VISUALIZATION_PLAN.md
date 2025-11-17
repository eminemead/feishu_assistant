# Visualization & Image Sending Plan

## Questions Answered

### a) Can we generate visualization plots (heatmap)?

**YES** ✅ - We can use Python libraries or Node.js libraries:
- **Python**: matplotlib, seaborn, plotly (via subprocess or API)
- **Node.js**: 
  - `canvas` + `node-canvas` for basic charts
  - `chart.js` + `node-canvas` for charts
  - `plotly-node` for interactive charts
  - `sharp` for image processing

**Recommended**: Use Python with matplotlib/seaborn (similar to okr_reviewer repo) via subprocess, or use `plotly` in Node.js

### b) Can we send PNG via Feishu OpenAPI?

**YES** ✅ - Feishu supports:
1. **Image upload**: Upload image to Feishu's file storage
2. **Image in cards**: Embed images in card messages
3. **Image messages**: Send images directly as messages

### c) Can we verify via Node SDK?

**YES** ✅ - The `@larksuiteoapi/node-sdk` supports:
- `client.im.image.create()` - Upload image
- `client.im.message.create()` with `msg_type: "image"` - Send image message
- Card elements with `tag: "img"` - Embed image in card

## Implementation Plan

### Step 1: Add Visualization Library

For Python approach (similar to okr_reviewer repo):
```bash
# Need Python with matplotlib/seaborn
# Call via subprocess
```

For Node.js approach:
```bash
bun add plotly-node canvas
# or
bun add @plotly/plotly.js sharp
```

### Step 2: Create Visualization Function

Generate heatmap from OKR data:
- Input: Analysis results from `analyzeHasMetricPercentage`
- Output: PNG image buffer
- Visualization: Heatmap showing has_metric_percentage by company and metric type

### Step 3: Upload Image to Feishu

Use Feishu SDK to upload image:
```typescript
const imageKey = await uploadImageToFeishu(imageBuffer);
```

### Step 4: Send Image in Card or Message

Option A: Embed in card (recommended)
Option B: Send as separate image message

