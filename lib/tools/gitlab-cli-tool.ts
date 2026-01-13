/**
 * GitLab CLI Tool Factory
 * 
 * Creates the GitLab CLI tool used by the DPA Mom Agent.
 * Wraps glab CLI commands for GitLab repository and issue management.
 * 
 * GUARDRAIL: This tool is scoped ONLY to dpa/dpa-mom/task repository.
 * All commands auto-inject -R dpa/dpa-mom/task to prevent misuse.
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { devtoolsTracker } from "../devtools-integration";

const execAsync = promisify(exec);

/**
 * GUARDRAIL: The ONLY GitLab repo this tool is allowed to operate on.
 * All commands will have -R flag auto-injected/enforced.
 */
const ALLOWED_GITLAB_REPO = "dpa/dpa-mom/task";
const GITLAB_HOST = "git.nevint.com";

/**
 * Enforce repo guardrail: ensure command targets ONLY allowed repo
 * 
 * - Strips any user-provided -R/--repo flags
 * - Auto-injects -R dpa/dpa-mom/task
 * - Rejects commands that don't make sense with repo scope
 */
function enforceRepoGuardrail(command: string): string {
  // Strip any existing -R or --repo flags (prevent override attempts)
  let sanitized = command
    .replace(/-R\s+[^\s]+/gi, "")
    .replace(/--repo[=\s]+[^\s]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Commands that need repo context (most glab commands)
  const needsRepoFlag = /^(issue|mr|ci|release|label|milestone|api)/i.test(sanitized);
  
  if (needsRepoFlag) {
    sanitized = `${sanitized} -R ${ALLOWED_GITLAB_REPO}`;
  }

  console.log(`[GitLab] Guardrail: "${command}" → "${sanitized}"`);
  return sanitized;
}

/**
 * Execute glab command safely (with repo guardrail enforced)
 */
async function executeGlabCommand(command: string, timeout: number = 30000): Promise<{ stdout: string; stderr: string }> {
  // GUARDRAIL: Enforce repo scope
  const safeCommand = enforceRepoGuardrail(command);
  
  try {
    const { stdout, stderr } = await Promise.race([
      execAsync(`glab ${safeCommand}`, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: { ...process.env, GITLAB_HOST }, // Ensure correct host
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Command timeout after ${timeout}ms`)), timeout)
      ),
    ]);
    return { stdout, stderr };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new Error("glab CLI not found. Please install glab: https://gitlab.com/gitlab-org/cli");
    }
    throw error;
  }
}

/**
 * GitLab CLI result type
 */
interface GitLabCliResult {
  success: boolean;
  output?: string;
  error?: string;
  command: string;
}

/**
 * Core execution logic
 */
async function executeGitLabCli(command: string, args?: string): Promise<GitLabCliResult> {
  const fullCommand = args ? `${command} ${args}` : command;
  const { stdout, stderr } = await executeGlabCommand(fullCommand);
  
  if (stderr && !stdout) {
    return {
      success: false,
      error: stderr,
      command: fullCommand,
    };
  }
  
  return {
    success: true,
    output: stdout,
    command: fullCommand,
  };
}

/**
 * Creates the GitLab CLI tool
 * 
 * Used by:
 * - DPA Mom Agent (production): With devtools tracking
 * 
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured GitLab CLI tool instance
 */
export function createGitLabCliTool(enableDevtoolsTracking: boolean = true) {
  return createTool({
    id: "gitlab_cli",
    description: `Access GitLab issue management via glab CLI.

⚠️ SCOPE: This tool ONLY works with dpa/dpa-mom/task repo (${GITLAB_HOST}).
The -R flag is auto-injected; do NOT specify repo manually.

Available commands:
- issue list: List issues (add --assignee=@me for your issues, -c for closed)
- issue view <iid>: View issue details
- issue create -t "title" -d "desc": Create new issue
- issue close <iid>: Close an issue
- issue note <iid> -m "comment": Add comment
- mr list: List merge requests
- ci view: View CI/CD pipelines

Examples:
- "issue list" → Lists open issues in dpa/dpa-mom/task
- "issue list --assignee=@me" → Your assigned issues
- "issue view 123" → View issue #123
- "issue create -t 'Bug fix' -d 'Details...'" → Create issue

Do NOT include 'glab' prefix or -R flag (auto-injected).`,
    inputSchema: z.object({
      command: z
        .string()
        .describe(
          "The glab command (e.g., 'issue list', 'issue view 123'). Do NOT include 'glab' prefix or -R repo flag.",
        ),
      args: z
        .string()
        .optional()
        .describe(
          "Additional flags (e.g., '--assignee=@me', '-c' for closed). Do NOT use -R or --repo.",
        ),
    }),
execute: async (inputData, context) => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { success: false, error: "Command aborted", command: inputData.command };
      }
      
      const { command, args } = inputData;
      const startTime = Date.now();
      
      const result = await executeGitLabCli(command, args);
      
      if (enableDevtoolsTracking) {
        devtoolsTracker.trackToolCall("gitlab_cli", { command, args }, startTime);
      }
      
      return result;
    },
  });
}

