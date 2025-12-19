# Mastra Upgrade Beads Issues Created

## Summary

Two beads issues have been created to track Mastra upgrade recommendations:

### Issue 1: Upgrade @mastra/core to Beta.14 (Primary)
**ID**: `feishu_assistant-zwl6`  
**Priority**: P1 (High)  
**Type**: Task  
**Status**: Open

**What**: Upgrade `@mastra/core` from 1.0.0-beta.8 to 1.0.0-beta.14

**Why**:
- ✅ **Streaming text deltas fixed** - Critical for chart streaming (Mermaid/Vega-Lite rendering)
- ✅ **Tool schema validation fixed** - Was breaking with Claude 3.5 Haiku, OpenAI o3
- ✅ **Better observability** - Span naming standardization, error serialization improvements
- ✅ **Low risk** - Few breaking changes, well-tested across 6 beta releases

**Estimated Effort**: 20 minutes (upgrade + testing)

**Acceptance Criteria**:
- [ ] Update `@mastra/core@1.0.0-beta.14` in package.json
- [ ] Review observability-config.ts for span name changes
- [ ] Test chart streaming (OKR analysis with Mermaid charts)
- [ ] Test agent tool execution (all specialist agents)
- [ ] Verify build passes: `bun run build`
- [ ] Verify tests pass: `bun run test`
- [ ] Smoke test Feishu bot interactions

---

### Issue 2: Add @mastra/hono Adapter (Enhancement)
**ID**: `feishu_assistant-3yjj`  
**Priority**: P2 (Medium)  
**Type**: Task  
**Status**: Open

**What**: Add `@mastra/hono` adapter and refactor manual agent routing in server.ts

**Why**:
- Standardized agent execution API patterns
- Built-in observability middleware integration
- Eliminates ~200 lines of manual route boilerplate (server.ts lines 500-700)
- Follows Mastra framework conventions
- Better maintainability and consistency

**Note**: This is OPTIONAL and depends on Issue 1 completing first.

**Estimated Effort**: 60-90 minutes (add adapter + refactor routes + test)

**Acceptance Criteria**:
- [ ] `@mastra/hono` added to package.json
- [ ] Mastra Hono adapter integrated in server.ts startup
- [ ] Manual agent routes refactored to use adapter
  - [ ] POST /agents/{agentName}/run
  - [ ] GET /agents
  - [ ] POST /workflows/{workflowName}/run
  - [ ] GET /workflows
- [ ] Observability middleware integrated
- [ ] All tests pass
- [ ] Feishu bot functionality unchanged
- [ ] server.ts boilerplate reduced by ~50%

---

## Execution Plan

### Phase 1 (This Session): Issue 1 Only
**Recommended** - Lower risk, clear benefits

```bash
# 1. Upgrade core
bun add "@mastra/core@1.0.0-beta.14"

# 2. Review changes
# - Check lib/observability-config.ts for span naming
# - Run build to catch any TypeScript issues

# 3. Test
bun run build
bun run test
bun run dev  # Manual Feishu testing

# 4. Deploy to staging
```

**Timeline**: 20-30 minutes  
**Risk**: LOW  
**Rollback**: Simple (downgrade version)

---

### Phase 2 (Later): Issue 2 (Optional Enhancement)
**Recommended for next sprint** - Higher effort, architectural benefit

Once Issue 1 is stable in production, consider:

```bash
# 1. Add Hono adapter
bun add "@mastra/hono@latest"

# 2. Refactor server.ts routes
# - Extract agent routing logic
# - Use MastraHonoAdapter
# - Test thoroughly

# 3. Deploy
```

**Timeline**: 2-3 hours  
**Risk**: MEDIUM (architectural refactoring)  
**Benefit**: Cleaner code, better patterns

---

## Key Benefits Summary

| Aspect | Impact | Issue |
|--------|--------|-------|
| Chart streaming reliability | Critical | #1 |
| Tool schema validation | Critical | #1 |
| Observability improvements | Medium | #1 |
| Code cleanliness | Medium | #2 |
| Framework compatibility | Medium | #1 |
| Architecture standardization | Low | #2 |

---

## Related Documentation

- **MASTRA_UPGRADE_EVALUATION.md** - Detailed upgrade analysis
- **MASTRA_VERSION_STATUS.md** - Current version status
- **AGENTS.md** - Project overview and quick reference

---

## Next Steps

1. ✅ Review MASTRA_UPGRADE_EVALUATION.md (just created)
2. ✅ Beads issues created (ready for execution)
3. ⏭️ **Execute Issue 1 when ready** (recommend this session)
4. ⏭️ Schedule Issue 2 for future session (optional)

---

## Status

**Date**: Dec 19, 2025  
**Created By**: Amp  
**Status**: Ready for execution  
**Blocker**: None (can start immediately)

---

All documentation is ready. You can start with Issue 1 whenever you're ready.
