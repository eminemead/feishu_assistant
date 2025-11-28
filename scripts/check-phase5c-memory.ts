#!/usr/bin/env bun
/**
 * Phase 5c Memory Check
 * Verifies memory persistence and context tracking for Phase 5c-2 testing
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Supabase credentials not configured");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkMemory() {
  console.log("🔍 Phase 5c Memory Verification\n");

  // Get recent messages
  const { data: messages, error } = await supabase
    .from("agent_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("❌ Error fetching messages:", error.message);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log("⚠️  No messages found in agent_messages table");
    return;
  }

  console.log(`✅ Found ${messages.length} messages\n`);

  // Group by conversation_id
  const byConversation: Record<string, typeof messages> = {};
  messages.forEach((msg) => {
    if (!byConversation[msg.conversation_id]) {
      byConversation[msg.conversation_id] = [];
    }
    byConversation[msg.conversation_id].push(msg);
  });

  // Display results
  Object.entries(byConversation).forEach(([convId, msgs]) => {
    console.log(`📌 Conversation: ${convId}`);
    console.log(`   Messages: ${msgs.length}`);
    console.log(`   Span: ${new Date(msgs[msgs.length - 1].created_at).toLocaleTimeString()} → ${new Date(msgs[0].created_at).toLocaleTimeString()}`);
    console.log("");

    // Show unique user_ids in this conversation
    const users = new Set(msgs.map((m) => m.user_id));
    console.log(`   Users in conversation: ${users.size}`);
    users.forEach((userId) => {
      const userMsgs = msgs.filter((m) => m.user_id === userId);
      console.log(`     • ${userId}: ${userMsgs.length} messages`);
    });
    console.log("");

    // Show message sequence
    console.log(`   Message sequence:`);
    msgs
      .reverse()
      .forEach((msg, idx) => {
        const preview = msg.content?.substring(0, 60).replace(/\n/g, " ") + "...";
        const time = new Date(msg.created_at).toLocaleTimeString();
        console.log(`     ${idx + 1}. [${msg.role}] ${time}`);
        console.log(`        ${preview}`);
      });
    console.log("");
  });

  // Check for issues
  console.log("📊 Analysis:\n");

  // Check if conversation_ids are formatted correctly
  const badConvIds = Object.keys(byConversation).filter((id) => !id.startsWith("feishu:"));
  if (badConvIds.length > 0) {
    console.log(`⚠️  Found ${badConvIds.length} conversation(s) with unexpected format:`);
    badConvIds.forEach((id) => console.log(`   ${id}`));
  } else {
    console.log(`✅ All conversation IDs correctly formatted (feishu:*)`);
  }

  // Check for proper alternation (user/assistant)
  Object.entries(byConversation).forEach(([convId, msgs]) => {
    const reversed = [...msgs].reverse();
    let lastRole = "";
    let issues = 0;

    reversed.forEach((msg, idx) => {
      if (lastRole === msg.role && msg.role !== "system") {
        issues++;
      }
      lastRole = msg.role;
    });

    if (issues === 0) {
      console.log(`✅ Conversation ${convId.substring(0, 40)}... has proper role alternation`);
    } else {
      console.log(`⚠️  Conversation ${convId.substring(0, 40)}... has ${issues} role violations`);
    }
  });

  console.log("\n✨ Memory check complete!");
}

checkMemory().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
