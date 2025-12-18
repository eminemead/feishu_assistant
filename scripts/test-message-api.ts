#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function main() {
  console.log("Testing basic API call (message API)...\n");
  
  try {
    // This should work if auth is working
    const resp = await client.im.chat.list({
      params: {
        page_size: 10,
      },
    });
    
    console.log("✅ Message API call succeeded!");
    console.log("Response code:", (resp as any).code);
    console.log("Has data:", !!(resp as any).data);
  } catch (error: any) {
    const code = error.code || error.response?.status;
    const msg = error.response?.data?.msg || error.message?.split('\n')[0];
    console.log(`❌ Failed: [${code}] ${msg}`);
  }
}

main();
