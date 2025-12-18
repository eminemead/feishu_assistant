#!/usr/bin/env bun
/**
 * End-to-end test for document tracking
 * 
 * Prerequisites:
 * 1. Supabase migration 010 deployed (creates documents, doc_snapshots, doc_change_events tables)
 * 2. Feishu app configured with webhook subscriptions
 * 3. Test document accessible with read/write permissions
 * 
 * Test flow:
 * 1. Register webhook for test document
 * 2. Store document metadata in Supabase
 * 3. Simulate webhook change event
 * 4. Verify event logged in Supabase
 * 5. Query change history
 * 6. Deregister webhook
 */

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
  getDocumentMetadata,
} from "../lib/doc-supabase";

const TEST_DOC_TOKEN = "L7v9dyAvLoaJBixTvgPcecLqnIh";
const TEST_CHAT_ID = "oc_test_group_chat";

async function test(step: number, name: string, fn: () => Promise<void>) {
  try {
    console.log(`\n📝 Step ${step}: ${name}`);
    await fn();
    console.log(`✅ Step ${step}: ${name} - PASSED`);
  } catch (error) {
    console.error(`❌ Step ${step}: ${name} - FAILED`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function runTests() {
  console.log("🚀 Document Tracking End-to-End Test\n");
  console.log("📋 Configuration:");
  console.log(`   Document Token: ${TEST_DOC_TOKEN}`);
  console.log(`   Chat ID: ${TEST_CHAT_ID}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    // Step 1: Register webhook
    await test(1, "Register webhook for test document", async () => {
      const success = await registerDocWebhook(TEST_DOC_TOKEN, "docx", TEST_CHAT_ID);
      if (!success) {
        throw new Error("Webhook registration returned false");
      }
    });

    // Step 2: Store document metadata
    await test(2, "Store document metadata in Supabase", async () => {
      const now = new Date().toISOString();
      const success = await storeDocumentMetadata({
        doc_token: TEST_DOC_TOKEN,
        title: "Test Document for Tracking",
        doc_type: "docx",
        owner_id: "user_owner_123",
        created_at: now,
        last_modified_user: "user_editor_456",
        last_modified_at: now,
      });
      if (!success) {
        throw new Error("Failed to store metadata");
      }
    });

    // Step 3: Retrieve metadata to verify storage
    await test(3, "Retrieve document metadata from Supabase", async () => {
      const meta = await getDocumentMetadata(TEST_DOC_TOKEN);
      if (!meta) {
        throw new Error("Could not retrieve metadata");
      }
      console.log(`   Document: ${meta.title}`);
      console.log(`   Type: ${meta.doc_type}`);
      console.log(`   Owner: ${meta.owner_id}`);
    });

    // Step 4: Simulate webhook change event and store it
    await test(4, "Simulate and log document change event", async () => {
      const mockEvent: DocChangeEvent = {
        schema: "2.0",
        header: {
          event_id: `event_test_${Date.now()}`,
          event_type: "docs:change",
          create_time: new Date().toISOString(),
          token: "token_test",
          app_id: process.env.FEISHU_APP_ID || "app_test",
        },
        event: {
          doc_token: TEST_DOC_TOKEN,
          doc_type: "docx",
          user_id: "user_editor_456",
          editor_type: "user",
          timestamp: Math.floor(Date.now() / 1000).toString(),
          change_type: "edit",
        },
      };

      const change = handleDocChangeEvent(mockEvent);
      console.log(`   Change Type: ${change.changeType}`);
      console.log(`   Modified By: ${change.modifiedBy}`);
      console.log(`   Modified At: ${change.modifiedAt}`);

      const logSuccess = await logChangeEvent({
        doc_token: change.docToken,
        change_type: change.changeType,
        changed_by: change.modifiedBy,
        changed_at: change.modifiedAt,
      });

      if (!logSuccess) {
        throw new Error("Failed to log change event");
      }
    });

    // Step 5: Query recent changes
    await test(5, "Query recent changes from Supabase", async () => {
      const changes = await getRecentChanges(TEST_DOC_TOKEN, 10);
      if (changes.length === 0) {
        throw new Error("No changes found (expected at least 1)");
      }
      console.log(`   Found ${changes.length} change(s)`);
      const latest = changes[0];
      console.log(`   Latest: ${latest.change_type} by ${latest.changed_by}`);
      console.log(`   At: ${latest.changed_at}`);
    });

    // Step 6: Log multiple events to test ordering
    await test(6, "Log additional change events and verify ordering", async () => {
      for (let i = 0; i < 2; i++) {
        await logChangeEvent({
          doc_token: TEST_DOC_TOKEN,
          change_type: "edit",
          changed_by: `user_${i + 1}`,
          changed_at: new Date(Date.now() + i * 1000).toISOString(), // slight delay
        });
      }

      const changes = await getRecentChanges(TEST_DOC_TOKEN, 5);
      console.log(`   Total changes: ${changes.length}`);
      
      // Verify ordering (newest first)
      for (let i = 0; i < changes.length - 1; i++) {
        const curr = new Date(changes[i].changed_at).getTime();
        const next = new Date(changes[i + 1].changed_at).getTime();
        if (curr < next) {
          throw new Error(`Incorrect ordering: ${changes[i].changed_at} should be >= ${changes[i + 1].changed_at}`);
        }
      }
      console.log(`   ✓ Ordering verified (newest first)`);
    });

    // Step 7: Deregister webhook
    await test(7, "Deregister webhook for test document", async () => {
      const success = await deregisterDocWebhook(TEST_DOC_TOKEN, "docx");
      if (!success) {
        throw new Error("Webhook deregistration returned false");
      }
    });

    console.log("\n✨ All tests passed!\n");
    console.log("📊 Summary:");
    console.log("   ✅ Webhook registration works");
    console.log("   ✅ Supabase document storage works");
    console.log("   ✅ Change event logging works");
    console.log("   ✅ Change history querying works");
    console.log("   ✅ Webhook deregistration works");
    console.log("\n🎯 Next step: Test with real Feishu document changes");
    console.log("   1. Run: @bot watch " + TEST_DOC_TOKEN.slice(0, 12) + "...");
    console.log("   2. Edit document in Feishu");
    console.log("   3. Check group chat for change notification");
    console.log("   4. Verify change is logged in Supabase");
    
    return true;
  } catch (error) {
    console.log("\n❌ Test failed\n");
    return false;
  }
}

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
