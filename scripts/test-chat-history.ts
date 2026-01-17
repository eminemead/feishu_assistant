#!/usr/bin/env bun
/**
 * Test script for Feishu chat history API
 * Usage: bun scripts/test-chat-history.ts [chatId]
 */

import { Client } from "@larksuiteoapi/node-sdk";

const client = new Client({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
});

const chatId = process.argv[2] || process.env.TEST_CHAT_ID;

if (!chatId) {
  console.error("❌ Please provide a chatId as argument or set TEST_CHAT_ID env var");
  console.error("   Usage: bun scripts/test-chat-history.ts oc_xxxxx");
  process.exit(1);
}

const TIMEOUT_MS = 10000; // 10 second timeout

async function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${name} timeout after ${ms}ms`)), ms)
    )
  ]);
}

async function testChatHistory() {
  console.log(`\n📋 Testing Feishu Chat History API`);
  console.log(`   Chat ID: ${chatId}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms`);
  console.log(`${"─".repeat(50)}\n`);

  // Test 1: Basic message fetch
  console.log("Test 1: Fetch last 5 messages");
  try {
    const resp = await withTimeout(
      client.im.message.list({
        params: {
          container_id_type: "chat",
          container_id: chatId,
          page_size: 5,
        },
      }),
      TIMEOUT_MS,
      "Message list"
    );
    
    if (resp.code === 0 && resp.data?.items) {
      console.log(`   ✅ Found ${resp.data.items.length} messages`);
      
      resp.data.items.slice(0, 3).forEach((msg: any, i: number) => {
        const senderId = msg.sender?.sender_id?.user_id || msg.sender?.sender_id?.open_id || "unknown";
        const senderType = msg.sender?.sender_type || "unknown";
        console.log(`   [${i + 1}] sender_id=${senderId}, type=${senderType}`);
      });
    } else {
      console.log(`   ❌ Failed: code=${resp.code}, msg=${resp.msg}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 2: Time-filtered fetch (last 4 hours)
  console.log("\nTest 2: Fetch messages from last 4 hours");
  const fourHoursAgo = Math.floor((Date.now() - 4 * 60 * 60 * 1000) / 1000);
  const now = Math.floor(Date.now() / 1000);
  console.log(`   start_time=${fourHoursAgo}, end_time=${now}`);
  
  try {
    const resp = await withTimeout(
      client.im.message.list({
        params: {
          container_id_type: "chat",
          container_id: chatId,
          page_size: 20,
          start_time: String(fourHoursAgo),
          end_time: String(now),
        },
      }),
      TIMEOUT_MS,
      "Time-filtered list"
    );
    
    if (resp.code === 0 && resp.data?.items) {
      console.log(`   ✅ Found ${resp.data.items.length} messages in last 4 hours`);
      
      // Count by sender
      const senderCounts: Record<string, number> = {};
      resp.data.items.forEach((msg: any) => {
        const senderId = msg.sender?.sender_id?.user_id || msg.sender?.sender_id?.open_id || "unknown";
        senderCounts[senderId] = (senderCounts[senderId] || 0) + 1;
      });
      
      if (Object.keys(senderCounts).length > 0) {
        console.log(`   Sender breakdown:`);
        Object.entries(senderCounts).forEach(([id, count]) => {
          console.log(`     - ${id}: ${count} msgs`);
        });
      }
    } else {
      console.log(`   ❌ Failed: code=${resp.code}, msg=${resp.msg}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log("✅ Tests complete\n");
}

testChatHistory().catch(console.error);
