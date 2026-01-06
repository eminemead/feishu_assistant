import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
  client,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";
import { devtoolsTracker } from "./devtools-integration";
import { handleDocumentCommand } from "./handle-doc-commands";

/**
 * Format thinking/reasoning content as a collapsible-like section in markdown
 */
function formatThinkingSection(reasoning: string): string {
  if (!reasoning || reasoning.trim().length === 0) {
    return "";
  }
  
  let content = reasoning.trim();
  const maxLength = 1500;
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + "...";
  }
  
  return `\n\n---\n\n<font color="grey">🧠 **Thinking Process**</font>\n\n> ${content.replace(/\n/g, "\n> ")}`;
}

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
    // Handle both XML format (<at ...>) and plain text format (@_user_1, @user_id, etc.)
    let cleanText = messageText
        // Remove XML-style mentions: <at user_id="...">...</at>
        .replace(/<at (user_id|open_id)="[^"]+">.*?<\/at>\s*/g, "")
        // Remove plain text mentions: @_user_1, @user_id, etc. (at start of message)
        .replace(/^@[^\s]+\s+/, "")
        // Remove @bot prefix if present (could be from second mention or explicit @bot)
        .replace(/^@bot\s+/i, "")
        .trim();

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

        // Check if this is a document tracking command (early exit before agent)
        // After mention removal, cleanText starts directly with the command (e.g., "watch https://...")
        const isDocCommand = /^(watch|check|unwatch|watched|tracking:\w+)\s+/i.test(cleanText);
        if (isDocCommand) {
            console.log(`[DocCommand] Intercepted document command: "${cleanText.substring(0, 50)}..."`);
            devtoolsTracker.trackAgentCall("DocumentTracking", cleanText, {
                messageId,
                rootId,
                commandIntercepted: true
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

        // Generate response with streaming and memory context
        console.log(`[FeishuMention] Generating response...`);
        const rawResult = await generateResponse(messages, updateCard, chatId, rootId, userId);
        
        // Handle structured result (with reasoning and confirmation) or plain string
        let result: string;
        let reasoning: string | undefined;
        let needsConfirmation = false;
        let confirmationData: string | undefined;
        
        if (typeof rawResult === "string") {
            result = rawResult;
        } else {
            result = rawResult.text;
            reasoning = rawResult.reasoning;
            needsConfirmation = rawResult.needsConfirmation || false;
            confirmationData = rawResult.confirmationData;
        }
        console.log(`[FeishuMention] Response generated:`);
        console.log(`  - length=${result?.length || 0}`);
        console.log(`  - reasoning=${reasoning?.length || 0}`);
        console.log(`  - needsConfirmation=${needsConfirmation}`);
        console.log(`  - hasConfirmationData=${!!confirmationData}`);
        console.log(`  - confirmationDataLength=${confirmationData?.length || 0}`);
        console.log(`  - result preview: "${result?.substring(0, 100) || 'N/A'}..."`);

        // Append thinking as markdown section if reasoning is present
        if (reasoning && reasoning.length > 0) {
            console.log(`[Card] Appending thinking section with ${reasoning.length} chars of reasoning`);
            const thinkingSection = formatThinkingSection(reasoning);
            result = result + thinkingSection;
        }

        // Finalize card with follow-up suggestions and send buttons in separate message
        // This handles: disabling streaming, generating followups, formatting as markdown, updating card, and sending buttons
        console.log(`[FeishuMention] Finalizing card with suggestions. cardId=${card.cardId}, result length=${result?.length || 0}`);
        const finalizeResult = await finalizeCardWithFollowups(
            card.cardId,
            card.elementId,
            result,
            cleanText,  // context for question generation
            needsConfirmation ? 0 : 3,  // No followups if confirmation needed
            {
                conversationId: chatId,
                rootId: messageId,
                threadId: rootId,
                sendButtonsAsSeperateMessage: true,
                confirmationData: needsConfirmation ? confirmationData : undefined,
            }
        );
        console.log(`[FeishuMention] Card finalized with suggestions${finalizeResult.buttonMessageId ? ` (buttons: ${finalizeResult.buttonMessageId})` : ''}`);

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
        try {
            await updateCardElement(
                card.cardId,
                card.elementId,
                errorMessage
            );
        } catch (updateError) {
            // If card update fails (e.g., sequence error), create a new error message
            console.error("Failed to update card with error message:", updateError);
            // Send a new message instead of updating the card
            await client.im.message.reply({
                path: { message_id: messageId },
                data: {
                    content: errorMessage,
                    msg_type: "text",
                    reply_in_thread: true,
                },
            });
        }
        // Finalize with error message but still try to add suggestions
        await finalizeCardWithFollowups(
            card.cardId,
            card.elementId,
            errorMessage,
            cleanText,
            3,
            {
                conversationId: chatId,
                rootId: messageId,
                threadId: rootId,
                sendButtonsAsSeperateMessage: true
            }
        ).catch(() => {
            // If finalization fails, fall back to basic finalization
            return finalizeCard(card.cardId);
        });
    }
}
