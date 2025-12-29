# Agent Skills

This directory contains Agent Skills Standard-compliant skill modules for the Feishu Assistant.

## What Are Agent Skills?

Agent Skills is an open standard (agentskills.io) for packaging reusable instructions and resources for AI agents. Skills are:
- **Modular**: Self-contained task modules
- **Portable**: Work across platforms (Claude, OpenAI Codex, etc.)
- **Reusable**: Shareable across teams
- **Standardized**: Open specification format

## Skill Format

Each skill is a directory containing:
- `SKILL.md` - Markdown file with YAML frontmatter and instructions (required)
- `resources/` - Optional directory with scripts, templates, reference files

### SKILL.md Structure

```markdown
---
name: "Skill Name"
description: "What this skill does"
version: "1.0.0"
tags: ["tag1", "tag2"]
keywords: ["keyword1", "keyword2"]
tools: ["tool1", "tool2"]  # Optional: tools this skill uses
---

# Instructions

[Detailed instructions for the AI on how to perform this task]

## Examples
[Usage examples]

## Resources
[Reference to included files]
```

## Skill Naming Convention

Skills are organized into two categories:

### Example Skills (Template/Reference)
- Prefixed with `example_skills.` to distinguish from production skills
- Current examples:
  - `example_skills.example-skill` - Template skill for creating new skills
  - `example_skills.okr-analysis` - Example OKR review and analysis workflow
  - `example_skills.dpa-team-support` - Example DPA team assistance patterns
  - `example_skills.feishu-doc-handling` - Example document tracking and management

### Production Skills
- No prefix - these are real, production-ready skills
- Example: `okr-analysis`, `dpa-support`, `doc-tracking`

## Creating a New Skill

1. Create a new directory in `skills/`:
   ```bash
   # For production skills (no prefix)
   mkdir skills/my-new-skill
   
   # For example/template skills (use prefix)
   mkdir skills/example_skills.my-template-skill
   ```

2. Create `SKILL.md` with YAML frontmatter:
   ```markdown
   ---
   name: "My New Skill"
   description: "What this skill does"
   version: "1.0.0"
   tags: ["tag1"]
   keywords: ["keyword1", "keyword2"]
   ---
   
   # Instructions
   
   [Your instructions here]
   ```

3. (Optional) Add resources:
   ```bash
   mkdir skills/my-new-skill/resources
   # Add reference files, templates, etc.
   ```

4. The skill will be automatically loaded on next server restart.

## Skill Discovery

Skills are automatically discovered and indexed by:
- **Keywords**: Matched against user queries
- **Tags**: Categorized for filtering
- **Name/Description**: Used for semantic matching

The system automatically selects relevant skills based on query content.

## Integration

Skills are integrated into agents via:
- **Skill Registry**: Tracks and indexes all available skills
- **Skill Injector**: Dynamically injects relevant skills into prompts
- **Agent Integration**: Skills are loaded into agent instructions at runtime

See `lib/skills/` for implementation details.

