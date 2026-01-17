/**
 * HTTP handler for Feishu document change webhooks
 * 
 * Route: POST /webhook/docs/change
 * 
 * When user watches a document, this endpoint receives events
 * whenever that document changes.
 */

import { isValidFeishuRequest } from "../feishu-utils";
import { 
  handleDocChangeEvent, 
  DocChangeEvent,
  webhookStorage,
} from "../doc-webhook";
import { client } from "../feishu-utils";
import { logChangeEvent } from "../doc-supabase";
import { evaluateChangeRules } from "../rules-integration";
import { handleChangeDetectedSnapshot } from "../doc-snapshot-integration";
import type { DocumentChange } from "../doc-persistence";

/**
 * Handle document change webhook
 */
export async function handleDocChangeWebhook(
  request: Request,
  rawBody: string
): Promise<{ status: number; body: string }> {
  try {
    // Verify webhook signature
    const isValid = await isValidFeishuRequest({ request, rawBody });
    if (!isValid) {
      console.warn("⚠️ [DocWebhook] Invalid webhook signature");
      return { status: 401, body: "Unauthorized" };
    }

    // Parse event
    const event: DocChangeEvent = JSON.parse(rawBody);
    console.log(`📨 [DocWebhook] Received change event for ${event.event.doc_token}`);

    // Handle the change
    const change = handleDocChangeEvent(event);

    // Log change event to Supabase
    await logChangeEvent({
      doc_token: change.docToken,
      change_type: change.changeType,
      changed_by: change.modifiedBy,
      changed_at: change.modifiedAt,
    });

    // Find subscription for this doc
    const subscription = await webhookStorage.load(change.docToken);
    if (!subscription) {
      console.warn(`⚠️ [DocWebhook] No subscription found for ${change.docToken}`);
      return { status: 200, body: "OK" }; // Still return 200 to ack
    }

    // ASYNC: Trigger rules evaluation and analysis (non-blocking)
    // This allows webhook to return quickly while processing happens in background
    triggerChangeAnalysis(change, subscription.chatIdToNotify).catch(err => {
      console.error("❌ [DocWebhook] Error during change analysis:", err);
    });

    // Send basic notification immediately
    await notifyDocChange(subscription.chatIdToNotify, change);

    return { status: 200, body: "OK" };
  } catch (error) {
    console.error("❌ [DocWebhook] Error handling webhook:", error);
    return { status: 500, body: "Internal Server Error" };
  }
}

/**
 * Trigger intelligent change analysis (runs in background)
 * 
 * Flow:
 * 1. Capture snapshot of current document state
 * 2. Evaluate rules based on change type/metadata
 * 3. Generate intelligent analysis/questions based on diff
 * 4. Post analysis response to chat
 */
async function triggerChangeAnalysis(
  change: ReturnType<typeof handleDocChangeEvent>,
  chatId: string
): Promise<void> {
  try {
    console.log(`📊 [Analysis] Starting change analysis for ${change.docToken}`);

    // Step 1: Capture snapshot for diff computation
    // TODO: Get proper userId from change.modifiedBy or session context
    const snapshotConfig = {
      enableAutoSnapshot: true,
      enableSemanticDiff: true,
      diffComputeTimeout: 5000,
    };

    await handleChangeDetectedSnapshot(
      change.docToken,
      change.docType,
      {
        lastModifiedUser: change.modifiedBy,
        lastModifiedTime: new Date(change.modifiedAt).getTime(),
        title: `Document change: ${change.changeType}`,
      },
      snapshotConfig
    );
    console.log(`✅ [Analysis] Snapshot captured for ${change.docToken}`);

    // Step 2: Evaluate rules (async, non-blocking)
    // Rules can trigger actions like alerts, notifications, or workflows
    const docChange: DocumentChange = {
      id: `${change.docToken}_${Date.now()}`,
      userId: change.modifiedBy,
      docToken: change.docToken,
      newModifiedUser: change.modifiedBy,
      newModifiedTime: new Date(change.modifiedAt).getTime(),
      changeType: (change.changeType === "edit" ? "time_updated" : "user_changed") as "time_updated" | "user_changed" | "new_document",
      changeDetectedAt: new Date(),
      debounced: false,
      notificationSent: true,
      notificationSentAt: new Date(),
      createdAt: new Date(),
    };

    await evaluateChangeRules(docChange, { async: true });
    console.log(`✅ [Analysis] Rules evaluated for ${change.docToken}`);

    // Step 3: Generate intelligent follow-up (optional, for future enhancement)
    // This would use an agent to:
    // - Analyze what changed semantically
    // - Generate questions about the changes
    // - Provide context-aware insights
    // TODO: Implement intelligent analysis via agent
    console.log(`ℹ️  [Analysis] Intelligent analysis deferred (TODO: agent implementation)`);

  } catch (error) {
    console.error(`❌ [Analysis] Failed to analyze change for ${change.docToken}:`, error);
    // Don't throw - analysis failure shouldn't prevent notification
  }
}

/**
 * Send notification to chat about document change
 */
async function notifyDocChange(
  chatId: string,
  change: ReturnType<typeof handleDocChangeEvent>
): Promise<void> {
  try {
    const message = `📝 Document change detected\n\n` +
      `**Token:** ${change.docToken}\n` +
      `**Type:** ${change.docType}\n` +
      `**Modified by:** ${change.modifiedBy}\n` +
      `**Change type:** ${change.changeType}\n` +
      `**Time:** ${change.modifiedAt}`;

    // Send as text message for now
    // TODO: Format as interactive card with action buttons
    const resp = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({
          text: message,
        }),
      },
    });

    const isSuccess = resp.code === 0 ? resp.code === 0 || resp.code === undefined : (resp.code === 0);
    if (!isSuccess) {
      console.error("Failed to send notification:", resp);
    } else {
      console.log(`✅ [DocWebhook] Notification sent to ${chatId}`);
    }
  } catch (error) {
    console.error("❌ [DocWebhook] Failed to notify:", error);
    // Don't throw - notification failure shouldn't break event processing
  }
}
