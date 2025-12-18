#!/usr/bin/env bun
import { Client } from "@larksuiteoapi/node-sdk";

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

const client = new Client({
  id: process.env.FEISHU_APP_ID!,
  secret: process.env.FEISHU_APP_SECRET!,
});

async function main() {
  try {
    console.log("Testing docs-api/meta with correct payload format...\n");
    
    const response = await client.request({
      method: "POST",
      url: "/open-apis/suite/docs-api/meta",
      data: {
        request_docs: [
          {
            docs_token: docId,
            docs_type: "doc",
          },
        ],
      },
      timeout: 5000,
    });
    
    console.log("✅ Success!");
    console.log(JSON.stringify(response, null, 2));
  } catch (error: any) {
    console.log("❌ Failed:");
    const code = error.code || error.response?.status || "unknown";
    const msg = error.message?.split('\n')[0] || error.response?.statusText || "error";
    console.log(`${code}: ${msg}`);
    if (error.response?.data) {
      console.log("Response data:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

main();
