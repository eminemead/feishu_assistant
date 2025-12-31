import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";
import { handleDocumentCommand } from "./handle-doc-commands";
import { devtoolsTracker } from "./devtools-integration";

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
  const startTime = Date.now();

  console.log(`Handling new message: ${chatId} ${rootId}`);

  // Remove bot mention from message text if present
  let cleanText = messageText.replace(
    /<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g,
    ""
  ).trim();

  // Track in devtools
  devtoolsTracker.trackAgentCall("FeishuMessage", cleanText, {
    messageId,
    rootId,
    isNewThread: messageId === rootId
  });

  // Check if this is a document tracking command (early exit before agent)
  // Document commands should be intercepted and handled directly
  const isDocCommand = /^(watch|check|unwatch|watched|tracking:\w+)\s+/i.test(cleanText);
  if (isDocCommand) {
    console.log(`[DocCommand] Intercepted document command: "${cleanText.substring(0, 50)}..."`);
    devtoolsTracker.trackAgentCall("DocumentTracking", cleanText, {
      messageId,
      rootId,
      commandIntercepted: true
    });

    // Create streaming card for command confirmation
    const card = await createAndSendStreamingCard(chatId, "chat_id", {}, {
      replyToMessageId: messageId,
      replyInThread: true,
    });

    // Handle document command directly (bypasses agent)
    const handled = await handleDocumentCommand({
      message: cleanText,
      chatId,
      userId,
      botUserId
    });

    if (handled) {
      console.log(`[DocCommand] Command handled successfully`);
      await updateCardElement(card.cardId, card.elementId, "✅ Command executed");
      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("DocumentTracking", "Command executed", duration, {
        threadId: rootId,
        messageId,
        commandHandled: true
      });
      return; // Early exit - don't call generateResponse
    }
    console.log(`[DocCommand] Command pattern matched but handler returned false, falling through to agent`);
  }

  // Create streaming card - reply in thread if this is a thread message
  const card = await createAndSendStreamingCard(
    chatId,
    "chat_id",
    {},
    rootId && rootId !== messageId
      ? {
          replyToMessageId: rootId,
          replyInThread: true,
        }
      : undefined
  );

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
    const rawResult = await generateResponse(messages, updateCard, chatId, rootId, userId);
    
    // Handle structured result (with confirmation data) or plain string
    let result: string;
    let needsConfirmation = false;
    let confirmationData: string | undefined;
    
    if (typeof rawResult === "string") {
      result = rawResult;
    } else {
      result = rawResult.text;
      needsConfirmation = rawResult.needsConfirmation || false;
      confirmationData = rawResult.confirmationData;
    }

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

    // Finalize card with follow-up suggestions and send buttons in separate message
    // This handles: disabling streaming, generating followups, formatting as markdown, updating card, and sending buttons
    const finalizeResult = await finalizeCardWithFollowups(
      card.cardId,
      card.elementId,
      result,
      cleanText,  // context for question generation
      needsConfirmation ? 0 : 3,  // No followups if confirmation needed
      {
        conversationId: chatId,
        rootId: rootId,  // Use actual rootId (root of conversation thread)
        threadId: rootId,
        sendButtonsAsSeperateMessage: true,
        // Pass confirmation data for special handling
        confirmationData: needsConfirmation ? confirmationData : undefined,
      }
    );

    // Track successful response
    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("FeishuMessage", result, duration, {
      threadId: rootId,
      messageId
    });
    } catch (error) {
    console.error("Error generating response:", error);

    // Track error
    devtoolsTracker.trackError(
      "FeishuMessage",
      error instanceof Error ? error : new Error(String(error)),
      { messageId, rootId }
    );
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
      cleanText,
      3,
      {
        conversationId: chatId,
        rootId: rootId,
        threadId: rootId,
        sendButtonsAsSeperateMessage: true
      }
    ).catch(() => {
      // If finalization fails, fall back to basic finalization
      return finalizeCard(card.cardId);
    });
  }
}
