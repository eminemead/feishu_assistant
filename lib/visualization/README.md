# Visualization Module

## Overview

This module generates heatmap visualizations for OKR metrics using **Observable Plot.js** (ojs).

## Why Observable Plot.js?

- ✅ **Declarative API** - Clean, readable code
- ✅ **Built-in Heatmap Support** - `Plot.cell()` perfect for heatmaps
- ✅ **Beautiful Defaults** - Great styling out of the box
- ✅ **Color Schemes** - Built-in `RdYlGn` scheme (same as seaborn!)
- ✅ **Pure JavaScript** - No Python dependency
- ✅ **Powerful** - Made by D3.js creators

## Dependencies

```bash
bun add @observablehq/plot jsdom sharp canvas
```

- `@observablehq/plot` - Observable Plot.js visualization library
- `jsdom` - DOM implementation for Node.js (Plot.js needs DOM)
- `sharp` - High-quality SVG to PNG conversion
- `canvas` - Canvas support for Plot.js legend rendering

## Usage

```typescript
import { generateOKRHeatmap } from "./visualization/okr-heatmap";

const analysisResult = await analyzeHasMetricPercentage("10 月");
const pngBuffer = await generateOKRHeatmap(analysisResult);
```

## Implementation

The visualization uses Observable Plot's declarative API:

```typescript
Plot.plot({
  marks: [
    Plot.cell(data, {
      x: "metricType",
      y: "company",
      fill: "value",
    }),
  ],
  color: {
    scheme: "RdYlGn", // Red-Yellow-Green like seaborn!
  },
})
```

## Testing

Run visualization tests:

```bash
bun test test/visualization/okr-heatmap.test.ts
```

All tests passing ✅ (5/5)

## Output

Generates PNG buffer ready for:
- Upload to Feishu (`uploadImageToFeishu()`)
- Display in Feishu cards
- Save to file for debugging

