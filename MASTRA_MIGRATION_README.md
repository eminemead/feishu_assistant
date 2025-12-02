# Mastra Migration - Quick Start Guide

**Epic**: `feishu_assistant-1mv`

This is your quick reference for the Mastra framework migration. Start here, then follow the links for details.

---

## What Are We Doing?

Migrating the Feishu Assistant from `@ai-sdk-tools/agents` to Mastra framework.

**Why**: Simpler code, better observability, actively maintained framework.

**Timeline**: 8-13 days (2 weeks)

**Impact**: No user-facing changes, but significantly improved codebase.

---

## Three Key Documents

### 1. **MASTRA_MIGRATION_PLAN.md** (START HERE)
Executive summary with:
- Why we're migrating
- High-level architecture
- Phase breakdown (6 phases)
- Timeline and dependencies
- Rollback procedures

**Read this first** to understand the big picture.

### 2. **MASTRA_MIGRATION_TASKS.md** (DETAILED)
Complete task breakdown with:
- 21 granular tasks
- Technical implementation details
- File impacts and changes
- Success criteria for each task
- Cross-cutting concerns

**Read this** when working on tasks.

### 3. **This File** (REFERENCE)
Quick navigation and command reference.

---

## Quick Commands

### See What's Ready to Work On
```bash
bd ready --json
```

Shows tasks with no blockers (ready to start).

### See the Epic Overview
```bash
bd show feishu_assistant-1mv
```

Shows the full epic with motivation and goals.

### See Dependency Tree
```bash
bd dep tree feishu_assistant-1mv
```

Shows task ordering and critical path.

### See High-Priority Tasks
```bash
bd list --priority 1 --json
```

All P1 (critical) tasks.

### Update Your Task
```bash
bd update TASK_ID --status in_progress
# ... work ...
bd update TASK_ID --status completed --reason "Implemented and tested"
```

### See What You're Blocking
```bash
bd dep tree TASK_ID
```

Shows all tasks that depend on this one.

---

## Phase Overview

| Phase | Focus | Duration | Tasks |
|-------|-------|----------|-------|
| 1 | Setup observability & memory | 1-2 days | 5 |
| 2 | Migrate 5 agents | 2-3 days | 6 |
| 3 | Migrate conversation memory | 1-2 days | 3 |
| 4 | Setup Langfuse tracing | 1 day | 3 |
| 5 | Comprehensive testing | 2-3 days | 4 |
| 6 | Cleanup & production | 1 day | 3 |

**Critical Path** (blocking others):
- Phase 1.1 → Phase 2.1 → Phase 2.2-5 → Phase 5 → Phase 6.3

**Can Parallel**:
- Phase 1.2, 1.3 (logging & Langfuse)
- Phase 2.2, 2.3, 2.4, 2.5 (after manager agent)
- Phase 3.2, 3.3 (after memory migration)
- Phase 4.2 (after 4.1)
- Phase 5.1 (after agent migration)

---

## Key Wins

### Code Simplification
```
BEFORE (ai-sdk-tools):
├─ 2 agent instances (primary + fallback)
├─ 100+ lines of manual fallback logic
├─ 300 lines of custom devtools tracking
└─ Custom handoff routing logic

AFTER (Mastra):
├─ 1 agent with model array
├─ Auto fallback by framework
├─ Native AI Tracing (Langfuse)
└─ Native agent switching
```

**Result**: ~500 lines removed, simpler architecture.

### Observability Upgrade
```
BEFORE (custom devtools):
├─ Local HTML UI only
├─ No token counting
├─ No production insights
└─ Manual logging

AFTER (Langfuse):
├─ Cloud dashboard
├─ Automatic token counting
├─ Production monitoring
├─ Structured logging
├─ Alerts & analytics
└─ Cost tracking
```

### Memory System
```
BEFORE: ai-sdk-tools memory + Supabase + Drizzle
AFTER: Mastra memory + PostgreSQL

Benefits:
├─ Simpler memory API
├─ PostgreSQL is more familiar
├─ Better RLS support
└─ Faster queries
```

---

## Success Criteria

### Phase 1: Foundation ✓
- [ ] Mastra observability initialized
- [ ] PinoLogger working
- [ ] Langfuse receiving traces
- [ ] PostgreSQL ready
- [ ] Connection pooling verified

### Phase 2: Agents ✓
- [ ] Manager agent working with Mastra
- [ ] All 5 specialists migrated
- [ ] Tools still working
- [ ] Unit tests passing

### Phase 3: Memory ✓
- [ ] Conversation history migrated
- [ ] RLS verified (no data leaks)
- [ ] Dual-read tests passing

### Phase 4: Observability ✓
- [ ] Langfuse showing all traces
- [ ] Real-time + batch modes working
- [ ] Custom devtools deprecated

### Phase 5: Testing ✓
- [ ] 80%+ code coverage
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Performance tests: no regression

### Phase 6: Production ✓
- [ ] ai-sdk-tools removed
- [ ] Documentation updated
- [ ] Deployed to staging → production
- [ ] Monitoring active

---

## Key Files That Change

### Core Agents (Replace entirely)
```
lib/agents/
├─ manager-agent.ts                    ← Replace with Mastra version
├─ okr-reviewer-agent.ts               ← Replace
├─ alignment-agent.ts                  ← Replace
├─ pnl-agent.ts                        ← Replace
├─ dpa-pm-agent.ts                     ← Replace
└─ *-mastra.ts files                   ← Delete (merged into main)
```

### New Files
```
lib/
├─ logger-config.ts                    ← NEW (structured logging)
└─ observability-config.ts             ← NEW (Langfuse setup)

scripts/
├─ migrate-memory.ts                   ← NEW (data migration)
└─ performance-test.ts                 ← NEW (baseline)

test/integration/
├─ memory-dual-read.test.ts            ← NEW (consistency)
├─ mastra-multiturn.test.ts            ← NEW (e2e flow)
└─ rls-isolation.test.ts               ← NEW (security)

docs/setup/
├─ mastra-setup.md                     ← NEW (guide)
├─ langfuse-guide.md                   ← NEW (guide)
└─ postgresql-setup.md                 ← NEW (guide)
```

### Files to Delete
```
lib/
├─ devtools-integration.ts             ← DELETE (Langfuse replaces)
└─ devtools-page.html                  ← DELETE

lib/agents/
└─ *-mastra.ts                         ← DELETE (merged)
```

### Minor Updates
```
server.ts                              ← Add observability init
generate-response.ts                   ← Update imports
lib/memory.ts                          ← Keep for compatibility
.env.example                           ← Add Langfuse keys
package.json                           ← Remove ai-sdk-tools
README.md                              ← Update references
AGENTS.md                              ← Update if needed
```

---

## Rollback at Any Point

If critical issues found:

1. Revert agent files from git
2. Switch `generate-response.ts` back to old agents
3. Keep Mastra memory (most stable)
4. Keep observability (backward compatible)
5. Investigate issue
6. Plan fix and retry

**Each phase is independent** - can rollback without affecting other phases.

---

## Team Communication

### Before Starting
- Share MASTRA_MIGRATION_PLAN.md with team
- Discuss timeline and risks
- Assign phase owners
- Schedule phase review meetings

### During Migration
- Daily standup on blockers
- After each phase: review meeting
- Document any deviations
- Keep MASTRA_MIGRATION_PLAN.md updated

### After Each Phase
- Run validation tests
- Get sign-off from tech lead
- Document issues and fixes
- Update team knowledge base

### After Completion
- Schedule retrospective
- Document lessons learned
- Plan next improvements
- Archive old implementation

---

## Common Questions

### How long will this take?
**8-13 days** depending on issues discovered during testing.

### Can I work on multiple phases in parallel?
**Yes**, but respect dependencies:
- Phase 1 must complete before phases 2+
- Within phase 2, all agents can be migrated in parallel
- Testing (phase 5) should start after agents done

### What if I find issues during testing?
1. Document the issue
2. Create a bug task (if not already tracked)
3. Fix it
4. Retest
5. Continue

### What's the rollback plan?
See "Rollback at Any Point" section above.
Each phase can be independently reverted.

### How do I know it's production-ready?
See "Success Criteria" section above.
All checkboxes must be checked.

### Will users notice anything?
**No**. This is entirely internal refactoring.
- Same request/response behavior
- Better observability (you notice)
- No user-visible changes

---

## Documentation Index

### Planning Docs
- **MASTRA_MIGRATION_PLAN.md** - High-level overview
- **MASTRA_MIGRATION_TASKS.md** - Detailed task breakdown (THIS IS THE REFERENCE)
- **This file** - Quick start and commands

### Implementation Docs (to be created)
- `docs/setup/mastra-setup.md` - Installation guide
- `docs/setup/langfuse-guide.md` - Observability setup
- `docs/setup/postgresql-setup.md` - Memory backend
- `docs/architecture/agent-framework.md` - Updated architecture

### Reference
- AGENTS.md - Code conventions
- README.md - Project overview

---

## Getting Help

### Questions About Decisions?
→ Read MASTRA_MIGRATION_TASKS.md for specific task
→ Look for "Context" and "Why This Matters" sections

### Questions About Implementation?
→ Read task description (detailed steps included)
→ Check "Files Involved" section
→ See "Success Criteria" section

### Having Issues?
→ Check task "Risk Mitigation" section
→ Document the issue
→ Create a bug task
→ Escalate to tech lead if blocking

### Need to Change Timeline?
→ Document the reason
→ Update MASTRA_MIGRATION_PLAN.md
→ Communicate to team
→ Adjust dependent tasks

---

## Remember

> This migration is about **simplifying code, improving observability, and moving to an actively maintained framework**.

Every task is documented with:
- **Why** it exists
- **How** to do it
- **What** success looks like

The goal is a codebase that's easier to understand, maintain, and debug.

**Future you** will thank **current you** for the thorough documentation.

---

**Let's ship this! 🚀**

Start with: `bd ready` → See what you can work on now
Reference: MASTRA_MIGRATION_TASKS.md → Detailed implementation guide
Questions: Read task descriptions → All context is self-contained
