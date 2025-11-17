# Documentation Organization

This document explains how the documentation is organized in this repository.

## Structure

```
docs/
├── README.md                    # Documentation index
├── setup/                       # Setup and configuration guides
│   ├── dspyground-setup.md
│   └── observability-evaluation.md
├── architecture/               # Architecture and design docs
│   ├── agent-architecture.md
│   ├── routing-logic.md
│   └── handoff-setup.md
├── implementation/              # Implementation guides
│   ├── okr-tool.md
│   ├── visualization-implementation.md
│   ├── visualization-plan.md
│   ├── visualization-summary.md
│   ├── chinese-language-support.md
│   ├── chinese-support-summary.md
│   └── observable-plot-setup.md
├── testing/                    # Testing documentation
│   └── test-quick-start.md
└── verification/                # Verification docs
    ├── handoff-verification.md
    └── feishu-image-api.md
```

## Root-Level Documentation

Some documentation remains at the root level for visibility:

- `README.md` - Main project README (entry point)
- `TESTING.md` - Main testing guide (referenced from root)
- `lib/agents/README.md` - Agent-specific documentation (co-located with code)
- `lib/visualization/README.md` - Visualization documentation (co-located with code)
- `test/README.md` - Test directory README (co-located with tests)

## Principles

1. **Co-location**: README files stay with their code/tests for easy discovery
2. **Centralization**: Detailed docs go in `docs/` for better organization
3. **Indexing**: `docs/README.md` provides navigation to all documentation
4. **Cross-references**: Docs link to each other and to code locations

## Adding New Documentation

- **Setup guides** → `docs/setup/`
- **Architecture docs** → `docs/architecture/`
- **Implementation guides** → `docs/implementation/`
- **Testing docs** → `docs/testing/`
- **Verification docs** → `docs/verification/`
- **Module READMEs** → Keep with code (e.g., `lib/agents/README.md`)

