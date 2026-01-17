#!/usr/bin/env bun
/**
 * Test Feishu API using native fetch (bypassing SDK's axios)
 */

const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;
const chatId = process.argv[2] || "oc_2129f1cc1883ab8c6306738b655f7dd9";

async function getAccessToken(): Promise<string> {
  console.log("Getting access token...");
  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await resp.json() as any;
  console.log(`Token response code: ${data.code}`);
  if (data.code !== 0) {
    throw new Error(`Failed to get token: ${data.msg}`);
  }
  return data.tenant_access_token;
}

async function getChatMessages(token: string): Promise<void> {
  console.log(`\nFetching messages from chat: ${chatId}`);
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=5`;
  
  const startMs = Date.now();
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const duration = Date.now() - startMs;
  
  const data = await resp.json() as any;
  console.log(`Response code: ${data.code}`);
  console.log(`Response msg: ${data.msg || 'OK'}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Items count: ${data.data?.items?.length || 0}`);
  
  if (data.data?.items?.length > 0) {
    console.log("\nSample messages:");
    for (const item of data.data.items.slice(0, 3)) {
      const senderId = item.sender?.sender_id?.user_id || item.sender?.sender_id?.open_id || "unknown";
      console.log(`  - ${senderId}: ${item.body?.content?.substring(0, 50) || 'N/A'}...`);
    }
  }
}

async function main() {
  try {
    const token = await getAccessToken();
    console.log(`Got token: ${token.substring(0, 20)}...`);
    await getChatMessages(token);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
  }
}

main();
