# Agent Skills Implementation - Beads Issue Created

## Summary

A beads issue has been created to track the implementation of Agent Skills Standard support for both the primary model (Nemotron Nano Free) and fallback model (DeepSeek v3.2).

### Issue: Implement Agent Skills Standard for Nemotron Nano and DeepSeek v3.2
**ID**: `feishu_assistant-eryk`  
**Priority**: P1 (High)  
**Type**: Feature  
**Status**: Open

---

## What Are Agent Skills?

Agent Skills is an **open standard** (agentskills.io) for packaging reusable instructions and resources for AI agents. Skills are:
- **Modular**: Self-contained task modules
- **Portable**: Work across platforms (Claude, OpenAI Codex, etc.)
- **Reusable**: Shareable across teams
- **Standardized**: Open specification format

### Skill Format

Skills are folders containing:
- `SKILL.md` - Markdown file with YAML frontmatter and instructions
- Optional resources - Scripts, templates, reference files

---

## Why Implement This?

1. **Standardize agent capabilities** across the team
2. **Create reusable skill modules** for common workflows
3. **Improve agent consistency** and reliability
4. **Enable skill composition** and dynamic loading
5. **Follow industry-standard patterns** (Claude, OpenAI)

---

## Compatibility Status

### ✅ Nemotron Nano Free (Primary Model)
- **Tool Calling**: ✅ Yes
- **Instruction Following**: ✅ Good
- **Context Window**: 1M tokens
- **Agent Skills Support**: ✅ Compatible

### ✅ DeepSeek v3.2 (Fallback Model)
- **Tool Calling**: ✅ Excellent (native support)
- **Instruction Following**: ✅ Excellent
- **Reasoning Modes**: ✅ Explicit modes available
- **Agent Skills Support**: ✅ Fully compatible

### ✅ Mastra Framework
- **Version**: `@mastra/core@1.0.0-beta.14`
- **Extensibility**: ✅ Can be extended to support skills
- **Agent System**: ✅ Ready for skill integration

---

## Implementation Plan

### Phase 1: Skill Infrastructure (Foundation)
1. Create skill directory structure
2. Implement skill loader (`lib/skills/skill-loader.ts`)
3. Create skill registry (`lib/skills/skill-registry.ts`)

### Phase 2: Mastra Integration
4. Integrate with Mastra Agent system
5. Update agent initialization

### Phase 3: Skill Detection & Selection
6. Implement skill relevance detection
7. Dynamic skill injection

### Phase 4: Example Skills
8. Create example skills:
   - `okr-analysis`
   - `dpa-team-support`
   - `feishu-doc-handling`
   - `gitlab-workflow`

### Phase 5: Testing & Validation
9. Test with both models
10. Performance optimization

---

## Files to Create

**New Files:**
- `lib/skills/skill-loader.ts` - Parse and load SKILL.md files
- `lib/skills/skill-registry.ts` - Skill registry and discovery
- `lib/skills/skill-injector.ts` - Inject skills into agent prompts
- `lib/skills/types.ts` - TypeScript types for skills
- `skills/README.md` - Skills documentation
- `skills/example-skill/SKILL.md` - Example skill template

**Modified Files:**
- `lib/agents/manager-agent-mastra.ts` - Add skill loading/injection
- `lib/agents/dpa-mom-agent-mastra.ts` - Add skill support
- `lib/agents/okr-reviewer-agent-mastra.ts` - Add skill support
- `lib/shared/internal-model.ts` - Ensure DeepSeek v3.2 compatibility

---

## Acceptance Criteria

- [ ] Skill loader can parse SKILL.md files with YAML frontmatter
- [ ] Skill registry tracks and indexes available skills
- [ ] Skills can be dynamically injected into agent prompts
- [ ] Both Nemotron Nano Free and DeepSeek v3.2 can use skills
- [ ] Example skills work correctly with both models
- [ ] Multi-skill composition works (2-3 skills simultaneously)
- [ ] Skills can reference and use existing Mastra tools
- [ ] Skill selection algorithm detects relevant skills
- [ ] Context window limits are respected
- [ ] Documentation created for creating new skills
- [ ] Tests pass for skill loading, injection, and execution

---

## Estimated Effort

**8-12 hours** including:
- Infrastructure setup: 2-3 hours
- Mastra integration: 2-3 hours
- Skill detection/selection: 2-3 hours
- Example skills: 1-2 hours
- Testing: 1-2 hours

---

## Dependencies

- ✅ Mastra framework (`@mastra/core@1.0.0-beta.14`) - Already installed
- ✅ Both models support tool calling - Verified
- ⏭️ YAML parser library (may need to add: `js-yaml` or `yaml`)

---

## References

- **Agent Skills Standard**: agentskills.io
- **Evaluation Document**: `AGENT_SKILLS_DEEPSEEK_V32_EVALUATION.md`
- **Current Models**: `lib/shared/model-fallback.ts`
- **Mastra Agents**: `lib/agents/*-mastra.ts`
- **Issue ID**: `feishu_assistant-eryk`

---

## Next Steps

1. ✅ Beads issue created (`feishu_assistant-eryk`)
2. ⏭️ Research YAML parsing libraries (`js-yaml`, `yaml`)
3. ⏭️ Design skill directory structure
4. ⏭️ Implement skill loader
5. ⏭️ Integrate with Mastra agents
6. ⏭️ Create example skills
7. ⏭️ Test with both models

---

## Status

**Date**: December 24, 2025  
**Created By**: AI Assistant  
**Status**: Ready for implementation  
**Blocker**: None (can start immediately)

---

The issue is tracked in Beads and ready for execution. You can view it with:
```bash
bd show feishu_assistant-eryk
```

Or check ready work:
```bash
bd ready --json
```

