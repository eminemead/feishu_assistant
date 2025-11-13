import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as lark from "@larksuiteoapi/node-sdk";
import { handleNewAppMention } from "./lib/handle-app-mention";
import { handleNewMessage } from "./lib/handle-messages";
import { getBotId } from "./lib/feishu-utils";

const app = new Hono();

const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;

// Initialize Feishu EventDispatcher
const eventDispatcher = new lark.EventDispatcher({
  encryptKey: encryptKey,
  verificationToken: verificationToken,
}).register({
  "im.message.receive_v1": async (data) => {
    try {
      const botUserId = await getBotId();
      const message = data.message;
      const chatId = message.chat_id;
      const messageId = message.message_id;
      const rootId = message.root_id || messageId;
      const content = message.content;

      // Parse message content
      let messageText = "";
      let isMention = false;
      let senderType = message.sender?.sender_type;

      try {
        const contentObj = JSON.parse(content);
        messageText = contentObj.text || "";

        // Check if bot is mentioned
        if (messageText.includes(`<at user_id="${botUserId}">`) || 
            messageText.includes(`<at open_id="${botUserId}">`)) {
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
        await handleNewMessage({
          chatId,
          messageId,
          rootId,
          messageText,
          botUserId,
        });
        return;
      }

      // Handle group message with mention
      if (isMention) {
        await handleNewAppMention({
          chatId,
          messageId,
          rootId,
          messageText,
          botUserId,
        });
        return;
      }

      // Handle thread reply (if root_id exists and is different from message_id)
      if (message.root_id && message.root_id !== messageId) {
        await handleNewMessage({
          chatId,
          messageId,
          rootId: message.root_id,
          messageText,
          botUserId,
        });
        return;
      }
    } catch (error) {
      console.error("Error handling message event:", error);
    }
  },
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({ status: "ok", service: "feishu-agent" });
});

// Feishu webhook endpoint
app.post("/webhook/event", async (c) => {
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
app.post("/webhook/card", async (c) => {
  try {
    const rawBody = await c.req.text();
    const headers = c.req.header();

    // Handle card actions if needed
    // For now, just return success
    return c.json({ success: true }, 200);
  } catch (error) {
    console.error("Error processing card webhook:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

const port = parseInt(process.env.PORT || "3000");

console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});

