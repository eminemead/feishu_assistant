import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as lark from "@larksuiteoapi/node-sdk";
import { handleNewAppMention } from "./lib/handle-app-mention";
import { handleNewMessage } from "./lib/handle-messages";
import { getBotId, client, parseMessageContent, isThreadBotRelevant } from "./lib/feishu-utils";
import { extractFeishuUserId } from "./lib/auth/extract-feishu-user-id";
import { healthMonitor } from "./lib/health-monitor";
import { handleCardAction, parseCardActionCallback } from "./lib/handle-card-action";
import {
  handleButtonFollowup,
  extractButtonFollowupContext,
} from "./lib/handle-button-followup";
import { initializeMastraMemory } from "./lib/memory-mastra";
import { getObservabilityStatus } from "./lib/observability-config";
// Import mastra instance to ensure observability is initialized
import "./lib/observability-config";

// Global error handlers to prevent process crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Process] Unhandled Promise Rejection:', reason);
  console.error('   Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('❌ [Process] Uncaught Exception:', error);
  // Don't exit immediately - log and continue
});

const app = new Hono();

// Track processed events to prevent duplicates
const processedEvents = new Set<string>();

// Determine if we're using Subscription Mode (WebSocket) or Webhook Mode
// Subscription Mode doesn't require encryptKey/verificationToken
const useSubscriptionMode = process.env.FEISHU_SUBSCRIPTION_MODE === "true" || 
                             (!process.env.FEISHU_ENCRYPT_KEY && !process.env.FEISHU_VERIFICATION_TOKEN);

// WebSocket watchdog configuration
const WS_WATCHDOG_INTERVAL_MS = 30_000;
const WS_STALE_THRESHOLD_MS = 3 * 60 * 1000; // restart if no events for 3 minutes
const WS_MAX_CONSECUTIVE_FAILURES = 3;

const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;

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
    autoReconnect: true,
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
  if (!useSubscriptionMode) return;
  healthMonitor.markWebSocketRestart(reason);
  healthMonitor.incrementWebSocketReconnectAttempt();
  try {
    await wsClient?.stop?.();
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
      
      const botUserId = await getBotId();
      const actionValue = (data as any).action?.value;

      if (typeof actionValue === "string" && actionValue.trim() && botUserId) {
        console.log(
          `🔘 [CardAction] Button clicked: "${actionValue}"`
        );

        // Extract context from Feishu callback data (not action_id)
        // Feishu provides context.open_chat_id and context.open_message_id directly
        const context = (data as any).context || {};
        const chatId = context.open_chat_id || "";
        const rootId = context.open_message_id || "";

        if (chatId && rootId) {
          console.log(
            `🔘 [CardAction] Extracted context: chatId=${chatId}, rootId=${rootId}`
          );
          
          // Process button click
          handleButtonFollowup({
            chatId,
            messageId: "",
            rootId,
            botUserId,
            userId: (data as any).operator?.open_id || (data as any).operator?.user_id || "",
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
    console.log(`🔔 [WebSocket] Received event type: ${eventType}`);
    console.log(`🔔 [WebSocket] Event data:`, JSON.stringify(data, null, 2));

    // Handle card.action.trigger_v1 from WebSocket in catch-all as fallback
    if (eventType === "card.action.trigger_v1") {
        try {
          console.log("🔘 [WebSocket] Card action trigger received via WebSocket");
          const botUserId = await getBotId();
          const actionValue = (data as any).action?.value;

          if (typeof actionValue === "string" && actionValue.trim() && botUserId) {
            console.log(
              `🔘 [CardAction] Button clicked via WebSocket: "${actionValue}"`
            );

            // Extract context from Feishu callback (Feishu provides context directly)
            const context = (data as any).context || (data as any).trigger || {};
            const chatId = context.open_chat_id || context.chat_id || "";
            const rootId = context.open_message_id || context.message_id || "";

            if (chatId && rootId) {
              console.log(
                `🔘 [CardAction] Extracted context: chatId=${chatId}, rootId=${rootId}`
              );

              // Process button click as background task
              handleButtonFollowup({
                chatId,
                messageId: rootId,
                rootId,
                botUserId,
                userId: (data as any).operator?.open_id || (data as any).operator?.user_id || "",
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

eventDispatcher.register({
  "im.message.receive_v1": async (data) => {
      try {
        // Deduplicate events by event_id
        const eventId = (data as any).event_id || (data as any).event?.event_id;
        if (eventId && processedEvents.has(eventId)) {
          console.log(`⚠️ [WebSocket] Duplicate event ignored: ${eventId}`);
          return;
        }
        if (eventId) {
          processedEvents.add(eventId);
          // Clean up old event IDs (keep last 1000)
          if (processedEvents.size > 1000) {
            const firstId = processedEvents.values().next().value as string;
            if (firstId) {
              processedEvents.delete(firstId);
            }
          }
        }

        console.log("📨 [WebSocket] Event received: im.message.receive_v1");
      console.log("📨 [WebSocket] Event data:", JSON.stringify(data, null, 2));
      const botUserId = await getBotId();
      console.log(`🤖 [WebSocket] Bot User ID: ${botUserId}`);
      const message = data.message;
      const chatId = message.chat_id;
      const messageId = message.message_id;
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
        
        // Extract mentioned user ID from mentions array
        // Skip bot mention and find actual user mention
        if (mentions.length > 0 && message.chat_type === "group") {
          // Find first user mention (skip bot mention)
          const userMention = mentions.find(mention => {
            const mentionId = mention.id?.open_id || mention.id?.user_id;
            // Skip if it's the bot itself
            return mentionId && mentionId !== botUserId;
          });

          if (userMention) {
            mentionedUserId = userMention.id?.open_id ||
                             userMention.id?.user_id ||
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
          const botMentioned = mentions.some(mention => {
            const mentionId = mention.id?.open_id || mention.id?.user_id || mention.id?.app_id;
            const isBotMention = mentionId === botUserId;
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
        // Use mentioned user's ID for memory context (if available), otherwise fall back to sender
        const contextUserId = mentionedUserId || userId || chatId;
        console.log(`💾 [WebSocket] Using user ID for memory context: ${contextUserId}${mentionedUserId ? ` (from mention)` : ` (sender)`}`);
        
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
        // Validate thread relevance before processing
        const isRelevant = await isThreadBotRelevant(chatId, message.root_id, botUserId);
        if (!isRelevant) {
          console.log(`⚠️ [WebSocket] Thread reply ignored: thread ${message.root_id} is not bot-relevant`);
          return;
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

    // Get bot ID for button followup routing
    const botUserId = await getBotId();

    // Check if this is a button action (string value) - treat as button followup
    const actionValue = cardActionPayload.event?.action?.value;
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
  
  // Start memory initialization in background without awaiting
  initializeMastraMemory().then(() => {
    console.log("✅ [Startup] Step 0b: Mastra Memory initialized");
  }).catch((error) => {
    console.warn("⚠️ [Startup] Mastra Memory initialization warning:", error);
    // Continue - memory is optional, agent can work without it
  });
  
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
  
  // Step 2: Start HTTP server (immediate, non-blocking)
  console.log("📋 [Startup] Step 2: Starting HTTP server...");
  
  serve({
    fetch: app.fetch,
    port,
  });
  
  const elapsedMs = Date.now() - startTime;
  console.log(`✅ [Startup] Step 2: HTTP server started on port ${port}`);
  console.log(`✨ [Startup] Server is ready to accept requests in ${elapsedMs}ms`);
  console.log(`📊 [Startup] Health check: curl http://localhost:${port}/health`);
}

// Start the server
startServer().catch((error) => {
  console.error("❌ [Startup] Fatal error during initialization:", error);
  process.exit(1);
});

