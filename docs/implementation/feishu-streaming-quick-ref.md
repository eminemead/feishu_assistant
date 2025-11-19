# Feishu Streaming Visualization - Quick Reference

## Best Pattern for OJS → Feishu Card

```typescript
// 3-phase pattern for charts/trends in cards

async function streamVisualizationToCard(query, chatId) {
  // PHASE 1: Create streaming card (user sees immediate feedback)
  const card = await createAndSendStreamingCard(chatId, "chat_id", {
    title: "Analyzing..."
  });

  try {
    // PHASE 2: Do both in parallel
    const [text, imageKey] = await Promise.all([
      // 2a. Stream text response (typewriter effect)
      streamTextWithUpdates(query, card.cardId, card.elementId),
      
      // 2b. Generate + upload visualization (non-blocking)
      generateAndUploadChart(query)
    ]);

    // PHASE 3: Add image + finalize
    if (imageKey) {
      await addImageElementToCard(card.cardId, imageKey, "Chart");
    }
    await finalizeCard(card.cardId, text);

  } catch (error) {
    await finalizeCard(card.cardId, `Error: ${error.message}`);
  }
}
```

## Key Points

### Text Streaming (Already Doing Right)
- Uses `updateCardElement()` with incrementing sequence numbers
- Feishu renders as typewriter effect automatically
- Works while `streaming_mode: true`
- ✅ Your implementation is correct

### Image in Card (Improvement Needed)
- Add via `addImageElementToCard()` **BEFORE** finalizing
- Use component-level API (works during streaming)
- Sequence numbers must continue incrementing
- After image added, then call `finalizeCard()` to disable streaming

### Observable Plot (Best Choice)
- Pure Node.js implementation ✅
- Uses jsdom for server-side rendering ✅
- Converts SVG→PNG with sharp ✅
- Much cleaner than canvas manipulation ✅

## Feishu API Limits (Important)

| Operation | Limit | During Streaming |
|-----------|-------|------------------|
| Text streaming updates | Unlimited | YES (this is the point) |
| Component API calls (add/update/delete) | 10/sec | YES (doesn't conflict) |
| Full card updates | 10/sec | NO (must disable streaming) |

## Sequence Numbers

Must increment **per card** across **all updates**:

```typescript
// Track state
const cardSequences = new Map<string, number>();

async function updateCard(cardId, operation) {
  let seq = cardSequences.get(cardId) || 0;
  seq++;
  cardSequences.set(cardId, seq);
  
  // Use seq for: text updates, component adds, settings changes
  return client.cardkit.v1[operation]({
    data: { sequence: seq, ... }
  });
}
```

Your current implementation of this is ✅ correct.

## Timing (Example Flow)

```
User query: "Show OKR metrics chart for Nov"
│
├─ [0ms] Create card + send to Feishu
├─ [5ms] Start: Text streaming of analysis
├─ [10ms] Start: Heatmap generation in parallel
├─ [50ms] Chunk 1 streamed (text update #1)
├─ [100ms] Chunk 2 streamed (text update #2)
├─ [150ms] Heatmap PNG ready
├─ [200ms] Image uploaded to Feishu (get image_key)
├─ [250ms] Chunk 3 streamed (text update #3)
├─ [300ms] Chunk 4 streamed (text update #4)
├─ [400ms] Text streaming done
├─ [410ms] Add image element to card
├─ [420ms] Finalize card (streaming_mode: false)
└─ [430ms] DONE - Total ~430ms with parallel execution
```

Compare to sequential: would be ~800ms+

## Common Mistakes to Avoid

❌ **Wrong**: Try to finalize, then add image
```typescript
await finalizeCard(card.cardId);
await addImageElementToCard(cardId, imageKey); // Won't work well
```

✅ **Right**: Add image, then finalize
```typescript
await addImageElementToCard(cardId, imageKey);
await finalizeCard(card.cardId);
```

❌ **Wrong**: Don't track sequence numbers
```typescript
await updateCardElement(cardId, elemId, text, sequence: 1);
await updateCardElement(cardId, elemId, text, sequence: 1); // Duplicate!
```

✅ **Right**: Increment sequence per card
```typescript
sequence = cardSequences.get(cardId) + 1;
cardSequences.set(cardId, sequence);
```

❌ **Wrong**: Wait for viz before starting text streaming
```typescript
const viz = await generateHeatmap(); // 200ms wait
const text = await streamText(); // Could have been parallel
```

✅ **Right**: Start both in parallel
```typescript
const [text, viz] = await Promise.all([
  streamText(),
  generateHeatmap() // Overlaps, saves ~200ms
]);
```

## Your Current Code Review

| File | Status | Notes |
|------|--------|-------|
| `feishu-utils.ts` | ✅ Solid | Streaming + finalize logic is correct |
| `okr-heatmap-plot.ts` | ✅ Solid | OJS implementation is clean |
| `okr-visualization-tool.ts` | ⚠️ Improve | Add parallelization of text + viz generation |
| `handle-messages.ts` | ⚠️ Improve | Reorder: image add → finalize (not finalize → image) |
| `handle-app-mention.ts` | ⚠️ Improve | Same as handle-messages.ts |

## Next Steps

1. **Update flow in `handle-messages.ts`** and `handle-app-mention.ts`:
   - Stream text + generate viz in parallel
   - Add image BEFORE finalizing
   - Continue incrementing sequence numbers

2. **Test edge cases**:
   - Viz generation failure (should not break text response)
   - Large datasets (test with 100+ companies)
   - Slow network (add timeout handling)

3. **Consider user experience**:
   - Show "generating visualization..." while processing
   - If viz takes >2s, show progress indicator
   - Fallback to text-only if viz fails

4. **Monitor**:
   - Track sequence number issues (enable logging)
   - Monitor image upload failures
   - Check card rendering in different Feishu clients

## Resources

- **Feishu Streaming Updates**: https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview
- **Feishu Card Updates**: https://open.feishu.cn/document/feishu-cards/update-feishu-card
- **Observable Plot Docs**: https://observablehq.com/plot
- **Your Code**: See `feishu-streaming-visualization-guide.md` for detailed patterns
