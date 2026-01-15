/**
 * Test script for Feishu Task → GitLab Integration
 * 
 * Tests the sync functionality between Feishu Tasks and GitLab Issues:
 * 1. getFeishuTaskDetails - Fetch task from Feishu API
 * 2. createGitlabIssueFromTask - Create GitLab issue from task
 * 3. updateGitlabIssueFromTask - Update GitLab issue fields
 * 4. handleTaskUpdatedEvent - Webhook event handling
 * 
 * Usage:
 *   bun run scripts/test-feishu-task-sync.ts [test-name]
 * 
 * Tests:
 *   fetch-task     - Fetch a specific task by GUID
 *   create-issue   - Create GitLab issue from mock task
 *   update-issue   - Update existing GitLab issue
 *   complete-task  - Test task completion → issue close
 *   comment-sync   - Test comment sync
 *   full-flow      - Run full integration test
 */

import { 
  getFeishuTaskDetails,
  createGitlabIssueFromTask,
  updateGitlabIssueFromTask,
  getGitlabIssueByTaskGuid,
  FeishuTaskDetails,
} from '../lib/services/feishu-task-service';
import { handleTaskUpdatedEvent, TaskUpdatedEvent } from '../lib/handlers/feishu-task-webhook-handler';
import { resolveGitlabUsername } from '../lib/services/user-mapping-service';

// Test configuration
const TEST_TASK_GUID = process.env.TEST_TASK_GUID || '';
const TEST_GITLAB_PROJECT = process.env.TEST_GITLAB_PROJECT || 'dpa/dpa-mom/task';
const TEST_ISSUE_IID = parseInt(process.env.TEST_ISSUE_IID || '0', 10);

// Colors for console output
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

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Test: Fetch task details from Feishu
 */
async function testFetchTask(): Promise<boolean> {
  log('cyan', '\n📋 Test: Fetch Feishu Task Details');
  
  if (!TEST_TASK_GUID) {
    log('yellow', '  ⚠️ Set TEST_TASK_GUID env var to test');
    return true;
  }
  
  const task = await getFeishuTaskDetails(TEST_TASK_GUID);
  
  if (!task) {
    log('red', '  ❌ Failed to fetch task');
    return false;
  }
  
  log('green', '  ✅ Task fetched successfully');
  console.log('  Task details:', {
    guid: task.guid,
    summary: task.summary,
    description: task.description?.substring(0, 50) + '...',
    due: task.due,
    membersCount: task.members?.length || 0,
    completedAt: task.completed_at,
  });
  
  return true;
}

/**
 * Test: Create GitLab issue from mock task
 */
async function testCreateIssue(): Promise<boolean> {
  log('cyan', '\n📋 Test: Create GitLab Issue from Task');
  
  const mockTask: FeishuTaskDetails = {
    guid: `test-${Date.now()}`,
    summary: `[Test] Feishu Task Sync - ${new Date().toISOString()}`,
    description: 'This is a test issue created from Feishu Task sync integration test.',
    due: {
      timestamp: Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000).toString(),
      is_all_day: true,
    },
    url: 'https://feishu.cn/task/test',
  };
  
  log('blue', '  Creating issue with:', mockTask.summary);
  
  const result = await createGitlabIssueFromTask(mockTask, mockTask.url, TEST_GITLAB_PROJECT);
  
  if (!result.success) {
    log('red', `  ❌ Failed to create issue: ${result.error}`);
    return false;
  }
  
  log('green', `  ✅ Issue created: #${result.issueIid}`);
  log('blue', `  URL: ${result.issueUrl}`);
  
  return true;
}

/**
 * Test: Update GitLab issue from task changes
 */
async function testUpdateIssue(): Promise<boolean> {
  log('cyan', '\n📋 Test: Update GitLab Issue from Task');
  
  if (!TEST_ISSUE_IID) {
    log('yellow', '  ⚠️ Set TEST_ISSUE_IID env var to test');
    return true;
  }
  
  const mockTask: FeishuTaskDetails = {
    guid: 'test-update',
    summary: `[Updated] Test Issue - ${new Date().toISOString()}`,
    description: 'Updated description from Feishu Task sync test.',
  };
  
  log('blue', `  Updating issue #${TEST_ISSUE_IID}...`);
  
  const result = await updateGitlabIssueFromTask(
    TEST_ISSUE_IID,
    mockTask,
    ['summary', 'description'],
    TEST_GITLAB_PROJECT
  );
  
  if (!result.success) {
    log('red', `  ❌ Failed to update issue: ${result.error}`);
    return false;
  }
  
  log('green', `  ✅ Issue #${TEST_ISSUE_IID} updated`);
  return true;
}

/**
 * Test: Task completion event → close GitLab issue
 */
async function testCompleteTask(): Promise<boolean> {
  log('cyan', '\n📋 Test: Task Completion Event');
  
  if (!TEST_TASK_GUID) {
    log('yellow', '  ⚠️ Set TEST_TASK_GUID env var to test with real task');
    
    // Create mock event for demonstration
    const mockEvent: TaskUpdatedEvent = {
      schema: '2.0',
      header: { event_type: 'task.task.updated_v1' },
      event: {
        task_guid: 'mock-task-guid',
        obj_type: 1,
        event_key: 'task.completed',
      },
    };
    
    log('blue', '  Simulating task.completed event (will fail without linked task)...');
    const result = await handleTaskUpdatedEvent(mockEvent);
    log('blue', `  Result: ${result.message}`);
    
    return true;
  }
  
  const event: TaskUpdatedEvent = {
    schema: '2.0',
    header: { event_type: 'task.task.updated_v1' },
    event: {
      task_guid: TEST_TASK_GUID,
      obj_type: 1,
      event_key: 'task.completed',
    },
  };
  
  log('blue', `  Sending task.completed event for ${TEST_TASK_GUID}...`);
  const result = await handleTaskUpdatedEvent(event);
  
  if (!result.success) {
    log('red', `  ❌ Event handling failed: ${result.message}`);
    return false;
  }
  
  log('green', `  ✅ ${result.message}`);
  return true;
}

/**
 * Test: Comment sync
 */
async function testCommentSync(): Promise<boolean> {
  log('cyan', '\n📋 Test: Comment Sync');
  
  if (!TEST_TASK_GUID) {
    log('yellow', '  ⚠️ Set TEST_TASK_GUID env var to test');
    return true;
  }
  
  const event: TaskUpdatedEvent = {
    schema: '2.0',
    header: { event_type: 'task.task.comment_created_v1' },
    event: {
      task_guid: TEST_TASK_GUID,
      obj_type: 1,
      event_key: 'task.comment.created',
      comment_guid: 'test-comment-guid',
    },
  };
  
  log('blue', `  Sending task.comment.created event...`);
  const result = await handleTaskUpdatedEvent(event);
  
  log('blue', `  Result: ${result.message}`);
  return true;
}

/**
 * Test: User mapping resolution
 */
async function testUserMapping(): Promise<boolean> {
  log('cyan', '\n📋 Test: User Mapping Resolution');
  
  const testOpenId = process.env.TEST_FEISHU_OPEN_ID || '';
  
  if (!testOpenId) {
    log('yellow', '  ⚠️ Set TEST_FEISHU_OPEN_ID env var to test');
    return true;
  }
  
  log('blue', `  Resolving GitLab username for ${testOpenId}...`);
  const username = await resolveGitlabUsername(testOpenId);
  
  if (username) {
    log('green', `  ✅ Resolved: ${testOpenId} → ${username}`);
  } else {
    log('yellow', `  ⚠️ Could not resolve username`);
  }
  
  return true;
}

/**
 * Test: Full integration flow
 */
async function testFullFlow(): Promise<boolean> {
  log('cyan', '\n📋 Test: Full Integration Flow');
  log('blue', '  This test simulates the complete Feishu Task → GitLab flow');
  
  // Step 1: Create a task (simulated)
  const mockTask: FeishuTaskDetails = {
    guid: `integration-test-${Date.now()}`,
    summary: `[Integration] Full Flow Test - ${new Date().toISOString()}`,
    description: 'Testing the complete Feishu Task → GitLab sync flow.',
    due: {
      timestamp: Math.floor((Date.now() + 3 * 24 * 60 * 60 * 1000) / 1000).toString(),
      is_all_day: true,
    },
    url: 'https://feishu.cn/task/integration-test',
  };
  
  // Step 2: Handle task.created event
  log('blue', '\n  Step 1: Simulating task.created event...');
  const createEvent: TaskUpdatedEvent = {
    schema: '2.0',
    header: { event_type: 'task.task.created_v1' },
    event: {
      task_guid: mockTask.guid,
      obj_type: 1,
      event_key: 'task.created',
    },
  };
  
  // Note: This will try to fetch task from Feishu API which will fail for mock task
  // In real scenario, the task would exist in Feishu
  const createResult = await handleTaskUpdatedEvent(createEvent);
  log('blue', `  Result: ${createResult.message}`);
  
  // Step 3: Direct issue creation (bypass API fetch)
  log('blue', '\n  Step 2: Creating GitLab issue directly...');
  const issueResult = await createGitlabIssueFromTask(mockTask, mockTask.url, TEST_GITLAB_PROJECT);
  
  if (!issueResult.success) {
    log('red', `  ❌ Issue creation failed: ${issueResult.error}`);
    return false;
  }
  
  log('green', `  ✅ Created issue #${issueResult.issueIid}`);
  
  // Step 4: Update issue
  log('blue', '\n  Step 3: Updating issue...');
  mockTask.summary = `[Updated] ${mockTask.summary}`;
  const updateResult = await updateGitlabIssueFromTask(
    issueResult.issueIid!,
    mockTask,
    ['summary'],
    TEST_GITLAB_PROJECT
  );
  
  if (!updateResult.success) {
    log('yellow', `  ⚠️ Update failed: ${updateResult.error}`);
  } else {
    log('green', '  ✅ Issue updated');
  }
  
  log('green', '\n✅ Full flow test completed');
  log('blue', `  Issue URL: ${issueResult.issueUrl}`);
  
  return true;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function runTests() {
  const testName = process.argv[2] || 'all';
  
  console.log('═'.repeat(60));
  log('cyan', '🧪 Feishu Task → GitLab Integration Test Suite');
  console.log('═'.repeat(60));
  console.log(`  Project: ${TEST_GITLAB_PROJECT}`);
  console.log(`  Task GUID: ${TEST_TASK_GUID || '(not set)'}`);
  console.log(`  Issue IID: ${TEST_ISSUE_IID || '(not set)'}`);
  console.log('═'.repeat(60));
  
  const tests: Record<string, () => Promise<boolean>> = {
    'fetch-task': testFetchTask,
    'create-issue': testCreateIssue,
    'update-issue': testUpdateIssue,
    'complete-task': testCompleteTask,
    'comment-sync': testCommentSync,
    'user-mapping': testUserMapping,
    'full-flow': testFullFlow,
  };
  
  let passed = 0;
  let failed = 0;
  
  if (testName === 'all') {
    for (const [name, testFn] of Object.entries(tests)) {
      try {
        const result = await testFn();
        if (result) passed++;
        else failed++;
      } catch (error) {
        log('red', `  ❌ Test "${name}" threw error:`, error);
        failed++;
      }
    }
  } else if (tests[testName]) {
    try {
      const result = await tests[testName]();
      if (result) passed++;
      else failed++;
    } catch (error) {
      log('red', `  ❌ Test "${testName}" threw error:`, error);
      failed++;
    }
  } else {
    log('red', `Unknown test: ${testName}`);
    log('yellow', `Available tests: ${Object.keys(tests).join(', ')}`);
    process.exit(1);
  }
  
  console.log('\n' + '═'.repeat(60));
  log('cyan', '📊 Test Results');
  console.log('═'.repeat(60));
  log('green', `  Passed: ${passed}`);
  if (failed > 0) log('red', `  Failed: ${failed}`);
  console.log('═'.repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  log('red', '❌ Test runner error:', error);
  process.exit(1);
});
