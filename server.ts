import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as lark from "@larksuiteoapi/node-sdk";
import { handleNewAppMention } from "./lib/handle-app-mention";
import { handleNewMessage } from "./lib/handle-messages";
import { getBotId, client } from "./lib/feishu-utils";
import { extractFeishuUserId } from "./lib/auth/extract-feishu-user-id";
import { healthMonitor } from "./lib/health-monitor";
import { handleCardAction, parseCardActionCallback } from "./lib/handle-card-action";
import {
  handleButtonFollowup,
  extractButtonFollowupContext,
} from "./lib/handle-button-followup";

const app = new Hono();

// Track processed events to prevent duplicates
const processedEvents = new Set<string>();

// Determine if we're using Subscription Mode (WebSocket) or Webhook Mode
// Subscription Mode doesn't require encryptKey/verificationToken
const useSubscriptionMode = process.env.FEISHU_SUBSCRIPTION_MODE === "true" || 
                             (!process.env.FEISHU_ENCRYPT_KEY && !process.env.FEISHU_VERIFICATION_TOKEN);

const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;

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

        // Extract context from action_id
        const actionId = (data as any).action?.action_id;
        let chatId = "";
        let rootId = "";

        if (actionId && typeof actionId === "string" && actionId.includes("|")) {
          const parts = actionId.split("|");
          chatId = parts[0];
          rootId = parts[1] || chatId;
          console.log(
            `🔘 [CardAction] Extracted context: chatId=${chatId}, rootId=${rootId}`
          );
        } else {
          console.warn(
            `⚠️ [CardAction] action_id doesn't have context format: ${actionId}`
          );
        }

        if (chatId && rootId) {
          // Process button click
          handleButtonFollowup({
            chatId,
            messageId: "",
            rootId,
            botUserId,
            userId: (data as any).operator?.operator_id || "",
            buttonValue: actionValue,
            isMention: false,
          })
            .then(() => {
              console.log(`✅ [CardAction] Button followup processed successfully`);
            })
            .catch((err) => {
              console.error(`❌ [CardAction] Error processing button followup:`, err);
            });
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

            // Extract context from action_id (format: chatId|rootId|index)
            const actionId = (data as any).action?.action_id;
            let chatId = "";
            let rootId = "";

            if (actionId && typeof actionId === "string" && actionId.includes("|")) {
              const parts = actionId.split("|");
              chatId = parts[0];
              rootId = parts[1] || chatId;
              console.log(
                `🔘 [CardAction] Extracted context: chatId=${chatId}, rootId=${rootId}`
              );
            } else {
              // Fallback: try to get from trigger info
              chatId = (data as any).trigger?.chat_id || "unknown";
              rootId = (data as any).trigger?.message_id || chatId;
              console.warn(
                `⚠️ [CardAction] action_id doesn't have context, using trigger info: ${chatId}`
              );
            }

            // Process button click as background task
            handleButtonFollowup({
              chatId,
              messageId: (data as any).trigger?.message_id || "",
              rootId,
              botUserId,
              userId: (data as any).operator?.operator_id || "",
              buttonValue: actionValue,
              isMention: false,
            })
              .then(() => {
                console.log(`✅ [CardAction] WebSocket button followup processed successfully`);
              })
              .catch((err) => {
                console.error(`❌ [CardAction] WebSocket button followup error:`, err);
              });
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

      console.log(`📩 [WebSocket] Message details: chatId=${chatId}, messageId=${messageId}, chatType=${message.chat_type}`);

      try {
        const contentObj = JSON.parse(content);
        messageText = contentObj.text || "";

        // Check if bot is mentioned using mentions array (Subscription Mode)
        // @ts-ignore - mentions array exists in subscription mode
        const mentions = (message as any).mentions || [];
        console.log(`🔍 [WebSocket] Mentions array:`, JSON.stringify(mentions, null, 2));
        
        // Check mentions array for bot
        // In Subscription Mode, if mentions array exists and has entries in a group chat,
        // it means the bot was mentioned
        if (mentions.length > 0 && message.chat_type === "group") {
          console.log(`🔍 [WebSocket] Found ${mentions.length} mention(s) in group message`);
          // In group chats, if there are mentions, the bot was mentioned
          isMention = true;
          console.log(`✅ [WebSocket] Bot mention detected via mentions array`);
        }

        // Fallback: Check text for @mentions (webhook mode format)
        if (!isMention && (messageText.includes(`<at user_id="${botUserId}">`) || 
            messageText.includes(`<at open_id="${botUserId}">`))) {
          isMention = true;
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
        await handleNewAppMention({
          chatId,
          messageId,
          rootId,
          messageText,
          botUserId,
          userId: userId || chatId, // Fallback to chatId if userId not available
        } as any);
        return;
      }

      // Handle thread reply (if root_id exists and is different from message_id)
      if (message.root_id && message.root_id !== messageId) {
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
  console.log("📋 [Startup] Starting server initialization...");
  
  // Step 1: Initialize WebSocket for Subscription Mode
  if (useSubscriptionMode) {
    console.log("📋 [Startup] Mode: Subscription (WebSocket)");
    console.log("📋 [Startup] Step 1: Initializing WebSocket connection...");
    
    if (!appId || !appSecret) {
      console.error("❌ [Startup] ERROR: FEISHU_APP_ID and FEISHU_APP_SECRET are required");
      process.exit(1);
    }

    // Create WSClient for Subscription Mode
    const wsClient = new lark.WSClient({
      appId,
      appSecret,
      domain: lark.Domain.Feishu,
      autoReconnect: true,
    });

    // Start WebSocket with timeout
    try {
      const wsStartPromise = wsClient.start({ eventDispatcher });
      
      // Add 10-second timeout to WebSocket connection
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("WebSocket connection timeout after 10 seconds")),
          10000
        )
      );
      
      await Promise.race([wsStartPromise, timeoutPromise]);
      
      console.log("✅ [Startup] Step 1: WebSocket connection established");
      console.log("📋 [Startup] Ready to receive Feishu events");
    } catch (error) {
      console.error("❌ [Startup] Step 1 FAILED: WebSocket connection error");
      console.error("   Error:", error instanceof Error ? error.message : String(error));
      console.error("\n   Troubleshooting:");
      console.error("   1. Verify Subscription Mode is enabled in Feishu admin panel");
      console.error("   2. Check FEISHU_APP_ID and FEISHU_APP_SECRET are correct");
      console.error("   3. Verify app has required permissions (im:message, contact:user)");
      console.error("   4. Check network connectivity to Feishu servers");
      console.error("\n   Note: Server will still start, but will not receive events");
      // Don't exit - allow server to start in degraded mode
    }
  } else {
    console.log("📋 [Startup] Mode: Webhook");
    console.log("📋 [Startup] WebSocket disabled - using HTTP webhooks");
  }
  
  // Step 2: Start HTTP server
  console.log("📋 [Startup] Step 2: Starting HTTP server...");
  
  serve({
    fetch: app.fetch,
    port,
  });
  
  console.log(`✅ [Startup] Step 2: HTTP server started on port ${port}`);
  console.log(`✨ [Startup] Server is ready to accept requests`);
  console.log(`📊 [Startup] Health check: curl http://localhost:${port}/health`);
}

// Start the server
startServer().catch((error) => {
  console.error("❌ [Startup] Fatal error during initialization:", error);
  process.exit(1);
});

