# Documentation Index

Complete documentation for the Feishu Assistant project. Organized by category for easy navigation.

## Quick Links

**New to the project?** Start here:
- [`AGENTS.md`](../AGENTS.md) - Code conventions and structure
- [`docs/setup/production-quick-start.md`](./setup/production-quick-start.md) - Quick start for operators
- [`docs/setup/production-deployment.md`](./setup/production-deployment.md) - Full deployment guide

**Debugging an issue?** Check:
- [`docs/implementation/production-readiness.md`](./implementation/production-readiness.md) - Error recovery
- [`docs/testing/`](./testing/) - Testing and verification guides
- [`docs/verification/`](./verification/) - Health check procedures

## By Category

### 🏗️ Architecture & Design
System design, architecture decisions, component relationships.

- **Agent System**
  - How the manager agent routes queries to specialists
  - Agent communication and tool integration
  
- **Memory System**
  - Conversation history with Supabase
  - User scope isolation and RLS
  
- **Threading Feature**
  - How thread replies work in Feishu
  - Message history loading and fallback logic

*See: [`docs/architecture/`](./architecture/)*

### 🛠️ Implementation & How-To
Feature implementations, technical details, debugging guides.

- **Fallback Logic** [`fallback-logic-fixes.md`](./implementation/fallback-logic-fixes.md)
  - Thread fetch latency improvements
  - Error categorization and recovery
  - Graceful degradation on failures

- **Production Readiness** [`production-readiness.md`](./implementation/production-readiness.md)
  - Health monitoring implementation
  - Error recovery mechanisms
  - Process management setup

- **Model Configuration** [`model-fallback-guide.md`](./implementation/model-fallback-guide.md)
  - Primary vs fallback model selection
  - Rate limit handling
  - API key management

- **Threading Feature** 
  - [`threading-fixes.md`](./implementation/threading-fixes.md) - What was fixed
  - [`threading-debugging.md`](./implementation/threading-debugging.md) - How to debug

*See: [`docs/implementation/`](./implementation/)*

### 🚀 Setup & Deployment
Installation, configuration, environment setup, quick start guides.

- **Production Deployment** [`production-deployment.md`](./setup/production-deployment.md)
  - Complete step-by-step setup
  - Environment configuration
  - PM2 process management
  - Monitoring and alerts

- **Quick Start** [`production-quick-start.md`](./setup/production-quick-start.md)
  - Fast reference for operators
  - Essential commands
  - Troubleshooting quick links

- **Model Configuration** [`model-usage-reference.md`](./setup/model-usage-reference.md)
  - How to use different models
  - API configuration
  - Available options

*See: [`docs/setup/`](./setup/)*

### 🧪 Testing & Verification
Testing guides, test strategies, verification procedures.

- **Threading Tests** [`threading-test-guide.md`](./testing/threading-test-guide.md)
  - How to test threading feature
  - Test commands and expected output

- **Integration Tests**
  - Agent routing verification
  - Memory system validation
  - API endpoint testing

*See: [`docs/testing/`](./testing/)*

### ✅ Verification & Checklists
Deployment checklists, health verification, release procedures.

- **Pre-Deployment Checklist**
  - Environment variables
  - Build verification
  - Health endpoint tests

- **Release Checklist**
  - Code review requirements
  - Testing requirements
  - Deployment steps

*See: [`docs/verification/`](./verification/)*

## By Feature

### Threading Feature
End-to-end guide for the threading feature (replies in threads).

| Component | Location |
|-----------|----------|
| Architecture | `docs/architecture/` |
| Implementation | `docs/implementation/threading-fixes.md` |
| Debugging | `docs/implementation/threading-debugging.md` |
| Testing | `docs/testing/threading-test-guide.md` |

### Production Deployment
Complete production setup and monitoring.

| Component | Location |
|-----------|----------|
| Full Guide | `docs/setup/production-deployment.md` |
| Quick Start | `docs/setup/production-quick-start.md` |
| Error Recovery | `docs/implementation/production-readiness.md` |
| Health Checks | `docs/verification/` |

### Model Management
Using different AI models and handling rate limits.

| Component | Location |
|-----------|----------|
| Configuration | `docs/setup/model-usage-reference.md` |
| Implementation | `docs/implementation/model-fallback-guide.md` |
| Fallback Logic | `docs/implementation/fallback-logic-fixes.md` |

### Error & Fallback Logic
Handling failures gracefully with timeouts and retries.

| Component | Location |
|-----------|----------|
| Implementation | `docs/implementation/fallback-logic-fixes.md` |
| Production Setup | `docs/implementation/production-readiness.md` |
| Debugging | `docs/implementation/threading-debugging.md` |

## Common Tasks

### Deploy to Production
1. Read: [`docs/setup/production-deployment.md`](./setup/production-deployment.md)
2. Follow: Pre-deployment checklist in [`docs/verification/`](./verification/)
3. Reference: [`docs/setup/production-quick-start.md`](./setup/production-quick-start.md)

### Debug Production Issue
1. Check health: `curl http://localhost:3000/health`
2. View logs: `pm2 logs feishu-agent`
3. Reference: [`docs/setup/production-quick-start.md`](./setup/production-quick-start.md) → Troubleshooting
4. Deep dive: [`docs/implementation/production-readiness.md`](./implementation/production-readiness.md)

### Test Threading Feature
1. Setup: Follow `docs/setup/production-deployment.md`
2. Test: [`docs/testing/threading-test-guide.md`](./testing/threading-test-guide.md)
3. Debug if needed: [`docs/implementation/threading-debugging.md`](./implementation/threading-debugging.md)

### Understand Error Handling
1. Overview: [`docs/implementation/fallback-logic-fixes.md`](./implementation/fallback-logic-fixes.md)
2. Production setup: [`docs/implementation/production-readiness.md`](./implementation/production-readiness.md)
3. Deployment: [`docs/setup/production-deployment.md`](./setup/production-deployment.md)

## File Organization Rules

All documentation follows these rules (see [`ORGANIZATION.md`](./ORGANIZATION.md)):

- **Root level**: Only `README.md`, `AGENTS.md`, `.gitignore`
- **Docs folder**: Organized by category
- **Naming**: kebab-case filenames
- **Format**: Markdown with consistent structure
- **Cross-references**: Use relative links within docs/

## Contributing

When adding documentation:

1. **Choose category**: architecture/ | implementation/ | setup/ | testing/ | verification/
2. **Use kebab-case filename**: e.g., `my-feature-guide.md`
3. **Add metadata**: Date, status, problem/motivation
4. **Include examples**: Code samples, command examples
5. **Update this index**: Add reference to README.md
6. **Link related docs**: Cross-reference with relative paths

See [`ORGANIZATION.md`](./ORGANIZATION.md) for detailed guidelines.

## Navigation

```
docs/
├── architecture/              # System design
├── implementation/            # How things work
├── setup/                    # Getting started
├── testing/                  # Test procedures
├── verification/             # Checklists
├── ORGANIZATION.md           # This structure explained
└── README.md                 # You are here
```

---

**Last Updated**: Nov 18, 2025  
**Total Docs**: 10+  
**Categories**: 5 (Architecture, Implementation, Setup, Testing, Verification)
