# Feishu Document Tracking - Executive Summary

**Date**: December 2, 2025
**Feature**: Real-time document change monitoring with bot notifications
**Epic**: `feishu_assistant-c0y`
**Total Effort**: 110-150 hours across 3 phases (8-12 weeks)

---

## The Feature in 60 Seconds

Users can tell the Feishu bot to "watch" documents. The bot then:
1. **Polls documents** every 30 seconds checking for changes
2. **Detects changes** by comparing who modified it and when
3. **Sends notifications** to the group when changes detected
4. **Tracks state persistently** so tracking survives server restarts
5. **Provides commands** to watch/check/unwatch documents

**Example**:
```
User: "@bot watch https://feishu.cn/docs/doccn123"
Bot:  "👀 Now tracking 'Q4 OKR Document'. Will notify when changed."

[2 hours later, someone edits the doc]

Bot:  "📝 Document Updated: Q4 OKR Document
      Modified by: @john at 2:45 PM
      [View in Feishu]"
```

---

## Why This Matters

### Problem Solved
- Teams don't know when important documents change
- No real-time collaboration awareness
- Manual polling = inefficient
- Multiple tools = fragmented experience

### Solution Value
- **Collaboration**: Team stays aware of doc changes
- **Productivity**: No need to manually check docs
- **Transparency**: Clear audit trail of who changed what
- **Integration**: Keeps everything in Feishu ecosystem

### Project Goals Alignment
✅ **Advanced SDK Integration**: Demonstrates mastery beyond basic message handling
✅ **Reactive Automation**: Moves toward AI-driven workflows
✅ **Foundation Building**: Base for sophisticated doc workflows
✅ **User Experience**: Makes bot more useful and proactive

---

## Deliverables by Phase

### Phase 1: MVP (2-3 weeks, 40-50 hours)
**What You Get**: Working document tracking system

- ✅ Polls Feishu documents for changes (metadata only)
- ✅ Detects changes using last_modified_user + last_modified_time
- ✅ Sends bot notifications to groups
- ✅ Tracks state persistently (survives restarts)
- ✅ Bot commands: @bot watch, check, unwatch, watched
- ✅ Handles 10-100 concurrent documents
- ✅ <500ms response time for commands
- ❌ No content diffs (what changed - deferred to Phase 3)
- ❌ No rules/conditional actions (deferred to Phase 3)
- ❌ No multi-channel (deferred to Phase 3)

**Success Criteria**:
- Tracks 10+ documents simultaneously
- Detects 90%+ of real changes within 5 minutes
- Zero false positives
- Survives 24 hours without crash

### Phase 2: Polish (1-2 weeks, 35-40 hours)
**What You Get**: Production-ready quality

- ✅ Comprehensive testing (>85% coverage)
- ✅ Full documentation (user + dev + operator guides)
- ✅ Health check endpoint for monitoring
- ✅ Detailed logging for debugging
- ✅ Metrics exposed (Prometheus format)
- ✅ Error handling hardened
- ✅ Performance optimized (100 docs, <200MB memory)

**Success Criteria**:
- >85% unit test coverage
- >10 integration tests passing
- Load test: 100 docs with <10% failure rate
- Zero crashes in 24h test

### Phase 3: Advanced (2-3 weeks, 35-45 hours)
**What You Get**: Feature-rich system for complex workflows

- ✅ Document content snapshots and diffs
- ✅ Rules engine (conditional actions)
- ✅ Multi-channel notifications (Slack, etc.)
- ✅ Advanced metrics and alerting
- ✅ Performance optimization (1000 docs)
- ❌ AI-powered change summaries (future research)

**Success Criteria**:
- Snapshots <1GB for 1000 changes
- Semantic diffs working for 95% of docs
- Rules engine tested
- 1000 tracked docs with <5% CPU

---

## Technical Approach

### What Works
✅ **Metadata Polling**: Feishu API provides `last_modified_user` + `last_modified_time`
✅ **Batch Requests**: Can fetch up to 200 docs per API call
✅ **Persistence**: Store state in Supabase for durability
✅ **Notifications**: Use existing card streaming infrastructure
✅ **Commands**: Integrate with existing message handler

### What Doesn't Work
❌ **Real-time Webhooks**: Feishu doesn't emit doc change events (hence polling)
❌ **Change Diffs**: No API to get "what changed" (workaround: snapshot + diff)
❌ **Per-User Actions**: Only see last editor, not all editors

### Architecture Overview
```
Polling Loop (30s)
    ↓
[Get metadata for 10-100 docs]
    ↓
[Compare to previous state]
    ↓
[Detect changes]
    ↓
[Send notifications] → Feishu groups
[Persist to database]
[Update metrics]
```

---

## Required Resources

### Skills Needed
- TypeScript/Node.js (existing)
- Feishu SDK (already learning)
- Supabase (already using)
- Testing frameworks (Jest/Vitest)

### Infrastructure
- **Feishu App**: Requires `docs:read`, `drive:file:read`, `im:message:send_as_bot` scopes
- **Supabase**: Two new tables (document_tracking, document_changes)
- **Monitoring**: Prometheus metrics endpoint (optional for Phase 1)

### Time Estimates
| Phase | Duration | Effort | Team |
|-------|----------|--------|------|
| 1 MVP | 2-3 weeks | 40-50h | 1 developer |
| 2 Polish | 1-2 weeks | 35-40h | 1 developer |
| 3 Advanced | 2-3 weeks | 35-45h | 1 developer |
| **Total** | **8-12 weeks** | **110-150h** | **1 developer** |

---

## Risk Assessment

### High Risks (Mitigations in Place)
1. **API Deprecation** (Feishu's legacy docs-api/meta)
   - Monitor: Feishu changelog
   - Fallback: Migrate to newer APIs

2. **False Negatives** (Missed changes)
   - Smaller polling interval (10s vs 30s)
   - Accept higher API costs

3. **Rate Limiting** (At 100+ docs)
   - Batch requests (200 docs/call)
   - Exponential backoff

### Medium Risks (Known Solutions)
4. **Storage Overhead** (Snapshots too large)
   - Compression (gzip 5-10x)
   - Retention policies
   - Archival

5. **Multi-Instance Conflicts** (Duplicate notifications)
   - Database-backed state
   - Leader election
   - Recommend single instance for MVP

---

## Success Metrics

### User Adoption
- Number of documents tracked
- Number of notifications sent
- User command frequency
- Feature usage patterns

### System Health
- Polling success rate (>95%)
- Change detection accuracy (>90%)
- Notification delivery rate (>99%)
- API error rate (<1%)
- Memory usage trend
- CPU usage trend

### Business Impact
- Improved collaboration awareness
- Reduced manual document polling
- Faster response to document changes
- Better audit trail of changes

---

## Next Steps

1. **Kickoff** (Day 1):
   - Review BEADS_SUMMARY.md
   - Review FEISHU_DOC_TRACKING_INVESTIGATION.md
   - Review FEISHU_DOC_TRACKING_ELABORATION.md
   - Familiarize with beads structure

2. **Phase 1 Execution** (Weeks 1-3):
   - Start with TODO 1: getDocMetadata()
   - Follow subtask breakdown
   - Test with real Feishu docs
   - Build polling infrastructure
   - Implement bot commands

3. **Phase 2 Execution** (Weeks 4-5):
   - Build comprehensive tests
   - Write documentation
   - Load testing
   - Production hardening

4. **Phase 3 Execution** (Weeks 6-8):
   - Content snapshots
   - Rules engine
   - Advanced metrics

---

## Documentation Structure

Created comprehensive, self-documenting materials:

1. **FEISHU_DOC_TRACKING_INVESTIGATION.md** (756 lines)
   - Technical research and findings
   - API capabilities and limitations
   - Working code examples
   - Workarounds and alternatives

2. **FEISHU_DOC_TRACKING_ELABORATION.md** (588 lines)
   - Detailed elaboration of 10 TODOs
   - Design requirements for each
   - Edge cases and considerations
   - Risk analysis and mitigation

3. **BEADS_SUMMARY.md** (647 lines)
   - Complete issue structure (18 issues)
   - All TODOs with full descriptions
   - Dependencies and relationships
   - Success criteria for each phase

4. **Issues in Beads** (Epic: feishu_assistant-c0y)
   - 1 Epic
   - 3 Phases (task/subtask)
   - 10 TODOs (fully documented)
   - 5 Subtasks (granular breakdown)

**Total Documentation**: 2600+ lines of self-contained, cross-referenced material.

---

## Decision Log

### Key Decisions Made

1. **Polling vs Webhooks**: 
   - Chose polling because Feishu doesn't emit doc change webhooks
   - 30-second interval balances responsiveness vs API load

2. **Metadata vs Full Diffs**:
   - Phase 1 uses metadata only (WHO + WHEN)
   - Phase 3 adds content snapshots for WHAT
   - Staged approach reduces complexity

3. **Persistent Storage**:
   - Supabase for durable state
   - In-memory Map for performance
   - Hybrid approach balances speed + reliability

4. **Single Instance MVP**:
   - Multi-instance coordination deferred to Phase 3
   - Simpler first implementation
   - Clear upgrade path later

5. **Self-Documenting Issues**:
   - Each TODO includes 500-1000 word description
   - Future developers have full context without meetings
   - Decisions + rationale + alternatives documented

---

## Conclusion

This feature enables **proactive collaboration awareness** - a natural next step for the Feishu assistant. It demonstrates advanced SDK integration while solving a real user problem.

The three-phase approach manages complexity:
- **Phase 1**: Core working system (MVP)
- **Phase 2**: Production quality (polish)
- **Phase 3**: Rich features (advanced)

Comprehensive documentation and beads structure ensure **knowledge continuity**. A developer can pick up this work in 6 months and understand the full context from the issue descriptions alone.

**Ready to start Phase 1? Begin with TODO 1: Implement getDocMetadata()** 

See `bd ready` to check available work, or `bd show feishu_assistant-mt0` for TODO 1 details.

