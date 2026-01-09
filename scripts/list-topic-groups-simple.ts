/**
 * Simple script to list topic groups using native fetch
 * 
 * Usage: bun scripts/list-topic-groups-simple.ts
 */

const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;

async function getTenantAccessToken(): Promise<string> {
  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  
  const data = await resp.json() as any;
  if (data.code !== 0) {
    throw new Error(`Failed to get token: ${data.msg}`);
  }
  return data.tenant_access_token;
}

async function listChats(token: string): Promise<any[]> {
  const resp = await fetch("https://open.feishu.cn/open-apis/im/v1/chats?page_size=100", {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const data = await resp.json() as any;
  if (data.code !== 0) {
    throw new Error(`Failed to list chats: ${data.msg}`);
  }
  return data.data?.items || [];
}

async function getChatDetails(token: string, chatId: string): Promise<any> {
  const resp = await fetch(`https://open.feishu.cn/open-apis/im/v1/chats/${chatId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const data = await resp.json() as any;
  if (data.code !== 0) {
    console.warn(`  ⚠️ Failed to get ${chatId}: ${data.msg}`);
    return null;
  }
  return data.data;
}

async function main() {
  console.log("🔐 Getting access token...");
  const token = await getTenantAccessToken();
  console.log("✅ Token obtained\n");
  
  console.log("🔍 Fetching groups...");
  const chats = await listChats(token);
  console.log(`📋 Found ${chats.length} groups\n`);
  
  const topicGroups: any[] = [];
  const regularGroups: any[] = [];
  
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    const details = await getChatDetails(token, chat.chat_id);
    
    if (details) {
      const info = {
        chat_id: chat.chat_id,
        name: details.name || "Unnamed",
        chat_mode: details.chat_mode || "unknown",
        description: details.description,
      };
      
      if (details.chat_mode === "topic") {
        topicGroups.push(info);
      } else {
        regularGroups.push(info);
      }
    }
    
    // Progress
    if ((i + 1) % 10 === 0) {
      console.log(`  📊 Checked ${i + 1}/${chats.length}...`);
    }
  }
  
  // Results
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📌 TOPIC GROUPS (话题群)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  if (topicGroups.length === 0) {
    console.log("  (No topic groups found)\n");
  } else {
    for (const g of topicGroups) {
      console.log(`  🏷️  ${g.name}`);
      console.log(`      chat_id: ${g.chat_id}`);
      if (g.description) console.log(`      description: ${g.description}`);
      console.log();
    }
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("💬 REGULAR GROUPS (消息群)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  for (const g of regularGroups) {
    console.log(`  💬 ${g.name} (${g.chat_mode})`);
    console.log(`      chat_id: ${g.chat_id}`);
    console.log();
  }
  
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`📊 Summary: ${topicGroups.length} topic groups, ${regularGroups.length} regular groups`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch(console.error);
