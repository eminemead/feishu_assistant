# Agent Architecture

This directory contains the unified DPA Mom agent implementation using [Mastra](https://mastra.ai) framework.

> 📚 **Documentation**: For detailed architecture documentation, see [docs/architecture/](../../docs/architecture/)

## Overview

The system uses a **Single Unified Agent + Workflows** pattern:

- **DPA Mom Agent** (`dpa-mom-agent.ts`): Single agent with all tools attached
- **Workflows** (`../workflows/`): Deterministic multi-step operations via `execute_workflow` tool

## DPA Mom Agent

**File**: `dpa-mom-agent.ts`

The caring chief-of-staff for the DPA (Data Product & Analytics) team.

### Capabilities
- **Team Coordination**: GitLab issue management, task tracking
- **OKR Analysis**: Metrics review, visualization, trend analysis
- **Document Operations**: Feishu docs reading, chat history search
- **Data Operations**: Chart generation, workflow execution

### Tools Available

| Tool | Purpose |
|------|---------|
| `gitlab_cli` | GitLab operations via glab CLI |
| `feishu_chat_history` | Search Feishu group chat histories |
| `feishu_docs` | Read Feishu documents |
| `mgr_okr_review` | Fetch OKR metrics data |
| `visualization` | Generate Feishu-friendly charts (ASCII or uploaded PNG) |
| `execute_workflow` | Execute deterministic workflows |

### Workflows (via `execute_workflow`)

| Workflow ID | Purpose |
|-------------|---------|
| `dpa-assistant` | GitLab issue creation with confirmation |
| `okr-analysis` | Complete OKR analysis pipeline |
| `document-tracking` | Document change monitoring |

## Usage

The agent is used by `generate-response.ts`:

```typescript
import { dpaMomAgent } from "./agents/dpa-mom-agent";

const response = await dpaMomAgent(messages, updateStatus, chatId, rootId, userId);
```

## Key Exports

```typescript
// Main agent function
export async function dpaMomAgent(
  messages: CoreMessage[],
  updateStatus?: (status: string) => void,
  chatId?: string,
  rootId?: string,
  userId?: string,
): Promise<DpaMomResult>

// Get agent instance (for Mastra registration)
export function getDpaMomAgent(): Agent

// Result type
export interface DpaMomResult {
  text: string;
  needsConfirmation?: boolean;
  confirmationData?: string;
  reasoning?: string;
  linkedIssue?: LinkedIssueResult;
}
```

## Historical Note

Previously used a multi-agent Manager → Specialist routing pattern. Consolidated into single unified agent in Jan 2026 for simplicity and better LLM-based tool selection.
