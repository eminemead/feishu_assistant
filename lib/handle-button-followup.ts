/**
 * Handle button selection and feed back to chat handler as new user query
 * When users click follow-up buttons, treat it as a new user message
 */

import { handleNewMessage } from "./handle-messages";
import { handleNewAppMention } from "./handle-app-mention";
import { extractButtonValue, extractButtonContext } from "./card-button-utils";
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

    console.log(`🔘 [ButtonFollowup] ============================================`);
    console.log(`🔘 [ButtonFollowup] Processing button click as new query`);
    console.log(`🔘 [ButtonFollowup] Context: chatId="${chatId}", rootId="${rootId}"`);
    console.log(`🔘 [ButtonFollowup] ButtonValue length: ${buttonValue?.length || 0}`);
    console.log(`🔘 [ButtonFollowup] ButtonValue preview: "${buttonValue?.substring(0, 100)}..."`);
    console.log(`🔘 [ButtonFollowup] ============================================`);

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
    const operatorId = payload.event?.operator?.operator_id;
    const eventId = payload.header?.event_id;
    
    console.log(`🔘 [ButtonFollowup] ============================================`);
    console.log(`🔘 [ButtonFollowup] Extracting context from card action`);
    console.log(`🔘 [ButtonFollowup] Fallback chatId: "${chatId}"`);
    console.log(`🔘 [ButtonFollowup] ActionValue type: ${typeof actionValue}`);
    if (typeof actionValue === 'object' && actionValue) {
      console.log(`🔘 [ButtonFollowup] ActionValue object keys: ${Object.keys(actionValue).join(', ')}`);
      console.log(`🔘 [ButtonFollowup] ActionValue.context: "${actionValue.context}"`);
    }
    console.log(`🔘 [ButtonFollowup] ============================================`);

    // Extract button value (the text to use as new query)
    const buttonValue = extractButtonValue(actionValue);
    if (!buttonValue) {
      console.warn(
        "⚠️ [ButtonFollowup] Could not extract button value from action"
      );
      return null;
    }

    // Extract context from value string (format: "chatId|rootId::buttonText")
    // For confirmation buttons, context should be in actionValue.context (object format)
    let extractedChatId = chatId;
    let extractedRootId = chatId;
    
    const contextFromValue = extractButtonContext(actionValue);
    if (contextFromValue) {
      extractedChatId = contextFromValue.chatId;
      extractedRootId = contextFromValue.rootId;
      console.log(
        `✅ [ButtonFollowup] Extracted context from value: chatId="${extractedChatId}", rootId="${extractedRootId}"`
      );
    } else {
      console.log(
        `⚠️ [ButtonFollowup] No context extracted from value, using fallbacks: chatId="${extractedChatId}", rootId="${extractedRootId}"`
      );
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
