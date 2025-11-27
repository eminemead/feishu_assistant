# Phase 5c-2: Memory Persistence Testing - Step-by-Step Guide

## Objective
Validate that multi-turn conversations maintain context through memory persistence.

## Prerequisites
- Server running: `bun run dev` (should be running already)
- Devtools enabled: http://localhost:3000/devtools
- Test group configured: `oc_cd4b98905e12ec0cb68adc529440e623`
- Supabase connected and memory tables accessible

## Quick Status Check

```bash
# Check server health
curl http://localhost:3000/health

# Check devtools is accessible
curl -s http://localhost:3000/devtools/api/stats | jq .

# Verify memory integration tests pass
bun test test/integration/memory-multiturn.test.ts --timeout 15000
```

## Phase 5c-2: Single User Multi-Turn Validation

### Manual Testing (Feishu)

**Step 1: Open test group**
- Go to Feishu
- Open group: `oc_cd4b98905e12ec0cb68adc529440e623`
- Send first message in the thread

**Step 2: Message 1 (Q1) - Initial Query**
```
Message: "What are the key principles of OKR setting?"

Expected Response:
- Agent should provide detailed explanation
- Should mention objectives, key results, measurable goals
- Response should be ~5-10 sentences explaining OKR fundamentals
- Check devtools: token usage should appear
```

**Devtools Check After Q1:**
```bash
curl -s 'http://localhost:3000/devtools/api/events?limit=10' | jq '.[] | {
  agent: .metadata.agent,
  type: .type,
  tokens_in: .metadata.tokens?.input,
  tokens_out: .metadata.tokens?.output
}' | head -20
```

Expected:
- One agent_call event from manager agent
- Token usage for the LLM call
- No memory tokens yet (first message)

**Step 3: Message 2 (Q2) - Follow-up with Context**
```
Message: "How can I apply those principles to my engineering team?"

Expected Response:
- Agent should reference back to OKR principles from Q1
- Response should specifically mention principles discussed in Q1
- Should apply them to engineering context
- Token usage should INCREASE (memory context added)
- Response should mention "As we discussed" or similar reference
```

**Devtools Check After Q2:**
```bash
curl -s 'http://localhost:3000/devtools/api/events?limit=10' | jq '.[] | {
  agent: .metadata.agent,
  type: .type,
  tokens_in: .metadata.tokens?.input,
  tokens_out: .metadata.tokens?.output,
  has_memory_context: (.context.memory != null)
}' | head -30
```

Expected:
- Second agent_call event
- Higher input token count (memory context included)
- Memory context visible in event

### Database Verification

**Check messages saved to Supabase:**
```bash
cat > /tmp/check_memory.ts << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get recent messages
const { data: messages, error } = await supabase
  .from('agent_messages')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('Error:', error);
} else {
  console.log('Recent messages:');
  messages?.forEach((msg, i) => {
    console.log(`\n${i+1}. [${msg.role}] ${msg.conversation_id}`);
    console.log(`   Content: ${msg.content?.substring(0, 100)}...`);
    console.log(`   Created: ${msg.created_at}`);
  });
}
EOF

bun run /tmp/check_memory.ts
```

Expected:
- At least 2-4 messages (Q1, A1, Q2, A2 or similar)
- Same conversation_id for all (e.g., `feishu:oc_cd4b98905e12ec0cb68adc529440e623:root_message_id`)
- Alternating user/assistant roles

### Success Criteria Checklist

- [ ] Q1 receives agent response with OKR explanation
- [ ] A1 appears in devtools event log
- [ ] Token usage tracked for Q1
- [ ] Q2 receives agent response
- [ ] A2 references back to Q1 context ("As discussed", "Based on what we talked about", etc.)
- [ ] A2 token usage is higher than A1 (memory context)
- [ ] Both messages appear in devtools events
- [ ] Messages saved to Supabase agent_messages table
- [ ] All messages have same conversation_id
- [ ] Conversation_id format: `feishu:chat_id:root_id`

## Phase 5c-3: User Isolation Validation (Optional - if 2 test users available)

**Setup**: Have User A and User B message in the same test group thread

**User A Message 1:**
```
Message: "I'm focusing on revenue growth for Q4"
Expected: Agent responds with revenue-focused advice
```

**User B Message 1:**
```
Message: "I'm focusing on product quality improvements"
Expected: Agent responds with quality-focused advice, no mention of revenue from User A
```

**Verification:**
```bash
# Check that messages are isolated by user_id
bun run << 'EOF'
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get messages grouped by user
const { data: messages } = await supabase
  .from('agent_messages')
  .select('user_id, role, content')
  .order('created_at', { ascending: false })
  .limit(20);

const byUser = {};
messages?.forEach(msg => {
  if (!byUser[msg.user_id]) byUser[msg.user_id] = [];
  byUser[msg.user_id].push(msg);
});

console.log('Messages by user:');
Object.entries(byUser).forEach(([userId, msgs]) => {
  console.log(`\nUser: ${userId} (${msgs.length} messages)`);
  msgs.forEach(msg => {
    console.log(`  ${msg.role}: ${msg.content?.substring(0, 50)}...`);
  });
});
EOF
```

Expected:
- User A's messages don't include User B's context
- Separate message threads per user
- RLS policy enforces at database level

## Troubleshooting

### No messages appearing in devtools
1. Check server is running: `curl http://localhost:3000/health`
2. Check devtools is enabled: `echo $ENABLE_DEVTOOLS`
3. Check server logs for errors
4. Try sending a message again

### Agent not responding
1. Check Feishu webhook is configured correctly
2. Check server logs for webhook errors
3. Verify test group ID is correct
4. Check LLM API keys are set

### Memory not persisting
1. Check Supabase connection: `curl -s http://localhost:3000/health | jq .supabase`
2. Verify agent_messages table exists
3. Check if InMemory provider is being used (fallback): look for "⚠️ [Memory] Supabase not configured"
4. Check Supabase JWT and connection string

### Devtools shows no memory context
1. This is expected for first message (no history to load)
2. Second message should show memory in context
3. Check token counts are increasing (input tokens higher on Q2)

## Next Steps

After successful Phase 5c-2 testing:
1. Move to Phase 5c-3 (user isolation) if test users available
2. Proceed to Phase 5d (Devtools Monitoring Verification)
3. Document findings in session summary

## Useful Commands

```bash
# Real-time devtools monitoring
watch 'curl -s "http://localhost:3000/devtools/api/events?limit=5" | jq ".[0]"'

# Clear devtools events
curl -X POST http://localhost:3000/devtools/api/clear

# Get event statistics
curl -s http://localhost:3000/devtools/api/stats | jq .

# View server logs (if using PM2)
pm2 logs feishu_assistant

# Manually check memory integration
bun test test/integration/memory-multiturn.test.ts
```
