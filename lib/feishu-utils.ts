import * as lark from "@larksuiteoapi/node-sdk";
import { CoreMessage } from "ai";
import crypto from "crypto";

const appId = process.env.FEISHU_APP_ID!;
const appSecret = process.env.FEISHU_APP_SECRET!;
const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;

// Initialize Feishu client
export const client = new lark.Client({
  appId,
  appSecret,
  appType: lark.AppType.SelfBuild,
  domain: lark.Domain.Feishu,
});

// Request verification for Feishu events
export async function isValidFeishuRequest({
  request,
  rawBody,
}: {
  request: Request;
  rawBody: string;
}): Promise<boolean> {
  const timestamp = request.headers.get("X-Lark-Request-Timestamp");
  const nonce = request.headers.get("X-Lark-Request-Nonce");
  const signature = request.headers.get("X-Lark-Signature");

  if (!timestamp || !nonce || !signature || !encryptKey) {
    console.log("Missing required headers or encrypt key");
    return false;
  }

  // Prevent replay attacks (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 60 * 5) {
    console.log("Timestamp out of range");
    return false;
  }

  // Verify signature
  const baseString = `${timestamp}${nonce}${encryptKey}${rawBody}`;
  const computedSignature = crypto
    .createHash("sha256")
    .update(baseString)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature)
  );
}

export const verifyRequest = async ({
  request,
  rawBody,
}: {
  request: Request;
  rawBody: string;
}) => {
  const validRequest = await isValidFeishuRequest({ request, rawBody });
  if (!validRequest) {
    throw new Error("Invalid Feishu request");
  }
};

// Get bot information (open_id)
export const getBotId = async (): Promise<string> => {
  // Get bot info - we'll use the app_id as bot identifier
  // For Feishu, we typically use app_id to identify the bot
  // If we need the actual bot open_id, we can get it from message events
  // For now, return app_id as the bot identifier
  return appId;
};

// Get message thread history
export async function getThread(
  chatId: string,
  rootId: string,
  botUserId: string
): Promise<CoreMessage[]> {
  // Note: Feishu API for listing messages in a thread might be different
  // For now, we'll fetch recent messages and filter by root_id
  // This is a simplified implementation - you may need to adjust based on actual API
  const resp = await client.im.message.list({
    params: {
      container_id_type: "chat_id",
      container_id: chatId,
      page_size: 50,
    },
  });

  if (!resp.success() || !resp.data?.items) {
    throw new Error("Failed to fetch messages");
  }

  // Filter messages in the thread (root_id matches or message_id matches rootId)
  const threadMessages = resp.data.items.filter(
    (msg: any) => msg.root_id === rootId || msg.message_id === rootId
  );

  // Sort by create_time
  threadMessages.sort(
    (a: any, b: any) => parseInt(a.create_time || "0") - parseInt(b.create_time || "0")
  );

  const result: CoreMessage[] = [];

  for (const message of threadMessages) {
    const isBot = message.sender?.sender_type === "app";
    const content = message.body?.content;

    if (!content) continue;

    try {
      const contentObj = JSON.parse(content);
      let text = contentObj.text || "";

      // Remove bot mention if present (Feishu uses <at user_id="..."> format)
      if (!isBot && text.includes(`<at user_id="${botUserId}">`)) {
        text = text.replace(/<at user_id="[^"]+">.*?<\/at>\s*/g, "").trim();
      }

      if (text) {
        result.push({
          role: isBot ? "assistant" : "user",
          content: text,
        });
      }
    } catch (e) {
      // Skip invalid JSON content
      console.error("Failed to parse message content:", e);
    }
  }

  return result;
}

// Card creation and streaming helpers

export interface StreamingCardConfig {
  title?: string;
  initialContent?: string;
  elementId?: string;
}

/**
 * Create a streaming card entity
 */
export async function createStreamingCard(
  config: StreamingCardConfig = {}
): Promise<{ cardId: string; cardEntityId: string; elementId: string }> {
  const elementId = config.elementId || `markdown_${Date.now()}`;
  const cardData = {
    schema: "2.0",
    header: {
      title: {
        content: config.title || "AI Assistant",
        tag: "plain_text",
      },
    },
    config: {
      streaming_mode: true,
      summary: {
        content: config.initialContent || "Thinking...",
      },
      streaming_config: {
        print_frequency_ms: {
          default: 70,
          android: 70,
          ios: 70,
          pc: 70,
        },
        print_step: {
          default: 1,
          android: 1,
          ios: 1,
          pc: 1,
        },
        print_strategy: "fast",
      },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: config.initialContent || "Thinking...",
          element_id: elementId,
        },
      ],
    },
  };

  const resp = await client.cardkit.v1.card.create({
    data: {
      type: "card_json",
      data: JSON.stringify(cardData),
    },
  });

  if (!resp.success() || !resp.data?.card_entity_id || !resp.data?.card_id) {
    throw new Error("Failed to create streaming card");
  }

  return {
    cardId: resp.data.card_id,
    cardEntityId: resp.data.card_entity_id,
    elementId,
  };
}

/**
 * Update card element content for streaming
 */
export async function updateCardElement(
  cardId: string,
  elementId: string,
  content: string
): Promise<void> {
  const resp = await client.cardkit.v1.card.element.update({
    path: {
      card_id: cardId,
      element_id: elementId,
    },
    data: {
      content: content,
    },
  });

  if (!resp.success()) {
    console.error("Failed to update card element:", resp);
    throw new Error("Failed to update card element");
  }
}

/**
 * Finalize card by disabling streaming mode
 */
export async function finalizeCard(
  cardId: string,
  finalContent?: string
): Promise<void> {
  if (finalContent) {
    // Update card config to disable streaming
    const resp = await client.cardkit.v1.card.settings.update({
      path: {
        card_id: cardId,
      },
      data: {
        settings: JSON.stringify({
          config: {
            streaming_mode: false,
          },
          summary: {
            content: finalContent.slice(0, 100), // Summary preview
          },
        }),
      },
    });

    if (!resp.success()) {
      console.error("Failed to finalize card:", resp);
    }
  } else {
    // Just disable streaming
    const resp = await client.cardkit.v1.card.settings.update({
      path: {
        card_id: cardId,
      },
      data: {
        settings: JSON.stringify({
          config: {
            streaming_mode: false,
          },
        }),
      },
    });

    if (!resp.success()) {
      console.error("Failed to finalize card:", resp);
    }
  }
}

/**
 * Send a card message using card entity ID
 */
export async function sendCardMessage(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  cardEntityId: string
): Promise<string> {
  const resp = await client.im.message.create({
    params: {
      receive_id_type: receiveIdType,
    },
    data: {
      receive_id: receiveId,
      msg_type: "interactive",
      // For card entities, use the card_entity_id in the content
      content: JSON.stringify({
        type: "card",
        data: {
          card_id: cardEntityId, // card_entity_id is used as card_id here
        },
      }),
    },
  });

  if (!resp.success() || !resp.data?.message_id) {
    throw new Error("Failed to send card message");
  }

  return resp.data.message_id;
}

/**
 * Create and send a streaming card message
 */
export async function createAndSendStreamingCard(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  config: StreamingCardConfig = {}
): Promise<{ cardId: string; cardEntityId: string; elementId: string; messageId: string }> {
  const card = await createStreamingCard(config);
  const messageId = await sendCardMessage(receiveId, receiveIdType, card.cardEntityId);

  return {
    ...card,
    messageId,
  };
}

