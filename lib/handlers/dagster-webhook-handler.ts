/**
 * HTTP handler for Dagster pipeline webhook notifications
 * 
 * Route: POST /webhook/dagster
 * 
 * Receives events from Dagster sensors when:
 * - Asset materialized (e.g., okr_metrics refreshed)
 * - Pipeline/job completed
 * - Threshold alerts triggered
 * 
 * Security: Validates X-Dagster-Secret header against DAGSTER_WEBHOOK_SECRET env var
 */

import { client } from "../feishu-utils";

// Event types from Dagster sensors
export type DagsterEventType = 
  | "asset_materialized"
  | "job_completed"
  | "job_failed"
  | "threshold_alert"
  | "custom";

export interface DagsterWebhookPayload {
  event: DagsterEventType;
  asset_key?: string;
  job_name?: string;
  run_id?: string;
  status?: "success" | "failure";
  metadata?: Record<string, unknown>;
  message?: string;
  timestamp?: string;
}

export interface DagsterWebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Validate Dagster webhook secret
 */
function validateDagsterSecret(request: Request): boolean {
  const secret = process.env.DAGSTER_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("⚠️ [DagsterWebhook] DAGSTER_WEBHOOK_SECRET not configured, skipping auth");
    return true; // Allow if not configured (dev mode)
  }

  const providedSecret = request.headers.get("X-Dagster-Secret");
  if (!providedSecret) {
    console.warn("⚠️ [DagsterWebhook] Missing X-Dagster-Secret header");
    return false;
  }

  return providedSecret === secret;
}

/**
 * Parse and validate Dagster webhook payload
 */
function parsePayload(rawBody: string): DagsterWebhookPayload | null {
  try {
    const payload = JSON.parse(rawBody);
    
    if (!payload.event) {
      console.warn("⚠️ [DagsterWebhook] Missing 'event' field in payload");
      return null;
    }

    return payload as DagsterWebhookPayload;
  } catch (error) {
    console.error("❌ [DagsterWebhook] Failed to parse payload:", error);
    return null;
  }
}

/**
 * Send Feishu notification for Dagster event
 */
async function sendDagsterNotification(
  chatId: string,
  payload: DagsterWebhookPayload
): Promise<void> {
  const emoji = getEventEmoji(payload.event, payload.status);
  const title = getEventTitle(payload);
  
  let message = `${emoji} **${title}**\n\n`;
  
  if (payload.asset_key) {
    message += `**Asset:** ${payload.asset_key}\n`;
  }
  if (payload.job_name) {
    message += `**Job:** ${payload.job_name}\n`;
  }
  if (payload.run_id) {
    message += `**Run ID:** ${payload.run_id}\n`;
  }
  if (payload.status) {
    message += `**Status:** ${payload.status}\n`;
  }
  if (payload.message) {
    message += `\n${payload.message}\n`;
  }
  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    message += `\n**Metadata:**\n`;
    for (const [key, value] of Object.entries(payload.metadata)) {
      message += `  • ${key}: ${JSON.stringify(value)}\n`;
    }
  }
  if (payload.timestamp) {
    message += `\n_${payload.timestamp}_`;
  }

  try {
    const resp = await client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text: message }),
      },
    });

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0);
    if (!isSuccess) {
      console.error("❌ [DagsterWebhook] Failed to send notification:", resp);
    } else {
      console.log(`✅ [DagsterWebhook] Notification sent to ${chatId}`);
    }
  } catch (error) {
    console.error("❌ [DagsterWebhook] Error sending notification:", error);
  }
}

function getEventEmoji(event: DagsterEventType, status?: string): string {
  if (status === "failure") return "❌";
  switch (event) {
    case "asset_materialized": return "📊";
    case "job_completed": return "✅";
    case "job_failed": return "❌";
    case "threshold_alert": return "⚠️";
    default: return "📨";
  }
}

function getEventTitle(payload: DagsterWebhookPayload): string {
  switch (payload.event) {
    case "asset_materialized":
      return `Asset Materialized: ${payload.asset_key || "unknown"}`;
    case "job_completed":
      return `Job Completed: ${payload.job_name || "unknown"}`;
    case "job_failed":
      return `Job Failed: ${payload.job_name || "unknown"}`;
    case "threshold_alert":
      return `Threshold Alert: ${payload.asset_key || payload.job_name || "unknown"}`;
    default:
      return `Dagster Event: ${payload.event}`;
  }
}

/**
 * Get notification target chat ID
 * Priority: payload.chat_id > env DAGSTER_NOTIFY_CHAT_ID > null
 */
function getNotificationChatId(payload: DagsterWebhookPayload): string | null {
  const payloadChatId = (payload.metadata as Record<string, unknown>)?.chat_id;
  if (typeof payloadChatId === "string") {
    return payloadChatId;
  }
  
  return process.env.DAGSTER_NOTIFY_CHAT_ID || null;
}

/**
 * Main handler for Dagster webhook
 */
export async function handleDagsterWebhook(
  request: Request,
  rawBody: string
): Promise<DagsterWebhookResult> {
  console.log("📨 [DagsterWebhook] Received webhook");

  // Validate secret
  if (!validateDagsterSecret(request)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  // Parse payload
  const payload = parsePayload(rawBody);
  if (!payload) {
    return { status: 400, body: { error: "Invalid payload" } };
  }

  console.log(`📨 [DagsterWebhook] Event: ${payload.event}, Asset: ${payload.asset_key || "N/A"}, Job: ${payload.job_name || "N/A"}`);

  // Get notification target
  const chatId = getNotificationChatId(payload);
  
  if (chatId) {
    // Send notification (non-blocking)
    sendDagsterNotification(chatId, payload).catch(err => {
      console.error("❌ [DagsterWebhook] Notification failed:", err);
    });
  } else {
    console.warn("⚠️ [DagsterWebhook] No chat_id configured for notifications");
  }

  // Log event for observability
  console.log(`✅ [DagsterWebhook] Processed event: ${payload.event}`);

  return { 
    status: 200, 
    body: { 
      ok: true, 
      event: payload.event,
      notified: !!chatId,
    } 
  };
}
