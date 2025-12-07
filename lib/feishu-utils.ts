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

// Helper to get a typed Feishu client instance
export function getFeishuClient() {
  return client;
}

/**
 * Parse text from Feishu message content
 * Handles both simple text format and post format (with nested elements/content arrays)
 * 
 * @param content - JSON string of message content
 * @returns Extracted text
 */
export function parseMessageContent(content: string): string {
  try {
    const contentObj = JSON.parse(content);
    
    // Simple text format: { "text": "..." }
    if (contentObj.text) {
      return contentObj.text;
    }
    
    // Post format: { "content": [[{ "tag": "text", "text": "..." }, ...]] }
    if (contentObj.content && Array.isArray(contentObj.content)) {
      const textParts: string[] = [];
      
      // Iterate through elements in the post
      for (const elementGroup of contentObj.content) {
        if (Array.isArray(elementGroup)) {
          for (const element of elementGroup) {
            if (element.tag === "text" && element.text) {
              textParts.push(element.text);
            }
          }
        }
      }
      
      return textParts.join("");
    }
    
    // Fallback: return empty string if no recognized format
    return "";
  } catch (e) {
    console.error("Error parsing message content:", e);
    return "";
  }
}

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

/**
 * Check if a thread is bot-relevant before processing thread replies
 * A thread is bot-relevant if:
 * 1. The root message is from the bot itself (sender.sender_type === 'app'), OR
 * 2. The root message mentions the bot
 * 
 * @param chatId - Chat ID where the thread exists
 * @param rootId - Root message ID of the thread
 * @param botUserId - Bot identifier (app_id)
 * @returns true if thread is bot-relevant, false otherwise
 */
export async function isThreadBotRelevant(
  chatId: string,
  rootId: string,
  botUserId: string
): Promise<boolean> {
  try {
    // Fetch root message details from Feishu API
    const resp = await client.im.message.get({
      path: {
        message_id: rootId,
      },
    });

    const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
    if (!isSuccess || !resp.data?.item) {
      console.warn(`⚠️ [ThreadValidation] Failed to fetch root message ${rootId}, assuming not bot-relevant`);
      return false;
    }

    const rootMessage = resp.data.item;
    
    // Check if root is from bot (sender.sender_type === 'app')
    const isBotMessage = rootMessage.sender?.sender_type === "app";
    if (isBotMessage) {
      console.log(`✅ [ThreadValidation] Thread ${rootId} is bot-relevant: root message is from bot`);
      return true;
    }

    // Check if root message mentions the bot via mentions array (structured format)
    // @ts-ignore - mentions array exists in message response
    const mentions = (rootMessage as any).mentions || [];
    if (mentions.length > 0) {
      const botMentioned = mentions.some((mention: any) => {
        const mentionId = mention.id?.open_id || mention.id?.user_id || mention.id?.app_id;
        const isBotMention = mentionId === botUserId;
        if (isBotMention) {
          console.log(`✅ [ThreadValidation] Bot mention found in mentions array: ${JSON.stringify(mention)}`);
        }
        return isBotMention;
      });
      
      if (botMentioned) {
        console.log(`✅ [ThreadValidation] Thread ${rootId} is bot-relevant: root message mentions bot (via mentions array)`);
        return true;
      }
    }

    // Check if root message mentions the bot via text content (fallback for webhook mode)
    const rootContent = rootMessage.body?.content;
    if (rootContent) {
      try {
        const rootText = parseMessageContent(rootContent);
        const mentionsBot = rootText.includes(`<at user_id="${botUserId}">`) ||
                           rootText.includes(`<at open_id="${botUserId}">`) ||
                           rootText.includes(`<at app_id="${botUserId}">`);
        
        if (mentionsBot) {
          console.log(`✅ [ThreadValidation] Thread ${rootId} is bot-relevant: root message mentions bot (via text content)`);
          return true;
        }
      } catch (e) {
        console.warn(`⚠️ [ThreadValidation] Failed to parse root message content:`, e);
      }
    }

    console.log(`❌ [ThreadValidation] Thread ${rootId} is NOT bot-relevant: root is from user and doesn't mention bot`);
    return false;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [ThreadValidation] Error checking thread relevance: ${errorMsg}`);
    // On error, assume not bot-relevant to avoid processing unrelated threads
    return false;
  }
}

// Get message thread history
export async function getThread(
  chatId: string,
  rootId: string,
  botUserId: string
): Promise<CoreMessage[]> {
  // Note: Feishu API for listing messages in a thread might be different
  // For now, we'll fetch recent messages and filter by root_id
  // This is a simplified implementation - you may need to adjust based on actual API
  
  let resp;
  let retries = 1; // Reduced from 3 to minimize latency on failures
  const retryDelayMs = 200; // Reduced from 500ms
  const timeoutMs = 5000; // 5 second timeout for thread fetch
  
  while (retries > 0) {
    try {
      // Wrap in Promise.race with timeout to prevent indefinite hangs
      const fetchPromise = client.im.message.list({
        params: {
          container_id_type: "chat_id",
          container_id: chatId,
          page_size: 50,
        },
      });
      
      resp = await Promise.race([
        fetchPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Thread fetch timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]) as any;
      
      break;
    } catch (error) {
      retries--;
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (retries === 0) {
        console.error("❌ Failed to fetch thread after 1 attempt:", errorMsg);
        // Return empty messages on failure to continue conversation gracefully
        console.warn("⚠️ Proceeding with empty thread context (falling back to current message only)");
        return [];
      }
      console.warn(`⚠️ Retry ${2 - retries}/1: Failed to fetch thread (${errorMsg}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  if (!resp || !resp.success() || !resp.data?.items) {
    console.warn("⚠️ No items in thread response, proceeding with empty context");
    return [];
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
      // Use parseMessageContent helper to handle both text and post formats
      let text = parseMessageContent(content);

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
  buttons?: Array<{
    id?: string;
    text: string;
    value?: string;
    type?: "default" | "primary" | "danger";
  }>;
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
        content: config.title || "",
        tag: "plain_text",
      },
    },
    config: {
      streaming_mode: true,
      summary: {
        content: config.initialContent || "",
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
          content: config.initialContent || "",
          element_id: elementId,
        },
        // NOTE: Cannot add action elements to streaming cards in Feishu v2
        // Button support deferred - see docs/implementation/button-ui-implementation.md
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
// IMPORTANT: This is the single source of truth for all card operations
// Both element updates and button/settings operations must use this same counter
const cardSequences = new Map<string, number>();

/**
 * Get the next sequence number for a card operation
 * Used by all card updates (streaming content, buttons, settings, images)
 * to ensure proper ordering in Feishu
 */
export function getNextCardSequence(cardId: string): number {
  if (!cardSequences.has(cardId)) {
    cardSequences.set(cardId, 0);
  }
  const sequence = cardSequences.get(cardId)! + 1;
  cardSequences.set(cardId, sequence);
  return sequence;
}

export async function updateCardElement(
  cardId: string,
  elementId: string,
  content: string
): Promise<void> {
  // Use cardElement.content for streaming updates (typing effect)
  // Sequence must be incremental per card across ALL operations
  const sequence = getNextCardSequence(cardId);
  
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
 * Add an image element to an existing card
 * Creates a new image element and adds it to the card body
 */
export async function addImageElementToCard(
  cardId: string,
  imageKey: string,
  altText: string = "OKR Metrics Visualization"
): Promise<string> {
  // Generate unique element ID for the image
  const imageElementId = `img_${Date.now()}`;
  
  // Create image element
  const imageElement = {
    tag: "img",
    img_key: imageKey,
    alt: {
      tag: "plain_text",
      content: altText,
    },
    title: {
      tag: "plain_text",
      content: "OKR Metrics Heatmap",
    },
    mode: "fit_horizontal",
    preview: true,
    element_id: imageElementId,
  };

  // Update sequence
  if (!cardSequences.has(cardId)) {
    cardSequences.set(cardId, 0);
  }
  const sequence = cardSequences.get(cardId)! + 1;
  cardSequences.set(cardId, sequence);

  // Add image element to card using cardElement.create API
  // Note: This creates a new element in the card body
  const resp = await client.cardkit.v1.cardElement.create({
    path: {
      card_id: cardId,
    },
    data: {
      element: JSON.stringify(imageElement),
      sequence: sequence,
    },
  });

  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  if (!isSuccess) {
    console.error("Failed to add image element to card:", resp);
    throw new Error("Failed to add image element to card");
  }

  console.log(`✅ [Card] Added image element: cardId=${cardId}, elementId=${imageElementId}, imageKey=${imageKey}`);
  return imageElementId;
}

/**
 * Finalize card by disabling streaming mode
 * Optionally adds image if imageKey is detected in the result
 */
export async function finalizeCard(
  cardId: string,
  finalContent?: string,
  imageKey?: string
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

  // Add image element if imageKey is provided
  if (imageKey) {
    try {
      await addImageElementToCard(cardId, imageKey);
      console.log(`✅ [Card] Image added to card: cardId=${cardId}, imageKey=${imageKey}`);
    } catch (error) {
      console.error("Failed to add image to card (non-critical):", error);
      // Don't throw - image addition is optional
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

  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  const responseData = resp.data || resp;
  
  if (!isSuccess || !responseData?.message_id) {
    console.error("Failed to send card message. Response:", JSON.stringify(resp, null, 2));
    throw new Error(`Failed to send card message: ${JSON.stringify(resp)}`);
  }

  return responseData.message_id;
}

/**
 * Reply to a message in a thread with a card
 */
export async function replyCardMessageInThread(
  messageId: string,
  cardEntityId: string,
  replyInThread: boolean = true
): Promise<string> {
  const resp = await client.im.message.reply({
    path: {
      message_id: messageId,
    },
    data: {
      msg_type: "interactive",
      content: JSON.stringify({
        type: "card",
        data: {
          card_id: cardEntityId,
        },
      }),
      reply_in_thread: replyInThread,
    },
  });

  const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
  const responseData = resp.data || resp;

  if (!isSuccess || !responseData?.message_id) {
    console.error("Failed to reply card message in thread. Response:", JSON.stringify(resp, null, 2));
    throw new Error(`Failed to reply card message in thread: ${JSON.stringify(resp)}`);
  }

  return responseData.message_id;
}

/**
 * Create and send a streaming card message
 */
export async function createAndSendStreamingCard(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  config: StreamingCardConfig = {},
  options?: { replyToMessageId?: string; replyInThread?: boolean }
): Promise<{ cardId: string; cardEntityId: string; elementId: string; messageId: string }> {
  console.log(`📤 [Card] Creating and sending streaming card to ${receiveIdType}:${receiveId}`);
  const card = await createStreamingCard(config);
  console.log(`📨 [Card] Sending card message with cardId: ${card.cardId}`);
  
  let messageId: string;
  if (options?.replyToMessageId) {
    // Reply to a specific message in thread
    console.log(`📨 [Card] Sending as thread reply to message: ${options.replyToMessageId}`);
    messageId = await replyCardMessageInThread(
      options.replyToMessageId,
      card.cardEntityId,
      options.replyInThread !== false // Default to true
    );
  } else {
    // Send as direct message
    messageId = await sendCardMessage(receiveId, receiveIdType, card.cardEntityId);
  }
  
  console.log(`✅ [Card] Card sent successfully: messageId=${messageId}, cardId=${card.cardId}`);

  return {
    ...card,
    messageId,
  };
}

