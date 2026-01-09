/**
 * Script to list all groups the bot is in and identify topic groups
 * 
 * Usage: bun scripts/list-topic-groups.ts
 */

import { getFeishuClient } from "../lib/feishu-utils";

interface ChatInfo {
  chat_id: string;
  name: string;
  chat_mode: string;
  description?: string;
  owner_id?: string;
  member_count?: number;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === retries - 1) throw error;
      console.log(`  ⏳ Retry ${i + 1}/${retries} after error: ${error.message?.slice(0, 50)}...`);
      await sleep(delay * (i + 1));
    }
  }
  throw new Error("Should not reach here");
}

async function listBotGroups(): Promise<void> {
  const client = getFeishuClient();
  
  console.log("🔍 Fetching groups the bot is a member of...\n");
  
  // Step 1: List all groups with retry
  let allGroups: any[] = [];
  let pageToken: string | undefined;
  
  try {
    do {
      const resp = await withRetry(() => client.im.chat.list({
        params: {
          page_size: 50, // Smaller page size
          page_token: pageToken,
        },
      }));
      
      const isSuccess = resp.code === 0 || resp.code === undefined;
      if (!isSuccess) {
        console.error("❌ Failed to list groups:", resp.code, resp.msg);
        return;
      }
      
      if (resp.data?.items) {
        allGroups = allGroups.concat(resp.data.items);
        console.log(`  📥 Fetched ${allGroups.length} groups so far...`);
      }
      
      pageToken = resp.data?.page_token;
      if (pageToken) await sleep(200); // Rate limiting
    } while (pageToken);
  } catch (error: any) {
    console.error("❌ Failed to list groups:", error.message);
    return;
  }
  
  console.log(`\n📋 Found ${allGroups.length} groups total\n`);
  
  // Step 2: Get detailed info for each group to check chat_mode
  const groupDetails: ChatInfo[] = [];
  
  for (let i = 0; i < allGroups.length; i++) {
    const group = allGroups[i];
    try {
      const detailResp = await withRetry(() => client.im.chat.get({
        path: {
          chat_id: group.chat_id,
        },
      }));
      
      const isSuccess = detailResp.code === 0 || detailResp.code === undefined;
      if (isSuccess && detailResp.data) {
        groupDetails.push({
          chat_id: group.chat_id,
          name: (detailResp.data as any).name || group.name || "Unnamed",
          chat_mode: (detailResp.data as any).chat_mode || "unknown",
          description: (detailResp.data as any).description,
          owner_id: (detailResp.data as any).owner_id,
          member_count: (detailResp.data as any).user_count,
        });
      }
      
      // Progress indicator
      if ((i + 1) % 5 === 0 || i === allGroups.length - 1) {
        console.log(`  📊 Checked ${i + 1}/${allGroups.length} groups...`);
      }
      
      await sleep(100); // Rate limiting
    } catch (error: any) {
      console.warn(`  ⚠️ Failed to get details for ${group.chat_id}: ${error.message?.slice(0, 50)}`);
    }
  }
  
  // Step 3: Separate topic groups from regular groups
  const topicGroups = groupDetails.filter(g => g.chat_mode === "topic");
  const regularGroups = groupDetails.filter(g => g.chat_mode !== "topic");
  
  // Display results
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📌 TOPIC GROUPS (话题群)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  if (topicGroups.length === 0) {
    console.log("  (No topic groups found)\n");
  } else {
    for (const group of topicGroups) {
      console.log(`  🏷️  ${group.name}`);
      console.log(`      chat_id: ${group.chat_id}`);
      console.log(`      chat_mode: ${group.chat_mode}`);
      if (group.description) console.log(`      description: ${group.description}`);
      if (group.member_count) console.log(`      members: ${group.member_count}`);
      console.log();
    }
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("💬 REGULAR GROUPS (消息群)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  if (regularGroups.length === 0) {
    console.log("  (No regular groups found)\n");
  } else {
    for (const group of regularGroups) {
      console.log(`  💬 ${group.name}`);
      console.log(`      chat_id: ${group.chat_id}`);
      console.log(`      chat_mode: ${group.chat_mode}`);
      if (group.description) console.log(`      description: ${group.description}`);
      console.log();
    }
  }
  
  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`📊 Summary: ${topicGroups.length} topic groups, ${regularGroups.length} regular groups`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

// Run
listBotGroups().catch(console.error);
