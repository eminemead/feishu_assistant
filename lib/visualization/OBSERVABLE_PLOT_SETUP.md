# Observable Plot.js Setup Guide

## Why Observable Plot.js?

Observable Plot.js is **excellent** for this use case because:

1. **Declarative API** - Much cleaner than manual canvas drawing
2. **Built-in Heatmap Support** - `Plot.cell()` is perfect for heatmaps
3. **Beautiful Defaults** - Great styling out of the box
4. **Color Schemes** - Built-in `RdYlGn` scheme (same as seaborn!)
5. **Powerful** - Made by D3.js creators, very capable
6. **Pure JavaScript** - No Python dependency

## Installation

```bash
bun add @observablehq/plot jsdom sharp
```

**Dependencies:**
- `@observablehq/plot` - Observable Plot.js library
- `jsdom` - DOM implementation for Node.js (Plot.js needs DOM)
- `sharp` - High-quality SVG to PNG conversion

## Usage

The implementation in `okr-heatmap-plot.ts` uses Observable Plot's declarative API:

```typescript
Plot.plot({
  marks: [
    Plot.cell(data, {
      x: "metricType",
      y: "company", 
      fill: "value",
    }),
    Plot.text(data, {
      x: "metricType",
      y: "company",
      text: (d) => d.value.toFixed(1) + "%",
    }),
  ],
  color: {
    scheme: "RdYlGn", // Red-Yellow-Green like seaborn!
    domain: [0, 100],
  },
})
```

## Advantages Over Canvas Approach

1. **Less Code** - Declarative vs imperative
2. **Better Styling** - Built-in color schemes and scales
3. **More Maintainable** - Easier to modify and extend
4. **Professional** - Used by Observable, D3.js ecosystem
5. **Flexible** - Easy to add more marks, facets, etc.

## Comparison

**Canvas Approach:**
- ~150 lines of manual drawing code
- Manual color calculations
- Manual positioning
- Hard to modify

**Observable Plot Approach:**
- ~50 lines of declarative code
- Built-in color schemes
- Automatic positioning
- Easy to modify and extend

## Next Steps

1. Install dependencies: `bun add @observablehq/plot jsdom sharp`
2. The implementation is ready in `okr-heatmap-plot.ts`
3. Test with real OKR data
4. Adjust styling as needed (Plot.js makes this easy!)

