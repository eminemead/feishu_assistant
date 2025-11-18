# Documentation Organization

All documentation is organized in the `/docs` folder by category.

## Directory Structure

```
docs/
├── architecture/        # System design, architecture decisions
├── implementation/      # Feature implementations, technical details
├── setup/              # Setup instructions, environment configuration
├── testing/            # Testing guides, test strategies, test procedures
├── verification/       # Verification checklists, deployment verification
├── ORGANIZATION.md     # This file
└── README.md           # Documentation index
```

## Filing Guidelines

### Architecture (`docs/architecture/`)
System design documents, architecture decisions, component relationships.

**Examples**:
- `agent-system-design.md` - Manager agent architecture
- `memory-system.md` - Conversation memory implementation
- `threading-architecture.md` - Thread feature design

### Implementation (`docs/implementation/`)
Feature implementations, how-to guides, technical details.

**Naming**: kebab-case with feature name  
**Examples**:
- `fallback-logic-fixes.md` - Fallback mechanism improvements
- `threading-fixes.md` - Threading feature fixes
- `threading-debugging.md` - Debugging threading issues
- `production-readiness.md` - Production error recovery
- `model-fallback-guide.md` - Model fallback strategy

### Setup (`docs/setup/`)
Installation, configuration, environment setup, quick start guides.

**Examples**:
- `production-deployment.md` - Production deployment guide
- `production-quick-start.md` - Production quick reference
- `model-usage-reference.md` - Model configuration guide
- `environment-variables.md` - Environment setup

### Testing (`docs/testing/`)
Testing guides, test strategies, test procedures, monitoring guides.

**Examples**:
- `threading-test-guide.md` - Testing threading feature
- `agent-testing-strategy.md` - How to test agents
- `integration-tests.md` - Integration test procedures

### Verification (`docs/verification/`)
Checklists for deployment, releases, testing verification.

**Examples**:
- `pre-deployment-checklist.md` - Pre-prod checks
- `release-checklist.md` - Release process verification
- `health-check-procedures.md` - Health check verification

## Root-Level Docs

Only keep at root (`/`):
- `README.md` - Project overview (NOT in docs/)
- `AGENTS.md` - Code conventions and structure (NOT in docs/)
- `.md` files in `.gitignore` - Temporary working notes

## Document Format

Each implementation/testing doc should include:

```markdown
# Feature Name

**Date**: Nov 18, 2025  
**Status**: ✅ Complete | ⚠️ In Progress | ❌ Not Started

## Problem/Motivation
What issue does this solve? Why is it important?

## Solution Overview
High-level approach to solving the problem.

## Code Changes
- File path 1: Description
- File path 2: Description

## API References
Links to external documentation used.

## Testing Checklist
- [ ] Item 1
- [ ] Item 2

## Backward Compatibility
Is this backwards compatible? Any breaking changes?

## Next Steps (if applicable)
What should be done next?
```

## Accessing Documentation

1. **Quick reference**: `docs/setup/` for quick start guides
2. **How-to**: `docs/implementation/` for implementation details
3. **System overview**: `docs/architecture/` for design docs
4. **Testing**: `docs/testing/` for test procedures
5. **Checklists**: `docs/verification/` for verification checklists

## Index by Feature

- **Threading Feature**
  - Architecture: `docs/architecture/threading-architecture.md` (if exists)
  - Implementation: `docs/implementation/threading-fixes.md`
  - Debugging: `docs/implementation/threading-debugging.md`
  - Testing: `docs/testing/threading-test-guide.md`

- **Production Deployment**
  - Setup: `docs/setup/production-deployment.md`
  - Quick Start: `docs/setup/production-quick-start.md`
  - Implementation: `docs/implementation/production-readiness.md`

- **Model Configuration**
  - Implementation: `docs/implementation/model-fallback-guide.md`
  - Reference: `docs/setup/model-usage-reference.md`

- **Fallback Logic**
  - Implementation: `docs/implementation/fallback-logic-fixes.md`

## Maintenance

When adding new docs:
1. Identify category (architecture/implementation/setup/testing/verification)
2. Use kebab-case filename
3. Include date and status
4. Update this file if new category needed
5. Update `docs/README.md` with reference

## Cross-References

Link between docs using:
```markdown
See: [`docs/setup/production-deployment.md`](./setup/production-deployment.md)
See: [`docs/implementation/fallback-logic-fixes.md`](./implementation/fallback-logic-fixes.md)
```

---

**Last Updated**: Nov 18, 2025
