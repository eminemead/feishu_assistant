#!/usr/bin/env bun
/**
 * Seed Team Working Memory
 * 
 * Pre-inject working memory profiles for known team members.
 * Run: bun run scripts/seed-team-memory.ts
 * 
 * Requires: SUPABASE_DATABASE_URL env var
 */

import { getSharedStorage, getMemoryResourceId } from '../lib/memory-factory';
import { Memory } from '@mastra/memory';

// ============================================================
// TEAM PROFILES - Edit this section with your team info
// ============================================================

interface TeamMember {
  feishuUserId: string;  // Feishu open_id or user_id
  profile: {
    name: string;
    language: 'zh-CN' | 'en' | 'auto';
    role: string;
    scope?: string;
    // Analysis preferences
    format?: 'table' | 'chart' | 'summary' | 'detailed';
    comparison?: 'MoM' | 'WoW' | 'custom';
    chartPreference?: 'heatmap' | 'bar' | 'line' | 'auto';
    detailLevel?: 'concise' | 'standard' | 'deep';
    // OKR focus
    focusBrands?: string[];
    keyMetrics?: string[];
    focusTeams?: string[];
    // Team collaboration
    gitlabProjects?: string[];
    keyChats?: string[];
    trackedDocs?: string[];
    // Notes
    notes?: string;
  };
}

// TODO: Replace with actual Feishu user IDs and profiles
const TEAM_MEMBERS: TeamMember[] = [
  {
    feishuUserId: 'ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Ian
    profile: {
      name: 'Ian',
      language: 'zh-CN',
      role: 'lead',
      scope: 'DPA团队负责人',
      format: 'chart',
      comparison: 'MoM',
      chartPreference: 'heatmap',
      detailLevel: 'standard',
      focusBrands: ['NIO', 'ALPS', 'Firefly'],
      keyMetrics: ['has_metric_percentage', 'completion_rate'],
      focusTeams: ['数据平台', '数据分析'],
      gitlabProjects: ['dpa/feishu-assistant'],
      notes: '团队负责人，关注全局OKR进展',
    },
  },
  // Add more team members here...
  // {
  //   feishuUserId: 'ou_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
  //   profile: {
  //     name: 'Alice',
  //     language: 'zh-CN',
  //     role: '团队成员',
  //     scope: '负责NIO品牌OKR',
  //     focusBrands: ['NIO'],
  //     ...
  //   },
  // },
];

// ============================================================
// TEMPLATE GENERATION - Converts profile to markdown template
// ============================================================

function generateWorkingMemory(profile: TeamMember['profile']): string {
  const lines: string[] = [
    '# 用户画像 (User Profile)',
    '',
    '## 身份信息 (Identity)',
    `- **姓名/Name**: ${profile.name}`,
    `- **语言偏好/Language**: ${profile.language}`,
    `- **角色/Role**: ${profile.role}`,
    `- **职责范围/Scope**: ${profile.scope || ''}`,
    '',
    '## 分析偏好 (Analysis Preferences)',
    `- **首选呈现方式/Format**: ${profile.format || 'auto'}`,
    `- **默认对比周期/Default Comparison**: ${profile.comparison || 'MoM'}`,
    `- **图表类型偏好/Chart Preference**: ${profile.chartPreference || 'auto'}`,
    `- **详细程度/Detail Level**: ${profile.detailLevel || 'standard'}`,
    '',
    '## OKR 关注点 (OKR Focus)',
    `- **关注的品牌/Focus Brands**: ${profile.focusBrands?.join(', ') || ''}`,
    `- **核心指标/Key Metrics**: ${profile.keyMetrics?.join(', ') || ''}`,
    `- **关注的BU或团队/Focus Teams**: ${profile.focusTeams?.join(', ') || ''}`,
    '- **常用对比基准/Baselines**:',
    '- **最近分析的周期/Recent Periods**:',
    '',
    '## 团队协作 (Team Collaboration)',
    `- **常用GitLab项目/GitLab Projects**: ${profile.gitlabProjects?.join(', ') || ''}`,
    `- **常关注的群聊/Key Chats**: ${profile.keyChats?.join(', ') || ''}`,
    `- **跟踪的文档/Tracked Docs**: ${profile.trackedDocs?.join(', ') || ''}`,
    '',
    '## 当前上下文 (Current Context)',
    '- **进行中的任务/Active Tasks**:',
    '- **未解决问题/Open Questions**:',
    `- **重要备注/Important Notes**: ${profile.notes || ''}`,
  ];
  
  return lines.join('\n');
}

// ============================================================
// SEED LOGIC
// ============================================================

async function seedTeamMemory() {
  console.log('🌱 Seeding team working memory...\n');

  const storage = getSharedStorage();
  if (!storage) {
    console.error('❌ Failed to get storage. Check SUPABASE_DATABASE_URL.');
    process.exit(1);
  }

  // Create memory instance (minimal config, just for updating)
  const memory = new Memory({ storage });

  let success = 0;
  let failed = 0;

  for (const member of TEAM_MEMBERS) {
    const resourceId = getMemoryResourceId(member.feishuUserId);
    const workingMemory = generateWorkingMemory(member.profile);

    console.log(`📝 ${member.profile.name} (${resourceId})`);

    try {
      // Create a dummy thread for this user to store resource-scoped memory
      // Mastra requires a threadId even for resource-scoped updates
      const threadId = `seed:${member.feishuUserId}:init`;

      await memory.updateWorkingMemory({
        threadId,
        resourceId,
        workingMemory,
      });

      console.log(`   ✅ Seeded successfully`);
      success++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${msg}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${success} seeded, ${failed} failed`);
  
  // Show sample
  if (TEAM_MEMBERS.length > 0) {
    console.log('\n📋 Sample generated working memory:');
    console.log('─'.repeat(50));
    console.log(generateWorkingMemory(TEAM_MEMBERS[0].profile));
    console.log('─'.repeat(50));
  }
}

// Run if executed directly
seedTeamMemory().catch(console.error);
