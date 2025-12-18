#!/usr/bin/env bun

console.log("Environment check:");
console.log("FEISHU_APP_ID:", process.env.FEISHU_APP_ID ? "✅ set" : "❌ not set");
console.log("FEISHU_APP_SECRET:", process.env.FEISHU_APP_SECRET ? "✅ set" : "❌ not set");
console.log("Actual ID:", process.env.FEISHU_APP_ID?.substring(0, 10) + "...");

import { Client } from "@larksuiteoapi/node-sdk";

const client = new Client({
  id: process.env.FEISHU_APP_ID,
  secret: process.env.FEISHU_APP_SECRET,
  disableTokenCache: false,
});

async function main() {
  try {
    console.log("\nTrying to get auth token...");
    
    // Make a simple auth request to verify token works
    const resp = await client.request({
      url: "/open-apis/auth/v1/tenant_access_token/internal",
      method: "post",
      timeout: 5000,
    });
    
    console.log("✅ Auth successful!");
    console.log("Response:", JSON.stringify(resp, null, 2));
  } catch (error: any) {
    console.log("❌ Auth failed:");
    console.log(error.code || error.response?.status, error.message?.split('\n')[0]);
    console.log("Full error:", error.response?.data);
  }
}

main();
