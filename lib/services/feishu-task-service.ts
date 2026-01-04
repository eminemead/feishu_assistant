/**
 * Feishu Task Service
 * 
 * Provides APIs for creating/updating Feishu tasks and syncing with GitLab issues.
 * Uses Feishu Task V2 API: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/task-v2
 */

import { client as feishuClient } from '../feishu-utils';
import { createClient } from '@supabase/supabase-js';

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
