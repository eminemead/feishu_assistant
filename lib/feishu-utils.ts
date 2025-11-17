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
  // ElementID must: start with alphabet, max 20 chars, only alphanumeric and underscores
  const timestamp = Date.now().toString().slice(-8); // Use last 8 digits to keep it short
  const elementId = config.elementId || `md_${timestamp}`;
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

  // Handle different response structures
  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  const responseData = resp.data || resp;

  if (!isSuccess || !responseData?.card_id) {
    console.error("Failed to create streaming card. Response:", JSON.stringify(resp, null, 2));
    throw new Error(`Failed to create streaming card: ${JSON.stringify(resp)}`);
  }

  // card_entity_id might not be in the response, use card_id as fallback
  const cardEntityId = responseData.card_entity_id || responseData.card_id;
  
  console.log(`✅ [Card] Created streaming card: cardId=${responseData.card_id}, elementId=${elementId}`);

  return {
    cardId: responseData.card_id,
    cardEntityId: cardEntityId,
    elementId,
  };
}

/**
 * Update card element content for streaming
 */
// Track sequence numbers per card to ensure proper ordering
const cardSequences = new Map<string, number>();

export async function updateCardElement(
  cardId: string,
  elementId: string,
  content: string
): Promise<void> {
  // Use cardElement.content for streaming updates (typing effect)
  // Sequence must be incremental per card (start from 1, increment each time)
  if (!cardSequences.has(cardId)) {
    cardSequences.set(cardId, 0);
  }
  const sequence = cardSequences.get(cardId)! + 1;
  cardSequences.set(cardId, sequence);
  
  console.log(`🔄 [Card] Updating card element: cardId=${cardId}, elementId=${elementId}, sequence=${sequence}, contentLength=${content.length}`);
  
  const resp = await client.cardkit.v1.cardElement.content({
    path: {
      card_id: cardId,
      element_id: elementId,
    },
    data: {
      content: content,
      sequence: sequence,
    },
  });

  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  if (!isSuccess) {
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
  // Use card.settings (not .settings.update) to update card settings
  // Sequence must be incremental - get current sequence and increment
  if (!cardSequences.has(cardId)) {
    cardSequences.set(cardId, 0);
  }
  const sequence = cardSequences.get(cardId)! + 1;
  cardSequences.set(cardId, sequence);
  
  const settingsData: any = {
    config: {
      streaming_mode: false,
    },
  };
  
  if (finalContent) {
    settingsData.summary = {
      content: finalContent.slice(0, 100), // Summary preview
    };
  }

  try {
    const resp = await client.cardkit.v1.card.settings({
      path: {
        card_id: cardId,
      },
      data: {
        settings: JSON.stringify(settingsData),
        sequence: sequence,
      },
    });

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
    if (!isSuccess) {
      console.error("Failed to finalize card:", resp);
    }
  } catch (error) {
    // Settings update is optional - log but don't fail
    console.warn("Failed to finalize card settings (non-critical):", error);
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

  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  const responseData = resp.data || resp;
  
  if (!isSuccess || !responseData?.message_id) {
    console.error("Failed to send card message. Response:", JSON.stringify(resp, null, 2));
    throw new Error(`Failed to send card message: ${JSON.stringify(resp)}`);
  }

  return responseData.message_id;
}

/**
 * Create and send a streaming card message
 */
export async function createAndSendStreamingCard(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  config: StreamingCardConfig = {}
): Promise<{ cardId: string; cardEntityId: string; elementId: string; messageId: string }> {
  console.log(`📤 [Card] Creating and sending streaming card to ${receiveIdType}:${receiveId}`);
  const card = await createStreamingCard(config);
  console.log(`📨 [Card] Sending card message with cardId: ${card.cardId}`);
  const messageId = await sendCardMessage(receiveId, receiveIdType, card.cardEntityId);
  console.log(`✅ [Card] Card sent successfully: messageId=${messageId}, cardId=${card.cardId}`);

  return {
    ...card,
    messageId,
  };
}

