# Visualization Module

## Overview

This module provides multiple visualization options for OKR metrics:

1. **ASCII Charts** - Instant emoji/unicode charts, perfect for Feishu streaming
2. **Datawrapper** (NEW!) - Professional PNG charts via API
3. **Observable Plot.js** - PNG heatmaps for complex visualizations
4. **Mermaid Charts** - Text-based diagrams (flowchart, pie, timeline, etc.)
5. **Vega-Lite Charts** - Data-driven JSON specs

## 🎯 Recommended: ASCII Charts

For Feishu, **use ASCII charts** - they render instantly with zero dependencies:

```typescript
import * as ascii from "./visualization/ascii-charts";

// Horizontal bar chart with emoji indicators
ascii.horizontalBarChart([
  { label: 'Company A', value: 92.5 },
  { label: 'Company B', value: 78.3 },
  { label: 'Company C', value: 45.8 },
], { sortDesc: true, colorize: true });

// Output:
// 🟢 Company A ████████████████████ 92.5%
// 🟡 Company B ████████████████░░░░ 78.3%
// 🔴 Company C █████████░░░░░░░░░░░ 45.8%
```

### ASCII Chart Types

| Chart | Function | Use Case |
|-------|----------|----------|
| Bar (Horiz) | `horizontalBarChart()` | Company performance |
| Bar (Vert) | `verticalBarChart()` | Category comparison |
| Progress | `progressBar()` | Single metric |
| Sparkline | `sparkline()` | Inline trends |
| Pie | `emojiPieChart()` | Distribution |
| Heatmap | `asciiHeatmap()` | Matrix data |
| Histogram | `histogram()` | Distribution |
| Table | `comparisonTable()` | With inline bars |
| Stats | `summaryStats()` | Summary with tree |
| Trend | `trendIndicator()` | Change direction |

### Why ASCII Charts?

- ✅ **Zero dependencies** - Pure TypeScript
- ✅ **Instant rendering** - No external APIs
- ✅ **Feishu compatible** - Works in markdown
- ✅ **Fully streamable** - Typewriter effect
- ✅ **Emoji-enhanced** - Visual status indicators
- ✅ **Accessible** - Works in any terminal/editor

## Datawrapper (Professional Charts)

For polished, publication-quality charts:

```typescript
import { generateBarChart, generatePieChart } from "./visualization/datawrapper";

// Bar chart
const barPng = await generateBarChart(
  [{ label: 'Shanghai', value: 92 }, { label: 'Beijing', value: 78 }],
  { title: 'Company Performance', horizontal: true }
);

// Pie/Donut chart
const piePng = await generatePieChart(
  [{ label: 'Revenue', value: 35 }, { label: 'Conversion', value: 25 }],
  { title: 'Metric Distribution', donut: true }
);
```

### Setup

```bash
# Get API key from: https://app.datawrapper.de/account/api-tokens
# Add to .env:
DATAWRAPPER_API_KEY=your_api_key_here
```

### Why Datawrapper?

- ✅ **Newsroom quality** - Used by NYT, Guardian, etc.
- ✅ **Beautiful defaults** - Professional styling out of the box
- ✅ **Many chart types** - Bar, line, pie, scatter, maps, tables
- ✅ **PNG export** - Works in Feishu images
- ⚠️ **Latency** - 2-5s per chart (API calls)
- ⚠️ **Rate limits** - Check your plan

### Test

```bash
bun scripts/test-datawrapper.ts
```

## Observable Plot.js (PNG Heatmaps)

For high-quality PNG exports:

```typescript
import { generateOKRHeatmap } from "./visualization/okr-heatmap";

const analysisResult = await analyzeHasMetricPercentage("10 月");
const pngBuffer = await generateOKRHeatmap(analysisResult);
```

### Dependencies

```bash
bun add @observablehq/plot jsdom sharp canvas
```

### Use When:
- Need high-quality PNG images
- Complex multi-dimensional heatmaps
- Client supports image rendering

## Mermaid Charts

Text-based diagrams:

```typescript
import { createPieChart } from "./visualization/mermaid-charts";

const chart = createPieChart([
  { label: 'Revenue', value: 35 },
  { label: 'Conversion', value: 25 },
]);
// Returns markdown with ```mermaid code block
```

### Use When:
- Client supports Mermaid rendering
- Need flowcharts, sequences, gantt, etc.

## Vega-Lite Charts

JSON specs for data visualization:

```typescript
import { barChart } from "./visualization/vega-lite-charts";

const chart = barChart(data, { title: 'Sales by Region' });
// Returns JSON spec + markdown
```

### Use When:
- Client has Vega-Lite runtime
- Need interactive charts (with appropriate renderer)

## Testing

```bash
# Run ASCII charts demo
bun scripts/test-ascii-charts.ts

# Run visualization tests
bun test test/visualization/okr-heatmap.test.ts
```

## File Structure

```
lib/
├── services/
│   └── visualization-service.ts  # 🎯 Unified service (use this!)
│
├── tools/
│   └── visualization-tool.ts     # Generic tool for all agents
│
└── visualization/
    ├── ascii-charts.ts           # Emoji/unicode charts
    ├── datawrapper.ts            # Datawrapper API client
    ├── mermaid-charts.ts         # Mermaid diagram builders
    ├── vega-lite-charts.ts       # Vega-Lite spec builders
    ├── okr-heatmap.ts            # Observable Plot heatmaps
    └── README.md                 # This file
```

## Usage

### For Agents (Recommended)

Use the `visualizationTool` in your agent:

```typescript
import { visualizationTool } from '../tools';

const agent = new Agent({
  tools: {
    visualization: visualizationTool,
    // ... other tools
  }
});
```

### For Services/Workflows

Use the `VisualizationService`:

```typescript
import { getVisualizationService } from '../services/visualization-service';

const viz = getVisualizationService();
const result = await viz.barChart(data, { title: 'Sales' });
console.log(result.markdown);
```

### Quick Helpers

```typescript
import { quickBarChart, quickPieChart } from '../tools';

const markdown = await quickBarChart(data, 'Sales by Region');
```

## Configuration

Set in `.env`:

```bash
# Default render mode: auto | ascii | datawrapper | mermaid | vega-lite
VISUALIZATION_DEFAULT_MODE=auto

# For professional charts (optional)
DATAWRAPPER_API_KEY=your_api_key
```

## Choosing the Right Mode

| Use Case | Recommended | Why |
|----------|-------------|-----|
| Chat responses | `ascii` | Instant, streamable |
| Quick inline stats | `ascii` | Zero latency |
| Reports/exports | `datawrapper` | Professional quality |
| Complex heatmaps | Observable Plot | Full control |
| Need interactivity | `vega-lite` | Client-side rendering |

