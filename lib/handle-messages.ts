import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import { maybeInjectRecentChatHistory } from "./chat-history-prefetch";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";
import { handleDocumentCommand } from "./handle-doc-commands";
import { devtoolsTracker } from "./devtools-integration";
import { logger } from "./logger";
import { executeSkillWorkflow } from "./workflows";
import { SLASH_COMMANDS, HELP_COMMANDS } from "./workflows/dpa-assistant-workflow";
import { getLinkedIssue } from "./services/issue-thread-mapping-service";
import { stripThinkingTags } from "./streaming/thinking-panel";
import { getRoutingDecision } from "./routing";
import {
  BROWSER_APPROVAL_CANCEL_PREFIX,
  BROWSER_APPROVAL_CONFIRM_PREFIX,
  BROWSER_APPROVAL_URL_REGEX,
} from "./shared/browser-approval";

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

  // Remove ONLY the bot mention from message text (preserve other @mentions for workflow)
  // After server.ts mention resolution, bot mention appears as @ou_xxx or @cli_xxx
  let cleanText = messageText
    // Remove XML-style bot mention at start: <at user_id="bot_id">@Bot</at>
    .replace(/^<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/, "")
    // Remove resolved bot mention at start: @ou_xxx (open_id format)
    .replace(/^@ou_[a-zA-Z0-9_-]+\s*/, "")
    // Remove resolved bot mention at start: @cli_xxx (app_id format)
    .replace(/^@cli_[a-zA-Z0-9_-]+\s*/, "")
    // Remove plain text bot mention at start: @_user_1 (placeholder ID)
    .replace(/^@_user_\d+\s*/, "")
    // Remove @bot prefix if present
    .replace(/^@bot\s+/i, "")
    .trim();

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

  // Check for slash commands (e.g., /collect, /创建, /list) - route directly to workflow
  const slashMatch = cleanText.match(/^\/([^\s]+)/);
  if (slashMatch) {
    const slashCmd = `/${slashMatch[1].toLowerCase()}`;
    const isKnownSlashCommand = slashCmd in SLASH_COMMANDS || HELP_COMMANDS.includes(slashCmd);
    
    if (isKnownSlashCommand) {
      logger.info(`[SlashCommand] ============================================`);
      logger.info(`[SlashCommand] Intercepted: "${slashCmd}"`);
      logger.info(`[SlashCommand] Full text: "${cleanText.substring(0, 100)}..."`);
      logger.info(`[SlashCommand] Context: chatId="${chatId}", rootId="${rootId}", userId="${userId}"`);
      logger.info(`[SlashCommand] ============================================`);
      
      devtoolsTracker.trackAgentCall("SlashCommand", cleanText, {
        messageId,
        rootId,
        command: slashCmd,
        commandIntercepted: true
      });

      // Create streaming card for slash command
      const card = await createAndSendStreamingCard(chatId, "chat_id", {}, {
        replyToMessageId: messageId,
        replyInThread: true,
      });

      try {
        // Check for linked GitLab issue
        const linkedIssue = await getLinkedIssue(chatId, rootId);
        if (linkedIssue) {
          logger.info(`[SlashCommand] Thread linked to GitLab #${linkedIssue.issueIid}`);
        }

        // Execute DPA Assistant workflow directly with full context
        const workflowResult = await executeSkillWorkflow("dpa-assistant", {
          query: cleanText,
          chatId,
          rootId,
          userId,
          linkedIssue: linkedIssue || undefined,
          onUpdate: async (text: string) => {
            await updateCardElement(card.cardId, card.elementId, text);
          },
        });

        logger.info(`[SlashCommand] Workflow result: success=${workflowResult.success}, needsConfirmation=${workflowResult.needsConfirmation}`);
        
        // Handle skip workflow signal (general_chat should fall through to agent)
        if (workflowResult.skipWorkflow) {
          logger.info(`[SlashCommand] Workflow returned skip signal, falling through to agent`);
          // Don't return - continue to generateResponse below
        } else {
          // Finalize card with workflow response
          const duration = Date.now() - startTime;
          await finalizeCardWithFollowups(
            card.cardId,
            card.elementId,
            workflowResult.response,
            undefined,
            undefined,
            {
              conversationId: chatId,
              rootId: rootId,
              threadId: rootId,
              confirmationData: workflowResult.needsConfirmation ? workflowResult.confirmationData : undefined,
              confirmationConfig: workflowResult.needsConfirmation
                ? workflowResult.confirmationConfig
                : undefined,
            }
          );

          devtoolsTracker.trackResponse("SlashCommand", workflowResult.response, duration, {
            threadId: rootId,
            messageId,
            command: slashCmd,
            workflowId: "dpa-assistant",
          });

          logger.info(`[SlashCommand] Complete (duration=${duration}ms)`);
          return; // Early exit - don't call generateResponse
        }
      } catch (workflowError) {
        logger.error(`[SlashCommand] Workflow execution failed:`, workflowError);
        // Fall through to agent on error
      }
    } else {
      logger.info(`[SlashCommand] Unknown command "${slashCmd}", falling through to agent`);
    }
  }

  // Check for browser approval URLs or confirmation callbacks
  const isBrowserApproval =
    BROWSER_APPROVAL_URL_REGEX.test(cleanText) ||
    cleanText.startsWith(BROWSER_APPROVAL_CONFIRM_PREFIX) ||
    cleanText.startsWith(BROWSER_APPROVAL_CANCEL_PREFIX);
  if (isBrowserApproval) {
    logger.info(`[BrowserApproval] Intercepted approval request`);
    devtoolsTracker.trackAgentCall("BrowserApproval", cleanText, {
      messageId,
      rootId,
      commandIntercepted: true,
    });

    const card = await createAndSendStreamingCard(chatId, "chat_id", {}, {
      replyToMessageId: messageId,
      replyInThread: true,
    });

    try {
      const workflowResult = await executeSkillWorkflow("browser-approval", {
        query: cleanText,
        chatId,
        rootId,
        userId,
        onUpdate: async (text: string) => {
          await updateCardElement(card.cardId, card.elementId, text);
        },
      });

      const duration = Date.now() - startTime;
      await finalizeCardWithFollowups(
        card.cardId,
        card.elementId,
        workflowResult.response,
        undefined,
        undefined,
        {
          conversationId: chatId,
          rootId: rootId,
          threadId: rootId,
          confirmationData: workflowResult.needsConfirmation
            ? workflowResult.confirmationData
            : undefined,
          confirmationConfig: workflowResult.needsConfirmation
            ? workflowResult.confirmationConfig
            : undefined,
        }
      );

      devtoolsTracker.trackResponse("BrowserApproval", workflowResult.response, duration, {
        threadId: rootId,
        messageId,
        workflowId: "browser-approval",
      });
      return;
    } catch (workflowError) {
      logger.error(`[BrowserApproval] Workflow execution failed:`, workflowError);
      // Fall through to agent on error
    }
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
    const routingDecision = getRoutingDecision(cleanText);
    if (
      routingDecision.target.type === "workflow" &&
      routingDecision.target.workflowId === "feishu-task"
    ) {
      logger.info(`[FeishuTask] Intent detected, routing to feishu-task workflow`);

      const threadMessages =
        rootId !== messageId ? await getThread(chatId, rootId, botUserId) : [];

      const workflowResult = await executeSkillWorkflow("feishu-task", {
        query: cleanText,
        chatId,
        rootId,
        userId,
        context: threadMessages.length > 0 ? { threadMessages } : undefined,
        onUpdate: async (text: string) => {
          await updateCardElement(card.cardId, card.elementId, text);
        },
      });

      const duration = Date.now() - startTime;
      await finalizeCardWithFollowups(
        card.cardId,
        card.elementId,
        workflowResult.response,
        undefined,
        undefined,
        {
          conversationId: chatId,
          rootId: rootId,
          threadId: rootId,
          confirmationData: workflowResult.needsConfirmation
            ? workflowResult.confirmationData
            : undefined,
          confirmationConfig: workflowResult.confirmationConfig,
        }
      );

      devtoolsTracker.trackResponse("FeishuTask", workflowResult.response, duration, {
        threadId: rootId,
        messageId,
        workflowId: "feishu-task",
      });
      return;
    }

    // Stabilize memory threading:
    // - In Feishu non-thread messages, rootId === messageId (unique per trigger)
    // - Use a stable "main" memory thread so the bot can remember prior turns in the chat
    const memoryRootId = rootId === messageId ? "main" : rootId;

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

    // Symptom fix: if user asks "analyze last N messages / sentiment / context",
    // prefetch recent group chat history and inject it into the prompt.
    messages = await maybeInjectRecentChatHistory({
      chatId,
      userText: cleanText,
      existingMessages: messages,
    });

    // Generate response with streaming and memory context
    const rawResult = await generateResponse(messages, updateCard, chatId, rootId, userId, memoryRootId);
    
    // Structured result (with confirmation data, reasoning)
    let result: string;
    let needsConfirmation = false;
    let confirmationData: string | undefined;
    let reasoning: string | undefined;
    let linkedIssue: { issueIid: number; issueUrl: string; project: string } | undefined;
    
    result = rawResult.text;
    needsConfirmation = rawResult.needsConfirmation || false;
    confirmationData = rawResult.confirmationData;
    reasoning = rawResult.reasoning;
    linkedIssue = rawResult.linkedIssue;

    // Always hide embedded <think>...</think> tags from rendered output
    // (workflows + some models may include them in plain text).
    const stripped = stripThinkingTags(result);
    result = stripped.text;
    // If a model embedded thinking tags, treat it as "reasoning" (hidden by default).
    if (!reasoning && stripped.reasoning) {
      reasoning = stripped.reasoning;
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

    // Thinking/reasoning is hidden by default.
    // Opt-in only (useful for debugging).
    const showThinking = process.env.SHOW_THINKING_PROCESS === "true";
    if (showThinking && reasoning && reasoning.length > 0) {
      logger.debug(`[Card] Appending thinking section with ${reasoning.length} chars of reasoning`);
      const thinkingSection = formatThinkingSection(reasoning);
      result = result + thinkingSection;
    }

    // Finalize card and send confirmation buttons if needed
    const finalizeResult = await finalizeCardWithFollowups(
      card.cardId,
      card.elementId,
      result,
      undefined,  // context (unused)
      undefined,  // maxFollowups (unused)
      {
        conversationId: chatId,
        rootId: rootId,
        threadId: rootId,
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
