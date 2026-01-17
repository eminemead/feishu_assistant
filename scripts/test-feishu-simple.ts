#!/usr/bin/env bun
/**
 * Simple Feishu API test - no timeout, raw response
 */

import { Client } from "@larksuiteoapi/node-sdk";

const client = new Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
});

const chatId = process.argv[2] || process.env.TEST_CHAT_ID;

if (!chatId) {
  console.error("Usage: bun scripts/test-feishu-simple.ts <chatId>");
  process.exit(1);
}

async function test() {
  console.log(`Testing chat: ${chatId}`);
  console.log(`App ID: ${process.env.FEISHU_APP_ID}`);
  console.log(`Start time: ${new Date().toISOString()}`);
  
  try {
    console.log("\n1. Testing im.chat.get (get chat info)...");
    const chatResp = await client.im.chat.get({
      path: { chat_id: chatId },
    });
    console.log(`   Chat info response code: ${chatResp.code}`);
    console.log(`   Chat name: ${chatResp.data?.name || 'N/A'}`);
    
    console.log("\n2. Testing im.message.list (get messages)...");
    const startMs = Date.now();
    const msgResp = await client.im.message.list({
      params: {
        container_id_type: "chat",
        container_id: chatId,
        page_size: 5,
      },
    });
    const duration = Date.now() - startMs;
    console.log(`   Message list response code: ${msgResp.code}`);
    console.log(`   Message list msg: ${msgResp.msg || 'OK'}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Items count: ${msgResp.data?.items?.length || 0}`);
    
    if (msgResp.data?.items?.length) {
      console.log("\n   Sample message:");
      const msg = msgResp.data.items[0];
      console.log(`   - message_id: ${msg.message_id}`);
      console.log(`   - sender: ${JSON.stringify(msg.sender)}`);
    }
  } catch (error: any) {
    console.error(`\nError: ${error.message}`);
    console.error(error);
  }
  
  console.log(`\nEnd time: ${new Date().toISOString()}`);
}

test();
