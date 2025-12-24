# Brave Search API Migration - Beads Issue Created

## Summary

A beads issue has been created to track the migration from Exa Search API to Brave Search API for web search functionality.

### Issue: Replace Exa Search API with Brave Search API
**ID**: `feishu_assistant-8aol`  
**Priority**: P1 (High)  
**Type**: Feature  
**Status**: Open

---

## Why Replace Exa with Brave Search?

### Current Situation (Exa API)
- ✅ Free tier: $10 in credits (one-time)
- ❌ After credits expire, requires paid plan
- ❌ Not sustainable for long-term production use

### Proposed Solution (Brave Search API)
- ✅ Free tier: **2,000 queries/month** (recurring)
- ✅ Rate limit: 1 query/second
- ✅ Independent search index
- ✅ No credit card required
- ✅ Better long-term cost efficiency

---

## Implementation Plan

### Step 1: Research & Setup
1. Research Brave Search API integration options (SDK vs HTTP client)
2. Get Brave Search API key from https://brave.com/search/api/
3. Review API documentation and rate limits

### Step 2: Create New Tool Factory
- Create `lib/tools/brave-search-tool.ts`
- Implement `createBraveSearchTool()` factory function
- Match existing `createSearchWebTool()` interface for compatibility

### Step 3: Update Existing Code
- Replace Exa usage in `lib/tools/search-web-tool.ts`
- Update `lib/utils.ts` to remove Exa dependency
- Update `lib/tools/index.ts` to export new tool (if needed)

### Step 4: Update Dependencies
- Remove `exa-js` from `package.json`
- Add Brave Search SDK/client (or use native fetch)

### Step 5: Update Configuration
- Update `README.md` to document `BRAVE_SEARCH_API_KEY`
- Update environment variable examples
- Update `.env.example` if it exists

### Step 6: Testing
- Test search functionality with Manager Agent
- Verify search result quality
- Test rate limiting behavior
- Run all existing tests

---

## Files to Modify

| File | Changes |
|------|---------|
| `lib/tools/search-web-tool.ts` | Replace Exa implementation with Brave Search |
| `lib/utils.ts` | Remove Exa utilities (or keep for backward compatibility) |
| `package.json` | Remove `exa-js`, add Brave Search client |
| `README.md` | Update API key documentation |
| `.env.example` | Update environment variables (if exists) |

---

## Acceptance Criteria

- [ ] Brave Search API integrated and working
- [ ] Search results quality comparable to Exa
- [ ] Manager Agent can use `searchWeb` tool successfully
- [ ] All tests pass
- [ ] Documentation updated
- [ ] Exa dependency removed from `package.json`
- [ ] Environment variable changed from `EXA_API_KEY` to `BRAVE_SEARCH_API_KEY`
- [ ] Rate limiting respected (1 query/second)
- [ ] Free tier limits documented

---

## Estimated Effort

**2-3 hours** including:
- API research and integration: 30-45 min
- Code implementation: 60-90 min
- Testing and verification: 30-45 min
- Documentation updates: 15-30 min

---

## References

- **Current Implementation**: `lib/tools/search-web-tool.ts`
- **Brave Search API**: https://brave.com/search/api/
- **Free Tier Details**: 2,000 queries/month, 1 query/second rate limit
- **Issue ID**: `feishu_assistant-8aol`

---

## Next Steps

1. ✅ Beads issue created (`feishu_assistant-8aol`)
2. ⏭️ Research Brave Search API integration
3. ⏭️ Get API key from Brave Search
4. ⏭️ Implement migration
5. ⏭️ Test and verify functionality
6. ⏭️ Update documentation

---

## Status

**Date**: December 24, 2025  
**Created By**: AI Assistant  
**Status**: Ready for implementation  
**Blocker**: None (can start immediately)

---

The issue is tracked in Beads and ready for execution. You can view it with:
```bash
bd show feishu_assistant-8aol
```

Or check ready work:
```bash
bd ready --json
```

