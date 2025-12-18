#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function main() {
  console.log("Testing with correct Client initialization...\n");
  
  try {
    const resp = await client.request({
      method: "POST",
      url: "/open-apis/suite/docs-api/meta",
      data: {
        request_docs: [{
          docs_token: docId,
          docs_type: "doc",
        }],
      },
      timeout: 5000,
    });
    
    console.log("✅ Metadata fetch succeeded!");
    console.log(JSON.stringify(resp, null, 2));
  } catch (error: any) {
    const code = error.code || error.response?.status;
    const msg = error.response?.data?.msg || error.message?.split('\n')[0];
    console.log(`❌ Failed: [${code}] ${msg}`);
  }
}

main();
