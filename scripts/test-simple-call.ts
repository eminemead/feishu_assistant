#!/usr/bin/env bun
import { Client } from "@larksuiteoapi/node-sdk";

const client = new Client({
  id: process.env.FEISHU_APP_ID,
  secret: process.env.FEISHU_APP_SECRET,
});

async function main() {
  try {
    // Try a call that just needs auth to work (get current user)
    console.log("Testing simple API call (get current user)...\n");
    
    const resp = await client.request({
      url: "/open-apis/contact/v3/users/batch_get_id",
      method: "POST",
      data: {
        mobiles: ["test@example.com"],
      },
      timeout: 5000,
    });
    
    console.log("✅ API call succeeded!");
    console.log(JSON.stringify(resp, null, 2));
  } catch (error: any) {
    const code = error.code || error.response?.status || "unknown";
    const msg = error.message?.split('\n')[0] || error.response?.statusText || "error";
    console.log(`❌ Failed: ${code}: ${msg}`);
    if (error.response?.data) {
      console.log("Response:", JSON.stringify(error.response.data));
    }
  }
}

main();
