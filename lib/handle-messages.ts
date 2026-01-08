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
import { logger } from "./logger";

/**
 * Format thinking/reasoning content as a collapsible-like section in markdown
 * Uses Feishu markdown's quote formatting for a subtle appearance
 */
function formatThinkingSection(reasoning: string): string {
  if (!reasoning || reasoning.trim().length === 0) {
    return "";
  }
  
  // Truncate if too long
  let content = reasoning.trim();
  const maxLength = 1500;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + "...";
  }
  
  // Format as a dimmed section with divider
  return `\n\n---\n\n<font color="grey">🧠 **Thinking Process**</font>\n\n> ${content.replace(/\n/g, "\n> ")}`;
}

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

  logger.info(`Handling new message: ${chatId} ${rootId}`);

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
    logger.info(`[DocCommand] Intercepted document command: "${cleanText.substring(0, 50)}..."`);
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
      logger.success("DocCommand", "Command handled successfully");
      await updateCardElement(card.cardId, card.elementId, "✅ Command executed");
      const duration = Date.now() - startTime;
      devtoolsTracker.trackResponse("DocumentTracking", "Command executed", duration, {
        threadId: rootId,
        messageId,
        commandHandled: true
      });
      return; // Early exit - don't call generateResponse
    }
    logger.info(`[DocCommand] Command pattern matched but handler returned false, falling through to agent`);
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
      const threadMessages = await getThread(chatId, rootId, botUserId);
      
      // Always add current message to thread context
      // This ensures button followups and new messages aren't lost
      if (threadMessages.length === 0) {
        logger.warn(`Thread fetch returned empty, using current message as fallback`);
        messages = [{ role: "user" as const, content: cleanText }];
      } else {
        // Append current message to thread history
        messages = [...threadMessages, { role: "user" as const, content: cleanText }];
      }
    } else {
      // New conversation
      messages = [{ role: "user" as const, content: cleanText }];
    }

    // Generate response with streaming and memory context
    const rawResult = await generateResponse(messages, updateCard, chatId, rootId, userId);
    
    // Handle structured result (with confirmation data, reasoning, showFollowups) or plain string
    let result: string;
    let needsConfirmation = false;
    let confirmationData: string | undefined;
    let reasoning: string | undefined;
    let showFollowups: boolean | undefined;
    let linkedIssue: { issueIid: number; issueUrl: string; project: string } | undefined;
    
    if (typeof rawResult === "string") {
      result = rawResult;
      showFollowups = true; // String response = general, show suggestions
    } else {
      result = rawResult.text;
      needsConfirmation = rawResult.needsConfirmation || false;
      confirmationData = rawResult.confirmationData;
      reasoning = rawResult.reasoning;
      showFollowups = rawResult.showFollowups; // Propagate from manager
      linkedIssue = rawResult.linkedIssue;
    }
    
    // Add linkage indicator if thread has linked GitLab issue
    if (linkedIssue && !needsConfirmation) {
      const linkageIndicator = `🔗 *Linked to [GitLab #${linkedIssue.issueIid}](${linkedIssue.issueUrl})*\n\n---\n\n`;
      result = linkageIndicator + result;
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
      logger.debug("Could not extract image_key from result");
    }

    // Append thinking as collapsed section in markdown if reasoning is present
    // Note: Feishu collapsible_panel doesn't work with streaming cards, so we use markdown formatting
    if (reasoning && reasoning.length > 0) {
      logger.debug(`[Card] Appending thinking section with ${reasoning.length} chars of reasoning`);
      // Format thinking as a dimmed/quoted section that users can scroll to see
      const thinkingSection = formatThinkingSection(reasoning);
      result = result + thinkingSection;
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
        showFollowups: showFollowups, // Propagate from manager (false for deterministic workflows)
      }
    );

    // Track successful response
    const duration = Date.now() - startTime;
    devtoolsTracker.trackResponse("FeishuMessage", result, duration, {
      threadId: rootId,
      messageId
    });
    } catch (error) {
    logger.error("Error generating response:", error);

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
