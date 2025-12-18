#!/usr/bin/env bun
import * as lark from "@larksuiteoapi/node-sdk";
import { registerDocWebhook, deregisterDocWebhook } from "../lib/doc-webhook";

const docToken = "L7v9dyAvLoaJBixTvgPcecLqnIh";
const docType = "doc";

// Test with correct client initialization
const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

async function main() {
  console.log("Testing webhook registration...\n");

  try {
    console.log(`📡 Registering webhook for ${docToken}...`);
    const registered = await registerDocWebhook(docToken, docType, "test-chat-id");
    console.log(`✅ Registration result: ${registered}`);

    if (!registered) {
      console.log("Registration returned false");
      return;
    }

    console.log("\n⏳ Waiting 3 seconds before deregistering...");
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log(`\n📡 Deregistering webhook for ${docToken}...`);
    const deregistered = await deregisterDocWebhook(docToken, docType);
    console.log(`✅ Deregistration result: ${deregistered}`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

main();
