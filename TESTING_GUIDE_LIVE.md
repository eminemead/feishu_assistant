# Button UI Testing - Live Testing Guide

**Date**: 2025-11-21  
**Time**: Now (server running)  
**Status**: ✅ Server ready, awaiting Feishu events  

## Current Status

```
✅ Build: Success (2.8MB, compiled in 147-194ms)
✅ Server: Running on port 3000
✅ WebSocket: Connected to Feishu
✅ Code: Integrated and ready
✅ Logs: Monitoring for events
```

## How To Trigger Button Testing

### Method 1: Mention Bot in Feishu (Recommended)
```
In any Feishu group chat where the bot has access:
@bot <your question>

Example: @bot What's the weather like?
```

**Why this works**: 
- `lib/handle-app-mention.ts` is fully integrated
- Passes `chatId`, `messageId`, `rootId` config
- Buttons should be sent in separate message

### Method 2: Direct Message to Bot
```
Send a direct message to the bot (if configured)
This triggers `lib/handle-messages.ts`
```

## What Will Happen

### Timeline (Approximate)
```
T+0s:   You send message to bot
T+1-2s: Bot generates response (might take longer for complex queries)
T+5-30s: Response streams to Feishu with typewriter effect
T+30s:  Streaming finishes
T+31s:  Text suggestions added to response
T+32s:  Streaming mode disabled
T+33s:  Buttons sent in SEPARATE message ← Testing this!
T+34s+: You can click buttons to continue conversation
```

### Expected Feishu UI

**Main Response Card**:
```
┌─────────────────────────────────────────┐
│ Bot Response (with streaming/typing)    │
│                                         │
│ This is the response text that shows   │
│ with a typewriter effect as it streams │
│                                         │
│ Suggestions:                            │
│ 1. First suggestion option              │
│ 2. Second suggestion option             │
│ 3. Third suggestion option              │
│                                         │
│ (text-based fallback)                   │
└─────────────────────────────────────────┘
```

**Separate Button Message** (Below the response):
```
┌─────────────────────────────────────────┐
│ Suggestions                             │
│                                         │
│ ┌──────────────┬──────────────┐         │
│ │ Option 1     │ Option 2     │         │
│ └──────────────┴──────────────┘         │
│                                         │
│ ┌──────────────┐                        │
│ │ Option 3     │                        │
│ └──────────────┘                        │
│                                         │
│ (interactive buttons!)                  │
└─────────────────────────────────────────┘
```

## Log Monitoring

### Start Log Monitoring
```bash
tail -f server.log | grep -E "button|Button|Feishu|mention|FollowupButtons|CardSuggestions|Error|error|action|separate|✅|❌"
```

### Expected Success Logs
When a message is received and buttons are sent, you should see:

```
[FeishuMention] Generating response...
[FeishuMention] Response generated (length=XXX)...
🎯 [CardSuggestions] Finalizing card with follow-ups...
🎯 [CardSuggestions] Generating follow-up suggestions...
✅ [CardSuggestions] Card updated with X text-based suggestions
🎯 [CardSuggestions] Disabling streaming mode...
✅ [CardSuggestions] Streaming mode disabled
🔘 [CardSuggestions] Sending buttons in separate message...
🔘 [FollowupButtons] Sending buttons in separate message...
🔘 [FollowupButtons] Sending card message...
✅ [FollowupButtons] Successfully sent buttons message: msg_xxxxx
✅ [CardSuggestions] Buttons sent in separate message: msg_xxxxx
```

### Red Flags (Errors to Watch For)
```
❌ 99992402               - Feishu validation error (shouldn't happen)
❌ Failed to send buttons - Button message send failed
⚠️ No follow-ups generated - No suggestions to send
Error:                      - Any error in finalization
exception:                  - Unexpected exception
```

## Verification Checklist

After sending a message to bot, verify:

### Response Rendering
- [ ] Response appears in Feishu
- [ ] Text shows with streaming/typing effect (if long response)
- [ ] Text suggestions visible in response (1, 2, 3...)
- [ ] Response is complete and readable

### Button Message
- [ ] Separate message appears BELOW the response
- [ ] Message has "Suggestions" or similar header
- [ ] Buttons are visible and styled as buttons
- [ ] Buttons show the suggestion text (not "undefined" or errors)
- [ ] Buttons have hover effects (visual feedback)

### Interactivity
- [ ] Clicking button sends request to bot
- [ ] New response appears for button click
- [ ] Conversation continues naturally
- [ ] No duplicate responses or messages
- [ ] No errors in Feishu chat

### Logging
- [ ] "Buttons sent in separate message" appears in logs
- [ ] No "error" or "Error" messages in button section
- [ ] No 99992402 errors anywhere in logs
- [ ] No exceptions thrown

## Test Scenarios

### Scenario 1: Basic Query (Quick)
**Send**: `@bot hello`  
**Expected**: Simple response with buttons  
**Time**: 5-10 seconds  

### Scenario 2: Longer Query (Complete Test)
**Send**: `@bot explain machine learning in detail`  
**Expected**: Longer streaming response with buttons  
**Time**: 15-30 seconds  
**Benefit**: Tests streaming effect + button sending together  

### Scenario 3: Button Click (Continuation)
**Do**: Click one of the buttons from response  
**Expected**: New response appears for button text  
**Time**: 5-10 seconds  
**Benefit**: Tests button handler integration  

## If Something Goes Wrong

### Buttons Don't Appear

1. **Check if finalization was called**:
   ```bash
   grep "CardSuggestions" server.log | tail -20
   ```

2. **Check if config was passed**:
   ```bash
   grep "Sending buttons in separate message" server.log
   ```

3. **Check for errors**:
   ```bash
   grep -i "error\|failed\|exception" server.log | tail -10
   ```

4. **Check Feishu for ANY new messages**:
   - Even if not styled as buttons, there should be a new message
   - Check if text suggestions are there at least

### Error 99992402 Appears

This would mean the button code is still trying to add buttons to streaming card.

1. **Check if separate message code is running**:
   ```bash
   grep "sendFollowupButtonsMessage" server.log
   ```

2. **Verify implementation was integrated**:
   ```bash
   grep "conversationId" lib/handle-app-mention.ts
   ```

3. **Rebuild might be needed**:
   ```bash
   bun run build
   ```

### Server Crashes

If server stops:
1. Check error logs: `tail -20 server.log`
2. Rebuild: `bun run build`
3. Restart: `NODE_ENV=development ENABLE_DEVTOOLS=true bun run dev`

## Success Criteria

✅ **Test passes if**:
- Response appears in Feishu
- Separate message with buttons appears
- Buttons are clickable
- Clicking button works
- No 99992402 errors
- No unhandled exceptions

❌ **Test fails if**:
- Buttons don't appear at all
- 99992402 error appears
- Unhandled exception thrown
- Server crashes

## Documentation Reference

- `IMPLEMENTATION_COMPLETE.md` - Implementation details
- `SESSION_SUMMARY_FINAL.md` - Complete overview
- `QUICK_START_TESTING.txt` - Quick checklist
- `lib/finalize-card-with-buttons.ts` - Implementation
- `lib/send-follow-up-buttons-message.ts` - Button sending

## Real-Time Commands

**Watch for incoming events**:
```bash
tail -f server.log | grep -i "mention\|message\|event"
```

**Watch for button sending**:
```bash
tail -f server.log | grep -i "button\|FollowupButtons"
```

**Watch for errors**:
```bash
tail -f server.log | grep -i "error\|failed\|exception"
```

**Full log**:
```bash
tail -f server.log
```

---

## Ready To Test!

Server is running and connected to Feishu.

**Next action**: Mention the bot in Feishu chat with a question, then monitor logs for button sending.

If buttons appear → Feature works! 🎉  
If not → Check logs and debug based on error messages.

Good luck! 🚀
