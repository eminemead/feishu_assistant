# DPA Mom Production Testing - Quick Start

**TL;DR**: Run the verification script, then test in production.

## Quick Verification

```bash
# Run pre-flight checks
./scripts/verify-dpa-mom-production.sh

# If all checks pass, you're ready to test!
```

## What Changed

- ✅ `dpa_mom` now uses **workflow-based routing** (was skill-based)
- ✅ Workflow ID: `dpa-assistant`
- ✅ Routes via `skills/agent-routing/SKILL.md` (priority 1)
- ✅ Supports 6 intents: gitlab_create, gitlab_list, gitlab_close, chat_search, doc_read, general_chat
- ✅ Asset labels: dashboard, report, table (auto-applied on close)

## Essential Checks

### 1. glab CLI
```bash
glab --version  # Should be installed
glab auth status  # Should show: ✓ Logged in to git.nevint.com
```

### 2. Test glab Access
```bash
glab issue list --group dpa --per-page 5
```

### 3. Workflow Registration
```bash
# If server running:
curl http://localhost:3000/devtools/workflows | jq '.[] | select(.id == "dpa-assistant")'
```

## Test Queries

Try these in Feishu:

1. **Create Issue**: "create issue: test workflow, priority 2"
2. **List Issues**: "show my issues" or "list MRs"
3. **Close Issue**: "close #123 dashboard https://superset.nevint.com/dash/456" (URL required!)
4. **General Chat**: "dpa team help with data pipeline"

## Monitoring

```bash
# Watch logs
pm2 logs feishu-agent | grep "DPA Workflow"

# Or direct log file
tail -f logs/out.log | grep "DPA Workflow"
```

## Full Documentation

See `docs/testing/dpa-mom-production-test.md` for complete testing guide.






