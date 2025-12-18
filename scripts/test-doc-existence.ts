#!/usr/bin/env bun
import { Client } from "@larksuiteoapi/node-sdk";

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new Client({
  id: process.env.FEISHU_APP_ID!,
  secret: process.env.FEISHU_APP_SECRET!,
});

async function main() {
  try {
    console.log("Testing doc existence via drive/spaces API...\n");
    
    // Try to get document info via drive/spaces/files
    const response = await client.request({
      url: `/open-apis/drive/v1/files/${docId}`,
      method: "get",
      timeout: 5000,
    });
    
    console.log("✅ Document found:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error: any) {
    console.log("❌ Failed:");
    console.log(error.code || error.response?.status, error.message?.split('\n')[0]);
    console.log("Full response:", error.response?.data);
  }
}

main();
