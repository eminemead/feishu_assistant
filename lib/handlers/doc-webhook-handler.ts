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

    // Find subscription for this doc
    const subscription = await webhookStorage.load(change.docToken);
    if (!subscription) {
      console.warn(`⚠️ [DocWebhook] No subscription found for ${change.docToken}`);
      return { status: 200, body: "OK" }; // Still return 200 to ack
    }

    // Send notification to subscribed chat
    await notifyDocChange(subscription.chatIdToNotify, change);

    return { status: 200, body: "OK" };
  } catch (error) {
    console.error("❌ [DocWebhook] Error handling webhook:", error);
    return { status: 500, body: "Internal Server Error" };
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

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0);
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
