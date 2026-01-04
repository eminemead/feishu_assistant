/**
 * Feishu Task Webhook Handler
 * 
 * Handles task.task.updated_v1 events from Feishu to sync task status to GitLab issues.
 * 
 * When a Feishu task is completed/uncompleted, this handler:
 * 1. Looks up the linked GitLab issue
 * 2. Updates the GitLab issue status via glab CLI
 * 3. Updates the sync record in Supabase
 */

import { 
  getGitlabIssueByTaskGuid, 
  updateGitlabStatus,
  updateFeishuTaskStatus 
} from '../services/feishu-task-service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TaskUpdatedEvent {
  schema: string;
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
    tenant_key: string;
  };
  event: {
    task_guid: string;
    obj_type: number;
    event_key: string;
  };
}

export interface TaskEventPayload {
  task_guid: string;
  is_completed?: boolean;
  completed_at?: string;
}

/**
 * Handle Feishu task update webhook event
 */
export async function handleTaskUpdatedEvent(event: TaskUpdatedEvent): Promise<{ success: boolean; message: string }> {
  const { task_guid, event_key } = event.event;
  
  console.log(`📋 [TaskWebhook] Received task update: guid=${task_guid}, event=${event_key}`);
  
  // event_key values: task.completed, task.uncompleted, task.updated, etc.
  const isCompleted = event_key === 'task.completed';
  const isUncompleted = event_key === 'task.uncompleted';
  
  if (!isCompleted && !isUncompleted) {
    console.log(`ℹ️ [TaskWebhook] Ignoring event_key: ${event_key}`);
    return { success: true, message: `Ignored event: ${event_key}` };
  }
  
  // Look up linked GitLab issue
  const link = await getGitlabIssueByTaskGuid(task_guid);
  if (!link) {
    console.log(`ℹ️ [TaskWebhook] No GitLab issue linked to task ${task_guid}`);
    return { success: true, message: 'No linked GitLab issue' };
  }
  
  const { gitlab_project, gitlab_issue_iid } = link;
  
  try {
    if (isCompleted) {
      // Close the GitLab issue
      console.log(`🔄 [TaskWebhook] Closing GitLab issue: ${gitlab_project}#${gitlab_issue_iid}`);
      await closeGitlabIssue(gitlab_project, gitlab_issue_iid);
      await updateGitlabStatus(gitlab_project, gitlab_issue_iid, 'closed');
      
      return { 
        success: true, 
        message: `Closed GitLab issue ${gitlab_project}#${gitlab_issue_iid}` 
      };
    } else {
      // Reopen the GitLab issue
      console.log(`🔄 [TaskWebhook] Reopening GitLab issue: ${gitlab_project}#${gitlab_issue_iid}`);
      await reopenGitlabIssue(gitlab_project, gitlab_issue_iid);
      await updateGitlabStatus(gitlab_project, gitlab_issue_iid, 'opened');
      
      return { 
        success: true, 
        message: `Reopened GitLab issue ${gitlab_project}#${gitlab_issue_iid}` 
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [TaskWebhook] Failed to update GitLab issue: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

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
  const link = await getGitlabIssueByTaskGuid(`${project}#${issueIid}`);
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
  }
}
