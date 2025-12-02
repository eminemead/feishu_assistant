# Documentation Organization

This document describes the structure and purpose of the documentation in this project.

## Directory Structure

```
docs/
├── architecture/          # System design, architecture decisions
├── implementation/        # Feature implementations, technical details
├── setup/                # Setup instructions, environment config
├── testing/              # Testing guides, test strategies
├── verification/         # Verification procedures, checklists
├── BUILD_AND_TEST.md     # Build, test, and quality gate commands
├── CODE_STYLE.md         # TypeScript conventions and code patterns
├── CRITICAL_WORKFLOWS.md # Essential workflows (memory, beads, devtools)
├── ORGANIZATION.md       # This file - documentation structure
└── README.md            # Documentation index
```

## Core Documentation

### AGENTS.md (Root Level)

**Purpose**: Onboarding document for AI agents and developers.

**Contains**:
- Project WHY, WHAT, TECH (philosophy and scope)
- Essential commands (dev, build, test)
- Key workflows with links to detailed docs
- Critical reminders and pro tips
- Beads issue tracking quick reference

**Approach**: Progressive disclosure - points to detailed docs in `/docs/` rather than duplicating information.

### Build and Test (BUILD_AND_TEST.md)

**Purpose**: All build, test, and quality gate commands with explanations.

**Contains**:
- Essential build commands
- Quality gates (typecheck, test, lint)
- Testing strategy
- Development tips

### Code Style (CODE_STYLE.md)

**Purpose**: TypeScript conventions, file organization, naming patterns.

**Contains**:
- File organization and structure
- Naming conventions
- Comment guidelines
- Integration patterns (Vercel AI, Feishu, Supabase)
- Testing approach

### Critical Workflows (CRITICAL_WORKFLOWS.md)

**Purpose**: Essential workflows unique to this project.

**Contains**:
- Memory persistence (Supabase with RLS)
- Beads issue tracking workflow
- Local development debugging (devtools)
- Architecture overview
- Development workflow
- Environment setup

## Subdirectories

### architecture/

System design and architectural decisions.

**Examples**:
- Component relationships
- Data flow diagrams
- Technology choices and rationale
- Integration architecture

### implementation/

Feature implementations and technical details.

**Examples**:
- Feature implementation guides
- API integration details
- Database schema and migrations
- Code change walkthroughs

### setup/

Environment configuration and setup instructions.

**Examples**:
- Feishu bot setup
- Supabase configuration
- Environment variables
- Database initialization

### testing/

Testing guides and test strategies.

**Examples**:
- Unit test approach
- Integration test guides
- Test data setup
- CI/CD testing strategy

### verification/

Verification procedures and checklists.

**Examples**:
- Feature verification checklists
- Testing procedures
- Deployment verification
- Performance verification

## Documentation Convention

### Implementation Docs (in `implementation/`)

If creating new feature documentation:

- Use kebab-case filenames (e.g., `thread-reply-implementation.md`)
- Include:
  - Problem/motivation at top
  - Solution overview
  - Code changes with file paths
  - Official API references (with URLs)
  - Testing checklist
  - Backward compatibility notes

### Root-Level Docs

Only the following documents belong at root level:

- `AGENTS.md` - Agent onboarding (lean, progressive disclosure)
- `README.md` - Project overview
- Any essential getting-started docs

### Temporary Planning Docs

AI-generated planning and design documents should be stored in `/history/` directory:

- Not checked into git (optional `.gitignore` entry)
- Keeps repository root clean
- Preserves planning history for reference
- Examples: PLAN.md, DESIGN.md, IMPLEMENTATION_PLAN.md

## How to Use This Structure

**For Developers**:
1. Start with `AGENTS.md` for project overview
2. Use `BUILD_AND_TEST.md` for build commands
3. Reference `CODE_STYLE.md` for coding conventions
4. See `CRITICAL_WORKFLOWS.md` for essential procedures

**For Deep Dives**:
1. `docs/architecture/` - Understand system design
2. `docs/implementation/` - Learn feature details
3. `docs/setup/` - Configure environments
4. `docs/testing/` - Write and run tests

**For Questions**:
1. Check relevant subdirectory first
2. Search AGENTS.md for quick pointers
3. Look at `docs/README.md` for index

## Principles

1. **Progressive Disclosure** - Essential info in AGENTS.md, detailed docs in `/docs/`
2. **Single Source of Truth** - Don't duplicate information between files
3. **Discoverable** - Clear file names and structure
4. **Scannable** - Use headers, lists, and code blocks for quick reference
5. **Actionable** - Include concrete commands and examples

## Updating Documentation

When adding new features:

1. Create implementation doc in `docs/implementation/`
2. Add testing guide in `docs/testing/`
3. Update relevant sections in `docs/architecture/` if design changes
4. Update `AGENTS.md` only if it affects critical workflows
5. Add planning docs to `history/` during development

This keeps the docs organized and AGENTS.md lean.
