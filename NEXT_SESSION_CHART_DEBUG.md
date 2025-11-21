# Next Session Prompt: Debug OKR Chart Generation

**Issue:** feishu_assistant-lu3 - Debug and fix OKR chart generation in Feishu

## Context (This Session)

**Completed:**
✅ Integrated `chartGenerationTool` into OKR reviewer agent
✅ Fixed message content parsing (handles post format with mentions + text)
✅ Added manual routing from Manager → OKR agent for analysis queries
✅ Rewrote OKR agent instructions to mandate chart generation
✅ Added period extraction guidance (11月 → "11 月" format)
✅ Added debug logging to database queries

**Current Status:**
- OKR agent is routing correctly and calling tools
- Agent says it's generating charts but NO markdown charts appear in output
- mgr_okr_review tool might be returning 0 rows from database
- Need to verify: database has data, period format is correct, tool is actually being called

**Test Queries Used:**
- "给我看下11月的OKR分析" (Show me November OKR analysis)
- "给我看下10月的OKR分析" (Show me October OKR analysis)

## What to Do (Next Session)

### Step 1: Verify Database Has Data
1. Check what periods exist in `/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db`
2. List all table names (should be like `okr_metrics_20250101` or similar)
3. Find a period that HAS data (use SELECT DISTINCT period)

**Command:**
```bash
# Use the existing test code to check periods
# Run tail -200 server.log | grep "\[OKR\]" to see debug output
```

### Step 2: Check Manager Agent Routing
1. Verify manual routing is working: `[Manager] Manual routing detected: OKR Reviewer matches query`
2. Check if OKR agent is being called: `[OKR] Memory context:` should appear
3. Look for tool calls: `mgr_okr_review` should have a log entry

**What to Look For:**
```
[Manager] Manual routing detected: OKR Reviewer matches query
[OKR] Memory context: ...
[OKR] Analyzing period: "11 月" from table: okr_metrics_...
[OKR] Query returned X rows for period "11 月"
```

### Step 3: Verify Chart Tool is Called
1. Once mgr_okr_review returns data, agent should call `chart_generation` tool
2. Look for chart tool output in logs or response markdown
3. Response should contain JSON blocks for Mermaid or Vega-Lite charts

### Step 4: Fix Issues Found
- If no periods found: Database might be empty or wrong format
- If period found but 0 rows: Query might be filtering wrong (titles, accounts, etc)
- If chart tool not called: Agent prompt might need strengthening
- If charts generated but not rendered: Markdown format issue

## Files to Check

**Agent:**
- `lib/agents/okr-reviewer-agent.ts` - System prompt, tools definition
- `lib/agents/manager-agent.ts` - Manual routing logic (lines 172-228)

**Tools:**
- `lib/tools/chart-generation-tool.ts` - Chart generation capability
- `lib/tools/okr-review-tool.ts` - OKR data fetching
- `lib/agents/okr-reviewer-agent.ts:analyzeHasMetricPercentage()` - DB query logic

**Database:**
- `/Users/xiaofei.yin/dspy/OKR_reviewer/okr_metrics.db` - DuckDB format

## Key Info

**OKR Agent Tools:**
1. `mgr_okr_review` - Fetches has_metric_percentage per company by period
2. `chart_generation` - Creates Mermaid/Vega-Lite charts from data
3. `okr_visualization` - Heatmaps

**Period Format:**
- User input: "11月", "10月"
- Tool expects: "11 月", "10 月" (WITH SPACE before 月)
- Agent has explicit instructions to extract and reformat

**Debug Commands:**
```bash
# Watch the OKR debug logs
tail -200 server.log | grep "\[OKR\]"

# Check devtools for tool calls
# http://localhost:3000/devtools

# Build and restart
bun run build
pkill -f "bun run dev"
sleep 2
cd /Users/xiaofei.yin/work_repo/feishu_assistant && nohup bun run dev > server.log 2>&1 &
```

## Success Criteria

✅ Database query returns data for at least one period
✅ OKR agent receives tool response with company/metric data
✅ Agent calls chart_generation tool with this data
✅ Response markdown includes chart definitions (```mermaid or ```json Vega-Lite)
✅ Feishu card renders charts alongside text analysis

## Recommended Approach

1. First: Verify database has accessible data and periods
2. Second: Check mgr_okr_review tool returns data for a valid period
3. Third: Force chart generation in agent prompt if needed (make it even more directive)
4. Fourth: Test with successful period and monitor full flow
5. Finally: Verify charts render in Feishu card

---

**Time Estimate:** 45-60 minutes
**Difficulty:** Medium (debugging database queries + agent behavior)
**Impact:** High (enables OKR visualization for users)
