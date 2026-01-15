#!/usr/bin/env bun
/**
 * Sync a Single Feishu Task to GitLab
 * 
 * Usage:
 *   # Sync by task GUID
 *   bun run scripts/sync-single-task.ts <task_guid>
 * 
 *   # Sync by Feishu task URL
 *   bun run scripts/sync-single-task.ts "https://feishu.cn/task/xxx"
 * 
 *   # Sync multiple tasks
 *   bun run scripts/sync-single-task.ts guid1 guid2 guid3
 * 
 * Examples:
 *   bun run scripts/sync-single-task.ts 8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d
 *   bun run scripts/sync-single-task.ts "https://feishu.cn/task/8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d"
 */

import {
  getFeishuTaskDetails,
  createGitlabIssueFromTask,
  saveTaskLinkExtended,
  getGitlabIssueByTaskGuid,
} from '../lib/services/feishu-task-service';
import { createClient } from '@supabase/supabase-js';

const GITLAB_PROJECT = process.env.GITLAB_PROJECT || process.env.FEISHU_TASK_GITLAB_PROJECT || 'dpa/dpa-mom/task';

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

/**
 * Extract task GUID from URL or return as-is if already a GUID
 */
function extractTaskGuid(input: string): string {
  // If it's a URL, extract the GUID
  if (input.includes('feishu.cn/task/')) {
    const match = input.match(/task\/([a-f0-9-]+)/i);
    return match ? match[1] : input;
  }
  // Otherwise assume it's already a GUID
  return input.trim();
}

/**
 * Check if task is already linked
 */
async function isTaskLinked(taskGuid: string): Promise<{ linked: boolean; issueIid?: number }> {
  const { data } = await supabase
    .from('gitlab_feishu_task_links')
    .select('gitlab_issue_iid')
    .eq('feishu_task_guid', taskGuid)
    .single();
  
  return { linked: !!data, issueIid: data?.gitlab_issue_iid };
}

/**
 * Sync a single task
 */
async function syncTask(input: string): Promise<boolean> {
  const taskGuid = extractTaskGuid(input);
  
  log('blue', `\n📋 Syncing task: ${taskGuid}`);
  
  // Check if already linked
  const { linked, issueIid } = await isTaskLinked(taskGuid);
  if (linked) {
    log('yellow', `   ⚠️ Task already linked to GitLab issue #${issueIid}`);
    return true;
  }
  
  // Fetch task details
  log('blue', `   Fetching task details...`);
  const task = await getFeishuTaskDetails(taskGuid);
  
  if (!task) {
    log('red', `   ❌ Failed to fetch task. Check if GUID is correct and app has permission.`);
    return false;
  }
  
  log('green', `   ✅ Task: ${task.summary}`);
  console.log(`      Description: ${task.description?.substring(0, 60) || '(none)'}...`);
  console.log(`      Completed: ${task.completed_at && task.completed_at !== '0' ? 'Yes' : 'No'}`);
  console.log(`      Due: ${task.due?.timestamp ? new Date(parseInt(task.due.timestamp) * 1000).toISOString().split('T')[0] : 'None'}`);
  
  // Create GitLab issue
  log('blue', `   Creating GitLab issue...`);
  const result = await createGitlabIssueFromTask(task, task.url, GITLAB_PROJECT);
  
  if (!result.success) {
    log('red', `   ❌ Failed to create issue: ${result.error}`);
    return false;
  }
  
  // Save link
  await saveTaskLinkExtended({
    gitlabProject: GITLAB_PROJECT,
    gitlabIssueIid: result.issueIid!,
    gitlabIssueUrl: result.issueUrl!,
    feishuTaskGuid: taskGuid,
    feishuTaskUrl: task.url,
  });
  
  // Close issue if task is completed
  if (task.completed_at && task.completed_at !== '0') {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    await execAsync(`glab issue close ${result.issueIid} -R ${GITLAB_PROJECT}`);
    log('yellow', `   📌 Issue closed (task was completed)`);
  }
  
  log('green', `   ✅ Created GitLab issue #${result.issueIid}`);
  log('cyan', `   🔗 ${result.issueUrl}`);
  
  return true;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: bun run scripts/sync-single-task.ts <task_guid_or_url> [more_guids...]

Examples:
  bun run scripts/sync-single-task.ts 8a9b0c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d
  bun run scripts/sync-single-task.ts "https://feishu.cn/task/8a9b0c1d"
  bun run scripts/sync-single-task.ts guid1 guid2 guid3

Environment:
  GITLAB_PROJECT - Target GitLab project (default: dpa/dpa-mom/task)
`);
    process.exit(1);
  }
  
  console.log('═'.repeat(60));
  log('cyan', '🚀 Feishu Task → GitLab Sync');
  console.log('═'.repeat(60));
  console.log(`  Target Project: ${GITLAB_PROJECT}`);
  console.log(`  Tasks to sync: ${args.length}`);
  console.log('═'.repeat(60));
  
  let success = 0;
  let failed = 0;
  
  for (const arg of args) {
    const result = await syncTask(arg);
    if (result) success++;
    else failed++;
  }
  
  console.log('\n' + '═'.repeat(60));
  log('cyan', '📊 Summary');
  console.log('═'.repeat(60));
  log('green', `  Success: ${success}`);
  if (failed > 0) log('red', `  Failed: ${failed}`);
  console.log('═'.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  log('red', '❌ Error:', error);
  process.exit(1);
});
