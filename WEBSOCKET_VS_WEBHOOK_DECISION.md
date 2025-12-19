# WebSocket Subscription Mode vs Webhooks for Feishu Bot

## Executive Summary

The Feishu Assistant uses **WebSocket Subscription Mode** for bot mention events but **webhooks for document tracking**. The decision was driven by a fundamental API constraint: **Feishu only supports streaming text in cards, not interactive elements like buttons**.

## The Core Decision: WebSocket Subscription Mode for Bot Messages

### Why Subscription Mode (WebSocket)?

**Root Reason: Card Streaming Requires Long-Lived Connections**

Feishu's CardKit API supports `streaming_mode` which allows:
- Progressive text updates to cards via `cardElement.patch()`
- Real-time typewriter-like appearance of agent responses
- Streaming Mermaid/Vega-Lite chart definitions in markdown

**API Constraint**: Once streaming_mode=true, **buttons/interactive elements cannot be added** (returns error 99992402).

See: `docs/implementation/feishu-api-findings.md` lines 1-127 for detailed investigation.

### Webhook vs Subscription Mode Trade-Off

| Aspect | Webhooks (HTTP) | Subscription Mode (WebSocket) |
|--------|-----------------|-------------------------------|
| Event Delivery | Push (one-way) | Push + Reply (two-way possible) |
| Long-lived Connection | No | Yes |
| Card Streaming | Limited | **Full support** |
| Button Updates | Possible after streaming ends | Not possible after creation |
| Implementation Complexity | Lower | Higher (connection management) |
| Latency | ~100-500ms per request | <10ms (persistent connection) |
| Scalability | HTTP scales well | WebSocket connection limits |

### The Key Insight: Card Streaming Requires Subscription Mode

**The Problem:**
- Webhooks deliver events asynchronously
- After receiving a webhook, you need to update the card from your server
- But Feishu requires a "long-lived connection" context for streaming APIs
- Webhooks don't provide this context

**The Solution:**
- Use WebSocket Subscription Mode (EventDispatcher)
- Bot stays connected to Feishu
- On mention event, immediately start streaming response via WebSocket context
- Can call `cardElement.patch()` progressively while connected

See: `server.ts` lines 48-51, 77-100 for Subscription Mode initialization.

## Evidence of the Card Streaming Requirement

### Commit History
- **`790ddf3`**: "Fix button callback handling for WebSocket Subscription Mode"
  - Shows button handling specifically tied to Subscription Mode
- **`136f324`**: "Fix: Remove duplicate follow-up text from streaming response card"
  - Indicates streaming was the primary feature being built
- **`0c1f705`**: "doc: session complete - chart streaming infrastructure ready"
  - Chart streaming drove architectural decisions

### API Findings Documentation
From `docs/implementation/feishu-api-findings.md`:

```
### Phase 1: Card Creation (Streaming Enabled)
✅ Can add markdown elements
✅ Can update markdown content via updateCardElement()
✅ Can add image elements
✅ Can add divider elements
❌ Cannot add action elements (buttons) ← KEY CONSTRAINT
❌ Cannot add interactive elements
```

### Session Notes
From beads issues tracking:
- **feishu_assistant-kjl**: "Alternative UI for follow-up suggestions - text-based menu" (closed)
  - Discovered that buttons can't be added to streaming cards
  - Chose text-based alternatives instead
- **feishu_assistant-s5p**: "Investigate alternative button UI approaches - blocked by Feishu API constraint"
  - Explicitly marked as "blocked by Feishu API constraint"

## Chart Streaming: The Breakthrough

From `history/WHY_CHARTS_IN_MARKDOWN_WORK.md`:

### The Insight
**Feishu only supports streaming text, BUT markdown code blocks let you stream chart definitions that render in real-time.**

```
User: "Generate OKR chart"
  → Agent: starting response...
  → [Stream] "Here's the analysis:"
  → [Stream] "\`\`\`mermaid\n"
  → [Stream] "flowchart LR\n..."
  → [Stream] "\`\`\`"
  ✓ User sees chart "drawing" in real-time
```

This works because:
1. ✓ Markdown is plain text (streamable)
2. ✓ Code blocks are plain text (streamable)
3. ✓ Mermaid/Vega-Lite definitions are plain text (streamable)
4. ✓ Feishu renders code blocks automatically

### Why This Required Subscription Mode
- Streaming must be continuous and low-latency
- WebSocket connections provide this capability
- Webhooks would require multiple round-trips (webhook → server → API → server → webhook) causing delays
- Progressive chart rendering needs <10ms latency between chunks

## Where Webhooks ARE Used: Document Tracking

The bot DOES use webhooks for document changes:

**Feature**: `docs:event:subscribe` webhook integration
- User: `@bot watch <doc>`
- Feishu: Document changes → POST to `/webhook/docs/change`
- System: Receives event → Extract changes → Notify chat

See: `lib/handlers/doc-webhook-handler.ts`, `lib/doc-webhook.ts`

**Why Webhooks Work Here:**
- Document changes are infrequent
- Don't require real-time streaming
- Each change can be a separate notification
- No need for progressive updates to a single card

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                Feishu App                        │
│                                                   │
│  1. Message Mentions → WebSocket Event           │
│  2. Document Changes → Webhook POST              │
└────┬──────────────────────┬──────────────────────┘
     │                      │
     │ Subscription Mode    │ Document Webhook
     │ (WSClient)           │ (HTTP POST)
     │                      │
     ↓                      ↓
┌─────────────────────┐  ┌─────────────────────┐
│ server.ts           │  │ server.ts           │
│ EventDispatcher     │  │ POST /webhook/docs  │
│                     │  │                     │
│ On im.message.*:    │  │ handleDocChange:    │
│ - Stream response   │  │ - Log to DB         │
│ - Update card       │  │ - Notify chat       │
│ - Progress updates  │  │ - Check rules       │
└─────────────────────┘  └─────────────────────┘
     ↓                      ↓
┌─────────────────────────────────────────────────┐
│  Feishu CardKit API                             │
│  - cardElement.patch() ← requires live context  │
│  - Streaming text → renders progressively       │
│  - Chart definitions → Mermaid/Vega renders     │
└─────────────────────────────────────────────────┘
```

## Technical Justification

### Why We Can't Use Webhooks for Messages

1. **Lost Connection Context**
   - Webhook arrives at server
   - Server receives event, extracts message
   - Server creates card
   - Server needs to stream updates
   - But WebSocket context is lost (webhook was HTTP)
   - `cardElement.patch()` fails without streaming context

2. **Latency Problem**
   - Webhook: server receives → processes → API call → Feishu (100-500ms)
   - WebSocket: connected → process → immediate patch (10-50ms)
   - Chart streaming needs low latency for smooth appearance

3. **Connection State**
   - Webhooks are stateless (each request independent)
   - Streaming requires maintaining state
   - WebSocket provides persistent connection state

### Why We CAN Use Webhooks for Document Changes

1. **No Real-Time Streaming**
   - Document changes are discrete events
   - No need for progressive updates
   - Can be handled in separate HTTP requests

2. **Simpler State Management**
   - Each change = separate notification
   - No need to maintain card streaming context
   - Document subscription state stored in DB (Supabase)

3. **Better Scalability**
   - HTTP webhooks scale to thousands of docs
   - WebSocket would require separate connection per doc
   - Polling is alternative but webhook is better

## Key Decisions

| Decision | Reason | Trade-off |
|----------|--------|-----------|
| **Subscription Mode for messages** | Card streaming needs persistent connection | Requires WebSocket connection management & reconnection logic |
| **Webhooks for doc changes** | Discrete events, no streaming needed | Document tracking is separate service from message handling |
| **Text-based follow-ups** | Buttons incompatible with streaming | Less interactive than buttons, but works reliably |
| **Markdown-embedded charts** | Streaming cards only support text | More elegant than pre-rendered images, leverages streaming |

## Known Limitations & Workarounds

### Limitation 1: No Interactive Buttons in Streaming Cards
- ❌ Can't add buttons while streaming
- ✅ Workaround: Text-based suggestions or separate message with buttons

### Limitation 2: Vega-Lite Rendering in Feishu
- ❌ Feishu might not render Vega-Lite JSON blocks
- ✅ Workaround: Use Mermaid (more reliable) + ASCII tables + prose

### Limitation 3: Button Callbacks in Streaming Context
- ❌ Can't update streaming card from button callback
- ✅ Workaround: Send new response card on button click (separate message)

See: `server.ts` lines 419-480 for button callback handling workaround.

## Future Improvements

1. **Langfuse Observability** (in progress)
   - Better tracking of streaming latency
   - Cost analysis for card updates
   - Performance profiling

2. **Hybrid Approach**
   - Keep Subscription Mode for messages (proven to work)
   - Consider polling fallback if WebSocket unreliable
   - Add health checks for connection stability

3. **Card State Management**
   - Implement card versioning for progressive updates
   - Better tracking of what's being streamed
   - Rollback capability for failed streams

4. **Document Tracking Enhancements**
   - Move from polling to webhook-based (docs:event:subscribe)
   - Real-time change reactions
   - Rule engine for conditional actions

## References

- **docs/implementation/feishu-api-findings.md** - Full investigation of CardKit API constraints
- **history/WHY_CHARTS_IN_MARKDOWN_WORK.md** - Explanation of chart streaming breakthrough
- **server.ts** - Lines 48-100 (WebSocket initialization), 280-380 (event handling)
- **lib/handle-app-mention.ts** - Message handling & card creation
- **lib/send-feishu-response-card.ts** - Card streaming implementation
- **lib/handlers/doc-webhook-handler.ts** - Document webhook handling

## Conclusion

**The decision to use WebSocket Subscription Mode over pure webhooks was driven by Feishu's CardKit API design**: streaming text to cards requires a long-lived connection. This architectural choice enabled chart streaming, which is a core feature providing real-time visualization of OKR data.

Webhooks are still used where appropriate (document tracking), but for the bot's message handling and response generation, Subscription Mode is the correct choice.
