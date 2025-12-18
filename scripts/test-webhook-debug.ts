#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";

const docToken = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function main() {
  try {
    console.log(`Testing webhook subscription endpoint...\n`);
    
    const resp = await client.request({
      method: "POST",
      url: `/open-apis/drive/v1/files/${docToken}/subscribe?file_type=doc`,
    });
    
    console.log("✅ Success!");
    console.log("Response:", JSON.stringify(resp, null, 2));
  } catch (error: any) {
    console.log("❌ Error:");
    console.log("Code:", error.code);
    console.log("Status:", error.response?.status);
    console.log("Data:", JSON.stringify(error.response?.data, null, 2));
    console.log("Message:", error.message);
  }
}

main();
