# Phase 5c-2 Execution Guide: Multi-Turn Memory Testing

## Setup (5 min)

### 1. Start fresh devtools monitoring
```bash
# Clear old events
curl -X POST http://localhost:3000/devtools/api/clear

# Verify clear
curl -s http://localhost:3000/devtools/api/stats | jq .
# Expected: totalEvents: 0
```

### 2. Watch devtools in real-time
```bash
# Terminal 1: Real-time event monitor
watch -n 1 'curl -s "http://localhost:3000/devtools/api/events?limit=5" | jq -r ".[] | \"[\(.metadata.agent)] \(.type) - \(.metadata.tokens.input // 0) in / \(.metadata.tokens.output // 0) out tokens\""'

# Terminal 2: Alternative - Full event monitor (if watch not available)
while true; do
  curl -s "http://localhost:3000/devtools/api/events?limit=3" | jq '.[] | {agent: .metadata.agent, type: .type, tokens_in: .metadata.tokens.input, tokens_out: .metadata.tokens.output}'
  echo "---"
  sleep 2
done
```

### 3. Verify server is running
```bash
curl -s http://localhost:3000/health | jq .status
# Expected: "healthy"
```

---

## Phase 5c-2: Testing (15 min)

### Test Group Info
- **Group**: `oc_cd4b98905e12ec0cb68adc529440e623`
- **Purpose**: Multi-turn conversation validation
- **Expected**: Bot maintains context across Q&A exchanges

### Execute Test Sequence

#### Step 1: Clear previous messages (optional)
If this is not a fresh test group, clear old messages first to avoid confusion.

#### Step 2: Send Q1 - Initial Query
**In Feishu, send to test group:**
```
@bot What are the key principles of OKR setting?
```

**Monitor Devtools:**
- Should see `agent_call` event immediately
- Check tokens: input ~200-300, output ~500-1000
- No memory context on first message (expected)

**Expected Response:**
- Detailed explanation of OKR principles (objectives, key results, etc.)
- ~5-10 sentences
- Clear and structured

**Log Output to Watch For:**
```
📌 [WebSocket] Extracted mentioned user ID: ou_xxx (Your Name)
💾 [WebSocket] Using user ID for memory context: ou_xxx (from mention)
```

---

#### Step 3: Send Q2 - Follow-up with Context
**In Feishu, wait ~2 seconds, then send:**
```
@bot How can I apply those principles to my engineering team?
```

**Monitor Devtools:**
- Should see second `agent_call` event
- **KEY**: Input token count should be HIGHER (memory context included)
- Compare: Q1 tokens vs Q2 tokens
  - Q1: ~200 input
  - Q2: ~400-600 input (memory adds ~200-400 tokens) ✅

**Expected Response:**
- Should reference back to Q1: "As we discussed", "Based on the principles we talked about", "Similar to what I mentioned", etc.
- Should specifically apply OKR principles to engineering context
- Should show understanding of Q1's content

**Success Indicators:**
- ✅ Response mentions "OKR principles" or references them
- ✅ Response talks about "engineering" specifically
- ✅ Response shows continuity from Q1

**Log Output to Watch For:**
```
💾 [WebSocket] Using user ID for memory context: ou_xxx (from mention)
[Memory] Loaded N messages for conversation: feishu:oc_xxx:root_xxx
[FeishuMention] Response generated ... (includes memory context in input)
```

---

#### Step 4: Send Q3 - Deeper Follow-up
**In Feishu, send:**
```
@bot What metrics should I track to measure success?
```

**Monitor Devtools:**
- Input tokens should be even HIGHER (Q1, Q2, Q3 context accumulated)
- Progression: Q1 ~200 → Q2 ~400 → Q3 ~600+ tokens

**Expected Response:**
- Should reference both Q1 AND Q2
- Should understand the OKR context from earlier messages
- Should provide metrics specific to engineering OKRs

---

## Verification Commands

### Check Token Usage Progression
```bash
curl -s 'http://localhost:3000/devtools/api/events?limit=10' | jq -r '.[] | select(.type == "agent_call") | "Event \(.metadata.agent): \(.metadata.tokens.input) in / \(.metadata.tokens.output) out tokens"'
```

Expected output:
```
Event Manager: 215 in / 847 out tokens        (Q1 - first message)
Event Manager: 437 in / 925 out tokens        (Q2 - memory context added)
Event Manager: 614 in / 892 out tokens        (Q3 - more context)
```

### View Full Event Details
```bash
curl -s 'http://localhost:3000/devtools/api/events?limit=3' | jq '.[] | {agent: .metadata.agent, tokens_in: .metadata.tokens.input, tokens_out: .metadata.tokens.output, has_memory: (.context.memory != null), duration_ms: (.duration)}'
```

### Check Memory Saved to Supabase
```bash
cat > /tmp/check_5c_memory.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: messages } = await supabase
  .from('agent_messages')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20);

console.log(`Total messages: ${messages?.length || 0}\n`);

messages?.forEach((msg, i) => {
  const shortContent = msg.content?.substring(0, 60).replace(/\n/g, ' ') + '...';
  console.log(`${i+1}. [${msg.role}] ${msg.conversation_id}`);
  console.log(`   ${shortContent}`);
  console.log(`   User: ${msg.user_id}, Created: ${new Date(msg.created_at).toLocaleTimeString()}\n`);
});
EOF

bun run /tmp/check_5c_memory.ts
```

Expected structure:
```
Total messages: 6-8

1. [assistant] feishu:oc_cd4b98905e12ec0cb68adc529440e623:root_xxx
   Here are the key principles of OKR setting...
   User: ou_xxx, Created: 17:30:45

2. [user] feishu:oc_cd4b98905e12ec0cb68adc529440e623:root_xxx
   How can I apply those principles to my engineering team?
   User: ou_xxx, Created: 17:30:52

...and so on, all with same conversation_id and user_id
```

---

## Success Criteria Checklist

Phase 5c-2 is **COMPLETE** when:

- [ ] Q1 receives detailed OKR explanation response
- [ ] Q1 event appears in devtools with token usage
- [ ] Q2 receives contextual follow-up response
- [ ] Q2 response explicitly references Q1 content
- [ ] Q2 event shows HIGHER input tokens (memory included)
- [ ] Q3 receives response with context from both Q1 and Q2
- [ ] Q3 input tokens even HIGHER than Q2
- [ ] All messages appear in devtools events (proper logging)
- [ ] All messages saved to Supabase with same conversation_id
- [ ] All messages have same user_id (mentioned user, not sender)
- [ ] Conversation_id format correct: `feishu:chat_id:root_id`

### Token Increase Thresholds
- Q1 input: 150-250 tokens
- Q2 input: 350-450 tokens (increase: ~200 for context)
- Q3 input: 500-700 tokens (increase: ~150-250 for accumulated context)

---

## Troubleshooting

### No response from agent
1. Check server logs for errors: `tail -f server.log`
2. Verify bot is mentioned correctly: `@bot` or `@_user_2`
3. Check LLM API keys are set
4. Look for "Error in handleNewAppMention" in logs

### Messages not appearing in devtools
1. Clear and restart: `curl -X POST http://localhost:3000/devtools/api/clear`
2. Send message again
3. Check: `curl -s http://localhost:3000/devtools/api/stats`
4. Verify ENABLE_DEVTOOLS=true in .env

### Memory not persisting (token count not increasing)
1. Check Supabase connection: `curl -s http://localhost:3000/health | jq`
2. Verify messages are being saved to database (check Supabase directly)
3. Look for warnings in logs: `⚠️ [Memory]`
4. Check if InMemory provider being used as fallback

### Response doesn't reference previous context
1. Verify messages are in agent_messages table
2. Check memory is being loaded: grep `[Memory] Loaded` in logs
3. Verify same conversation_id for all messages
4. Try increasing message count in memory load (update limit in code)

### User ID not from mention
1. Check logs for: `📌 [WebSocket] Extracted mentioned user ID`
2. If not present, check mentions array in webhook: `curl logs for mentions`
3. Verify message format: must be `@bot message` not `message @bot`
4. Check Feishu subscription mode is working (not webhook mode)

---

## After Testing

1. **Document results**: Record token counts and response quality
2. **Verify Supabase**: Take screenshot of agent_messages with all Q/A
3. **Save logs**: Copy relevant server logs for reference
4. **Update bd**: Mark phase 5c-2 as complete with findings
5. **Move forward**: Proceed to Phase 5c-3 (user isolation) or Phase 5d

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `curl -X POST http://localhost:3000/devtools/api/clear` | Clear all events |
| `curl -s http://localhost:3000/devtools/api/stats \| jq .` | View statistics |
| `curl -s 'http://localhost:3000/devtools/api/events?limit=5' \| jq` | View recent events |
| `bun run /tmp/check_5c_memory.ts` | Check Supabase memory |
| `tail -f server.log` | Watch server logs (if logging configured) |

---

## Expected Timeline

- Setup: 5 min
- Q1 send & response: 30 sec
- Monitor & verify: 1 min
- Q2 send & response: 30 sec
- Monitor & verify: 1 min
- Q3 send & response: 30 sec
- Monitor & verify: 1 min
- Supabase check: 2 min
- Documentation: 2 min

**Total**: ~12-15 minutes
