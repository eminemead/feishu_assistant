/**
 * Handle button selection and feed back to chat handler as new user query
 * When users click follow-up buttons, treat it as a new user message
 */

import { handleNewMessage } from "./handle-messages";
import { handleNewAppMention } from "./handle-app-mention";
import { extractButtonValue } from "./card-button-utils";
import { CardActionCallback, CardActionResponse } from "./handle-card-action";

export interface ButtonFollowupContext {
  chatId: string;
  messageId: string;
  rootId: string;
  botUserId: string;
  userId: string;
  buttonValue: string;
  originalActionId?: string;
  isMention?: boolean;
}

/**
 * Process button click as a new user query
 * @param context Button click context
 * @returns CardActionResponse for the button callback
 */
export async function handleButtonFollowup(
  context: ButtonFollowupContext
): Promise<CardActionResponse> {
  try {
    const {
      chatId,
      messageId,
      rootId,
      botUserId,
      userId,
      buttonValue,
      isMention,
    } = context;

    console.log(
      `🔘 [ButtonFollowup] Processing button click as new query: buttonValue="${buttonValue}", chatId=${chatId}, rootId=${rootId}`
    );

    // Treat button click as a new user message
    // The button value becomes the new message text
    const messageText = buttonValue;

    // Route based on chat type
    // In group mentions, route to app mention handler
    // In direct messages, route to message handler
    if (isMention) {
      console.log(
        `👥 [ButtonFollowup] Routing to mention handler: "${messageText}"`
      );
      await handleNewAppMention({
        chatId,
        messageId: messageId || `btn_${Date.now()}`, // Use timestamp if no messageId
        rootId,
        messageText,
        botUserId,
        userId,
      } as any);
    } else {
      console.log(
        `💬 [ButtonFollowup] Routing to message handler: "${messageText}"`
      );
      await handleNewMessage({
        chatId,
        messageId: messageId || `btn_${Date.now()}`,
        rootId,
        messageText,
        botUserId,
        userId,
      } as any);
    }

    console.log(`✅ [ButtonFollowup] Button followup processed successfully`);

    return {
      toast: {
        type: "success",
        content: "Processing your selection...",
      },
    };
  } catch (error) {
    console.error("❌ [ButtonFollowup] Error processing button followup:", error);
    return {
      toast: {
        type: "fail",
        content: "Failed to process your selection",
      },
    };
  }
}

/**
 * Extract button followup context from card action callback
 * This converts a card action payload into a button followup context
 */
export function extractButtonFollowupContext(
  payload: CardActionCallback,
  chatId: string,
  botUserId: string,
  isMention?: boolean
): ButtonFollowupContext | null {
  try {
    const actionValue = payload.event?.action?.value;
    const actionId = payload.event?.action?.action_id;
    const operatorId = payload.event?.operator?.operator_id;
    const eventId = payload.header?.event_id;

    // Extract button value
    const buttonValue = extractButtonValue(actionValue);
    if (!buttonValue) {
      console.warn(
        "⚠️ [ButtonFollowup] Could not extract button value from action"
      );
      return null;
    }

    // Try to extract context from action_id (format: chatId|rootId|index)
    let extractedChatId = chatId;
    let extractedRootId = chatId;
    
    if (actionId && typeof actionId === "string") {
      const parts = actionId.split("|");
      if (parts.length >= 2) {
        extractedChatId = parts[0];
        extractedRootId = parts[1];
        console.log(
          `✅ [ButtonFollowup] Extracted context from action_id: chatId=${extractedChatId}, rootId=${extractedRootId}`
        );
      }
    }

    return {
      chatId: extractedChatId,
      messageId: eventId || "",
      rootId: extractedRootId, // Use extracted rootId for proper thread context
      botUserId,
      userId: operatorId || "",
      buttonValue,
      isMention: isMention || false,
    };
  } catch (error) {
    console.error(
      "❌ [ButtonFollowup] Error extracting button followup context:",
      error
    );
    return null;
  }
}

/**
 * Create action handler for button clicks
 * Used with handleCardAction for custom action routing
 */
export function createButtonFollowupHandler(
  chatId: string,
  botUserId: string,
  isMention?: boolean
): (value: any) => Promise<CardActionResponse> {
  return async (actionValue: any) => {
    const buttonValue = extractButtonValue(actionValue);

    if (!buttonValue) {
      return {
        toast: {
          type: "fail",
          content: "Invalid button selection",
        },
      };
    }

    return handleButtonFollowup({
      chatId,
      messageId: "",
      rootId: chatId,
      botUserId,
      userId: "",
      buttonValue,
      isMention,
    });
  };
}
