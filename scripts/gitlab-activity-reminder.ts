#!/usr/bin/env bun
/**
 * GitLab Issue Activity Reminder
 *
 * Checks dpa/dpa-mom/task for members who haven't created/updated issues recently.
 * Sends reminder to Feishu group chat.
 *
 * Usage:
 *   bun run scripts/gitlab-activity-reminder.ts [--days 7] [--dry-run]
 */

import { execSync } from 'child_process';
import { client } from '../lib/feishu-utils';

const GROUP_PATH = 'dpa/dpa-mom';
const PROJECT_PATH = 'dpa/dpa-mom/task';
const DEFAULT_DAYS = 7;
const DEFAULT_CHAT_ID =
  process.env.FEISHU_PUBLISH_CHAT_ID ||
  'oc_c6c0874d4020e0d3b48d1fce2b62656b';

interface CliArgs {
  days: number;
  dryRun: boolean;
  chatId: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    days: DEFAULT_DAYS,
    dryRun: false,
    chatId: DEFAULT_CHAT_ID,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      result.days = parseInt(args[++i], 10);
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    } else if (args[i] === '--chat-id' && args[i + 1]) {
      result.chatId = args[++i];
    }
  }

  return result;
}

function runGlab(cmd: string): string {
  try {
    return execSync(`glab ${cmd}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(`glab command failed: ${error.stderr || error.message}`);
  }
}

function getGroupMembers(): string[] {
  const json = runGlab(`api "groups/${encodeURIComponent(GROUP_PATH)}/members/all"`);
  const members = JSON.parse(json) as Array<{ username: string }>;
  return members.map((m) => m.username);
}

interface Issue {
  author: { username: string };
  assignees?: Array<{ username: string }>;
  created_at: string;
  updated_at: string;
}

function getProjectIssues(): Issue[] {
  const json = runGlab(`issue list --repo ${PROJECT_PATH} --all --per-page 100 --output json`);
  return JSON.parse(json) as Issue[];
}

function getActiveUsers(issues: Issue[], cutoffDate: Date): Set<string> {
  const active = new Set<string>();

  for (const issue of issues) {
    const updatedAt = new Date(issue.updated_at);
    if (updatedAt >= cutoffDate) {
      // Author is active
      active.add(issue.author.username);
      // Assignees are also considered active if issue was updated
      for (const assignee of issue.assignees || []) {
        active.add(assignee.username);
      }
    }
  }

  return active;
}

async function sendFeishuReminder(
  chatId: string,
  inactiveUsers: string[]
): Promise<string> {
  const mentions = inactiveUsers
    .map((u) => `<at user_id="${u}">${u}</at>`)
    .join(' ');

  const text = `📋 Weekly Issue Activity Reminder

以下同学近7天未在 GitLab ${PROJECT_PATH} 创建或更新 issue：
${mentions}

请记得及时更新工作进展 🙏`;

  const resp = await client.im.message.create({
    params: { receive_id_type: 'chat_id' },
    data: {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    },
  });

  const isSuccess = resp.code === 0 || resp.code === undefined;
  if (!isSuccess || !resp.data?.message_id) {
    throw new Error(`Failed to send message: ${JSON.stringify(resp)}`);
  }

  return resp.data.message_id;
}

async function main() {
  const args = parseArgs();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - args.days);

  console.log(`📊 GitLab Activity Check`);
  console.log(`   Project: ${PROJECT_PATH}`);
  console.log(`   Lookback: ${args.days} days (since ${cutoffDate.toISOString().split('T')[0]})`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log();

  // Fetch data
  console.log('🔍 Fetching group members...');
  const members = getGroupMembers();
  console.log(`   Found ${members.length} members: ${members.join(', ')}`);

  console.log('🔍 Fetching project issues...');
  const issues = getProjectIssues();
  console.log(`   Found ${issues.length} issues`);

  // Find active users
  const activeUsers = getActiveUsers(issues, cutoffDate);
  console.log(`\n✅ Active users (${activeUsers.size}): ${[...activeUsers].join(', ')}`);

  // Find inactive users
  const inactiveUsers = members.filter((m) => !activeUsers.has(m));
  console.log(`\n⚠️  Inactive users (${inactiveUsers.length}): ${inactiveUsers.join(', ')}`);

  if (inactiveUsers.length === 0) {
    console.log('\n🎉 Everyone has been active! No reminder needed.');
    return;
  }

  if (args.dryRun) {
    console.log('\n[DRY RUN] Would send reminder to:', args.chatId);
    console.log('[DRY RUN] Mentioning:', inactiveUsers.join(', '));
    return;
  }

  // Send reminder
  console.log(`\n📤 Sending Feishu reminder to ${args.chatId}...`);
  const messageId = await sendFeishuReminder(args.chatId, inactiveUsers);
  console.log(`✅ Sent! message_id: ${messageId}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
