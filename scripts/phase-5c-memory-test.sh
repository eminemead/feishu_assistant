#!/bin/bash
# Phase 5c: Memory Persistence Validation Test Script
# 
# Tests multi-turn conversations to validate memory persistence

set -e

echo "🔍 Phase 5c: Memory Persistence Validation"
echo "==========================================="
echo ""

# Configuration
TEST_GROUP="${TEST_FEISHU_GROUP_ID:-oc_cd4b98905e12ec0cb68adc529440e623}"
TEST_USER_ID="${TEST_FEISHU_USER_ID:-}"
DEVTOOLS_URL="http://localhost:3000/devtools/api"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 Scenario 1: Single User Multi-Turn Context Preservation"
echo "==========================================================="
echo ""
echo "Test: Send Q1 → A1 → Q2 (should have context) → A2"
echo ""
echo "Setup:"
echo "  - Test Group: $TEST_GROUP"
echo "  - Server: http://localhost:3000"
echo "  - Devtools: $DEVTOOLS_URL"
echo ""

# Check server health
echo "1️⃣ Checking server health..."
health=$(curl -s http://localhost:3000/health)
if echo "$health" | grep -q '"status":"healthy"'; then
  echo "   ✅ Server is healthy"
else
  echo "   ❌ Server is not healthy"
  exit 1
fi

echo ""
echo "2️⃣ Memory setup status:"
echo "   - Running integration tests..."
bun test test/integration/memory-integration.test.ts --timeout 10000 2>&1 | grep -E "(pass|fail)" | tail -1

echo ""
echo "3️⃣ Multi-turn test status:"
echo "   - Running multi-turn tests..."
bun test test/integration/memory-multiturn.test.ts --timeout 15000 2>&1 | grep -E "(pass|fail)" | tail -1

echo ""
echo "4️⃣ Manual Test Instructions:"
echo ""
echo "   ${YELLOW}MANUAL TESTING:${NC}"
echo ""
echo "   Step 1: Open Feishu and go to test group"
echo "   Group ID: $TEST_GROUP"
echo ""
echo "   Step 2: Send first message (Q1)"
echo "   Message: \"What are the key principles of OKR setting?\""
echo "   Expected: Agent responds with detailed explanation"
echo ""
echo "   Step 3: Send follow-up message (Q2)"
echo "   Message: \"How can I apply those principles to my engineering team?\""
echo "   Expected: Agent references back to principles from Q1"
echo ""
echo "   Step 4: Monitor devtools"
echo "   URL: http://localhost:3000/devtools"
echo ""
echo "   Check:"
echo "   - Token usage should increase for memory context"
echo "   - Events should show agent_call with memory in context"
echo "   - Both Q1 and Q2 should appear in event logs"
echo ""

echo "5️⃣ Verify memory in Supabase:"
echo ""
echo "   Command to check saved messages:"
echo ""
echo "   ${YELLOW}# Requires Supabase access${NC}"
echo "   SUPABASE_DATABASE_URL=\$SUPABASE_DATABASE_URL bun run << 'EOF'"
echo "   import { createClient } from '@supabase/supabase-js';"
echo "   const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);"
echo "   const { data } = await db.from('agent_messages').select('*').order('created_at', { ascending: false }).limit(10);"
echo "   console.log(JSON.stringify(data, null, 2));"
echo "   EOF"
echo ""

echo ""
echo "6️⃣ Token usage verification:"
echo ""
echo "   Check memory token impact:"
echo "   curl -s 'http://localhost:3000/devtools/api/events?limit=50' | jq '.[] | { agent: .metadata.agent, tokens: .metadata.tokens, memory: .context.memory }'"
echo ""

echo ""
echo "${GREEN}✅ Phase 5c-2 setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Send test messages in Feishu (steps 2-3 above)"
echo "  2. Monitor devtools in real-time"
echo "  3. Verify messages are saved to Supabase"
echo "  4. Check token usage shows memory cost"
echo ""
