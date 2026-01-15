import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { MastraServer, HonoBindings, HonoVariables } from "@mastra/hono";
import * as lark from "@larksuiteoapi/node-sdk";
import { handleNewAppMention } from "./lib/handle-app-mention";
import { handleNewMessage } from "./lib/handle-messages";
import { getBotId, client, parseMessageContent, isThreadBotRelevant } from "./lib/feishu-utils";
import { extractFeishuUserId } from "./lib/auth/extract-feishu-user-id";
import { exchangeCodeForToken, generateAuthUrl } from "./lib/auth/feishu-oauth";
import { healthMonitor } from "./lib/health-monitor";
import { handleCardAction, parseCardActionCallback } from "./lib/handle-card-action";
import {
  handleButtonFollowup,
  extractButtonFollowupContext,
} from "./lib/handle-button-followup";
import { getMastraAsync, getObservabilityStatus } from "./lib/observability-config";
import { handleDocChangeWebhook } from "./lib/handlers/doc-webhook-handler";
import { handleDagsterWebhook } from "./lib/handlers/dagster-webhook-handler";
import { handleTaskUpdatedEvent, TaskUpdatedEvent } from "./lib/handlers/feishu-task-webhook-handler";
import {
  NotificationRequestSchema,
  NotificationApiResponseSchema,
  NotificationErrorResponseSchema,
  NotificationSuccessResponseSchema,
} from "./lib/notification-types";
import { authenticateNotificationRequest } from "./lib/notification-auth";
import { resolveNotificationTarget } from "./lib/notification-targets";
import {
  getCachedNotificationResponse,
  storeNotificationResponse,
} from "./lib/notification-idempotency";
import { logger } from "./lib/logger";

// Global error handlers to prevent process crash
process.on('unhandledRejection', (reason, promise) => {
  // Properly extract error info - Error objects serialize to {} by default
  const errorInfo =
    reason instanceof Error
      ? {
          name: reason.name,
          message: reason.message,
          stack: reason.stack,
          ...Object.fromEntries(Object.entries(reason)), // capture any enumerable props
        }
      : reason;
  logger.fail('Process', 'Unhandled Promise Rejection', { reason: errorInfo, promise: String(promise) });
});

process.on('uncaughtException', (error) => {
  logger.fail('Process', 'Uncaught Exception', error);
  // Don't exit immediately - log and continue
});

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

// Track processed events to prevent duplicates (with TTL for memory management)
const processedEvents = new Map<string, number>(); // key -> timestamp
const PROCESSED_EVENT_TTL_MS = 10 * 60 * 1000; // 10 minutes TTL
const PROCESSED_EVENT_MAX_SIZE = 2000;

let lastCleanupAt = Date.now();
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Only cleanup every 5 min, not per event

const cleanupProcessedEvents = () => {
  const now = Date.now();
  // Skip if recently cleaned to avoid O(n log n) sort spam
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS && processedEvents.size < PROCESSED_EVENT_MAX_SIZE) {
    return;
  }
  lastCleanupAt = now;
  
  // Fast path: only expire old entries (O(n))
  for (const [key, timestamp] of processedEvents) {
    if (now - timestamp > PROCESSED_EVENT_TTL_MS) {
      processedEvents.delete(key);
    }
  }
  
  // Expensive cleanup: only if over size limit
  if (processedEvents.size > PROCESSED_EVENT_MAX_SIZE) {
    const entries = [...processedEvents.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, processedEvents.size - PROCESSED_EVENT_MAX_SIZE);
    for (const [key] of toRemove) {
      processedEvents.delete(key);
    }
  }
};

// Determine if we're using Subscription Mode (WebSocket) or Webhook Mode
// Subscription Mode doesn't require encryptKey/verificationToken
const useSubscriptionMode = process.env.FEISHU_SUBSCRIPTION_MODE === "true" || 
                             (!process.env.FEISHU_ENCRYPT_KEY && !process.env.FEISHU_VERIFICATION_TOKEN);

// WebSocket watchdog configuration
// Increased thresholds to reduce unnecessary reconnects that cause duplicate message processing
const WS_WATCHDOG_INTERVAL_MS = 60_000; // Check every 60s instead of 30s
const WS_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes instead of 3 - low traffic is normal
const WS_MAX_CONSECUTIVE_FAILURES = 5; // 5 failures instead of 3

const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;
const botOpenId = process.env.FEISHU_BOT_OPEN_ID; // Bot's open_id for mention detection

// Track WebSocket health
let wsClient: lark.WSClient | null = null;
let lastWsEventAt = Date.now();
let wsConsecutiveFailures = 0;

const recordWsEvent = () => {
  lastWsEventAt = Date.now();
  healthMonitor.setWebSocketEventTimestamp(new Date(lastWsEventAt));
};

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const createWsClient = () =>
  new lark.WSClient({
    appId,
    appSecret,
    domain: lark.Domain.Feishu,
    autoReconnect: false, // Disabled - watchdog handles reconnects with proper cleanup
  });

const startWebSocket = async (reason: string): Promise<boolean> => {
  healthMonitor.setWebSocketStatus('connecting', reason);
  wsClient = createWsClient();
  try {
    await wsClient.start({ eventDispatcher });
    wsConsecutiveFailures = 0;
    lastWsEventAt = Date.now();
    healthMonitor.setWebSocketStatus('connected', reason);
    healthMonitor.setWebSocketEventTimestamp(new Date(lastWsEventAt));
    return true;
  } catch (error) {
    wsConsecutiveFailures++;
    healthMonitor.setWebSocketError(`start failed: ${formatError(error)}`);
    return false;
  }
};

const restartWebSocket = async (reason: string): Promise<boolean> => {
  if (!useSubscriptionMode) return false;
  healthMonitor.markWebSocketRestart(reason);
  healthMonitor.incrementWebSocketReconnectAttempt();
  try {
    await (wsClient as any)?.stop?.();
  } catch (error) {
    healthMonitor.setWebSocketError(`stop failed: ${formatError(error)}`);
  }

  try {
    const started = await startWebSocket(reason);
    if (started) {
      return true;
    }
  } catch (error) {
    healthMonitor.setWebSocketError(`restart failed: ${formatError(error)}`);
  }
  return false;
};

// Initialize Feishu EventDispatcher
// For Subscription Mode, encryptKey and verificationToken are optional
const eventDispatcher = new lark.EventDispatcher({
  encryptKey: encryptKey || "",
  verificationToken: verificationToken || "",
});

// Handle card action triggers (both webhook and WebSocket modes)
(eventDispatcher as any).register({
  "card.action.trigger": async (data: any) => {
    try {
      console.log("🔘 [CardAction] Card action trigger received");
      console.log("🔘 [CardAction] Action data:", JSON.stringify(data, null, 2));
      
      // Deduplicate card actions to prevent double processing
      // Use event_id (unique per event) or token as fallback
      const eventId = (data as any).event_id;
      const token = (data as any).token;
      const dedupKey = eventId ? `card:${eventId}` : (token ? `card:${token}` : null);
      
      if (dedupKey && processedEvents.has(dedupKey)) {
        console.log(`⚠️ [CardAction] Duplicate card action ignored: ${dedupKey}`);
        return;
      }
      if (dedupKey) {
        processedEvents.set(dedupKey, Date.now());
        cleanupProcessedEvents();
      }
      
      const botUserId = await getBotId();
      const operatorId = (data as any).operator?.user_id || (data as any).operator?.open_id || "";
      const rawActionValue = (data as any).action?.value;
      
      // Handle Release Notes card actions first
      if (typeof rawActionValue === "object" && rawActionValue?.action?.startsWith("release_notes_")) {
        console.log(`📋 [CardAction] Release notes action (WebSocket): ${rawActionValue.action}`);
        const { handleReleaseNotesCardAction } = await import("./lib/workflows/release-notes-workflow");
        await handleReleaseNotesCardAction(rawActionValue);
        return; // Handled
      }
      
      // Handle both string (legacy) and object (CardKit 2.0 with behaviors) formats
      // Object format: { context: "chatId|rootId", index: 0, text: "button text" }
      let actionValue: string | undefined;
      let buttonContext: string | undefined; // The chatId|rootId stored in button
      
      if (typeof rawActionValue === "string") {
        actionValue = rawActionValue;
      } else if (rawActionValue && typeof rawActionValue === "object") {
        // Extract text from object value (CardKit 2.0 callback format)
        actionValue = rawActionValue.text || rawActionValue.value;
        // Extract button's stored context (the correct chatId|rootId from when button was created)
        buttonContext = rawActionValue.context;
        console.log(`🔘 [CardAction] Extracted from object: text="${actionValue?.substring(0, 50)}...", context="${buttonContext}"`);
      }

      if (actionValue && actionValue.trim() && botUserId) {
        console.log(
          `🔘 [CardAction] Button clicked: "${actionValue.substring(0, 100)}..."`
        );

        // Priority for context extraction:
        // 1. Button's stored context (rawActionValue.context = "chatId|rootId") - most accurate
        // 2. Feishu's callback context (context.open_chat_id, open_message_id) - fallback
        let chatId = "";
        let rootId = "";
        
        if (buttonContext && buttonContext.includes("|")) {
          // Parse button's stored context: "chatId|rootId"
          const parts = buttonContext.split("|");
          chatId = parts[0];
          rootId = parts[1];
          console.log(`🔘 [CardAction] Using button context: chatId=${chatId}, rootId=${rootId}`);
        } else {
          // Fallback to Feishu's context (less accurate - open_message_id is card ID, not thread root)
          const feishuContext = (data as any).context || {};
          chatId = feishuContext.open_chat_id || "";
          rootId = feishuContext.open_message_id || "";
          console.log(`🔘 [CardAction] Using Feishu context (fallback): chatId=${chatId}, rootId=${rootId}`);
        }

        if (chatId && rootId) {
          console.log(
            `🔘 [CardAction] Final context: chatId=${chatId}, rootId=${rootId}`
          );
          
          // Process button click
          handleButtonFollowup({
            chatId,
            messageId: "",
            rootId,
            botUserId,
            userId: operatorId,
            buttonValue: actionValue,
            isMention: false,
          })
            .then(() => {
              console.log(`✅ [CardAction] Button followup processed successfully`);
            })
            .catch((err) => {
              console.error(`❌ [CardAction] Error processing button followup:`, err);
            });
        } else {
          console.warn(
            `⚠️ [CardAction] Missing context: chatId=${chatId}, rootId=${rootId}`
          );
        }
      } else {
        console.warn(`⚠️ [CardAction] No actionValue extracted from:`, rawActionValue);
      }
    } catch (error) {
      console.error("❌ [CardAction] Error handling card action:", error);
    }
  },
});

// Add a catch-all handler to see what events we're receiving
eventDispatcher.register({
  "*": async (data: any, eventType: string) => {
    recordWsEvent();
    // Log event type only, not full data (performance: avoid expensive JSON.stringify at scale)
    console.log(`🔔 [WebSocket] Received event type: ${eventType}`);

    // Handle card.action.trigger_v1 from WebSocket in catch-all as fallback
    if (eventType === "card.action.trigger_v1") {
        try {
          console.log("🔘 [WebSocket] Card action trigger_v1 received via WebSocket");
          
          // Deduplicate card actions to prevent double processing
          const eventId = (data as any).event_id;
          const token = (data as any).token;
          const dedupKey = eventId ? `card:${eventId}` : (token ? `card:${token}` : null);
          
          if (dedupKey && processedEvents.has(dedupKey)) {
            console.log(`⚠️ [CardAction] Duplicate card action (v1) ignored: ${dedupKey}`);
            return;
          }
          if (dedupKey) {
            processedEvents.set(dedupKey, Date.now());
            cleanupProcessedEvents();
          }
          
          const botUserId = await getBotId();
          const operatorId = (data as any).operator?.user_id || (data as any).operator?.open_id || "";
          const rawActionValue = (data as any).action?.value;
          
          // Handle Release Notes card actions first
          if (typeof rawActionValue === "object" && rawActionValue?.action?.startsWith("release_notes_")) {
            console.log(`📋 [CardAction] Release notes action (WebSocket v1): ${rawActionValue.action}`);
            const { handleReleaseNotesCardAction } = await import("./lib/workflows/release-notes-workflow");
            await handleReleaseNotesCardAction(rawActionValue);
            return; // Handled
          }
          
          // Handle both string (legacy) and object (CardKit 2.0) formats
          let actionValue: string | undefined;
          let buttonContext: string | undefined; // The chatId|rootId stored in button
          
          if (typeof rawActionValue === "string") {
            actionValue = rawActionValue;
          } else if (rawActionValue && typeof rawActionValue === "object") {
            actionValue = rawActionValue.text || rawActionValue.value;
            // Extract button's stored context (the correct chatId|rootId)
            buttonContext = rawActionValue.context;
          }

          if (actionValue && actionValue.trim() && botUserId) {
            console.log(
              `🔘 [CardAction] Button clicked via WebSocket: "${actionValue.substring(0, 100)}...", buttonContext="${buttonContext}"`
            );

            // Priority for context extraction:
            // 1. Button's stored context (rawActionValue.context = "chatId|rootId") - most accurate
            // 2. Feishu's callback context - fallback
            let chatId = "";
            let rootId = "";
            
            if (buttonContext && buttonContext.includes("|")) {
              const parts = buttonContext.split("|");
              chatId = parts[0];
              rootId = parts[1];
              console.log(`🔘 [CardAction] Using button context: chatId=${chatId}, rootId=${rootId}`);
            } else {
              const feishuContext = (data as any).context || (data as any).trigger || {};
              chatId = feishuContext.open_chat_id || feishuContext.chat_id || "";
              rootId = feishuContext.open_message_id || feishuContext.message_id || "";
              console.log(`🔘 [CardAction] Using Feishu context (fallback): chatId=${chatId}, rootId=${rootId}`);
            }

            if (chatId && rootId) {
              console.log(
                `🔘 [CardAction] Final context: chatId=${chatId}, rootId=${rootId}`
              );

              // Process button click as background task
              handleButtonFollowup({
                chatId,
                messageId: rootId,
                rootId,
                botUserId,
                userId: operatorId,
                buttonValue: actionValue,
                isMention: false,
              })
                .then(() => {
                  console.log(`✅ [CardAction] WebSocket button followup processed successfully`);
                })
                .catch((err) => {
                  console.error(`❌ [CardAction] WebSocket button followup error:`, err);
                });
            } else {
              console.warn(
                `⚠️ [CardAction] Missing context: chatId=${chatId}, rootId=${rootId}`
              );
            }
          }
        } catch (error) {
          console.error("❌ [CardAction] Error handling WebSocket card action:", error);
        }
      }
    },
  } as any);

// Silently ignore task tenant updates (not relevant to our use case)
eventDispatcher.register({
  "task.task.update_tenant_v1": async () => {
    // No-op: Feishu sends these for workspace-level task config changes
    // We only care about individual task updates (task.task.updated_v1)
  },
} as any);

// Handle Feishu task events (for GitLab-Feishu task sync)
// Supports: task.created, task.updated, task.completed, task.uncompleted, task.deleted
eventDispatcher.register({
  "task.task.updated_v1": async (data: any) => {
    try {
      console.log("📋 [WebSocket] Task update event received");
      const taskGuid = data?.object?.guid || data?.task_guid;
      const eventKey = data?.event_key || data?.action;
      const changedFields = data?.changed_fields || [];
      
      if (!taskGuid) {
        console.warn("⚠️ [WebSocket] Task event missing task_guid");
        return;
      }
      
      // Build event structure expected by handler
      const event = {
        schema: "2.0",
        header: { event_type: "task.task.updated_v1" },
        event: { task_guid: taskGuid, event_key: eventKey, obj_type: 1, changed_fields: changedFields },
      } as any;
      
      const result = await handleTaskUpdatedEvent(event);
      console.log(`📋 [WebSocket] Task sync result: ${result.message}`);
    } catch (error) {
      console.error("❌ [WebSocket] Error handling task update:", error);
    }
  },
} as any);

// Handle Feishu task creation events
eventDispatcher.register({
  "task.task.created_v1": async (data: any) => {
    try {
      console.log("📋 [WebSocket] Task created event received");
      const taskGuid = data?.object?.guid || data?.task_guid;
      
      if (!taskGuid) {
        console.warn("⚠️ [WebSocket] Task created event missing task_guid");
        return;
      }
      
      const event = {
        schema: "2.0",
        header: { event_type: "task.task.created_v1" },
        event: { task_guid: taskGuid, event_key: "task.created", obj_type: 1 },
      } as any;
      
      const result = await handleTaskUpdatedEvent(event);
      console.log(`📋 [WebSocket] Task create result: ${result.message}`);
    } catch (error) {
      console.error("❌ [WebSocket] Error handling task creation:", error);
    }
  },
} as any);

// Handle Feishu task comment events
eventDispatcher.register({
  "task.task.comment_created_v1": async (data: any) => {
    try {
      console.log("📋 [WebSocket] Task comment event received");
      const taskGuid = data?.object?.guid || data?.task_guid;
      const commentGuid = data?.comment_guid || data?.object?.comment_guid;
      
      if (!taskGuid) {
        console.warn("⚠️ [WebSocket] Task comment event missing task_guid");
        return;
      }
      
      const event = {
        schema: "2.0",
        header: { event_type: "task.task.comment_created_v1" },
        event: { task_guid: taskGuid, event_key: "task.comment.created", obj_type: 1, comment_guid: commentGuid },
      } as any;
      
      const result = await handleTaskUpdatedEvent(event);
      console.log(`📋 [WebSocket] Task comment result: ${result.message}`);
    } catch (error) {
      console.error("❌ [WebSocket] Error handling task comment:", error);
    }
  },
} as any);

eventDispatcher.register({
  "im.message.receive_v1": async (data) => {
      try {
        // IMMEDIATE FIX: Filter out old messages to prevent processing during WebSocket reconnections
        const rawCreateTime = (data as any).message?.create_time || (data as any).message?.timestamp;
        const now = Date.now();
        
        // Detect if timestamp is in seconds (10 digits) or milliseconds (13 digits)
        // Feishu typically sends seconds, but handle both cases
        let messageCreateTimeMs: number | null = null;
        if (rawCreateTime) {
          const tsNum = typeof rawCreateTime === 'string' ? parseInt(rawCreateTime, 10) : rawCreateTime;
          // If timestamp is less than 10^12, it's in seconds; convert to ms
          messageCreateTimeMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
        }
        
        const messageAgeMs = messageCreateTimeMs ? (now - messageCreateTimeMs) : null;
        
        // Ignore messages older than 5 minutes (300000 ms) to prevent reprocessing on reconnect
        // Also ignore if we can't determine age (null) - safer to skip than to process old messages
        if (messageAgeMs === null) {
          console.warn(`⚠️ [WebSocket] Ignoring message with unknown timestamp: messageId=${(data as any).message?.message_id}`);
          return;
        }
        if (messageAgeMs > 300000) {
          console.log(`⚠️ [WebSocket] Ignoring old message (${Math.round(messageAgeMs / 1000)}s ago): messageId=${(data as any).message?.message_id}`);
          return;
        }
        if (messageAgeMs < -60000) {
          // Message from the "future" (clock skew > 1 min) - likely bad timestamp, skip
          console.warn(`⚠️ [WebSocket] Ignoring message with future timestamp (${Math.round(messageAgeMs / 1000)}s): messageId=${(data as any).message?.message_id}`);
          return;
        }

        // Deduplicate events - ALWAYS use message_id as primary key (stable across reconnects)
        // event_id can change on WebSocket reconnection, but message_id stays the same
        const eventId = (data as any).event_id || (data as any).event?.event_id;
        const message = data.message;
        const messageId = message?.message_id;
        
        // Primary dedup by message_id (most reliable), fallback to event_id
        const dedupKey = messageId ? `msg:${messageId}` : (eventId ? `evt:${eventId}` : null);
        
        if (!dedupKey) {
          console.warn(`⚠️ [WebSocket] No message_id or event_id for deduplication, skipping message`);
          return; // Changed: skip instead of processing - safer
        }
        
        if (processedEvents.has(dedupKey)) {
          console.log(`⚠️ [WebSocket] Duplicate event ignored: ${dedupKey}`);
          return;
        }
        
        processedEvents.set(dedupKey, Date.now());
        cleanupProcessedEvents();

        console.log("📨 [WebSocket] Event received: im.message.receive_v1");
      console.log("📨 [WebSocket] Event data:", JSON.stringify(data, null, 2));
      const botUserId = await getBotId();
      console.log(`🤖 [WebSocket] Bot User ID: ${botUserId}`);
      const chatId = message.chat_id;
      const rootId = message.root_id || messageId;
      const content = message.content;
      // @ts-ignore - sender may exist in subscription mode data structure
      const senderType = (message as any).sender?.sender_type || data.sender?.sender_type;
      
      // Extract user ID from Feishu event for authentication and RLS
      const userId = extractFeishuUserId(message, data);
      if (userId) {
        console.log(`👤 [Auth] Extracted user ID: ${userId}`);
      } else {
        console.warn(`⚠️ [Auth] Could not extract user ID, using chatId as fallback: ${chatId}`);
      }

      // Parse message content
      let messageText = "";
      let isMention = false;
      let mentionedUserId: string | null = null;

      console.log(`📩 [WebSocket] Message details: chatId=${chatId}, messageId=${messageId}, chatType=${message.chat_type}`);

      try {
        // Use helper function that handles both text and post formats
        messageText = parseMessageContent(content);

        // Check if bot is mentioned using mentions array (Subscription Mode)
        // @ts-ignore - mentions array exists in subscription mode
        const mentions = (message as any).mentions || [];
        console.log(`🔍 [WebSocket] Mentions array:`, JSON.stringify(mentions, null, 2));
        
        // Resolve mention placeholders (_user_1, _user_2, etc.) to actual user IDs
        // This is critical for workflows that need to parse @mentions (e.g., assignee in GitLab issues)
        if (mentions.length > 0) {
          for (const mention of mentions) {
            const mentionKey = mention.key; // e.g., "@_user_1" or "_user_1"
            if (!mentionKey) continue;
            
            // Get the actual user ID (prefer user_id for GitLab mapping, then open_id)
            const actualUserId = mention.id?.user_id || mention.id?.open_id || mention.id?.union_id;
            if (!actualUserId) continue;
            
            // Replace both "@_user_X" and "_user_X" patterns in the message text
            // Feishu may use either format depending on message type
            const patterns = [
              mentionKey,                           // e.g., "@_user_1"
              mentionKey.replace(/^@/, ''),         // e.g., "_user_1"
            ];
            
            for (const pattern of patterns) {
              if (messageText.includes(pattern)) {
                console.log(`🔄 [WebSocket] Resolving mention: ${pattern} → @${actualUserId} (${mention.name || 'unknown'})`);
                // Preserve @ prefix for mentions so downstream can identify them
                messageText = messageText.split(pattern).join(`@${actualUserId}`);
              }
            }
          }
        }
        
        // Extract mentioned user ID from mentions array
        // Skip bot mention and find actual user mention
        // PRIORITY: user_id > open_id (user_id maps to GitLab username like "xiaofei.yin")
        if (mentions.length > 0 && message.chat_type === "group") {
          // Find first user mention (skip bot mention)
          const userMention = mentions.find((mention: any) => {
            const mentionId = mention.id?.open_id || mention.id?.user_id;
            // Skip if it's the bot itself
            return mentionId && mentionId !== botUserId;
          });

          if (userMention) {
            // Prefer user_id (maps to GitLab username) over open_id
            mentionedUserId = userMention.id?.user_id ||
                             userMention.id?.open_id ||
                             userMention.id?.union_id ||
                             null;

            if (mentionedUserId) {
              console.log(`📌 [WebSocket] Extracted mentioned user ID: ${mentionedUserId} (${userMention.name || 'unknown'})`);
            }
          } else {
            console.log(`🔍 [WebSocket] No user mention found (only bot mention)`);
          }
        }
        
        // Check mentions array for bot
        // In Subscription Mode, check if BOT is in mentions array
        if (message.chat_type === "group") {
          // Look for bot in mentions array (by open_id, user_id, or app_id)
          const botMentioned = mentions.some((mention: any) => {
            const mentionOpenId = mention.id?.open_id;
            const mentionUserId = mention.id?.user_id;
            const mentionAppId = mention.id?.app_id;
            
            // Check if this mention matches the bot's IDs
            // botOpenId is the actual open_id when bot is mentioned in groups
            // botUserId (appId) is used as fallback
            const isBotMention = (botOpenId && mentionOpenId === botOpenId) || 
                                mentionAppId === botUserId ||
                                mentionUserId === botUserId;
            
            if (isBotMention) {
              console.log(`✅ [WebSocket] Bot mention found in mentions array: ${JSON.stringify(mention)}`);
            }
            return isBotMention;
          });
          
          if (botMentioned) {
            console.log(`✅ [WebSocket] Bot mention detected in mentions array`);
            isMention = true;
          } else if (mentions.length > 0) {
            console.log(`🔍 [WebSocket] Found ${mentions.length} user mention(s) in group (not bot mention)`);
          }
        }

        // Fallback: Check text for @mentions (webhook mode format)
        // Bot mentions appear as <at app_id="cli_xxx"> in subscription mode
        if (!isMention && (messageText.includes(`<at user_id="${botUserId}">`) || 
            messageText.includes(`<at open_id="${botUserId}">`) ||
            messageText.includes(`<at app_id="${botUserId}">`))) {
          isMention = true;
          console.log(`✅ [WebSocket] Bot mention detected in message text`);
        }
      } catch (e) {
        console.error("Failed to parse message content:", e);
        return;
      }

      // Skip if message is from bot itself
      if (senderType === "app") {
        return;
      }

      // Handle direct message (chat_type === "p2p")
      if (message.chat_type === "p2p") {
        console.log(`💬 [WebSocket] Processing direct message: "${messageText.substring(0, 50)}..."`);
        await handleNewMessage({
          chatId,
          messageId,
          rootId,
          messageText,
          botUserId,
          userId: userId || chatId, // Fallback to chatId if userId not available
        } as any);
        return;
      }

      // Handle group message with mention
      if (isMention) {
        console.log(`👥 [WebSocket] Processing group mention: "${messageText.substring(0, 50)}..."`);
        // Use SENDER's user_id for context (needed for GitLab assignee, RLS, etc.)
        // sender's user_id (like "xiaofei.yin") maps to GitLab username
        // mentionedUserId might be someone else entirely (not the requester)
        const contextUserId = userId || chatId;
        console.log(`💾 [WebSocket] Using sender user ID for context: ${contextUserId}`);
        
        await handleNewAppMention({
          chatId,
          messageId,
          rootId,
          messageText,
          botUserId,
          userId: contextUserId,
        } as any);
        return;
      }

      // Handle thread reply (if root_id exists and is different from message_id)
      if (message.root_id && message.root_id !== messageId) {
        // Check for GitLab commands that should work without bot-relevance check
        // These enable users to interact with GitLab issues from any thread
        const isLinkCommand = /(?:link\s*(?:to|this\s*to)?|跟踪|关联|绑定|track)\s*(?:#|issue\s*#?)?(\d+)/i.test(messageText);
        const isSummarizeCommand = /(?:summarize|summary|status|状态|总结|进展)\s*(?:of\s*)?(?:#|issue\s*#?)?(\d+)/i.test(messageText);
        const isCloseCommand = /(?:close|完成|关闭|done|finish|结束)\s*(?:#|issue\s*#?)?(\d+)/i.test(messageText);
        const isAssignCommand = /assign\s*(?:to\s*)?me|我来(?:做|负责|执行|吧)?|我已经|安排给我|分配给我|指派给我|我负责|我接|让我来/i.test(messageText);
        const isGitLabCommand = isLinkCommand || isSummarizeCommand || isCloseCommand || isAssignCommand;
        
        if (isGitLabCommand) {
          const cmdType = isLinkCommand ? 'link' : isSummarizeCommand ? 'summarize' : isCloseCommand ? 'close' : 'assign';
          console.log(`🔗 [WebSocket] GitLab ${cmdType} command detected, bypassing thread relevance check`);
        } else {
          // Validate thread relevance before processing (non-link commands)
          const isRelevant = await isThreadBotRelevant(chatId, message.root_id, botUserId);
          if (!isRelevant) {
            console.log(`⚠️ [WebSocket] Thread reply ignored: thread ${message.root_id} is not bot-relevant`);
            return;
          }
        }
        
        console.log(`🧵 [WebSocket] Processing thread reply: "${messageText.substring(0, 50)}..."`);
        await handleNewMessage({
          chatId,
          messageId,
          rootId: message.root_id,
          messageText,
          botUserId,
          userId: userId || chatId, // Fallback to chatId if userId not available
        });
        return;
      }
      
      console.log(`⚠️ [WebSocket] Message ignored (not p2p, not mention, not thread reply)`);
    } catch (error) {
      console.error("❌ [WebSocket] Error handling message event:", error);
    }
  },
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({ 
    status: "ok", 
    service: "feishu-agent",
    mode: useSubscriptionMode ? "subscription" : "webhook"
  });
});

// Detailed health metrics endpoint
app.get("/health", (c) => {
  const metrics = healthMonitor.getMetrics();
  const statusCode = metrics.status === 'unhealthy' ? 503 : metrics.status === 'degraded' ? 200 : 200;
  return c.json(metrics, statusCode);
});

// OAuth callback endpoint for Feishu user authorization
// Users are redirected here after granting document access permission
app.get("/oauth/feishu/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    console.error(`[OAuth] Authorization denied: ${error}`);
    return c.html(`
      <html>
        <head><title>授权失败</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>❌ 授权失败</h2>
          <p>用户拒绝了授权或发生错误: ${error}</p>
          <p>请返回飞书重新尝试。</p>
        </body>
      </html>
    `);
  }

  if (!code || !state) {
    return c.html(`
      <html>
        <head><title>参数错误</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>❌ 参数错误</h2>
          <p>缺少必要的授权参数。</p>
        </body>
      </html>
    `, 400);
  }

  const result = await exchangeCodeForToken(code, state);

  if (result.success) {
    return c.html(`
      <html>
        <head><title>授权成功</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>✅ 授权成功!</h2>
          <p>已获得文档访问权限。</p>
          <p>现在可以关闭此页面，返回飞书继续使用。</p>
          <p style="color: #666; margin-top: 20px;">Bot 现在可以读取您有权访问的飞书文档了。</p>
        </body>
      </html>
    `);
  } else {
    return c.html(`
      <html>
        <head><title>授权失败</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>❌ 授权失败</h2>
          <p>错误: ${result.error}</p>
          <p>请返回飞书重新尝试。</p>
        </body>
      </html>
    `, 500);
  }
});

// Internal notification API endpoint
// POST /internal/notify/feishu/v1
//
// Allows trusted internal tools (Cursor, AMP, batch jobs, etc.) to send
// notifications into Feishu via the existing bot ("evi") without going
// through the Mastra manager agent or public webhooks.
app.post("/internal/notify/feishu/v1", async (c) => {
  try {
    // 1) Authenticate caller using shared-secret header
    const rawHeaders = c.req.header();
    const authContext = authenticateNotificationRequest(rawHeaders as Record<string, string | undefined>);

    // 2) Parse and validate JSON body against NotificationRequestSchema
    const body = await c.req.json().catch(() => {
      throw new Error("INVALID_REQUEST: body must be valid JSON");
    });

    const request = NotificationRequestSchema.parse(body);

    const idempotencyKey = request.meta?.idempotencyKey;

    // 2b) If an idempotency key is supplied, return cached success response
    // when available.
    if (idempotencyKey) {
      const cached = getCachedNotificationResponse(idempotencyKey);
      if (cached) {
        const response = NotificationSuccessResponseSchema.parse(cached);
        return c.json(response, 200);
      }
    }

    // 3) Resolve target (including logical_name → concrete mapping + auth)
    const { receiveIdType, receiveId } = resolveNotificationTarget(
      request.target,
      authContext,
    );

    // 4) Dispatch to Feishu based on kind
    let messageId: string | undefined;

    if (request.kind === "text") {
      const payload = (request.payload as any).text;
      if (typeof payload !== "string" || !payload.trim()) {
        throw new Error("INVALID_PAYLOAD: text payload is required for kind=text");
      }

      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await client.im.message.create({
            params: {
              receive_id_type: receiveIdType,
            },
            data: {
              receive_id: receiveId,
              msg_type: "text",
              content: JSON.stringify({ text: payload }),
            },
          });

          const isSuccess = resp.code === 0 || resp.code === undefined;
          if (!isSuccess || !resp.data?.message_id) {
            throw new Error("FEISHU_ERROR: failed to send text message");
          }
          messageId = resp.data.message_id;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * Math.pow(2, attempt)),
            );
          }
        }
      }
      if (!messageId) {
        throw new Error(
          `FEISHU_ERROR: failed to send text message after retries: ${String(
            lastError,
          )}`,
        );
      }
    } else if (request.kind === "markdown") {
      const payload = request.payload as any;
      const markdown: string | undefined = payload.markdown;
      if (typeof markdown !== "string" || !markdown.trim()) {
        throw new Error(
          "INVALID_PAYLOAD: markdown payload is required for kind=markdown",
        );
      }

      // For v1 we send markdown as plain text; future versions may switch to
      // Feishu "post" or an interactive card depending on use case.
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await client.im.message.create({
            params: {
              receive_id_type: receiveIdType,
            },
            data: {
              receive_id: receiveId,
              msg_type: "text",
              content: JSON.stringify({ text: markdown }),
            },
          });

          const isSuccess = resp.code === 0 || resp.code === undefined;
          if (!isSuccess || !resp.data?.message_id) {
            throw new Error("FEISHU_ERROR: failed to send markdown message");
          }
          messageId = resp.data.message_id;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 100 * Math.pow(2, attempt)),
            );
          }
        }
      }
      if (!messageId) {
        throw new Error(
          `FEISHU_ERROR: failed to send markdown message after retries: ${String(
            lastError,
          )}`,
        );
      }
    } else {
      // card and chart_report will be implemented in Phase 2 extensions.
      throw new Error(
        `INVALID_REQUEST: kind "${request.kind}" is not yet supported by this endpoint`,
      );
    }

    const response = NotificationApiResponseSchema.parse({
      status: "sent",
      messageId,
    });
    return c.json(response, 200);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NotificationAPI] Error handling request:", message);

    let statusCode = 500;
    let errorCode: "UNAUTHORIZED" | "FORBIDDEN" | "INVALID_REQUEST" | "INVALID_TARGET" | "INVALID_PAYLOAD" | "FEISHU_ERROR" | "INTERNAL_ERROR" =
      "INTERNAL_ERROR";

    if (message.startsWith("UNAUTHORIZED")) {
      statusCode = 401;
      errorCode = "UNAUTHORIZED";
    } else if (message.startsWith("FORBIDDEN")) {
      statusCode = 403;
      errorCode = "FORBIDDEN";
    } else if (message.startsWith("INVALID_TARGET")) {
      statusCode = 400;
      errorCode = "INVALID_TARGET";
    } else if (message.startsWith("INVALID_PAYLOAD")) {
      statusCode = 400;
      errorCode = "INVALID_PAYLOAD";
    } else if (message.startsWith("INVALID_REQUEST")) {
      statusCode = 400;
      errorCode = "INVALID_REQUEST";
    } else if (message.startsWith("FEISHU_ERROR")) {
      statusCode = 502;
      errorCode = "FEISHU_ERROR";
    }

    const errorBody = NotificationErrorResponseSchema.parse({
      status: "error",
      errorCode,
      message,
    });

    return c.json(errorBody, statusCode as 400 | 401 | 403 | 500);
  }
});

// Feishu webhook endpoint (only used in Webhook Mode)
// In Subscription Mode, events come through WebSocket connection managed by SDK
app.post("/webhook/event", async (c) => {
  if (useSubscriptionMode) {
    return c.json({ 
      error: "Webhook mode disabled. Using Subscription Mode (WebSocket)." 
    }, 400);
  }
  try {
    const rawBody = await c.req.text();
    const headers = c.req.header();

    // Handle URL verification challenge
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return c.json({ challenge: payload.challenge });
      }
    } catch (e) {
      // Not a challenge, continue with event processing
    }

    // Invoke the event dispatcher manually
    // The dispatcher expects headers and body
    const result = await eventDispatcher.invoke({
      headers: headers,
      body: rawBody,
    });

    // The dispatcher may return a response object
    // If it does, we should return it; otherwise return success
    if (result) {
      // If result is a Response object, return it
      if (result instanceof Response) {
        return result;
      }
      // If result has a body property, parse and return it
      if (typeof result === "object" && "body" in result) {
        try {
          const body = typeof result.body === "string" 
            ? JSON.parse(result.body) 
            : result.body;
          return c.json(body);
        } catch (e) {
          return c.json({ success: true }, 200);
        }
      }
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("Error processing webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Document change webhook endpoint (for docs:event:subscribe)
// When user watches a document, Feishu pushes change events here
app.post("/webhook/docs/change", async (c) => {
  try {
    const rawBody = await c.req.text();

    // Handle URL verification challenge
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return c.json({ challenge: payload.challenge });
      }
    } catch (e) {
      // Not a challenge, continue with doc change processing
    }

    // Convert Hono request to web Request for validation
    const webRequest = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
    });

    const result = await handleDocChangeWebhook(webRequest, rawBody);
    return c.json({ ok: true }, result.status as 200 | 400 | 500);
  } catch (error) {
    console.error("❌ [DocWebhook] Error processing webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Feishu Task webhook endpoint
// Receives task events to sync with GitLab issues:
// - task.task.created_v1: New task → create GitLab issue
// - task.task.updated_v1: Task update → update GitLab issue
// - task.task.comment_created_v1: Comment → GitLab note
// Configure this URL in Feishu admin: Event Subscriptions
app.post("/webhook/task", async (c) => {
  try {
    const rawBody = await c.req.text();

    // Handle URL verification challenge
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return c.json({ challenge: payload.challenge });
      }
      
      const eventType = payload.header?.event_type;
      
      // Handle task events
      if (eventType === "task.task.updated_v1" || 
          eventType === "task.task.created_v1" ||
          eventType === "task.task.comment_created_v1") {
        
        // Map event type to event_key
        let eventKey = payload.event?.event_key;
        if (!eventKey) {
          if (eventType === "task.task.created_v1") eventKey = "task.created";
          else if (eventType === "task.task.comment_created_v1") eventKey = "task.comment.created";
        }
        
        const event: TaskUpdatedEvent = {
          schema: payload.schema || "2.0",
          header: payload.header,
          event: {
            task_guid: payload.event?.task_guid || payload.event?.object?.guid,
            obj_type: payload.event?.obj_type || 1,
            event_key: eventKey,
            comment_guid: payload.event?.comment_guid,
            changed_fields: payload.event?.changed_fields,
          },
        };
        
        const result = await handleTaskUpdatedEvent(event);
        return c.json(result, result.success ? 200 : 500);
      }
    } catch (e) {
      console.error("❌ [TaskWebhook] Error parsing payload:", e);
    }

    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("❌ [TaskWebhook] Error processing webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Dagster pipeline webhook endpoint
// Receives notifications from Dagster sensors on asset materialization, job completion, etc.
// Security: Validates X-Dagster-Secret header against DAGSTER_WEBHOOK_SECRET env var
app.post("/webhook/dagster", async (c) => {
  try {
    const rawBody = await c.req.text();

    const webRequest = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
    });

    const result = await handleDagsterWebhook(webRequest, rawBody);
    return c.json(result.body, result.status as 200 | 400 | 500);
  } catch (error) {
    console.error("❌ [DagsterWebhook] Error processing webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Card action webhook endpoint (for interactive card callbacks)
// NOTE: Card action callbacks typically still use webhooks even in Subscription Mode
// If you're using interactive cards with buttons, you'll need to configure this URL
// in the "Callback Configuration" tab in Feishu admin panel
app.post("/webhook/card", async (c) => {
  try {
    const rawBody = await c.req.text();
    const headers = c.req.header();

    // Handle URL verification challenge for card callbacks
    try {
      const payload = JSON.parse(rawBody);
      if (payload.type === "url_verification") {
        return c.json({ challenge: payload.challenge });
      }
    } catch (e) {
      // Not a challenge, continue with card action processing
    }

    // Parse and validate card action callback
    const cardActionPayload = await parseCardActionCallback(
      headers,
      rawBody,
      eventDispatcher
    );

    if (!cardActionPayload) {
      console.warn("⚠️ [CardAction] Invalid or unparseable card action payload");
      return c.json({ error: "Invalid payload" }, 400);
    }

    // Deduplicate card actions to prevent double processing (webhook + WebSocket)
    const action = cardActionPayload.event?.action as any;
    const actionToken = action?.action_token;
    const actionTime = action?.action_time;
    const operatorId = cardActionPayload.event?.operator?.operator_id || "";
    const dedupKey = actionToken ? `card:${actionToken}` : `card:${actionTime}:${operatorId}`;
    
    if (processedEvents.has(dedupKey)) {
      console.log(`⚠️ [CardAction] Duplicate card webhook action ignored: ${dedupKey}`);
      // Still return success to Feishu to avoid retries
      return c.json({ toast: { type: "success", content: "Processing..." } }, 200);
    }
    processedEvents.set(dedupKey, Date.now());
    cleanupProcessedEvents();

    // Get bot ID for button followup routing
    const botUserId = await getBotId();

    // Check if this is a button action
    const actionValue = cardActionPayload.event?.action?.value;
    
    // Handle Release Notes card actions
    if (typeof actionValue === "object" && actionValue?.action?.startsWith("release_notes_")) {
      console.log(`📋 [CardAction] Release notes action detected: ${actionValue.action}`);
      const { handleReleaseNotesCardAction } = await import("./lib/workflows/release-notes-workflow");
      const response = await handleReleaseNotesCardAction(actionValue);
      return c.json(response, 200);
    }
    if (typeof actionValue === "string" && actionValue.trim() && botUserId) {
      console.log(`🔘 [CardAction] Detected button followup action: "${actionValue}"`);

      // Extract button followup context from action_id which contains chatId|rootId|index
      const actionId = cardActionPayload.event?.action?.action_id;
      let chatId = "";
      
      if (actionId && typeof actionId === "string" && actionId.includes("|")) {
        // Parse context from action_id
        const parts = actionId.split("|");
        chatId = parts[0];
        console.log(`🔘 [CardAction] Extracted chatId from action_id: ${chatId}`);
      } else {
        // Fallback to app_id if action_id doesn't have context
        chatId = cardActionPayload.header?.app_id || "unknown";
        console.warn(`⚠️ [CardAction] action_id doesn't have context format, using app_id: ${chatId}`);
      }
      
      const buttonContext = extractButtonFollowupContext(
        cardActionPayload,
        chatId,
        botUserId,
        false // Determine from message context if needed
      );

      if (buttonContext) {
        console.log(`✅ [CardAction] Extracted button followup context: chatId=${buttonContext.chatId}, rootId=${buttonContext.rootId}, value="${buttonContext.buttonValue}"`);
        // Process button click as a new user message (in background)
        handleButtonFollowup(buttonContext)
          .then(() => {
            console.log(`✅ [CardAction] Button followup processed successfully`);
          })
          .catch((err) => {
            console.error(`❌ [CardAction] Error processing button followup:`, err);
          });

        // Return success response immediately
        return c.json(
          {
            toast: {
              type: "success" as const,
              content: "Processing your selection...",
            },
          },
          200
        );
      }
    }

    // Default: handle as generic card action
    const response = await handleCardAction(cardActionPayload);

    // Send response within 3 seconds as required by Feishu
    console.log(`✅ [CardAction] Sending response:`, JSON.stringify(response, null, 2));
    return c.json(response, 200);
  } catch (error) {
    console.error("❌ [CardAction] Error processing card webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

const port = parseInt(process.env.PORT || "3000");

// Global error handlers for graceful degradation
process.on('uncaughtException', (error) => {
  console.error('❌ [FATAL] Uncaught exception:', error);
  console.error('Stack:', error.stack);
  healthMonitor.trackError('OTHER', `Uncaught exception: ${error.message}`);
  // Log but don't crash - let process manager handle restart
  // This allows ongoing requests to complete
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [WARN] Unhandled rejection at:', promise, 'reason:', reason);
  const message = reason instanceof Error ? reason.message : String(reason);
  healthMonitor.trackError('OTHER', `Unhandled rejection: ${message}`);
});

// Devtools endpoints (development only) - moved before port usage
if (process.env.NODE_ENV === "development" || process.env.ENABLE_DEVTOOLS === "true") {
  // Import devtools tracker (using dynamic import to avoid top-level await)
  import("./lib/devtools-integration").then(({ devtoolsTracker }) => {
    // API endpoint for devtools data with advanced filtering
    app.get("/devtools/api/events", (c) => {
      const limit = c.req.query("limit");
      const type = c.req.query("type");
      const agent = c.req.query("agent");
      const tool = c.req.query("tool");
      const search = c.req.query("search");
      
      let events = devtoolsTracker.getEvents(limit ? parseInt(limit) : undefined);
      
      // Apply filters
      const filterOptions: any = {};
      if (type) filterOptions.types = [type];
      if (agent) filterOptions.agents = [agent];
      if (tool) filterOptions.tools = [tool];
      if (search) filterOptions.searchQuery = search;
      
      if (Object.keys(filterOptions).length > 0) {
        events = devtoolsTracker.filterEvents(filterOptions);
      }
      
      return c.json({ events });
    });
    
    // API endpoint for sessions
    app.get("/devtools/api/sessions", (c) => {
      const tool = c.req.query("tool");
      const sessions = tool 
        ? devtoolsTracker.getSessionsForTool(tool)
        : devtoolsTracker.getSessions();
      return c.json({ sessions });
    });
    
    // API endpoint for statistics
    app.get("/devtools/api/stats", (c) => {
      return c.json({
        ...devtoolsTracker.getStats(),
        uniqueAgents: devtoolsTracker.getUniqueAgents(),
        uniqueTools: devtoolsTracker.getUniqueToolNames(),
        eventStats: devtoolsTracker.getEventStats(),
      });
    });
    
    // API endpoint to clear events
    app.post("/devtools/api/clear", (c) => {
      devtoolsTracker.clear();
      return c.json({ success: true });
    });
    
    console.log("🔧 Devtools API: http://localhost:" + port + "/devtools/api/events");
    console.log("🔧 Devtools Sessions: http://localhost:" + port + "/devtools/api/sessions");
    console.log("🔧 Devtools Stats: http://localhost:" + port + "/devtools/api/stats");
  });
  
  // Serve devtools UI
  app.get("/devtools", async (c) => {
    const fs = await import("fs/promises");
    const path = await import("path");
    try {
      const htmlPath = path.join(process.cwd(), "lib", "devtools-page.html");
      const html = await fs.readFile(htmlPath, "utf-8");
      return c.html(html);
    } catch (error) {
      console.error("Error loading devtools page:", error);
      return c.text("Devtools page not found", 404);
    }
  });
  
  console.log("🔧 Devtools available at: http://localhost:" + port + "/devtools");
}

/**
 * Main startup sequence
 * Handles both Subscription Mode (WebSocket) and Webhook Mode
 * 
 * IMPORTANT: In Subscription Mode, WebSocket connection is established first,
 * then HTTP server starts. This prevents race conditions and ensures the
 * server is fully ready before it reports as "running".
 */
async function startServer() {
  const startTime = Date.now();
  console.log(`📋 [Startup] Starting server initialization... (${new Date().toISOString()})`);
  
  // Step 0: Initialize Mastra Observability and Memory (background, non-blocking)
  console.log("📋 [Startup] Step 0: Initializing Mastra Observability and Memory...");
  
  // Initialize observability (synchronous, already configured)
  const obsStatus = getObservabilityStatus();
  if (obsStatus.enabled) {
    console.log(`✅ [Startup] Step 0a: Mastra Observability enabled`);
    console.log(`   Phoenix endpoint: ${obsStatus.phoenixEndpoint}`);
    console.log(`   Project: ${obsStatus.projectName}`);
    console.log(`   Log level: ${obsStatus.logLevel}`);
  } else {
    console.warn("⚠️ [Startup] Step 0a: Mastra Observability disabled (PHOENIX_ENDPOINT not set)");
  }
  
  // Initialize memory storage tables (required when using PostgresStore directly)
  const { initializeStorage, initializeVector } = await import("./lib/memory-factory");
  const storageOk = await initializeStorage();
  const vectorOk = await initializeVector();
  if (storageOk && vectorOk) {
    console.log("✅ [Startup] Step 0b: Memory storage + vector tables initialized");
  } else {
    console.warn("⚠️ [Startup] Step 0b: Memory initialization partial", { storageOk, vectorOk });
  }
  
  // Step 0c: Initialize Mastra (agents/workflows) and Mastra Server routes
  console.log("📋 [Startup] Step 0c: Initializing Mastra instance...");
  const mastra = await getMastraAsync();
  console.log("✅ [Startup] Step 0c: Mastra instance ready");
  
  // Step 1: Initialize WebSocket for Subscription Mode
  if (useSubscriptionMode) {
    console.log("📋 [Startup] Mode: Subscription (WebSocket)");
    console.log("📋 [Startup] Step 1: Initializing WebSocket connection...");
    
    if (!appId || !appSecret) {
      console.error("❌ [Startup] ERROR: FEISHU_APP_ID and FEISHU_APP_SECRET are required");
      process.exit(1);
    }

    startWebSocket("startup")
      .then((started) => {
        if (started) {
      console.log("✅ [Startup] Step 1: WebSocket connection established");
      console.log("📋 [Startup] Ready to receive Feishu events");
        } else {
          console.error("❌ [Startup] Step 1 FAILED: WebSocket connection error");
        }
      })
      .catch((error) => {
      console.error("❌ [Startup] Step 1 FAILED: WebSocket connection error");
      console.error("   Error:", error instanceof Error ? error.message : String(error));
      console.error("\n   Troubleshooting:");
      console.error("   1. Verify Subscription Mode is enabled in Feishu admin panel");
      console.error("   2. Check FEISHU_APP_ID and FEISHU_APP_SECRET are correct");
      console.error("   3. Verify app has required permissions (im:message, contact:user)");
      console.error("   4. Check network connectivity to Feishu servers");
      console.error("\n   Note: Server will still start, but will not receive events");
    });

    // Watchdog to restart WS if stale or repeatedly failing
    setInterval(async () => {
      const ageMs = Date.now() - lastWsEventAt;
      const isStale = ageMs > WS_STALE_THRESHOLD_MS;
      const hasFailures = wsConsecutiveFailures >= WS_MAX_CONSECUTIVE_FAILURES;

      if (isStale || hasFailures) {
        const reason = isStale
          ? `stale (${Math.round(ageMs / 1000)}s since last event)`
          : `consecutive failures (${wsConsecutiveFailures})`;
        console.warn(`⚠️ [WS Watchdog] Restarting WebSocket due to ${reason}`);
        try {
          const restarted = await restartWebSocket(reason);
          if (restarted) {
            wsConsecutiveFailures = 0; // reset only on success
          }
        } catch (error) {
          console.error(`❌ [WS Watchdog] Restart failed: ${formatError(error)}`);
        }
      }
    }, WS_WATCHDOG_INTERVAL_MS);
  } else {
    console.log("📋 [Startup] Mode: Webhook");
    console.log("📋 [Startup] WebSocket disabled - using HTTP webhooks");
  }
  
  // Step 1.5: Initialize Mastra Server routes (must be done before HTTP server starts)
  console.log("📋 [Startup] Step 1.5: Initializing Mastra Server routes...");
  try {
    const mastraServer = new MastraServer({
      app,
      mastra,
      prefix: "/mastra",
      openapiPath: "/openapi.json",
    });
    await mastraServer.init();
    console.log("✅ [Startup] Step 1.5: Mastra Server routes initialized");
    console.log("   Available at: /mastra/api/agents, /mastra/api/workflows, etc.");
  } catch (error) {
    console.warn("⚠️ [Startup] Step 1.5: Mastra Server initialization warning:", error);
    // Continue - Mastra is optional, custom endpoints still work
  }
  
  // Step 2: Start HTTP server (immediate, non-blocking)
  console.log("📋 [Startup] Step 2: Starting HTTP server...");
  
  // Prevent double-binding if startServer is invoked more than once (Bun/dev reloads)
  const globalAny = globalThis as any;
  if (globalAny.__feishu_server_started__) {
    console.warn("⚠️ [Startup] HTTP server already started, skipping duplicate serve()");
    return;
  }
  globalAny.__feishu_server_started__ = true;

  serve({
    fetch: app.fetch,
    port,
  });
  
  const elapsedMs = Date.now() - startTime;
  console.log(`✅ [Startup] Step 2: HTTP server started on port ${port}`);
  console.log(`✨ [Startup] Server is ready to accept requests in ${elapsedMs}ms`);
  console.log(`📊 [Startup] Health check: curl http://localhost:${port}/health`);
  console.log(`📡 [Startup] Mastra API: http://localhost:${port}/mastra/api/agents`);
  console.log(`📖 [Startup] OpenAPI spec: http://localhost:${port}/mastra/openapi.json`);
  console.log(`🎨 [Startup] Arize Phoenix (observability): http://localhost:6006`);
}

// Start the server
startServer().catch((error) => {
  console.error("❌ [Startup] Fatal error during initialization:", error);
  process.exit(1);
});

