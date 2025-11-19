# Feishu Streaming Visualization Guide

## Executive Summary

For streaming visualization outputs (OJS/Observable Plot charts) into Feishu cards, **the best approach is a 3-phase pattern**:

1. **Text Streaming Phase** - Stream AI response text with typewriter effect
2. **Visualization Generation** - Generate OJS visualization in parallel/background
3. **Image Addition Phase** - Add generated image to card as a new element (not text streaming)

This avoids conflicts between text streaming and image updates, and provides the best user experience.

---

## Current Implementation Analysis

### What You're Already Doing Right

Your codebase implements a solid foundation:

1. **OJS Visualization Generation** (`lib/visualization/okr-heatmap-plot.ts`)
   - Uses Observable Plot.js for declarative heatmap generation
   - Converts to PNG via sharp (SVG → PNG)
   - Proper Node.js server-side rendering with jsdom

2. **Card Streaming** (`lib/feishu-utils.ts`)
   - Creates streaming cards with `streaming_mode: true`
   - Uses `updateCardElement()` for text updates with typewriter effect
   - Tracks sequence numbers for proper ordering
   - Finalizes with `finalizeCard()` to disable streaming mode

3. **Image Handling** (`lib/feishu-image-utils.ts` + `okr-visualization-tool.ts`)
   - Uploads PNG buffers to Feishu
   - Gets `image_key` for reference
   - Adds image elements to cards

### Gap: Timing of Image Addition

**Current flow:**
```
1. Create streaming card
2. Stream text responses with typewriter effect
3. Try to add image (but streaming mode still active)
4. Finalize card
```

**Issue:** According to Feishu docs, once you finalize streaming (disable `streaming_mode`), you can no longer use text streaming. But you're trying to add images while streaming is still active, which can conflict with text updates.

---

## Feishu Official Capabilities

### Three Card Update Methods

| Method | Use Case | Frequency Limit | Supported During Streaming |
|--------|----------|-----------------|---------------------------|
| **Text Streaming** | Typewriter effect on text content | Part of streaming | YES (enabled by `streaming_mode: true`) |
| **Component-Level Partial Update** | Add/remove/modify components | 10 req/sec | YES (component APIs work independently) |
| **Full Card Update** | Replace entire card JSON | 10 req/sec | NO (must disable streaming first) |

### Key Facts from Official Docs

1. **Streaming Mode Setup** (`streaming_config` options - Feishu 7.23+):
   ```json
   {
     "streaming_mode": true,
     "streaming_config": {
       "print_frequency_ms": { "default": 70, "android": 70, "ios": 70, "pc": 70 },
       "print_step": { "default": 1 },
       "print_strategy": "fast" // or "delay"
     }
   }
   ```

2. **Text Streaming Strategy**:
   - **"fast"** (default): Unrendered text displays immediately, then continues streaming
   - **"delay"**: All text streams with typewriter effect

3. **Component API Limits**:
   - Up to 10 operations per second per card
   - Can add/update/delete components while streaming is active
   - **Does NOT** count against streaming text update limit

4. **Finalization Required for Interactivity**:
   - Must disable streaming (`streaming_mode: false`) before handling button/form callbacks
   - Text streaming continues normally after finalization (if you re-enable it)

---

## Best Practice: 3-Phase Pattern

### Phase 1: Text Streaming (Immediate Feedback)
```typescript
// User sees AI thinking in real-time
const card = await createAndSendStreamingCard(chatId, "chat_id", {
  title: "Analyzing OKR Metrics...",
  initialContent: ""
});

// Stream text response with typewriter effect
for await (const chunk of agentResponse) {
  await updateCardElement(
    card.cardId,
    card.elementId,
    accumulatedText + chunk
  );
}
```

**Why this first:**
- Users see progress immediately
- Builds trust with real-time feedback
- Text streaming is optimized and fast

### Phase 2: Visualization Generation (Parallel)
```typescript
// Happens during or after text streaming
// Can run in background - doesn't block text updates
const visualization = await generateOKRHeatmap(analysisData);
const imageKey = await uploadImageToFeishu(visualization, "card");
```

**Key points:**
- Heatmap generation (100-500ms) can overlap with text streaming
- Upload to Feishu (100-200ms) is quick
- No blocking of text updates

### Phase 3: Add Image Element (After Text Streaming)
```typescript
// After text streaming completes, add image
if (imageKey) {
  // Option A: Add as new component while streaming still active
  await addImageElementToCard(card.cardId, imageKey, "OKR Heatmap");
  
  // Then finalize
  await finalizeCard(card.cardId);
}
```

**Why separate from text streaming:**
- Text streaming and component adds can overlap (10 req/sec limit)
- Clear separation of concerns
- Better error handling if image generation fails

---

## Implementation Patterns

### Pattern 1: Standard Streaming + Image (Recommended)

```typescript
export async function handleChartQuery(query: string, chatId: string) {
  // 1. Create streaming card immediately
  const card = await createAndSendStreamingCard(chatId, "chat_id", {
    title: "Analyzing your query..."
  });

  try {
    // 2. Start text streaming in parallel with viz generation
    const textPromise = (async () => {
      let fullText = "";
      for await (const chunk of generateResponse(query)) {
        fullText += chunk;
        await updateCardElement(card.cardId, card.elementId, fullText);
      }
      return fullText;
    })();

    // 3. Generate visualization in parallel
    const vizPromise = (async () => {
      const analysis = await analyzeMetrics(query);
      const buffer = await generateOKRHeatmap(analysis);
      return await uploadImageToFeishu(buffer, "card");
    })();

    // Wait for both to complete
    const [finalText, imageKey] = await Promise.all([textPromise, vizPromise]);

    // 4. Add image to card (while streaming still active)
    if (imageKey) {
      await addImageElementToCard(card.cardId, imageKey);
    }

    // 5. Finalize - disable streaming mode
    await finalizeCard(card.cardId, finalText);

  } catch (error) {
    console.error("Error processing query:", error);
    await finalizeCard(card.cardId, `Error: ${error.message}`);
  }
}
```

### Pattern 2: Progressive Enhancement (For Complex Viz)

If chart generation is slow (>2 seconds):

```typescript
// Show progress while generating
const card = await createAndSendStreamingCard(chatId, "chat_id", {
  title: "Analyzing OKR Metrics"
});

// Stream initial analysis text
await updateCardElement(
  card.cardId, 
  card.elementId,
  "Analyzing data...\n\nGenerating visualization..."
);

// Generate visualization (may take time)
const analysis = await analyzeMetrics(query);
const buffer = await generateOKRHeatmap(analysis);
const imageKey = await uploadImageToFeishu(buffer, "card");

// Update with full result
const fullText = `
Analysis complete!

${analysis.summary}

See visualization below.
`;
await updateCardElement(card.cardId, card.elementId, fullText);

// Add image
await addImageElementToCard(card.cardId, imageKey);

// Finalize
await finalizeCard(card.cardId);
```

### Pattern 3: Multi-Chart Cards (Using Component APIs)

For cards with multiple visualizations:

```typescript
// Create card with initial structure
const card = await createAndSendStreamingCard(chatId, "chat_id", {
  title: "Multi-Metric Dashboard",
  initialContent: "Generating visualizations..."
});

// Disable streaming early to add multiple images
await finalizeCard(card.cardId, "");

// Add multiple chart elements
const charts = await Promise.all([
  generateHeatmapChart(data1),
  generateTrendChart(data2),
  generateBreakdownChart(data3)
]);

for (const [index, chartBuffer] of charts.entries()) {
  const imageKey = await uploadImageToFeishu(chartBuffer, "card");
  await addImageElementToCard(
    card.cardId, 
    imageKey, 
    `Chart ${index + 1}`
  );
}
```

---

## Observable Plot Best Practices

### For Feishu Cards (Server-Side Rendering)

Your current implementation is solid. Key points:

1. **jsdom Setup** (your code does this correctly)
   ```typescript
   const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
     pretendToBeVisual: true,
     resources: "usable",
   });
   ```

2. **Canvas Support** (needed for color legends)
   ```typescript
   const { Canvas } = require("canvas");
   (dom.window as any).HTMLCanvasElement = Canvas;
   ```

3. **SVG → PNG Conversion** (via sharp)
   ```typescript
   const sharp = (await import("sharp")).default;
   return await sharp(Buffer.from(svgString))
     .png()
     .toBuffer();
   ```

### OJS Output Best Practices

```typescript
// Good: Let Plot.js handle sizing
const plot = Plot.plot({
  width: 1200,
  height: Math.max(600, dataRows * 50),  // Dynamic height
  color: { type: "linear", scheme: "RdYlGn", domain: [0, 100] },
  marks: [
    Plot.cell(data, { x: "metric", y: "company", fill: "value" }),
    Plot.text(data, { text: (d) => d.value.toFixed(1) + "%" })
  ]
});

// Avoid: Manual canvas manipulation (not needed with Plot)
```

### Why Observable Plot > Manual Canvas

| Aspect | Observable Plot | Manual Canvas |
|--------|-----------------|---------------|
| Lines of code | ~30-40 | 150+ |
| Readability | Declarative, clean | Imperative, verbose |
| Legends | Built-in color scales | Manual drawing |
| Responsiveness | Automatic sizing | Manual calculation |
| Maintenance | Much easier | Error-prone |
| Performance | Optimized rendering | Often wasteful |

---

## Feishu SDK Methods Reference

Your current usage is correct. For reference:

```typescript
// Create streaming card entity (with JSON 2.0 schema)
client.cardkit.v1.card.create({
  data: {
    type: "card_json",
    data: JSON.stringify(cardData)  // Must be JSON string
  }
})

// Stream text updates (typewriter effect)
client.cardkit.v1.cardElement.content({
  path: { card_id, element_id },
  data: { content, sequence }  // Sequence must increment per card
})

// Add component (works while streaming active)
client.cardkit.v1.card.element.create({
  path: { card_id },
  data: { element: JSON.stringify(imageElement), sequence }
})

// Update card settings (disable streaming)
client.cardkit.v1.card.settings({
  path: { card_id },
  data: { settings: JSON.stringify({ config: { streaming_mode: false } }), sequence }
})
```

---

## Error Handling Patterns

```typescript
async function robustChartStreaming(query: string, cardId: string) {
  try {
    // 1. Stream text
    const text = await streamText(query, cardId);
    
    // 2. Try to generate visualization
    let imageKey: string | null = null;
    try {
      const buffer = await generateVisualization(query);
      imageKey = await uploadImageToFeishu(buffer, "card");
    } catch (vizError) {
      // Log but don't fail entire operation
      console.warn("Failed to generate visualization:", vizError);
      // User still gets text response
    }
    
    // 3. Add image if successful
    if (imageKey) {
      try {
        await addImageElementToCard(cardId, imageKey);
      } catch (imgError) {
        console.warn("Failed to add image to card:", imgError);
      }
    }
    
    // 4. Always finalize
    await finalizeCard(cardId, text);
    
  } catch (error) {
    console.error("Chart streaming failed:", error);
    // Graceful fallback - at least finalize the card
    try {
      await finalizeCard(cardId, `Error: ${error.message}`);
    } catch (finalizeError) {
      console.error("Even finalize failed:", finalizeError);
    }
  }
}
```

---

## Performance Optimization

### Parallel Execution Timing

For typical OKR visualization flow:

| Phase | Duration | Parallelizable |
|-------|----------|----------------|
| Stream text chunks | ~1-2 seconds | Yes (with viz generation) |
| Generate heatmap PNG | ~100-200ms | Yes (during text streaming) |
| Upload to Feishu | ~100-200ms | Yes (during text streaming) |
| Add image element | ~50ms | Yes (while streaming active) |
| Finalize card | ~30ms | No (should be last) |

**Total optimized time: ~1.5-2.5 seconds** (vs 2+ seconds sequential)

```typescript
// Optimal: Text streams while visualization generates
Promise.all([
  streamTextResponse(cardId),     // ~1.5-2s
  generateAndUploadViz(data)      // ~200-400ms, parallel
])
.then(([_, imageKey]) => {
  // Both complete, add image and finalize
  return addImageAndFinalize(cardId, imageKey);
})
```

---

## Feishu JSON Schema Notes

### Card JSON 2.0 Structure (Required for Streaming)

```typescript
{
  schema: "2.0",  // REQUIRED for streaming support
  header: {
    title: { content: "...", tag: "plain_text" }
  },
  config: {
    streaming_mode: true,
    streaming_config: {
      print_frequency_ms: { default: 70 },
      print_step: { default: 1 },
      print_strategy: "fast"
    }
  },
  body: {
    elements: [
      {
        tag: "markdown",
        content: "",
        element_id: "md_12345"  // Must be: alphanumeric + underscore, max 20 chars
      }
    ]
  }
}
```

### Important Constraints

1. **element_id**: 
   - Must start with letter
   - Max 20 characters
   - Only alphanumeric + underscore
   - Your approach: `md_${timestamp.slice(-8)}` is good

2. **sequence numbers**:
   - Must increment per card
   - Start from 1
   - Used in: text updates, component adds/updates, settings changes
   - Your tracking: `cardSequences` map is correct approach

3. **streaming_config** (Feishu 7.23+):
   - Clients 7.20-7.22 ignore custom params, use defaults
   - Your defaults (70ms, step 1, "fast") are reasonable

---

## Testing Checklist

- [ ] Text streams with typewriter effect (test with 500+ character response)
- [ ] Heatmap generates without errors (test with different company counts)
- [ ] Image uploads successfully to Feishu
- [ ] Image displays in card after finalization
- [ ] Multiple sequential queries don't cause sequence number conflicts
- [ ] Error in viz generation doesn't break text streaming
- [ ] Card finalizes even if image upload fails
- [ ] Component API adds don't interfere with text streaming
- [ ] Sequence numbers increment correctly across multiple updates

---

## Conclusion

**Your current implementation is ~80% optimal.** The main improvements:

1. ✅ Using streaming mode for text (excellent choice)
2. ✅ Using OJS for visualization (clean and maintainable)
3. ✅ Uploading PNG to Feishu (right approach)
4. ⚠️ **Add image during streaming phase** (currently trying after)
5. ✅ Finalizing card (correct)

**Action items:**
1. Reorder: Add image elements **before** finalizing card
2. Ensure sequence numbers continue incrementing through image addition
3. Consider parallel execution of text streaming + viz generation for performance
4. Add error handling if viz generation fails (should not break text response)

See code patterns above for implementation guidance.
