import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";

export interface FeishuMessageData {
  chatId: string;
  messageId: string;
  rootId: string;
  messageText: string;
  botUserId: string;
}

export async function handleNewMessage(data: FeishuMessageData) {
  const { chatId, messageId, rootId, messageText, botUserId } = data;

  console.log(`Handling new message: ${chatId} ${rootId}`);

  // Remove bot mention from message text if present
  let cleanText = messageText.replace(
    /<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g,
    ""
  ).trim();

  // Create streaming card
  const card = await createAndSendStreamingCard(chatId, "chat_id", {
    title: "AI Assistant",
    initialContent: "Thinking...",
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
      // New conversation
      messages = [{ role: "user" as const, content: cleanText }];
    }

    // Generate response with streaming
    const result = await generateResponse(messages, updateCard);

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
