import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";

export interface FeishuMentionData {
  chatId: string;
  messageId: string;
  rootId: string;
  messageText: string;
  botUserId: string;
  userId: string; // Feishu user ID (open_id/user_id) for authentication and RLS
}

export async function handleNewAppMention(data: FeishuMentionData) {
  const { chatId, messageId, rootId, messageText, botUserId, userId } = data;

  console.log("Handling app mention");

  // Remove bot mention from message text
  let cleanText = messageText.replace(
    /<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g,
    ""
  ).trim();

  // Create streaming card - reply in thread instead of direct chat message
  const card = await createAndSendStreamingCard(chatId, "chat_id", {
    title: "Evidence-总参",
    initialContent: "我琢么琢么...",
  }, {
    replyToMessageId: messageId,
    replyInThread: true,
  });

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
      // New mention, start fresh conversation
      messages = [{ role: "user" as const, content: cleanText }];
    }

    // Generate response with streaming and memory context
    const result = await generateResponse(messages, updateCard, chatId, rootId, userId);

    // Finalize card
    await finalizeCard(card.cardId, result);
  } catch (error) {
    console.error("Error generating response:", error);
    await updateCardElement(
      card.cardId,
      card.elementId,
      "Sorry, I encountered an error processing your request."
    );
    await finalizeCard(card.cardId);
  }
}
