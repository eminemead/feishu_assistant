/**
 * Feishu Task Service
 * 
 * Provides APIs for creating/updating Feishu tasks and syncing with GitLab issues.
 * Uses Feishu Task V2 API: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/task-v2
 */

import { client as feishuClient } from '../feishu-utils';
import { createClient } from '@supabase/supabase-js';
import { getUserAccessToken } from '../auth/feishu-oauth';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface CreateTaskParams {
  summary: string;
  description?: string;
  dueDate?: string;  // ISO date string or Unix timestamp
  assigneeOpenIds?: string[];
  creatorOpenId?: string;
  // GitLab issue link info
  gitlabProject?: string;
  gitlabIssueIid?: number;
  gitlabIssueUrl?: string;
}

export interface TaskLinkRecord {
  id: string;
  gitlab_project: string;
  gitlab_issue_iid: number;
  gitlab_issue_url: string | null;
  feishu_task_guid: string;
  feishu_task_url: string | null;
  gitlab_status: string;
  feishu_status: string;
  created_at: string;
}

export interface FeishuTaskLinkJobPayload {
  taskGuid: string;
  taskUrl?: string;
  summary: string;
  description?: string;
  dueTimestamp?: string;
  assigneeOpenIds?: string[];
  gitlabProject: string;
  createdBy?: string;
  requestedAt?: string;
}

export interface FeishuTaskResult {
  success: boolean;
  taskGuid?: string;
  taskUrl?: string;
  error?: string;
}

/**
 * Create a Feishu task and optionally link it to a GitLab issue
 */
export async function createFeishuTask(params: CreateTaskParams): Promise<FeishuTaskResult> {
  const { summary, description, dueDate, assigneeOpenIds, creatorOpenId, gitlabProject, gitlabIssueIid, gitlabIssueUrl } = params;

  try {
    // Build task members array
    const members: Array<{ id: string; type: string; role: string }> = [];
    
    // Add assignees
    if (assigneeOpenIds?.length) {
      for (const openId of assigneeOpenIds) {
        members.push({
          id: openId,
          type: 'user',
          role: 'assignee',
        });
      }
    }

    // Build due date object (Feishu uses Unix timestamp in seconds)
    let due: { timestamp?: string; is_all_day?: boolean } | undefined;
    if (dueDate) {
      const timestamp = typeof dueDate === 'string' 
        ? Math.floor(new Date(dueDate).getTime() / 1000).toString()
        : dueDate;
      due = {
        timestamp,
        is_all_day: true,
      };
    }

    // Build description with GitLab link
    let fullDescription = description || '';
    if (gitlabIssueUrl) {
      fullDescription += `\n\n🔗 GitLab Issue: ${gitlabIssueUrl}`;
    }

    // Create task via Feishu Task V2 API
    const resp = await feishuClient.task.v2.task.create({
      params: {
        user_id_type: 'open_id',
      },
      data: {
        summary,
        description: fullDescription || undefined,
        due,
        members: members.length > 0 ? members : undefined,
        origin: {
          platform_i18n_name: { zh_cn: 'GitLab Issue', en_us: 'GitLab Issue' },
          href: gitlabIssueUrl ? {
            url: gitlabIssueUrl,
            title: `GitLab: ${gitlabProject}#${gitlabIssueIid}`,
          } : undefined,
        },
      },
    });

    const isSuccess = (resp.code === 0 || resp.code === undefined);
    
    if (!isSuccess || !resp.data?.task?.guid) {
      console.error('❌ [FeishuTask] Failed to create task:', resp);
      return { 
        success: false, 
        error: `Failed to create task: ${JSON.stringify(resp)}` 
      };
    }

    const taskGuid = resp.data.task.guid;
    const taskUrl = resp.data.task.url;

    console.log(`✅ [FeishuTask] Created task: guid=${taskGuid}`);

    // If GitLab info provided, save the link to Supabase
    if (gitlabProject && gitlabIssueIid) {
      await saveTaskLink({
        gitlabProject,
        gitlabIssueIid,
        gitlabIssueUrl: gitlabIssueUrl || null,
        feishuTaskGuid: taskGuid,
        feishuTaskUrl: taskUrl || null,
        creatorOpenId: creatorOpenId || null,
        assigneeOpenId: assigneeOpenIds?.[0] || null,
      });
    }

    return {
      success: true,
      taskGuid,
      taskUrl,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [FeishuTask] Error creating task:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Update Feishu task status
 * Note: Feishu Task V2 API uses PATCH with completed_at field
 */
export async function updateFeishuTaskStatus(
  taskGuid: string, 
  completed: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use patch API to update completion status
    // completed_at: set to current timestamp to complete, empty string to uncomplete
    const resp = await feishuClient.task.v2.task.patch({
      path: { task_guid: taskGuid },
      params: {
        user_id_type: 'open_id',
      },
      data: {
        task: {
          completed_at: completed ? Math.floor(Date.now() / 1000).toString() : '0',
        },
        update_fields: ['completed_at'],
      },
    });

    const isSuccess = (resp.code === 0 || resp.code === undefined);
    if (!isSuccess) {
      return { success: false, error: `Failed to update task: ${JSON.stringify(resp)}` };
    }

    // Update sync status in Supabase
    await supabase
      .from('gitlab_feishu_task_links')
      .update({ 
        feishu_status: completed ? 'done' : 'todo',
        last_synced_at: new Date().toISOString(),
      })
      .eq('feishu_task_guid', taskGuid);

    console.log(`✅ [FeishuTask] Updated task ${taskGuid} status: completed=${completed}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ [FeishuTask] Error updating task status:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Update Feishu task description
 */
export async function updateFeishuTaskDescription(
  taskGuid: string,
  description: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await feishuClient.task.v2.task.patch({
      path: { task_guid: taskGuid },
      params: {
        user_id_type: "open_id",
      },
      data: {
        task: {
          description,
        },
        update_fields: ["description"],
      },
    });

    const isSuccess = resp.code === 0 || resp.code === undefined;
    if (!isSuccess) {
      return { success: false, error: `Failed to update task: ${JSON.stringify(resp)}` };
    }

    console.log(`✅ [FeishuTask] Updated task description: ${taskGuid}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error updating task description:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Delete Feishu task (best-effort cleanup)
 */
export async function deleteFeishuTask(
  taskGuid: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const taskApi = (feishuClient.task.v2 as any);
    const deleteApi = taskApi?.task?.delete;
    if (typeof deleteApi !== "function") {
      return { success: false, error: "Task delete API not available" };
    }

    const resp = await deleteApi({
      path: { task_guid: taskGuid },
      params: {
        user_id_type: "open_id",
      },
    });

    const isSuccess = resp.code === 0 || resp.code === undefined;
    if (!isSuccess) {
      return { success: false, error: `Failed to delete task: ${JSON.stringify(resp)}` };
    }

    console.log(`✅ [FeishuTask] Deleted task: ${taskGuid}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error deleting task:", errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Save GitLab-Feishu task link to Supabase
 */
async function saveTaskLink(params: {
  gitlabProject: string;
  gitlabIssueIid: number;
  gitlabIssueUrl: string | null;
  feishuTaskGuid: string;
  feishuTaskUrl: string | null;
  creatorOpenId: string | null;
  assigneeOpenId: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('gitlab_feishu_task_links')
    .upsert({
      gitlab_project: params.gitlabProject,
      gitlab_issue_iid: params.gitlabIssueIid,
      gitlab_issue_url: params.gitlabIssueUrl,
      feishu_task_guid: params.feishuTaskGuid,
      feishu_task_url: params.feishuTaskUrl,
      created_by: params.creatorOpenId,
      assignee_feishu_open_id: params.assigneeOpenId,
      gitlab_status: 'opened',
      feishu_status: 'todo',
      last_synced_at: new Date().toISOString(),
    }, {
      onConflict: 'gitlab_project,gitlab_issue_iid',
    });

  if (error) {
    console.error('❌ [FeishuTask] Failed to save task link:', error);
    throw error;
  }

  console.log(`✅ [FeishuTask] Saved link: ${params.gitlabProject}#${params.gitlabIssueIid} ↔ ${params.feishuTaskGuid}`);
}

// ============================================================================
// Feishu Task Details Fetching (Phase 1.1)
// ============================================================================

export interface FeishuTaskDetails {
  guid: string;
  summary: string;
  description?: string;
  due?: { timestamp: string; is_all_day: boolean };
  members?: Array<{ id: string; type: string; role: string }>;
  completed_at?: string;
  creator?: { id: string; type: string };
  created_at?: string;
  updated_at?: string;
  custom_fields?: Array<{ guid: string; text_value?: string; number_value?: string }>;
  url?: string;
}

const TASK_API_BASE = "https://open.feishu.cn/open-apis/task/v2";

function normalizeTaskDetails(task: any): FeishuTaskDetails {
  return {
    guid: task.guid || task.task_guid || "",
    summary: task.summary || "",
    description: task.description,
    due: task.due as any,
    members: task.members as any,
    completed_at: task.completed_at,
    creator: task.creator as any,
    created_at: task.created_at,
    updated_at: task.updated_at,
    custom_fields: task.custom_fields as any,
    url: task.url,
  };
}

async function fetchTaskWithUserToken(
  taskGuid: string,
  userToken: string
): Promise<FeishuTaskDetails | null> {
  const url = new URL(`${TASK_API_BASE}/tasks/${taskGuid}`);
  url.searchParams.set("user_id_type", "open_id");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json",
    },
  });

  const data: any = await response.json();
  if (data.code !== 0 || !data.data?.task) {
    console.warn(`⚠️ [FeishuTask] User token fetch failed for ${taskGuid}:`, data);
    return null;
  }

  return normalizeTaskDetails(data.data.task);
}

/**
 * Fetch task details using user's OAuth token (bypasses follower limitation).
 */
export async function getFeishuTaskDetailsWithUserAuth(
  taskGuid: string,
  feishuUserId: string
): Promise<FeishuTaskDetails | null> {
  const userToken = await getUserAccessToken(feishuUserId);
  if (!userToken) {
    return null;
  }

  try {
    return await fetchTaskWithUserToken(taskGuid, userToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] User token error fetching task ${taskGuid}:`, errorMsg);
    return null;
  }
}

/**
 * Fetch full task details from Feishu API
 * Used when webhook only provides task_guid
 */
export async function getFeishuTaskDetails(taskGuid: string): Promise<FeishuTaskDetails | null> {
  try {
    const resp = await feishuClient.task.v2.task.get({
      path: { task_guid: taskGuid },
      params: { user_id_type: 'open_id' },
    });
    
    const isSuccess = (resp.code === 0 || resp.code === undefined);
    if (!isSuccess || !resp.data?.task) {
      console.warn(`⚠️ [FeishuTask] Failed to fetch task ${taskGuid}:`, resp);
      return null;
    }
    
    return normalizeTaskDetails(resp.data.task);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] Error fetching task ${taskGuid}:`, errorMsg);
    return null;
  }
}

export interface FeishuTasklistInfo {
  guid: string;
  name: string;
}

/**
 * List tasklists using user's OAuth token (required for personal tasklists).
 */
export async function listFeishuTasklistsWithUserAuth(
  feishuUserId: string
): Promise<FeishuTasklistInfo[]> {
  const userToken = await getUserAccessToken(feishuUserId);
  if (!userToken) {
    return [];
  }

  const tasklists: FeishuTasklistInfo[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL(`${TASK_API_BASE}/tasklists`);
      url.searchParams.set("page_size", "100");
      url.searchParams.set("user_id_type", "open_id");
      if (pageToken) {
        url.searchParams.set("page_token", pageToken);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      const data: any = await response.json();
      if (data.code !== 0) {
        console.warn(`⚠️ [FeishuTask] User token tasklist list failed:`, data);
        break;
      }

      const items = data.data?.items || [];
      for (const item of items) {
        if (item?.guid) {
          tasklists.push({
            guid: item.guid,
            name: item.name || "Unnamed",
          });
        }
      }

      pageToken = data.data?.page_token;
    } while (pageToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] Error listing tasklists:`, errorMsg);
  }

  return tasklists;
}

/**
 * List tasks in a tasklist using user's OAuth token.
 */
export async function listFeishuTasksFromTasklistWithUserAuth(
  tasklistGuid: string,
  feishuUserId: string
): Promise<FeishuTaskDetails[]> {
  const userToken = await getUserAccessToken(feishuUserId);
  if (!userToken) {
    return [];
  }

  const tasks: FeishuTaskDetails[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL(`${TASK_API_BASE}/tasklists/${tasklistGuid}/tasks`);
      url.searchParams.set("page_size", "100");
      url.searchParams.set("user_id_type", "open_id");
      if (pageToken) {
        url.searchParams.set("page_token", pageToken);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
      });

      const data: any = await response.json();
      if (data.code !== 0) {
        console.warn(`⚠️ [FeishuTask] User token tasklist tasks failed:`, data);
        break;
      }

      const items = data.data?.items || [];
      for (const item of items) {
        const taskGuid = item.task_guid || item.guid;
        if (taskGuid) {
          const taskDetails = await fetchTaskWithUserToken(taskGuid, userToken);
          if (taskDetails) {
            tasks.push(taskDetails);
          }
        }
      }

      pageToken = data.data?.page_token;
    } while (pageToken);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] Error listing tasklist tasks:`, errorMsg);
  }

  return tasks;
}

// ============================================================================
// GitLab Issue Creation from Feishu Task (Phase 1.2)
// ============================================================================

export interface GitlabIssueResult {
  success: boolean;
  issueIid?: number;
  issueUrl?: string;
  error?: string;
}

/**
 * Escape shell argument for safe command execution
 */
function escapeShellArg(arg: string): string {
  return arg.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Format Feishu timestamp to GitLab due date (YYYY-MM-DD)
 */
function formatDueDate(timestamp: string): string {
  const ts = parseInt(timestamp, 10);
  const date = new Date(ts * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Build GitLab issue description from Feishu task
 */
function buildGitlabDescription(task: FeishuTaskDetails, feishuTaskUrl?: string): string {
  let desc = task.description || '';
  
  if (feishuTaskUrl) {
    desc += `\n\n---\n🔗 **Feishu Task**: [${task.summary}](${feishuTaskUrl})`;
  } else if (task.url) {
    desc += `\n\n---\n🔗 **Feishu Task**: [${task.summary}](${task.url})`;
  }
  
  return desc;
}

/**
 * Resolve GitLab assignee from Feishu task members
 */
async function resolveGitlabAssignee(
  members?: Array<{ id: string; type: string; role: string }>
): Promise<string | null> {
  if (!members || members.length === 0) return null;
  
  // Find assignee role members
  const assignee = members.find(m => m.role === 'assignee');
  if (!assignee) return null;
  
  // Import user mapping service
  const { getGitlabUsername } = await import('./user-mapping-service');
  return getGitlabUsername(assignee.id);
}

/**
 * Create GitLab issue from Feishu task data
 */
export async function createGitlabIssueFromTask(
  task: FeishuTaskDetails,
  feishuTaskUrl?: string,
  targetProject: string = 'dpa/dpa-mom/task'
): Promise<GitlabIssueResult> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    const title = task.summary;
    const description = buildGitlabDescription(task, feishuTaskUrl);
    const assignee = await resolveGitlabAssignee(task.members);
    const dueDate = task.due?.timestamp ? formatDueDate(task.due.timestamp) : undefined;
    
    // Build glab command
    let cmd = `glab issue create -t "${escapeShellArg(title)}" -d "${escapeShellArg(description)}" -R ${targetProject}`;
    if (assignee) cmd += ` --assignee ${assignee}`;
    if (dueDate) cmd += ` --due-date ${dueDate}`;
    
    console.log(`🔧 [FeishuTask] Creating GitLab issue: ${cmd.substring(0, 100)}...`);
    
    const { stdout, stderr } = await execAsync(cmd);
    
    // Parse issue IID from output (format: "Created issue #123...")
    const match = stdout.match(/#(\d+)/);
    const issueIid = match ? parseInt(match[1]) : undefined;
    
    if (!issueIid) {
      console.warn(`⚠️ [FeishuTask] Could not parse issue IID from: ${stdout}`);
      return { 
        success: false, 
        error: `Failed to parse issue IID from glab output: ${stdout}` 
      };
    }
    
    const issueUrl = `https://git.nevint.com/${targetProject}/-/issues/${issueIid}`;
    console.log(`✅ [FeishuTask] Created GitLab issue #${issueIid}: ${issueUrl}`);
    
    return { success: true, issueIid, issueUrl };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] Error creating GitLab issue:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// GitLab Issue Update from Feishu Task (Phase 1.3)
// ============================================================================

/**
 * Update existing GitLab issue when Feishu task changes
 */
export async function updateGitlabIssueFromTask(
  issueIid: number,
  task: FeishuTaskDetails,
  changedFields: string[],
  targetProject: string = 'dpa/dpa-mom/task'
): Promise<{ success: boolean; error?: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    const updates: string[] = [];
    
    if (changedFields.includes('summary')) {
      updates.push(`-t "${escapeShellArg(task.summary)}"`);
    }
    if (changedFields.includes('description')) {
      updates.push(`-d "${escapeShellArg(task.description || '')}"`);
    }
    if (changedFields.includes('due')) {
      const dueDate = task.due?.timestamp ? formatDueDate(task.due.timestamp) : '';
      if (dueDate) {
        updates.push(`--due-date ${dueDate}`);
      }
    }
    
    if (updates.length > 0) {
      const cmd = `glab issue update ${issueIid} ${updates.join(' ')} -R ${targetProject}`;
      console.log(`🔧 [FeishuTask] Updating GitLab issue #${issueIid}: ${cmd.substring(0, 100)}...`);
      await execAsync(cmd);
    }
    
    // Handle completion status separately
    if (changedFields.includes('completed_at')) {
      if (task.completed_at && task.completed_at !== '0') {
        const cmd = `glab issue close ${issueIid} -R ${targetProject}`;
        console.log(`🔧 [FeishuTask] Closing GitLab issue #${issueIid}`);
        await execAsync(cmd);
      } else {
        const cmd = `glab issue reopen ${issueIid} -R ${targetProject}`;
        console.log(`🔧 [FeishuTask] Reopening GitLab issue #${issueIid}`);
        await execAsync(cmd);
      }
    }
    
    console.log(`✅ [FeishuTask] Updated GitLab issue #${issueIid}`);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FeishuTask] Error updating GitLab issue #${issueIid}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// Task Link Persistence (Extended)
// ============================================================================

/**
 * Save task link with extended info
 */
export async function saveTaskLinkExtended(params: {
  gitlabProject: string;
  gitlabIssueIid: number;
  gitlabIssueUrl: string;
  feishuTaskGuid: string;
  feishuTaskUrl?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('gitlab_feishu_task_links')
    .upsert({
      gitlab_project: params.gitlabProject,
      gitlab_issue_iid: params.gitlabIssueIid,
      gitlab_issue_url: params.gitlabIssueUrl,
      feishu_task_guid: params.feishuTaskGuid,
      feishu_task_url: params.feishuTaskUrl || null,
      gitlab_status: 'opened',
      feishu_status: 'todo',
      last_synced_at: new Date().toISOString(),
    }, {
      onConflict: 'feishu_task_guid',
    });

  if (error) {
    console.error('❌ [FeishuTask] Failed to save task link:', error);
    throw error;
  }

  console.log(`✅ [FeishuTask] Saved link: ${params.feishuTaskGuid} ↔ ${params.gitlabProject}#${params.gitlabIssueIid}`);
}

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Look up GitLab issue by Feishu task GUID
 */
export async function getGitlabIssueByTaskGuid(taskGuid: string): Promise<TaskLinkRecord | null> {
  const { data, error } = await supabase
    .from('gitlab_feishu_task_links')
    .select('*')
    .eq('feishu_task_guid', taskGuid)
    .single();

  if (error || !data) {
    console.warn(`⚠️ [FeishuTask] No GitLab issue found for task ${taskGuid}`);
    return null;
  }

  return data as TaskLinkRecord;
}

/**
 * Look up Feishu task by GitLab issue
 */
export async function getFeishuTaskByGitlabIssue(
  project: string, 
  issueIid: number
): Promise<TaskLinkRecord | null> {
  const { data, error } = await supabase
    .from('gitlab_feishu_task_links')
    .select('*')
    .eq('gitlab_project', project)
    .eq('gitlab_issue_iid', issueIid)
    .single();

  if (error || !data) {
    return null;
  }

  return data as TaskLinkRecord;
}

/**
 * List GitLab-Feishu task links (canonical task index)
 */
export async function listTaskLinks(params?: {
  project?: string;
  feishuStatus?: "todo" | "in_progress" | "done";
  gitlabStatus?: "opened" | "closed";
  limit?: number;
}): Promise<TaskLinkRecord[]> {
  try {
    let query = supabase
      .from("gitlab_feishu_task_links")
      .select("*")
      .order("updated_at", { ascending: false });

    if (params?.project) {
      query = query.eq("gitlab_project", params.project);
    }
    if (params?.feishuStatus) {
      query = query.eq("feishu_status", params.feishuStatus);
    }
    if (params?.gitlabStatus) {
      query = query.eq("gitlab_status", params.gitlabStatus);
    }
    if (params?.limit) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query;
    if (error || !data) {
      console.warn("⚠️ [FeishuTask] Failed to list task links:", error);
      return [];
    }

    return data as TaskLinkRecord[];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error listing task links:", errorMsg);
    return [];
  }
}

/**
 * Enqueue a task link retry job (PGMQ)
 */
export async function enqueueTaskLinkJob(
  payload: FeishuTaskLinkJobPayload
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("enqueue_feishu_task_link", {
      payload,
    });
    if (error) {
      console.error("❌ [FeishuTask] Failed to enqueue task link job:", error);
      return null;
    }

    const msgId = typeof data === "number" ? data : Number(data);
    return Number.isFinite(msgId) ? msgId : null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error enqueuing task link job:", errorMsg);
    return null;
  }
}

export interface TaskLinkQueueItem {
  msgId: number;
  readCount: number;
  enqueuedAt?: string;
  payload: FeishuTaskLinkJobPayload;
}

/**
 * Dequeue task link retry jobs (PGMQ)
 */
export async function dequeueTaskLinkJobs(params?: {
  batchSize?: number;
  visibilityTimeoutSec?: number;
}): Promise<TaskLinkQueueItem[]> {
  const batchSize = params?.batchSize ?? 5;
  const visibilityTimeoutSec = params?.visibilityTimeoutSec ?? 60;

  try {
    const { data, error } = await supabase.rpc("dequeue_feishu_task_link", {
      batch_size: batchSize,
      visibility_timeout: visibilityTimeoutSec,
    });
    if (error) {
      console.error("❌ [FeishuTask] Failed to dequeue task link jobs:", error);
      return [];
    }

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((row: any) => ({
        msgId: Number(row.msg_id),
        readCount: Number(row.read_ct || 0),
        enqueuedAt: row.enqueued_at,
        payload: (row.message || row.msg || row.payload) as FeishuTaskLinkJobPayload,
      }))
      .filter((item) => Number.isFinite(item.msgId) && !!item.payload);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error dequeuing task link jobs:", errorMsg);
    return [];
  }
}

/**
 * Ack (delete) a task link retry job (PGMQ)
 */
export async function ackTaskLinkJob(msgId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("ack_feishu_task_link", {
      msg_id: msgId,
    });
    if (error) {
      console.error("❌ [FeishuTask] Failed to ack task link job:", error);
      return false;
    }

    return Boolean(data);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [FeishuTask] Error acking task link job:", errorMsg);
    return false;
  }
}

/**
 * Update GitLab issue status in the link table
 */
export async function updateGitlabStatus(
  project: string,
  issueIid: number,
  status: 'opened' | 'closed'
): Promise<void> {
  const { error } = await supabase
    .from('gitlab_feishu_task_links')
    .update({ 
      gitlab_status: status,
      last_synced_at: new Date().toISOString(),
    })
    .eq('gitlab_project', project)
    .eq('gitlab_issue_iid', issueIid);

  if (error) {
    console.error('❌ [FeishuTask] Failed to update GitLab status:', error);
    throw error;
  }
}
