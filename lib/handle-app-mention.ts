import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";
import { devtoolsTracker } from "./devtools-integration";

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
  const startTime = Date.now();

  console.log("Handling app mention");

  // Remove bot mention from message text
  let cleanText = messageText.replace(
    /<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g,
    ""
  ).trim();

  // Track in devtools
  devtoolsTracker.trackAgentCall("FeishuMention", cleanText, { 
    messageId, 
    rootId,
    isNewThread: messageId === rootId 
  });

  // Create streaming card - reply in thread instead of direct chat message
  const card = await createAndSendStreamingCard(chatId, "chat_id", {}, {
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
      console.log(`[Thread] Fetching thread history: rootId=${rootId}, messageId=${messageId}`);
      const threadMessages = await getThread(chatId, rootId, botUserId);
      
      // If thread fetch failed or returned empty, use current message as fallback
      if (threadMessages.length === 0) {
        console.warn("⚠️ [Thread] Thread history empty or fetch failed, using current message only");
        console.log(`[Thread] Fallback: Starting fresh with current message only`);
        messages = [{ role: "user" as const, content: cleanText }];
      } else {
        console.log(`[Thread] Successfully loaded ${threadMessages.length} message(s) from thread history`);
        messages = threadMessages;
      }
    } else {
      // New mention, start fresh conversation
      console.log(`[Thread] New mention (messageId === rootId), starting fresh conversation`);
      messages = [{ role: "user" as const, content: cleanText }];
    }

    // Validate messages before sending to agent
    if (messages.length === 0) {
      console.error("❌ No messages to process");
      throw new Error("No messages to process");
    }
    
    console.log(`[Thread] Processing with ${messages.length} message(s)`);

    // Generate response with streaming and memory context
    console.log(`[FeishuMention] Generating response...`);
    const result = await generateResponse(messages, updateCard, chatId, rootId, userId);
    console.log(`[FeishuMention] Response generated (length=${result?.length || 0}): "${result?.substring(0, 50) || 'N/A'}..."`);

    // Finalize card with follow-up buttons
    console.log(`[FeishuMention] About to finalize card with followups. cardId=${card.cardId}, result length=${result?.length || 0}`);
    try {
      const finalizeResult = await finalizeCardWithFollowups(
        card.cardId,
        result,
        undefined, // imageKey
        cleanText  // context for button generation
      );
      console.log(`[FeishuMention] Finalization result:`, finalizeResult);
    } catch (finalizeError) {
      console.error(`[FeishuMention] Error in finalizeCardWithFollowups:`, finalizeError);
      throw finalizeError;
    }
    
    // Track successful response
    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("FeishuMention", result, duration, {
      threadId: rootId,
      messageId
    });
  } catch (error) {
    console.error("Error in handleNewAppMention:", error);
    
    // Track error
    devtoolsTracker.trackError(
      "FeishuMention",
      error instanceof Error ? error : new Error(String(error)),
      { messageId, rootId }
    );
    
    const errorMessage = "Sorry, I encountered an error processing your request.";
    await updateCardElement(
      card.cardId,
      card.elementId,
      errorMessage
    );
    // Finalize with error message but still try to add buttons
    await finalizeCardWithFollowups(
      card.cardId,
      errorMessage,
      undefined,
      cleanText
    ).catch(() => {
      // If button finalization fails, fall back to basic finalization
      return finalizeCard(card.cardId);
    });
  }
}
