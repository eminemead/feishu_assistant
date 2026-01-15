/**
 * Migration Script: Sync Existing Feishu Tasks → GitLab
 * 
 * This script fetches existing Feishu tasks and creates corresponding GitLab issues.
 * 
 * Usage:
 *   # Dry run (preview what would be synced)
 *   bun run scripts/migrate-feishu-tasks-to-gitlab.ts --dry-run
 * 
 *   # Sync all tasks from a specific tasklist
 *   FEISHU_TASKLIST_GUID=xxx bun run scripts/migrate-feishu-tasks-to-gitlab.ts
 * 
 *   # Sync with specific project
 *   GITLAB_PROJECT=dpa/dpa-mom/task bun run scripts/migrate-feishu-tasks-to-gitlab.ts
 * 
 *   # Limit number of tasks to sync
 *   bun run scripts/migrate-feishu-tasks-to-gitlab.ts --limit 10
 * 
 * Environment Variables:
 *   FEISHU_TASKLIST_GUID  - Tasklist GUID to fetch tasks from (optional, fetches user's tasks if not set)
 *   GITLAB_PROJECT        - Target GitLab project (default: dpa/dpa-mom/task)
 *   SKIP_COMPLETED        - Skip completed tasks (default: false)
 */

import { client as feishuClient } from '../lib/feishu-utils';
import { createClient } from '@supabase/supabase-js';
import {
  createGitlabIssueFromTask,
  saveTaskLinkExtended,
  getGitlabIssueByTaskGuid,
  FeishuTaskDetails,
} from '../lib/services/feishu-task-service';

// Configuration
const TASKLIST_GUID = process.env.FEISHU_TASKLIST_GUID || '';
const GITLAB_PROJECT = process.env.GITLAB_PROJECT || process.env.FEISHU_TASK_GITLAB_PROJECT || 'dpa/dpa-mom/task';
const SKIP_COMPLETED = process.env.SKIP_COMPLETED === 'true';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0', 10);

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

interface MigrationStats {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  alreadyLinked: number;
}

/**
 * Fetch tasks from Feishu tasklist
 * Feishu Task V2 API requires fetching from specific tasklists
 */
async function fetchTasksFromTasklist(tasklistGuid: string): Promise<FeishuTaskDetails[]> {
  const tasks: FeishuTaskDetails[] = [];
  let pageToken: string | undefined;
  
  log('dim', `   Fetching from tasklist: ${tasklistGuid}`);
  
  try {
    do {
      // Use tasklist.listTasks to get tasks from a specific tasklist
      const resp = await (feishuClient.task.v2 as any).tasklist.listTasks({
        path: { tasklist_guid: tasklistGuid },
        params: {
          page_size: 100,
          page_token: pageToken,
          user_id_type: 'open_id',
        },
      });
      
      const isSuccess = (resp.code === 0 || resp.code === undefined);
      if (!isSuccess) {
        log('yellow', `   ⚠️ Tasklist API error (code: ${resp.code}), trying alternative...`);
        break;
      }
      
      const items = resp.data?.items || [];
      for (const item of items) {
        // Each item has task_guid, we need to fetch full details
        const taskGuid = item.task_guid || item.guid;
        if (taskGuid) {
          const taskDetails = await fetchTaskDetails(taskGuid);
          if (taskDetails) {
            tasks.push(taskDetails);
          }
        }
      }
      
      pageToken = resp.data?.page_token;
      log('dim', `   Fetched ${tasks.length} tasks so far...`);
      
    } while (pageToken);
  } catch (error) {
    log('yellow', `   ⚠️ Error fetching from tasklist:`, error instanceof Error ? error.message : error);
  }
  
  return tasks;
}

/**
 * Fetch single task details
 */
async function fetchTaskDetails(taskGuid: string): Promise<FeishuTaskDetails | null> {
  try {
    const resp = await feishuClient.task.v2.task.get({
      path: { task_guid: taskGuid },
      params: { user_id_type: 'open_id' },
    });
    
    const isSuccess = (resp.code === 0 || resp.code === undefined);
    if (!isSuccess || !resp.data?.task) {
      return null;
    }
    
    const task = resp.data.task;
    return {
      guid: task.guid!,
      summary: task.summary || '',
      description: task.description,
      due: task.due as any,
      members: task.members as any,
      completed_at: task.completed_at,
      creator: task.creator as any,
      created_at: task.created_at,
      updated_at: task.updated_at,
      url: task.url,
    };
  } catch {
    return null;
  }
}

/**
 * List available tasklists
 */
async function listTasklists(): Promise<Array<{ guid: string; name: string }>> {
  const tasklists: Array<{ guid: string; name: string }> = [];
  let pageToken: string | undefined;
  
  try {
    do {
      const resp = await (feishuClient.task.v2 as any).tasklist.list({
        params: {
          page_size: 100,
          page_token: pageToken,
          user_id_type: 'open_id',
        },
      });
      
      const isSuccess = (resp.code === 0 || resp.code === undefined);
      if (!isSuccess) {
        break;
      }
      
      const items = resp.data?.items || [];
      for (const item of items) {
        tasklists.push({
          guid: item.guid,
          name: item.name || 'Unnamed',
        });
      }
      
      pageToken = resp.data?.page_token;
    } while (pageToken);
  } catch (error) {
    log('yellow', `   ⚠️ Error listing tasklists:`, error instanceof Error ? error.message : error);
  }
  
  return tasklists;
}

/**
 * Fetch tasks from Feishu
 * Strategy:
 * 1. If TASKLIST_GUID is set, fetch from that tasklist
 * 2. If TASK_GUIDS env var is set, fetch those specific tasks
 * 3. Otherwise, list tasklists and let user choose
 */
async function fetchFeishuTasks(): Promise<FeishuTaskDetails[]> {
  const tasks: FeishuTaskDetails[] = [];
  
  log('blue', `\n📋 Fetching tasks from Feishu...`);
  
  // Option 1: Specific task GUIDs provided
  const taskGuids = process.env.TASK_GUIDS?.split(',').map(g => g.trim()).filter(Boolean);
  if (taskGuids && taskGuids.length > 0) {
    log('dim', `   Fetching ${taskGuids.length} specific tasks...`);
    
    for (const guid of taskGuids) {
      const task = await fetchTaskDetails(guid);
      if (task) {
        tasks.push(task);
        log('dim', `   ✓ Fetched: ${task.summary.substring(0, 40)}...`);
      } else {
        log('yellow', `   ⚠️ Could not fetch task: ${guid}`);
      }
    }
    
    log('green', `   ✅ Found ${tasks.length} tasks`);
    return tasks;
  }
  
  // Option 2: Specific tasklist
  if (TASKLIST_GUID) {
    const tasklistTasks = await fetchTasksFromTasklist(TASKLIST_GUID);
    tasks.push(...tasklistTasks);
    log('green', `   ✅ Found ${tasks.length} tasks from tasklist`);
    return tasks;
  }
  
  // Option 3: List available tasklists
  log('dim', `   No tasklist specified, listing available tasklists...`);
  const tasklists = await listTasklists();
  
  if (tasklists.length === 0) {
    log('yellow', `   ⚠️ No tasklists found. Please specify TASK_GUIDS or FEISHU_TASKLIST_GUID`);
    log('dim', `\n   Example:`);
    log('dim', `   TASK_GUIDS="guid1,guid2,guid3" bun run scripts/migrate-feishu-tasks-to-gitlab.ts`);
    log('dim', `   FEISHU_TASKLIST_GUID="xxx" bun run scripts/migrate-feishu-tasks-to-gitlab.ts`);
    return tasks;
  }
  
  log('cyan', `\n   Available tasklists:`);
  for (const tl of tasklists) {
    log('dim', `   - ${tl.name} (${tl.guid})`);
  }
  log('yellow', `\n   Set FEISHU_TASKLIST_GUID to one of these and re-run.`);
  
  // Fetch from all tasklists if --all flag is set
  if (process.argv.includes('--all')) {
    log('blue', `\n   --all flag detected, fetching from all tasklists...`);
    for (const tl of tasklists) {
      const tasklistTasks = await fetchTasksFromTasklist(tl.guid);
      tasks.push(...tasklistTasks);
    }
    log('green', `   ✅ Found ${tasks.length} total tasks`);
  }
  
  return tasks;
}

/**
 * Check if task is already linked to GitLab
 */
async function isTaskLinked(taskGuid: string): Promise<boolean> {
  const { data } = await supabase
    .from('gitlab_feishu_task_links')
    .select('id')
    .eq('feishu_task_guid', taskGuid)
    .single();
  
  return !!data;
}

/**
 * Migrate a single task to GitLab
 */
async function migrateTask(
  task: FeishuTaskDetails, 
  index: number, 
  total: number
): Promise<'synced' | 'skipped' | 'failed' | 'already_linked'> {
  const prefix = `[${index + 1}/${total}]`;
  
  // Check if already linked
  if (await isTaskLinked(task.guid)) {
    log('dim', `${prefix} ⏭️  Already linked: ${task.summary.substring(0, 50)}...`);
    return 'already_linked';
  }
  
  // Skip completed tasks if configured
  if (SKIP_COMPLETED && task.completed_at && task.completed_at !== '0') {
    log('dim', `${prefix} ⏭️  Skipping completed: ${task.summary.substring(0, 50)}...`);
    return 'skipped';
  }
  
  // Dry run mode
  if (DRY_RUN) {
    log('yellow', `${prefix} 🔍 Would sync: ${task.summary.substring(0, 50)}...`);
    console.log(`       GUID: ${task.guid}`);
    console.log(`       Completed: ${task.completed_at ? 'Yes' : 'No'}`);
    console.log(`       Due: ${task.due?.timestamp || 'None'}`);
    return 'synced';
  }
  
  // Create GitLab issue
  log('blue', `${prefix} 🔄 Syncing: ${task.summary.substring(0, 50)}...`);
  
  try {
    const result = await createGitlabIssueFromTask(task, task.url, GITLAB_PROJECT);
    
    if (!result.success) {
      log('red', `${prefix} ❌ Failed: ${result.error}`);
      return 'failed';
    }
    
    // Save link
    await saveTaskLinkExtended({
      gitlabProject: GITLAB_PROJECT,
      gitlabIssueIid: result.issueIid!,
      gitlabIssueUrl: result.issueUrl!,
      feishuTaskGuid: task.guid,
      feishuTaskUrl: task.url,
    });
    
    // If task is completed, close the GitLab issue
    if (task.completed_at && task.completed_at !== '0') {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync(`glab issue close ${result.issueIid} -R ${GITLAB_PROJECT}`);
      log('dim', `       Closed issue (task was completed)`);
    }
    
    log('green', `${prefix} ✅ Created #${result.issueIid}: ${result.issueUrl}`);
    return 'synced';
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('red', `${prefix} ❌ Error: ${errorMsg}`);
    return 'failed';
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('═'.repeat(70));
  log('cyan', '🚀 Feishu Tasks → GitLab Migration');
  console.log('═'.repeat(70));
  console.log(`  Target Project: ${GITLAB_PROJECT}`);
  console.log(`  Tasklist GUID:  ${TASKLIST_GUID || '(all tasks)'}`);
  console.log(`  Skip Completed: ${SKIP_COMPLETED}`);
  console.log(`  Dry Run:        ${DRY_RUN}`);
  console.log(`  Limit:          ${LIMIT || 'None'}`);
  console.log('═'.repeat(70));
  
  if (DRY_RUN) {
    log('yellow', '\n⚠️  DRY RUN MODE - No changes will be made\n');
  }
  
  // Fetch tasks
  let tasks = await fetchFeishuTasks();
  
  if (tasks.length === 0) {
    log('yellow', '\n⚠️  No tasks found to migrate');
    return;
  }
  
  // Apply limit
  if (LIMIT > 0 && tasks.length > LIMIT) {
    log('yellow', `\n⚠️  Limiting to first ${LIMIT} tasks`);
    tasks = tasks.slice(0, LIMIT);
  }
  
  // Migration stats
  const stats: MigrationStats = {
    total: tasks.length,
    synced: 0,
    skipped: 0,
    failed: 0,
    alreadyLinked: 0,
  };
  
  log('blue', `\n📤 Migrating ${tasks.length} tasks to GitLab...\n`);
  
  // Process each task
  for (let i = 0; i < tasks.length; i++) {
    const result = await migrateTask(tasks[i], i, tasks.length);
    
    switch (result) {
      case 'synced': stats.synced++; break;
      case 'skipped': stats.skipped++; break;
      case 'failed': stats.failed++; break;
      case 'already_linked': stats.alreadyLinked++; break;
    }
    
    // Rate limiting - avoid overwhelming GitLab API
    if (!DRY_RUN && i < tasks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // Print summary
  console.log('\n' + '═'.repeat(70));
  log('cyan', '📊 Migration Summary');
  console.log('═'.repeat(70));
  console.log(`  Total Tasks:    ${stats.total}`);
  log('green', `  Synced:         ${stats.synced}`);
  log('dim', `  Already Linked: ${stats.alreadyLinked}`);
  log('yellow', `  Skipped:        ${stats.skipped}`);
  if (stats.failed > 0) {
    log('red', `  Failed:         ${stats.failed}`);
  }
  console.log('═'.repeat(70));
  
  if (DRY_RUN) {
    log('yellow', '\n💡 Run without --dry-run to actually migrate tasks');
  }
}

// Run migration
runMigration().catch(error => {
  log('red', '❌ Migration error:', error);
  process.exit(1);
});
