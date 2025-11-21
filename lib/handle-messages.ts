import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";

export interface FeishuMessageData {
  chatId: string;
  messageId: string;
  rootId: string;
  messageText: string;
  botUserId: string;
  userId: string; // Feishu user ID (open_id/user_id) for authentication and RLS
}

export async function handleNewMessage(data: FeishuMessageData) {
  const { chatId, messageId, rootId, messageText, botUserId, userId } = data;

  console.log(`Handling new message: ${chatId} ${rootId}`);

  // Remove bot mention from message text if present
  let cleanText = messageText.replace(
    /<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g,
    ""
  ).trim();

  // Create streaming card
  const card = await createAndSendStreamingCard(chatId, "chat_id", {});

  // Create update function for streaming
  let currentContent = "";
  const updateCard = async (status: string) => {
    currentContent = status;
    await updateCardElement(card.cardId, card.elementId, status);
  };

  try {
    // Get thread messages if this is a thread reply
    let messages;
    if (rootId !== messageId) {
      // This is a thread reply, get thread history
      messages = await getThread(chatId, rootId, botUserId);
    } else {
      // New conversation
      messages = [{ role: "user" as const, content: cleanText }];
    }

    // Generate response with streaming and memory context
    const result = await generateResponse(messages, updateCard, chatId, rootId, userId);

    // Extract image_key from result if present
    // Tool results may include visualization.image_key in JSON format
    let imageKey: string | undefined;
    try {
      // Try to parse result as JSON to extract image_key
      // Some agents may return JSON with tool results
      const jsonMatch = result.match(/\{[^}]*"visualization"[^}]*"image_key"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        imageKey = parsed?.visualization?.image_key;
      }
      
      // Also check for direct image_key references in text
      const imageKeyMatch = result.match(/image_key["\s:]+([a-zA-Z0-9_-]+)/i);
      if (!imageKey && imageKeyMatch) {
        imageKey = imageKeyMatch[1];
      }
    } catch (e) {
      // Parsing failed, continue without image
      console.log("Could not extract image_key from result");
    }

    // Finalize card with follow-up suggestions
    // This handles: disabling streaming, generating followups, formatting as markdown, and updating card
    await finalizeCardWithFollowups(
      card.cardId,
      card.elementId,
      result,
      cleanText  // context for question generation
    );
  } catch (error) {
    console.error("Error generating response:", error);
    const errorMessage = "Sorry, I encountered an error processing your request.";
    await updateCardElement(
      card.cardId,
      card.elementId,
      errorMessage
    );
    // Finalize with error message but still try to add suggestions
    await finalizeCardWithFollowups(
      card.cardId,
      card.elementId,
      errorMessage,
      cleanText
    ).catch(() => {
      // If finalization fails, fall back to basic finalization
      return finalizeCard(card.cardId);
    });
  }
}
