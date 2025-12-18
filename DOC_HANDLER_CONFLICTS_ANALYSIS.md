# Document Handler vs Manager Agent: Routing Conflicts

## Current Status
- ✅ Webhook infrastructure deployed (doc-webhook-handler.ts + POST /webhook/docs/change)
- ✅ Document command handler working (handle-doc-commands.ts)
- ✅ Supabase integration logging events successfully
- ❌ **Routing conflicts** between doc handler and manager agent
- ❌ Missing document command interception in handle-messages.ts

## Problem 1: Document Commands Routed to Manager Agent

### Root Cause
Document command interception only exists in `handle-app-mention.ts` (lines 89-120), but NOT in `handle-messages.ts`.

### Flow Comparison

**GOOD PATH** (handle-app-mention.ts):
```
@bot watch https://...
  ↓
handleNewAppMention()
  ↓
Pattern match: /^(watch|check|unwatch|watched|tracking:\w+)/
  ↓
Early-exit: handleDocumentCommand() called
  ↓
Returns early, BYPASSES manager agent ✅
```

**BROKEN PATH** (handle-messages.ts):
```
@bot watch https://...  (from P2P message)
  ↓
handleNewMessage()
  ↓
⚠️ NO PATTERN MATCHING
  ↓
Calls generateResponse() → managerAgent()
  ↓
Manager agent receives "watch https://..." query
  ↓
Manager has no "document tracking" specialist
  ↓
Falls back to web search or generic response ❌
```

## Problem 2: Webhook Events + User Queries = Dual Responses

When user says "watch document X":

1. **Via command handler**: Sends confirmation message to chat
2. **Via manager agent** (if path is wrong): Sends agent response

Result: User sees 2+ responses for 1 command

## Problem 3: Pattern Matching Not Consistent

Currently only checking in handle-app-mention.ts:
```typescript
const isDocCommand = /^(watch|check|unwatch|watched|tracking:\w+)\s+/i.test(cleanText);
```

Should check in:
- `handle-app-mention.ts` ✅ (done)
- `handle-messages.ts` ❌ (missing)
- `handle-button-followup.ts` ❌ (check if needed)

## Solutions

### Fix 1: Add Document Command Interception to handle-messages.ts

File: `lib/handle-messages.ts`

Add after line 28 (after cleanText):

```typescript
import { handleDocumentCommand } from "./handle-doc-commands";
import { devtoolsTracker } from "./devtools-integration";

// ... existing code ...

  try {
    // Check if this is a document tracking command (early exit before agent)
    const isDocCommand = /^(watch|check|unwatch|watched|tracking:\w+)\s+/i.test(cleanText);
    if (isDocCommand) {
      console.log(`[DocCommand] Intercepted document command: "${cleanText.substring(0, 50)}..."`);
      devtoolsTracker.trackAgentCall("DocumentTracking", cleanText, {
        messageId,
        rootId,
        commandIntercepted: true
      });

      // Handle document command directly (bypasses agent)
      const handled = await handleDocumentCommand({
        message: cleanText,
        chatId,
        userId,
        botUserId
      });

      if (handled) {
        console.log(`[DocCommand] Command handled successfully`);
        await updateCardElement(card.cardId, card.elementId, "✅ Command executed");
        devtoolsTracker.trackResponse("DocumentTracking", "Command executed", Date.now() - startTime, {
          threadId: rootId,
          messageId,
          commandHandled: true
        });
        return; // Early exit - don't call generateResponse
      }
      console.log(`[DocCommand] Command pattern matched but handler returned false, falling through to agent`);
    }

    // Rest of existing code...
```

### Fix 2: Ensure handle-button-followup.ts Consistency

File: `lib/handle-button-followup.ts`

Check if button follow-ups with document commands are handled correctly.
Currently calls `handleNewAppMention()` which HAS the interception, so should be OK.
But verify the flow works end-to-end.

### Fix 3: Verify Manager Agent Has No Document Routing

File: `lib/agents/manager-agent.ts`

Confirm document tracking is NOT in routing patterns:
```typescript
// Line ~218: Check routing patterns don't match document commands
// OKR pattern
// Alignment pattern
// P&L pattern
// DPA-PM pattern
// (None should match "watch", "check", "unwatch", etc.)
```

## Testing Checklist

After implementing fixes:

- [ ] Send P2P message: `@bot watch https://...` → Should be handled by command handler
- [ ] Send group message: `@bot watch https://...` → Should be handled by command handler
- [ ] Verify only 1 response card appears (not 2+)
- [ ] Check logs show "[DocCommand] Intercepted document command"
- [ ] Verify manager agent is NOT called for document commands
- [ ] Test with actual webhook event: Document change → Notification appears (no double response)

## Files to Modify

1. **lib/handle-messages.ts** (PRIMARY FIX)
   - Add document command pattern matching
   - Add early-exit logic before generateResponse()
   - Add imports: handleDocumentCommand, devtoolsTracker

2. **lib/handle-button-followup.ts** (VERIFY)
   - Confirm document commands routed to handleNewAppMention() work correctly

3. **lib/agents/manager-agent.ts** (VERIFY)
   - Confirm no document command patterns in routing
   - Verify no "document tracking" specialist in instructions

## Success Criteria

✅ Document commands ALWAYS routed to handler, never to manager agent
✅ Single response per document command (no duplicate messages)
✅ Webhook events trigger notifications without conflicts
✅ Both P2P and group messages handle doc commands identically
