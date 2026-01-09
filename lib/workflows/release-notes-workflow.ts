/**
 * Release Notes Workflow
 * 
 * Generates and posts release notes to the DPA Release Notes topic group.
 * 
 * Flow:
 * 1. Dev: "release notes for #123, #456, #789 version v1.2.3"
 * 2. Bot: Fetches issue details via glab CLI
 * 3. Bot: LLM generates formatted changelog
 * 4. Bot: Shows preview card with [Post] [Edit] buttons
 * 5. Dev: Confirms → Posts to topic group
 * 
 * Target: DPA - Release Notes (话题群)
 * chat_id: oc_c5d0383100429b9934323b3e6194ed49
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import { generateText } from "ai";
import { getFeishuClient } from "../feishu-utils";
import { getMastraModelSingle } from "../shared/model-router";

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const RELEASE_NOTES_TOPIC_GROUP = "oc_c5d0383100429b9934323b3e6194ed49";
const DEFAULT_GITLAB_PROJECT = "dpa/dpa-mom/task"; // https://git.nevint.com/dpa/dpa-mom/task/-/issues

// ============================================================================
// GitLab Issue Fetching (via glab CLI)
// ============================================================================

interface GitLabIssue {
  iid: number;
  title: string;
  description: string;
  labels: string[];
  state: string;
  author: string;
  webUrl: string;
}

/**
 * Fetch issue details via glab CLI
 * 
 * @param issueNumber - Issue IID
 * @param project - Optional project path (e.g., "dpa/evidence")
 */
async function fetchIssueViaGlab(issueNumber: number, project?: string): Promise<GitLabIssue | null> {
  try {
    // Build command with optional --repo flag
    const repoFlag = project ? `--repo ${project}` : "";
    const cmd = `glab issue view ${issueNumber} ${repoFlag} --output json`.trim();
    
    console.log(`[ReleaseNotes] Fetching: ${cmd}`);
    
    const { stdout } = await execAsync(cmd, {
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024,
    });
    
    const data = JSON.parse(stdout);
    
    return {
      iid: data.iid || issueNumber,
      title: data.title || "Unknown",
      description: data.description || "",
      labels: data.labels || [],
      state: data.state || "unknown",
      author: data.author?.username || data.author?.name || "unknown",
      webUrl: data.web_url || "",
    };
  } catch (error: any) {
    console.error(`[ReleaseNotes] Failed to fetch issue #${issueNumber}:`, error.message);
    return null;
  }
}

/**
 * Fetch multiple issues
 */
async function fetchIssues(issueNumbers: number[], project?: string): Promise<GitLabIssue[]> {
  const results = await Promise.all(
    issueNumbers.map(iid => fetchIssueViaGlab(iid, project))
  );
  return results.filter((issue): issue is GitLabIssue => issue !== null);
}

// ============================================================================
// Step 1: Fetch Issues from GitLab
// ============================================================================

const fetchIssuesStep = createStep({
  id: "fetch-gitlab-issues",
  inputSchema: z.object({
    issueNumbers: z.array(z.number()).describe("List of GitLab issue numbers to include"),
    version: z.string().describe("Release version (e.g., v1.2.3)"),
    projectName: z.string().optional().describe("Project display name"),
    gitlabProject: z.string().optional().describe("GitLab project path (e.g., 'dpa/evidence')"),
    author: z.string().optional().describe("Releaser name"),
  }),
  outputSchema: z.object({
    issues: z.array(z.object({
      iid: z.number(),
      title: z.string(),
      description: z.string(),
      labels: z.array(z.string()),
      state: z.string(),
      author: z.string(),
      webUrl: z.string(),
    })),
    version: z.string(),
    projectName: z.string().optional(),
    author: z.string().optional(),
    fetchErrors: z.array(z.number()), // Issue numbers that failed to fetch
  }),
  execute: async ({ inputData }) => {
    const { issueNumbers, version, projectName, gitlabProject, author } = inputData;
    
    const project = gitlabProject || DEFAULT_GITLAB_PROJECT;
    console.log(`[ReleaseNotes] Fetching ${issueNumbers.length} issues from ${project}: ${issueNumbers.join(", ")}`);
    
    const issues = await fetchIssues(issueNumbers, project);
    const fetchedIds = new Set(issues.map(i => i.iid));
    const fetchErrors = issueNumbers.filter(n => !fetchedIds.has(n));
    
    if (fetchErrors.length > 0) {
      console.warn(`[ReleaseNotes] Failed to fetch issues: ${fetchErrors.join(", ")}`);
    }
    
    console.log(`[ReleaseNotes] Fetched ${issues.length}/${issueNumbers.length} issues`);
    
    return {
      issues,
      version,
      projectName,
      author,
      fetchErrors,
    };
  },
});

// ============================================================================
// Step 2: Generate Changelog via LLM
// ============================================================================

const generateChangelogStep = createStep({
  id: "generate-changelog",
  inputSchema: z.object({
    issues: z.array(z.object({
      iid: z.number(),
      title: z.string(),
      description: z.string(),
      labels: z.array(z.string()),
      state: z.string(),
      author: z.string(),
      webUrl: z.string(),
    })),
    version: z.string(),
    projectName: z.string().optional(),
    author: z.string().optional(),
    fetchErrors: z.array(z.number()),
  }),
  outputSchema: z.object({
    version: z.string(),
    projectName: z.string().optional(),
    author: z.string().optional(),
    changelog: z.string(),
    formattedTitle: z.string(),
    issueCount: z.number(),
    fetchErrors: z.array(z.number()),
  }),
  execute: async ({ inputData }) => {
    const { issues, version, projectName, author, fetchErrors } = inputData;
    
    console.log(`[ReleaseNotes] Generating changelog for ${issues.length} issues`);
    
    if (issues.length === 0) {
      return {
        version,
        projectName,
        author,
        changelog: "No issues found for this release.",
        formattedTitle: `🚀 ${projectName ? `${projectName} ` : ""}${version}`,
        issueCount: 0,
        fetchErrors,
      };
    }
    
    // Prepare issue summaries for LLM
    const issueSummaries = issues.map(issue => {
      const labelStr = issue.labels.length > 0 ? ` [${issue.labels.join(", ")}]` : "";
      return `- #${issue.iid}: ${issue.title}${labelStr}\n  ${issue.description?.slice(0, 200) || "(no description)"}`;
    }).join("\n\n");
    
    // Generate changelog via LLM
    const prompt = `You are writing release notes for ${projectName || "a software project"} ${version}.

Based on these GitLab issues, generate a concise, well-formatted changelog in Chinese.

Group items by type:
- ✨ 新功能 (Features) - new capabilities
- 🐛 问题修复 (Bug Fixes) - bug fixes
- 🔧 优化改进 (Improvements) - enhancements, refactoring
- 📝 其他 (Other) - documentation, chores

For each item, write ONE clear sentence describing the change. Include the issue number.
Keep it concise - no more than 2 sentences per item.
Use bullet points, not numbered lists.

Issues:
${issueSummaries}

Output ONLY the formatted changelog content (no title, no metadata).`;

    try {
      const result = await generateText({
        model: getMastraModelSingle(false), // Uses NVIDIA (default) or OpenRouter free models
        prompt,
      });
      
      const changelog = result.text.trim();
      const formattedTitle = `🚀 ${projectName ? `${projectName} ` : ""}${version}`;
      
      console.log(`[ReleaseNotes] Generated changelog (${changelog.length} chars)`);
      
      return {
        version,
        projectName,
        author,
        changelog,
        formattedTitle,
        issueCount: issues.length,
        fetchErrors,
      };
    } catch (error: any) {
      console.error(`[ReleaseNotes] LLM generation failed:`, error.message);
      
      // Fallback: simple list
      const fallbackChangelog = issues.map(issue => 
        `- #${issue.iid}: ${issue.title}`
      ).join("\n");
      
      return {
        version,
        projectName,
        author,
        changelog: fallbackChangelog,
        formattedTitle: `🚀 ${projectName ? `${projectName} ` : ""}${version}`,
        issueCount: issues.length,
        fetchErrors,
      };
    }
  },
});

// ============================================================================
// Step 3: Format for Posting
// ============================================================================

const formatReleaseNotesStep = createStep({
  id: "format-release-notes",
  inputSchema: z.object({
    version: z.string(),
    projectName: z.string().optional(),
    author: z.string().optional(),
    changelog: z.string(),
    formattedTitle: z.string(),
    issueCount: z.number(),
    fetchErrors: z.array(z.number()),
  }),
  outputSchema: z.object({
    version: z.string(),
    formattedTitle: z.string(),
    formattedContent: z.string(),
    author: z.string().optional(),
    issueCount: z.number(),
    fetchErrors: z.array(z.number()),
  }),
  execute: async ({ inputData }) => {
    const { version, projectName, author, changelog, formattedTitle, issueCount, fetchErrors } = inputData;
    
    console.log(`[ReleaseNotes] Formatting release notes for ${version}`);
    
    // Build metadata header
    const metadataLines: string[] = [];
    metadataLines.push(`📅 ${new Date().toLocaleDateString("zh-CN")}`);
    if (author) metadataLines.push(`👤 ${author}`);
    metadataLines.push(`📋 ${issueCount} issues`);
    
    const header = metadataLines.join(" | ");
    
    // Combine into final content
    const formattedContent = `${header}\n\n${changelog}`;
    
    return {
      version,
      formattedTitle,
      formattedContent,
      author,
      issueCount,
      fetchErrors,
    };
  },
});

// ============================================================================
// Step 4: Post to Topic Group
// ============================================================================

const postToTopicGroupStep = createStep({
  id: "post-to-topic-group",
  inputSchema: z.object({
    version: z.string(),
    formattedTitle: z.string(),
    formattedContent: z.string(),
    author: z.string().optional(),
    issueCount: z.number(),
    fetchErrors: z.array(z.number()),
    targetChatId: z.string().optional(), // Override default target
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    threadId: z.string().optional(), // In topic groups, messageId = threadId
    topicUrl: z.string().optional(),
    error: z.string().optional(),
    version: z.string(),
    formattedTitle: z.string(),
    formattedContent: z.string(),
    issueCount: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { version, formattedTitle, formattedContent, targetChatId, issueCount } = inputData;
    
    const chatId = targetChatId || RELEASE_NOTES_TOPIC_GROUP;
    console.log(`[ReleaseNotes] Posting to topic group: ${chatId}`);
    
    try {
      const client = getFeishuClient();
      
      // Use text format with markdown-like content for simplicity
      // Feishu will render it as a new topic in the topic group
      const resp = await client.im.message.create({
        params: {
          receive_id_type: "chat_id",
        },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({
            text: `${formattedTitle}\n\n${formattedContent}`,
          }),
        },
      });
      
      const isSuccess = resp.code === 0 || resp.code === undefined;
      
      if (!isSuccess || !resp.data?.message_id) {
        console.error(`[ReleaseNotes] Failed to post:`, resp);
        return {
          success: false,
          error: `Feishu API error: ${resp.msg || resp.code}`,
          version,
          formattedTitle,
          formattedContent,
          issueCount,
        };
      }
      
      const messageId = resp.data.message_id;
      // In topic groups, the message_id is also the thread_id for the new topic
      const topicUrl = `https://applink.feishu.cn/client/message/link?token=${messageId}`;
      
      console.log(`[ReleaseNotes] ✅ Posted successfully: ${messageId}`);
      
      return {
        success: true,
        messageId,
        threadId: messageId, // Same as messageId in topic groups
        topicUrl,
        version,
        formattedTitle,
        formattedContent,
        issueCount,
      };
    } catch (error: any) {
      console.error(`[ReleaseNotes] Exception:`, error);
      return {
        success: false,
        error: error.message || "Unknown error",
        version,
        formattedTitle,
        formattedContent,
        issueCount,
      };
    }
  },
});

// ============================================================================
// Workflow Definitions
// ============================================================================

/**
 * Generate Release Notes Preview (without posting)
 * 
 * Use this to generate and preview release notes before posting.
 */
export const releaseNotesPreviewWorkflow = createWorkflow({
  id: "release-notes-preview",
  description: "Generate release notes preview from GitLab issues (without posting)",
  inputSchema: z.object({
    issueNumbers: z.array(z.number()).describe("GitLab issue numbers to include"),
    version: z.string().describe("Release version (e.g., v1.2.3)"),
    projectName: z.string().optional().describe("Project display name"),
    gitlabProject: z.string().optional().describe("GitLab project path (e.g., 'dpa/evidence')"),
    author: z.string().optional().describe("Releaser name"),
  }),
  outputSchema: z.object({
    version: z.string(),
    formattedTitle: z.string(),
    formattedContent: z.string(),
    author: z.string().optional(),
    issueCount: z.number(),
    fetchErrors: z.array(z.number()),
  }),
})
  .then(fetchIssuesStep)
  .then(generateChangelogStep)
  .then(formatReleaseNotesStep)
  .commit();

/**
 * Post Release Notes (full workflow including posting)
 */
export const releaseNotesWorkflow = createWorkflow({
  id: "release-notes",
  description: "Generate and post release notes to DPA Release Notes topic group",
  inputSchema: z.object({
    issueNumbers: z.array(z.number()).describe("GitLab issue numbers to include"),
    version: z.string().describe("Release version (e.g., v1.2.3)"),
    projectName: z.string().optional().describe("Project display name"),
    gitlabProject: z.string().optional().describe("GitLab project path (e.g., 'dpa/evidence')"),
    author: z.string().optional().describe("Releaser name"),
    targetChatId: z.string().optional().describe("Override target chat ID"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    messageId: z.string().optional(),
    threadId: z.string().optional(),
    topicUrl: z.string().optional(),
    error: z.string().optional(),
    version: z.string(),
    formattedTitle: z.string(),
    formattedContent: z.string(),
    issueCount: z.number(),
  }),
})
  .then(fetchIssuesStep)
  .then(generateChangelogStep)
  .then(formatReleaseNotesStep)
  .then(postToTopicGroupStep)
  .commit();

// ============================================================================
// Convenience Helpers
// ============================================================================

export interface ReleaseNotesInput {
  issueNumbers: number[];
  version: string;
  projectName?: string;
  gitlabProject?: string; // e.g., "dpa/evidence"
  author?: string;
  targetChatId?: string;
}

export interface ReleaseNotesPreviewResult {
  version: string;
  formattedTitle: string;
  formattedContent: string;
  author?: string;
  issueCount: number;
  fetchErrors: number[];
}

export interface ReleaseNotesResult extends ReleaseNotesPreviewResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  topicUrl?: string;
  error?: string;
}

/**
 * Generate release notes preview (without posting)
 * 
 * Use this to show preview before confirming.
 * 
 * @example
 * const preview = await generateReleaseNotesPreview({
 *   issueNumbers: [123, 456, 789],
 *   version: "v1.2.3",
 *   projectName: "Feishu Assistant",
 *   author: "xiaofei.yin",
 * });
 * // Show preview to user, then call postReleaseNotes() if confirmed
 */
export async function generateReleaseNotesPreview(
  input: Omit<ReleaseNotesInput, "targetChatId">
): Promise<ReleaseNotesPreviewResult> {
  console.log(`[ReleaseNotes] Generating preview for ${input.version} with issues: ${input.issueNumbers.join(", ")}`);
  
  const run = await releaseNotesPreviewWorkflow.createRun();
  const result = await run.start({ inputData: input });
  
  const output = result as any;
  
  if (output.status === "success" && output.result) {
    return output.result as ReleaseNotesPreviewResult;
  }
  
  // Handle workflow failure
  return {
    version: input.version,
    formattedTitle: `🚀 ${input.projectName ? `${input.projectName} ` : ""}${input.version}`,
    formattedContent: `Failed to generate: ${output.error?.message || "Unknown error"}`,
    issueCount: 0,
    fetchErrors: input.issueNumbers,
  };
}

/**
 * Post release notes to the topic group
 * 
 * @example
 * const result = await postReleaseNotes({
 *   issueNumbers: [123, 456, 789],
 *   version: "v1.2.3",
 *   projectName: "Feishu Assistant",
 *   author: "xiaofei.yin",
 * });
 */
export async function postReleaseNotes(input: ReleaseNotesInput): Promise<ReleaseNotesResult> {
  console.log(`[ReleaseNotes] Starting workflow for ${input.version} with issues: ${input.issueNumbers.join(", ")}`);
  
  const run = await releaseNotesWorkflow.createRun();
  const result = await run.start({ inputData: input });
  
  const output = result as any;
  
  if (output.status === "success" && output.result) {
    return output.result as ReleaseNotesResult;
  }
  
  // Handle workflow failure
  return {
    success: false,
    error: output.error?.message || "Workflow execution failed",
    version: input.version,
    formattedTitle: `🚀 ${input.projectName ? `${input.projectName} ` : ""}${input.version}`,
    formattedContent: "",
    issueCount: 0,
    fetchErrors: [],
  };
}

/**
 * Post pre-generated release notes (skip generation, just post)
 * 
 * Use this when user confirms a preview.
 */
export async function postPreviewedReleaseNotes(
  preview: ReleaseNotesPreviewResult,
  targetChatId?: string
): Promise<ReleaseNotesResult> {
  console.log(`[ReleaseNotes] Posting previewed release notes for ${preview.version}`);
  
  const chatId = targetChatId || RELEASE_NOTES_TOPIC_GROUP;
  
  try {
    const client = getFeishuClient();
    
    const resp = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({
          text: `${preview.formattedTitle}\n\n${preview.formattedContent}`,
        }),
      },
    });
    
    const isSuccess = resp.code === 0 || resp.code === undefined;
    
    if (!isSuccess || !resp.data?.message_id) {
      return {
        ...preview,
        success: false,
        error: `Feishu API error: ${(resp as any).msg || resp.code}`,
      };
    }
    
    const messageId = resp.data.message_id;
    const topicUrl = `https://applink.feishu.cn/client/message/link?token=${messageId}`;
    
    console.log(`[ReleaseNotes] ✅ Posted previewed notes: ${messageId}`);
    
    return {
      ...preview,
      success: true,
      messageId,
      threadId: messageId,
      topicUrl,
    };
  } catch (error: any) {
    return {
      ...preview,
      success: false,
      error: error.message || "Unknown error",
    };
  }
}

// ============================================================================
// Preview Card with Buttons
// ============================================================================

/**
 * Send release notes preview as an interactive card with [Post] [Edit] buttons
 * 
 * @param chatId - Chat ID to send the preview to
 * @param preview - Generated preview content
 * @param rootId - Optional root message ID for threading
 * @returns Message ID of the preview card
 */
export async function sendReleaseNotesPreviewCard(
  chatId: string,
  preview: ReleaseNotesPreviewResult,
  rootId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  console.log(`[ReleaseNotes] Sending preview card to ${chatId}`);
  
  try {
    const client = getFeishuClient();
    
    // Store preview data as JSON for the callback to use
    const previewData = JSON.stringify({
      version: preview.version,
      formattedTitle: preview.formattedTitle,
      formattedContent: preview.formattedContent,
      author: preview.author,
      issueCount: preview.issueCount,
    });
    
    // Build card with preview content and action buttons
    const cardData = {
      schema: "2.0",
      header: {
        title: {
          tag: "plain_text",
          content: `📝 Release Notes Preview`,
        },
        subtitle: {
          tag: "plain_text", 
          content: preview.formattedTitle,
        },
        template: "blue",
      },
      body: {
        elements: [
          // Preview content
          {
            tag: "markdown",
            content: preview.formattedContent,
          },
          // Divider
          {
            tag: "hr",
          },
          // Metadata
          {
            tag: "note",
            elements: [
              {
                tag: "plain_text",
                content: `${preview.issueCount} issues included${preview.fetchErrors.length > 0 ? ` | ⚠️ Failed to fetch: ${preview.fetchErrors.join(", ")}` : ""}`,
              },
            ],
          },
          // Action buttons
          {
            tag: "action",
            actions: [
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "✅ Post to Release Notes",
                },
                type: "primary",
                behaviors: [
                  {
                    type: "callback",
                    value: {
                      action: "release_notes_post",
                      preview: previewData,
                      chatId: chatId,
                      rootId: rootId || "",
                    },
                  },
                ],
              },
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "❌ Cancel",
                },
                type: "default",
                behaviors: [
                  {
                    type: "callback",
                    value: {
                      action: "release_notes_cancel",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    
    // Send as reply in thread if rootId provided
    let resp;
    if (rootId) {
      resp = await client.im.message.reply({
        path: {
          message_id: rootId,
        },
        data: {
          msg_type: "interactive",
          content: JSON.stringify(cardData),
        },
      });
    } else {
      resp = await client.im.message.create({
        params: {
          receive_id_type: "chat_id",
        },
        data: {
          receive_id: chatId,
          msg_type: "interactive",
          content: JSON.stringify(cardData),
        },
      });
    }
    
    const isSuccess = resp.code === 0 || resp.code === undefined;
    
    if (!isSuccess || !resp.data?.message_id) {
      console.error(`[ReleaseNotes] Failed to send preview card:`, resp);
      return {
        success: false,
        error: `Feishu API error: ${(resp as any).msg || resp.code}`,
      };
    }
    
    console.log(`[ReleaseNotes] ✅ Preview card sent: ${resp.data.message_id}`);
    
    return {
      success: true,
      messageId: resp.data.message_id,
    };
  } catch (error: any) {
    console.error(`[ReleaseNotes] Exception sending preview card:`, error);
    return {
      success: false,
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Handle release notes card button callbacks
 * 
 * Register this with your card action handler:
 * ```
 * actionHandlers["release_notes_post"] = handleReleaseNotesAction;
 * actionHandlers["release_notes_cancel"] = handleReleaseNotesAction;
 * ```
 */
export async function handleReleaseNotesCardAction(
  actionValue: any
): Promise<{ toast: { type: "success" | "fail"; content: string } }> {
  const action = actionValue?.action;
  
  if (action === "release_notes_cancel") {
    return {
      toast: {
        type: "success",
        content: "Release notes cancelled",
      },
    };
  }
  
  if (action === "release_notes_post") {
    try {
      const previewData = JSON.parse(actionValue.preview);
      const preview: ReleaseNotesPreviewResult = {
        ...previewData,
        fetchErrors: [],
      };
      
      const result = await postPreviewedReleaseNotes(preview);
      
      if (result.success) {
        return {
          toast: {
            type: "success",
            content: `✅ Posted to Release Notes!`,
          },
        };
      } else {
        return {
          toast: {
            type: "fail",
            content: `Failed: ${result.error}`,
          },
        };
      }
    } catch (error: any) {
      return {
        toast: {
          type: "fail",
          content: `Error: ${error.message}`,
        },
      };
    }
  }
  
  return {
    toast: {
      type: "fail",
      content: "Unknown action",
    },
  };
}

// ============================================================================
// Export Constants
// ============================================================================

export const TOPIC_GROUPS = {
  RELEASE_NOTES: RELEASE_NOTES_TOPIC_GROUP,
} as const;

export const GITLAB_PROJECTS = {
  DPA_MOM_TASK: DEFAULT_GITLAB_PROJECT,
} as const;
