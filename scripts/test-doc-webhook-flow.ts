#!/usr/bin/env bun
/**
 * Test document webhook flow end-to-end
 * 
 * 1. Register webhook for test document
 * 2. Simulate change event
 * 3. Verify data is stored in Supabase
 */

import * as lark from "@larksuiteoapi/node-sdk";
import { createClient } from "@supabase/supabase-js";
import { 
  normalizeFileType,
  registerDocWebhook,
  deregisterDocWebhook,
  handleDocChangeEvent,
  type DocChangeEvent,
} from "../lib/doc-webhook";
import { 
  storeDocumentMetadata,
  logChangeEvent,
  getRecentChanges,
} from "../lib/doc-supabase";

const docToken = "L7v9dyAvLoaJBixTvgPcecLqnIh";
const chatId = "oc_test_group_chat_id";

async function testFlow() {
  console.log("🚀 Document Webhook Flow Test\n");
  
  // Step 1: Register webhook
  console.log("📝 Step 1: Register webhook...");
  try {
    const success = await registerDocWebhook(docToken, "docx", chatId);
    if (success) {
      console.log("✅ Webhook registered successfully\n");
    }
  } catch (error) {
    console.error("❌ Failed to register webhook:", error);
    process.exit(1);
  }

  // Step 2: Store document metadata
  console.log("📝 Step 2: Store document metadata...");
  try {
    const metaSuccess = await storeDocumentMetadata({
      doc_token: docToken,
      title: "Test Document",
      doc_type: "docx",
      owner_id: "user_123",
      created_at: new Date().toISOString(),
      last_modified_user: "user_456",
      last_modified_at: new Date().toISOString(),
    });
    if (metaSuccess) {
      console.log("✅ Document metadata stored\n");
    }
  } catch (error) {
    console.error("❌ Failed to store metadata:", error);
  }

  // Step 3: Simulate webhook event
  console.log("📝 Step 3: Simulate document change event...");
  const mockEvent: DocChangeEvent = {
    schema: "2.0",
    header: {
      event_id: "event_test_123",
      event_type: "docs:change",
      create_time: new Date().toISOString(),
      token: "token_test",
      app_id: process.env.FEISHU_APP_ID || "app_test",
    },
    event: {
      doc_token: docToken,
      doc_type: "docx",
      user_id: "user_456",
      editor_type: "user",
      timestamp: Math.floor(Date.now() / 1000).toString(),
      change_type: "edit",
    },
  };

  try {
    const change = handleDocChangeEvent(mockEvent);
    console.log("✅ Change event parsed");
    console.log(`   - Doc: ${change.docToken}`);
    console.log(`   - Type: ${change.changeType}`);
    console.log(`   - By: ${change.modifiedBy}`);
    console.log(`   - At: ${change.modifiedAt}\n`);

    // Store the change event
    const eventStored = await logChangeEvent({
      doc_token: change.docToken,
      change_type: change.changeType,
      changed_by: change.modifiedBy,
      changed_at: change.modifiedAt,
    });
    
    if (eventStored) {
      console.log("✅ Change event logged to Supabase\n");
    }
  } catch (error) {
    console.error("❌ Failed to process change event:", error);
  }

  // Step 4: Query recent changes
  console.log("📝 Step 4: Verify changes in Supabase...");
  try {
    const recentChanges = await getRecentChanges(docToken, 5);
    console.log(`✅ Found ${recentChanges.length} recent change(s)`);
    if (recentChanges.length > 0) {
      const latest = recentChanges[0];
      console.log(`   - Type: ${latest.change_type}`);
      console.log(`   - By: ${latest.changed_by}`);
      console.log(`   - At: ${latest.changed_at}\n`);
    }
  } catch (error) {
    console.error("❌ Failed to query changes:", error);
  }

  // Step 5: Deregister webhook
  console.log("📝 Step 5: Deregister webhook...");
  try {
    const deregSuccess = await deregisterDocWebhook(docToken, "docx");
    if (deregSuccess) {
      console.log("✅ Webhook deregistered\n");
    }
  } catch (error) {
    console.error("❌ Failed to deregister webhook:", error);
  }

  console.log("✨ Test complete!");
}

testFlow();
