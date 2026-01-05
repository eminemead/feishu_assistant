# DPA Mom Production Testing Guide

**Last Updated**: 2025-01-XX  
**Workflow**: `dpa-assistant` (workflow-based routing)  
**Status**: Ready for production testing

## Overview

The `dpa_mom` functionality has been migrated from skill-based routing to workflow-based routing. The new `dpa-assistant` workflow provides deterministic, multi-step execution with intent classification.

## Architecture Changes

### Before (Skill-based)
- DPA Mom Agent injected instructions into Manager Agent
- Limited tool access
- No guaranteed execution order

### After (Workflow-based) ✅
- **Workflow ID**: `dpa-assistant`
- **Routing**: Via `skills/agent-routing/SKILL.md` (priority 1)
- **Execution**: Deterministic multi-step pipeline
  1. Classify Intent → Fast model determines intent
  2. Branch by Intent → Execute specific step
  3. Format Response → Combine into final response

### Intents Supported
- `gitlab_create`: Create GitLab issues
- `gitlab_list`: List/view GitLab issues/MRs
- `chat_search`: Search Feishu chat history
- `doc_read`: Read Feishu documents
- `general_chat`: Conversational AI

## Pre-Flight Checks

### 1. Verify glab CLI Installation

```bash
# Check if glab is installed
which glab

# Check version
glab --version

# Expected: glab version 1.x.x or higher
```

**If not installed:**
```bash
# Install glab (varies by OS)
# macOS
brew install glab

# Linux (using package manager)
# See: https://gitlab.com/gitlab-org/cli/-/releases
```

### 2. Verify glab Authentication

```bash
# Check authentication status
glab auth status

# Expected output should show:
# ✓ Logged in to git.nevint.com as <username>
```

**If not authenticated:**
```bash
# Authenticate to git.nevint.com
glab auth login --hostname git.nevint.com

# Follow the prompts:
# 1. Choose "Use a token" or "Login with browser"
# 2. If using token, create a Personal Access Token at:
#    https://git.nevint.com/-/user_settings/personal_access_tokens
#    Required scopes: api, read_user, read_repository, write_repository
```

### 3. Test glab CLI Access

```bash
# Test basic API access
glab api "/user" --host git.nevint.com | jq -r '.username, .name'

# Test DPA group access
glab issue list --group dpa --per-page 5

# Expected: Should list recent issues without errors
```

### 4. Verify Workflow Registration

```bash
# Check if workflow is registered (via devtools or logs)
curl http://localhost:3000/devtools/workflows 2>/dev/null | jq '.[] | select(.id == "dpa-assistant")'

# Or check logs during startup:
# Should see: "[Workflows] Initialized X workflows: ..., dpa-assistant, ..."
```

### 5. Check Environment Variables

Ensure these are set in production:

```bash
# Required for workflow execution
OPENROUTER_API_KEY=your_key  # For intent classification

# Optional but recommended
ENABLE_DEVTOOLS=true  # For monitoring workflow execution
NODE_ENV=production
```

## Testing Scenarios

### Test 1: Intent Classification - GitLab Create

**Query**: "create issue: test production workflow, priority 2, ddl next wednesday"

**Expected Flow**:
1. ✅ Routes to `dpa-assistant` workflow (keyword match: "issue")
2. ✅ Classifies intent as `gitlab_create`
3. ✅ Parses issue details (title, project, priority, due date)
4. ✅ Shows preview with confirmation buttons
5. ✅ On confirm, executes `glab issue create` command
6. ✅ Returns success message with issue link

**Verification**:
```bash
# Check logs for:
# [DPA Workflow] Classifying intent for: "create issue..."
# [DPA Workflow] Classified intent: gitlab_create
# [DPA Workflow] Executing GitLab create
```

### Test 2: Intent Classification - GitLab List

**Query**: "show my issues" or "list MRs"

**Expected Flow**:
1. ✅ Routes to `dpa-assistant` workflow
2. ✅ Classifies intent as `gitlab_list`
3. ✅ Executes `glab issue list --group dpa --assignee=@me` or `glab mr list`
4. ✅ Returns formatted list

**Verification**:
```bash
# Check logs for:
# [DPA Workflow] Classified intent: gitlab_list
# [DPA Workflow] Executing GitLab list
```

### Test 3: Intent Classification - General Chat

**Query**: "dpa team help me with data pipeline"

**Expected Flow**:
1. ✅ Routes to `dpa-assistant` workflow (keyword: "dpa")
2. ✅ Classifies intent as `general_chat`
3. ✅ Uses inline agent for conversational response
4. ✅ Returns helpful response in Chinese/English

**Verification**:
```bash
# Check logs for:
# [DPA Workflow] Classified intent: general_chat
# [DPA Workflow] Executing general chat
```

### Test 4: glab CLI Error Handling

**Test Case**: Invalid project path

**Query**: "create issue in dpa/nonexistent: test"

**Expected**:
1. ✅ Workflow executes normally
2. ✅ glab command fails with error
3. ✅ Error message returned to user
4. ✅ No crash or unhandled exception

**Verification**:
```bash
# Check logs for error handling:
# [DPA Workflow] GitLab create parsing failed: ...
# Or: ❌ Failed to create issue
```

### Test 5: Authentication Edge Cases

**Test Case**: glab token expired or invalid

**Expected**:
1. ✅ glab command fails gracefully
2. ✅ Error message indicates authentication issue
3. ✅ User-friendly error: "Please authenticate glab CLI"

**Verification**:
```bash
# Simulate auth failure (if possible):
# Remove or invalidate glab token
# Test issue creation
# Should see: "glab CLI authentication failed" or similar
```

## Monitoring & Debugging

### 1. Check Workflow Execution Logs

```bash
# PM2 logs
pm2 logs feishu-agent | grep "DPA Workflow"

# Or direct log file
tail -f logs/out.log | grep "DPA Workflow"
```

**Key log patterns to watch for**:
- `[DPA Workflow] Classifying intent for: ...`
- `[DPA Workflow] Classified intent: ...`
- `[DPA Workflow] Executing GitLab ...`
- `[DPA Workflow] Formatting response for intent: ...`

### 2. Monitor glab CLI Calls

```bash
# Check devtools for tool calls
curl http://localhost:3000/devtools/tools 2>/dev/null | jq '.[] | select(.name == "gitlab_cli")'

# Or check logs for:
# [Tool] gitlab_cli: execute({ command: "issue create ..." })
```

### 3. Check Routing Decisions

```bash
# Manager agent logs should show:
# [Manager] Workflow routing: dpa-assistant (confidence: X.XX)
# [Router] Routing decision: category=dpa_mom, type=workflow, workflowId=dpa-assistant
```

### 4. Verify Workflow Registry

```bash
# Check if workflow is registered
curl http://localhost:3000/devtools/workflows 2>/dev/null | jq '.[] | select(.id == "dpa-assistant")'

# Expected output:
# {
#   "id": "dpa-assistant",
#   "name": "DPA Assistant",
#   "description": "DPA team assistant with intent-based routing...",
#   ...
# }
```

## Common Issues & Solutions

### Issue 1: "glab CLI not found"

**Symptom**: Error: `glab CLI not found. Please install glab`

**Solution**:
```bash
# Install glab on production server
# See installation instructions above
```

### Issue 2: "Not authenticated to git.nevint.com"

**Symptom**: glab commands fail with authentication error

**Solution**:
```bash
# Authenticate glab
glab auth login --hostname git.nevint.com

# Verify
glab auth status
```

### Issue 3: Workflow not found

**Symptom**: `[Router] Workflow dpa-assistant not found in registry`

**Solution**:
```bash
# Check if workflow is initialized
# Restart application to ensure initializeWorkflows() is called
pm2 restart feishu-agent

# Check logs for:
# [Workflows] Initialized X workflows: ..., dpa-assistant, ...
```

### Issue 4: Wrong intent classification

**Symptom**: Query routed to wrong intent (e.g., "create issue" → `general_chat`)

**Solution**:
- Check classification prompt in `dpa-assistant-workflow.ts`
- Verify model is responding correctly
- Check logs for classification output
- May need to adjust keywords or classification prompt

### Issue 5: glab command timeout

**Symptom**: Commands timeout after 30 seconds

**Solution**:
- Check network connectivity to git.nevint.com
- Verify glab token has proper permissions
- Check if GitLab instance is accessible
- May need to increase timeout in `gitlab-cli-tool.ts`

## Success Criteria

✅ **All tests pass**:
- [ ] glab CLI installed and authenticated
- [ ] Workflow registered and accessible
- [ ] Intent classification works for all intents
- [ ] GitLab create with confirmation flow works
- [ ] GitLab list works
- [ ] General chat works
- [ ] Error handling graceful
- [ ] Logs show proper workflow execution

## Next Steps After Testing

1. **Monitor production usage** for 24-48 hours
2. **Collect metrics**:
   - Intent classification accuracy
   - glab command success rate
   - Average workflow execution time
   - Error rates by intent type
3. **Gather user feedback** on workflow behavior
4. **Optimize** based on real usage patterns

## Rollback Plan

If issues are found:

1. **Disable workflow routing**:
   - Edit `skills/agent-routing/SKILL.md`
   - Set `enabled: false` for `dpa_assistant` rule
   - Restart application

2. **Fallback to legacy agent** (if still available):
   - The old `dpa-mom-agent.ts` may still exist
   - Can be re-enabled if needed

3. **Monitor**:
   - Check error rates
   - Verify fallback behavior
   - Plan fixes for next deployment

## References

- Workflow implementation: `lib/workflows/dpa-assistant-workflow.ts`
- glab CLI tool: `lib/tools/gitlab-cli-tool.ts`
- Routing configuration: `skills/agent-routing/SKILL.md`
- GitLab operations skill: `skills/gitlab-operations/SKILL.md`






