/**
 * Feishu Task Webhook Handler
 * 
 * Handles Feishu Task webhook events to sync with GitLab issues:
 * - task.created: Create GitLab issue from new Feishu task
 * - task.updated: Update GitLab issue fields
 * - task.completed: Close linked GitLab issue
 * - task.uncompleted: Reopen linked GitLab issue
 * - task.deleted: Optionally close GitLab issue
 * - task.comment.created: Add note to GitLab issue
 */

import { 
  getGitlabIssueByTaskGuid, 
  updateGitlabStatus,
  updateFeishuTaskStatus,
  getFeishuTaskDetails,
  getFeishuTaskDetailsWithUserAuth,
  createGitlabIssueFromTask,
  updateGitlabIssueFromTask,
  saveTaskLinkExtended,
  FeishuTaskDetails,
  getFeishuTaskByGitlabIssue,
} from '../services/feishu-task-service';
import { generateAuthUrl, hasUserAuthorized } from '../auth/feishu-oauth';
import { resolveGitlabUsername } from '../services/user-mapping-service';
import { client as feishuClient } from '../feishu-utils';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Default target project for GitLab issues
const DEFAULT_GITLAB_PROJECT = process.env.FEISHU_TASK_GITLAB_PROJECT || 'dpa/dpa-mom/task';

// OAuth auth-link prompt throttling (avoid spamming users)
const AUTH_PROMPT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const lastAuthPrompt = new Map<string, number>();

function getTaskOauthScopes(): string[] {
  const envScopes = process.env.FEISHU_TASK_OAUTH_SCOPES;
  if (envScopes) {
    const scopes = envScopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    if (scopes.length > 0) {
      return scopes;
    }
  }
  return ["task:task:read", "task:tasklist:read"];
}

async function maybePromptUserAuth(openId: string, taskGuid: string): Promise<void> {
  if (!openId) return;

  const authorized = await hasUserAuthorized(openId);
  if (authorized) return;

  const now = Date.now();
  const lastPrompt = lastAuthPrompt.get(openId) || 0;
  if (now - lastPrompt < AUTH_PROMPT_TTL_MS) return;

  lastAuthPrompt.set(openId, now);

  const authUrl = generateAuthUrl(openId, getTaskOauthScopes());
  const text =
    "🔐 为了同步你创建/更新的飞书任务到 GitLab，需要你的授权。\n" +
    `请点击授权链接：${authUrl}\n\n` +
    "授权后，Bot 将使用你的 user_access_token 读取任务详情（仅限已授权权限范围内）。";

  try {
    const resp = await feishuClient.im.message.create({
      params: {
        receive_id_type: "open_id",
      },
      data: {
        receive_id: openId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });

    const isSuccess = resp.code === 0 || resp.code === undefined;
    if (!isSuccess) {
      console.warn("⚠️ [TaskWebhook] Failed to send auth prompt:", resp);
    }
  } catch (error) {
    console.warn("⚠️ [TaskWebhook] Error sending auth prompt:", error);
  }
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event key types from Feishu Task webhook
 */
export type TaskEventKey = 
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'task.uncompleted'
  | 'task.deleted'
  | 'task.comment.created';

export interface TaskUpdatedEvent {
  schema: string;
  header: {
    event_id?: string;
    event_type: string;
    create_time?: string;
    token?: string;
    app_id?: string;
    tenant_key?: string;
  };
  event: {
    task_guid: string;
    obj_type: number;
    event_key: string;
    comment_guid?: string;
    changed_fields?: string[];
    operator_open_id?: string;
  };
}

export interface TaskEventPayload {
  task_guid: string;
  is_completed?: boolean;
  completed_at?: string;
}

/**
 * Main handler for Feishu task webhook events
 * Routes to specific handlers based on event_key
 */
export async function handleTaskUpdatedEvent(event: TaskUpdatedEvent): Promise<{ success: boolean; message: string }> {
  const { task_guid, event_key, comment_guid, changed_fields } = event.event;
  const operatorOpenId = event.event.operator_open_id;
  
  console.log(`📋 [TaskWebhook] Received event: guid=${task_guid}, event=${event_key}`);
  
  // Fetch full task details for most events
  const taskWithUserAuth = operatorOpenId
    ? await getFeishuTaskDetailsWithUserAuth(task_guid, operatorOpenId)
    : null;
  const task = taskWithUserAuth || await getFeishuTaskDetails(task_guid);
  if (!task && event_key !== 'task.deleted') {
    if (operatorOpenId) {
      await maybePromptUserAuth(operatorOpenId, task_guid);
    }
    console.error(`❌ [TaskWebhook] Failed to fetch task ${task_guid}`);
    return { success: false, message: `Failed to fetch task ${task_guid}` };
  }
  
  switch (event_key) {
    case 'task.created':
      return handleTaskCreated(task_guid, task!);
    
    case 'task.updated':
      return handleTaskUpdated(task_guid, task!, changed_fields || []);
    
    case 'task.completed':
      return handleTaskStatusChange(task_guid, true);
    
    case 'task.uncompleted':
      return handleTaskStatusChange(task_guid, false);
    
    case 'task.deleted':
      return handleTaskDeleted(task_guid);
    
    case 'task.comment.created':
      return handleCommentCreated(task_guid, comment_guid || '', task);
    
    default:
      console.log(`ℹ️ [TaskWebhook] Ignoring event_key: ${event_key}`);
      return { success: true, message: `Ignored event: ${event_key}` };
  }
}

// ============================================================================
// Event Handlers (Phase 2.1)
// ============================================================================

/**
 * Handle new task creation → create GitLab issue
 */
async function handleTaskCreated(
  taskGuid: string, 
  task: FeishuTaskDetails
): Promise<{ success: boolean; message: string }> {
  console.log(`📋 [TaskWebhook] Handling task.created: ${task.summary}`);
  
  // Check if already linked (idempotency)
  const existing = await getGitlabIssueByTaskGuid(taskGuid);
  if (existing) {
    console.log(`ℹ️ [TaskWebhook] Task already linked to GitLab issue #${existing.gitlab_issue_iid}`);
    return { success: true, message: 'Already synced' };
  }
  
  // Create GitLab issue
  const result = await createGitlabIssueFromTask(task, task.url, DEFAULT_GITLAB_PROJECT);
  if (!result.success) {
    console.error(`❌ [TaskWebhook] Failed to create GitLab issue: ${result.error}`);
    return { success: false, message: result.error! };
  }
  
  // Save link
  await saveTaskLinkExtended({
    gitlabProject: DEFAULT_GITLAB_PROJECT,
    gitlabIssueIid: result.issueIid!,
    gitlabIssueUrl: result.issueUrl!,
    feishuTaskGuid: taskGuid,
    feishuTaskUrl: task.url,
  });
  
  console.log(`✅ [TaskWebhook] Created GitLab issue #${result.issueIid} for task ${taskGuid}`);
  return { success: true, message: `Created GitLab issue #${result.issueIid}` };
}

/**
 * Handle task field updates → update GitLab issue
 */
async function handleTaskUpdated(
  taskGuid: string, 
  task: FeishuTaskDetails,
  changedFields: string[]
): Promise<{ success: boolean; message: string }> {
  console.log(`📋 [TaskWebhook] Handling task.updated: ${task.summary}, fields: ${changedFields.join(', ')}`);
  
  // Look up linked GitLab issue
  const link = await getGitlabIssueByTaskGuid(taskGuid);
  if (!link) {
    console.log(`ℹ️ [TaskWebhook] No GitLab issue linked to task ${taskGuid}, creating new...`);
    // Create new issue if not linked
    return handleTaskCreated(taskGuid, task);
  }
  
  // Update GitLab issue
  const result = await updateGitlabIssueFromTask(
    link.gitlab_issue_iid, 
    task, 
    changedFields, 
    link.gitlab_project
  );
  
  if (!result.success) {
    return { success: false, message: result.error! };
  }
  
  return { success: true, message: `Updated GitLab issue #${link.gitlab_issue_iid}` };
}

/**
 * Handle task completion/reopening → close/reopen GitLab issue
 */
async function handleTaskStatusChange(
  taskGuid: string, 
  completed: boolean
): Promise<{ success: boolean; message: string }> {
  console.log(`📋 [TaskWebhook] Handling task status change: completed=${completed}`);
  
  // Look up linked GitLab issue
  const link = await getGitlabIssueByTaskGuid(taskGuid);
  if (!link) {
    console.log(`ℹ️ [TaskWebhook] No GitLab issue linked to task ${taskGuid}`);
    return { success: true, message: 'No linked GitLab issue' };
  }
  
  const { gitlab_project, gitlab_issue_iid } = link;
  
  try {
    if (completed) {
      console.log(`🔄 [TaskWebhook] Closing GitLab issue: ${gitlab_project}#${gitlab_issue_iid}`);
      await closeGitlabIssue(gitlab_project, gitlab_issue_iid);
      await updateGitlabStatus(gitlab_project, gitlab_issue_iid, 'closed');
      return { success: true, message: `Closed GitLab issue ${gitlab_project}#${gitlab_issue_iid}` };
    } else {
      console.log(`🔄 [TaskWebhook] Reopening GitLab issue: ${gitlab_project}#${gitlab_issue_iid}`);
      await reopenGitlabIssue(gitlab_project, gitlab_issue_iid);
      await updateGitlabStatus(gitlab_project, gitlab_issue_iid, 'opened');
      return { success: true, message: `Reopened GitLab issue ${gitlab_project}#${gitlab_issue_iid}` };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [TaskWebhook] Failed to update GitLab issue: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

/**
 * Handle task deletion → optionally close GitLab issue
 */
async function handleTaskDeleted(taskGuid: string): Promise<{ success: boolean; message: string }> {
  console.log(`📋 [TaskWebhook] Handling task.deleted: ${taskGuid}`);
  
  // Look up linked GitLab issue
  const link = await getGitlabIssueByTaskGuid(taskGuid);
  if (!link) {
    console.log(`ℹ️ [TaskWebhook] No GitLab issue linked to deleted task ${taskGuid}`);
    return { success: true, message: 'No linked GitLab issue' };
  }
  
  // Optionally close the GitLab issue (configurable behavior)
  // For now, just add a note that the Feishu task was deleted
  const { gitlab_project, gitlab_issue_iid } = link;
  
  try {
    const noteContent = '⚠️ **Note**: The linked Feishu task has been deleted.';
    const cmd = `glab issue note ${gitlab_issue_iid} -m "${noteContent}" -R ${gitlab_project}`;
    await execAsync(cmd);
    
    console.log(`✅ [TaskWebhook] Added deletion note to GitLab issue #${gitlab_issue_iid}`);
    return { success: true, message: `Added note to GitLab issue #${gitlab_issue_iid}` };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ [TaskWebhook] Failed to add deletion note: ${errorMsg}`);
    return { success: true, message: 'Task deleted, note failed' };
  }
}

/**
 * Handle comment creation → add note to GitLab issue (Phase 4)
 * 
 * Note: Feishu Task V2 API comment structure may vary.
 * We attempt to fetch and sync the comment, falling back gracefully.
 */
async function handleCommentCreated(
  taskGuid: string, 
  commentGuid: string,
  task?: FeishuTaskDetails | null
): Promise<{ success: boolean; message: string }> {
  console.log(`📋 [TaskWebhook] Handling task.comment.created: task=${taskGuid}, comment=${commentGuid}`);
  
  // Look up linked GitLab issue
  const link = await getGitlabIssueByTaskGuid(taskGuid);
  if (!link) {
    console.log(`ℹ️ [TaskWebhook] No GitLab issue linked to task ${taskGuid}`);
    return { success: true, message: 'No linked GitLab issue' };
  }
  
  try {
    // Try to fetch comment content from Feishu
    // The API path varies by SDK version, so we use dynamic access
    let content = '';
    let author: string | null = null;
    
    try {
      // Try the comment.get endpoint (varies by SDK version)
      const taskApi = (feishuClient.task.v2 as any);
      const commentApi = taskApi.comment || taskApi.taskComment;
      
      if (commentApi?.get) {
        const commentResp = await commentApi.get({
          path: { 
            task_guid: taskGuid,
            comment_id: commentGuid,
          },
          params: { user_id_type: 'open_id' },
        });
        
        const isSuccess = (commentResp.code === 0 || commentResp.code === undefined);
        if (isSuccess && commentResp.data?.comment) {
          const comment = commentResp.data.comment;
          content = comment.content || '';
          const creatorId = comment.creator?.id;
          if (creatorId) {
            author = await resolveGitlabUsername(creatorId);
          }
        }
      }
    } catch (apiError) {
      console.warn(`⚠️ [TaskWebhook] Comment API not available or failed:`, apiError);
    }
    
    // Build note content
    let noteContent: string;
    if (content) {
      noteContent = author
        ? `**[Feishu Comment by @${author}]**\n\n${content}`
        : `**[Feishu Comment]**\n\n${content}`;
    } else {
      // Fallback: just note that a comment was added
      noteContent = '📝 **[Feishu Comment]** A new comment was added to the linked Feishu task.';
    }
    
    // Add note to GitLab issue
    const escapedNote = noteContent.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const cmd = `glab issue note ${link.gitlab_issue_iid} -m "${escapedNote}" -R ${link.gitlab_project}`;
    await execAsync(cmd);
    
    console.log(`✅ [TaskWebhook] Synced comment to GitLab issue #${link.gitlab_issue_iid}`);
    return { success: true, message: 'Comment synced' };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [TaskWebhook] Failed to sync comment: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

// ============================================================================
// GitLab Operations
// ============================================================================

/**
 * Close a GitLab issue via glab CLI
 */
async function closeGitlabIssue(project: string, issueIid: number): Promise<void> {
  const command = `glab issue close ${issueIid} -R ${project}`;
  console.log(`🔧 [TaskWebhook] Executing: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('Closing')) {
      console.warn(`⚠️ [TaskWebhook] glab stderr: ${stderr}`);
    }
    console.log(`✅ [TaskWebhook] Issue closed: ${stdout || 'success'}`);
  } catch (error: any) {
    throw new Error(`glab issue close failed: ${error.message}`);
  }
}

/**
 * Reopen a GitLab issue via glab CLI
 */
async function reopenGitlabIssue(project: string, issueIid: number): Promise<void> {
  const command = `glab issue reopen ${issueIid} -R ${project}`;
  console.log(`🔧 [TaskWebhook] Executing: ${command}`);
  
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr && !stderr.includes('Reopening')) {
      console.warn(`⚠️ [TaskWebhook] glab stderr: ${stderr}`);
    }
    console.log(`✅ [TaskWebhook] Issue reopened: ${stdout || 'success'}`);
  } catch (error: any) {
    throw new Error(`glab issue reopen failed: ${error.message}`);
  }
}

/**
 * Handle GitLab issue status change (when closing via GitLab directly)
 * This would be called from a GitLab webhook if configured
 */
export async function syncGitlabStatusToFeishuTask(
  project: string,
  issueIid: number,
  status: 'opened' | 'closed'
): Promise<void> {
  const link = await getFeishuTaskByGitlabIssue(project, issueIid);
  if (!link) {
    console.log(`ℹ️ [GitLabSync] No Feishu task linked to ${project}#${issueIid}`);
    return;
  }
  
  const { feishu_task_guid } = link;
  const completed = status === 'closed';
  
  console.log(`🔄 [GitLabSync] Syncing GitLab status to Feishu: task=${feishu_task_guid}, completed=${completed}`);
  
  const result = await updateFeishuTaskStatus(feishu_task_guid, completed);
  if (!result.success) {
    console.error(`❌ [GitLabSync] Failed to update Feishu task: ${result.error}`);
    return;
  }

  try {
    await updateGitlabStatus(project, issueIid, status);
  } catch (error) {
    console.error(`❌ [GitLabSync] Failed to update GitLab status in link table:`, error);
  }
}
