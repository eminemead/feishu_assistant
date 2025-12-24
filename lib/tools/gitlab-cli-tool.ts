/**
 * GitLab CLI Tool Factory
 * 
 * Creates the GitLab CLI tool used by the DPA Mom Agent.
 * Wraps glab CLI commands for GitLab repository and issue management.
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { trackToolCall } from "../devtools-integration";

const execAsync = promisify(exec);

/**
 * Execute glab command safely
 */
async function executeGlabCommand(command: string, timeout: number = 30000): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await Promise.race([
      execAsync(`glab ${command}`, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
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
 * Creates the GitLab CLI tool
 * 
 * Used by:
 * - DPA Mom Agent (production): With devtools tracking
 * 
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured GitLab CLI tool instance
 */
export function createGitLabCliTool(enableDevtoolsTracking: boolean = true) {
  const executeFn = enableDevtoolsTracking
    ? trackToolCall(
        "gitlab_cli",
        async ({ command, args }: { command: string; args?: string }) => {
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
      )
    : async ({ command, args }: { command: string; args?: string }) => {
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
      };

  // Base tool definition
  // @ts-ignore - Type instantiation depth issue
  const gitlabCliToolBase = tool({
    description: `Access GitLab repository and issue management via glab CLI. 
    
Available commands:
- issue: Manage issues (list, view, create, close, etc.)
- mr: Manage merge requests (list, view, create, etc.)
- repo: Repository operations (view, clone, etc.)
- ci: CI/CD operations (view pipelines, jobs, etc.)
- api: Direct API calls

Examples:
- "issue list" - List all issues
- "issue view 123" - View issue #123
- "mr list" - List merge requests
- "repo view" - View repository info
- "ci view" - View CI/CD pipelines

Use glab command syntax. For help: "glab <command> --help"`,
    // @ts-ignore
    parameters: zodSchema(
      z.object({
        command: z
          .string()
          .describe(
            "The glab command to execute (e.g., 'issue list', 'mr view 456', 'repo view'). Do not include 'glab' prefix."
          ),
        args: z
          .string()
          .optional()
          .describe(
            "Additional arguments/flags for the command (e.g., '--state=opened', '--assignee=username'). Optional."
          ),
      })
    ),
    execute: executeFn,
  });

  return gitlabCliToolBase;
}

