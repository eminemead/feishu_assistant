import { getThread } from "./feishu-utils";
import { generateResponse } from "./generate-response";
import { maybeInjectRecentChatHistory } from "./chat-history-prefetch";
import {
  createAndSendStreamingCard,
  updateCardElement,
  finalizeCard,
  client,
} from "./feishu-utils";
import { finalizeCardWithFollowups } from "./finalize-card-with-buttons";
import { devtoolsTracker } from "./devtools-integration";
import { handleDocumentCommand } from "./handle-doc-commands";
import { executeSkillWorkflow } from "./workflows";
import { SLASH_COMMANDS, HELP_COMMANDS } from "./workflows/dpa-assistant-workflow";
import { getLinkedIssue } from "./services/issue-thread-mapping-service";
import { stripThinkingTags } from "./streaming/thinking-panel";

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
    console.log(`[DEBUG] Original messageText: "${messageText.substring(0, 200)}"`);

    // Remove ONLY the bot mention from message text (preserve other @mentions for workflow)
    // The bot mention is typically at the start of the message
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

    console.log(`[DEBUG] cleanText after mention removal: "${cleanText.substring(0, 200)}"`);

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
        // Stabilize memory threading for non-thread mentions:
        // rootId === messageId means "not in a thread" (unique per trigger),
        // so use a stable "main" memory thread for continuity.
        const memoryRootId = rootId === messageId ? "main" : rootId;

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

        // Symptom fix: if user asks "analyze last N messages / sentiment / context",
        // prefetch recent group chat history and inject it into the prompt.
        messages = await maybeInjectRecentChatHistory({
            chatId,
            userText: cleanText,
            existingMessages: messages,
        });

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

        // Check for slash commands (e.g., /collect, /创建, /list) - route directly to workflow
        console.log(`[DEBUG] cleanText for slash check: "${cleanText.substring(0, 100)}"`);
        console.log(`[DEBUG] cleanText starts with /: ${cleanText.startsWith('/')}`);
        const slashMatch = cleanText.match(/^\/([^\s]+)/);
        console.log(`[DEBUG] slashMatch: ${JSON.stringify(slashMatch)}`);
        if (slashMatch) {
            const slashCmd = `/${slashMatch[1].toLowerCase()}`;
            const isKnownSlashCommand = slashCmd in SLASH_COMMANDS || HELP_COMMANDS.includes(slashCmd);
            
            if (isKnownSlashCommand) {
                console.log(`[SlashCommand] ============================================`);
                console.log(`[SlashCommand] Intercepted: "${slashCmd}"`);
                console.log(`[SlashCommand] Full text: "${cleanText.substring(0, 100)}..."`);
                console.log(`[SlashCommand] Context: chatId="${chatId}", rootId="${rootId}", userId="${userId}"`);
                console.log(`[SlashCommand] ============================================`);
                
                devtoolsTracker.trackAgentCall("SlashCommand", cleanText, {
                    messageId,
                    rootId,
                    command: slashCmd,
                    commandIntercepted: true
                });

                try {
                    // Check for linked GitLab issue
                    const linkedIssue = await getLinkedIssue(chatId, rootId);
                    if (linkedIssue) {
                        console.log(`[SlashCommand] Thread linked to GitLab #${linkedIssue.issueIid}`);
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

                    console.log(`[SlashCommand] Workflow result: success=${workflowResult.success}, needsConfirmation=${workflowResult.needsConfirmation}`);
                    
                    // Handle skip workflow signal (general_chat should fall through to agent)
                    if (workflowResult.skipWorkflow) {
                        console.log(`[SlashCommand] Workflow returned skip signal, falling through to agent`);
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
                            }
                        );

                        devtoolsTracker.trackResponse("SlashCommand", workflowResult.response, duration, {
                            threadId: rootId,
                            messageId,
                            command: slashCmd,
                            workflowId: "dpa-assistant",
                        });

                        console.log(`[SlashCommand] Complete (duration=${duration}ms)`);
                        return; // Early exit - don't call generateResponse
                    }
                } catch (workflowError) {
                    console.error(`[SlashCommand] Workflow execution failed:`, workflowError);
                    // Fall through to agent on error
                }
            } else {
                console.log(`[SlashCommand] Unknown command "${slashCmd}", falling through to agent`);
            }
        }

        // Generate response with streaming and memory context
        console.log(`[FeishuMention] Generating response...`);
        const rawResult = await generateResponse(messages, updateCard, chatId, rootId, userId, memoryRootId);
        
        // Structured result (with reasoning, confirmation)
        let result: string;
        let reasoning: string | undefined;
        let needsConfirmation = false;
        let confirmationData: string | undefined;
        
        result = rawResult.text;
        reasoning = rawResult.reasoning;
        needsConfirmation = rawResult.needsConfirmation || false;
        confirmationData = rawResult.confirmationData;

        // Always hide embedded <think>...</think> tags from rendered output
        const stripped = stripThinkingTags(result);
        result = stripped.text;
        if (!reasoning && stripped.reasoning) {
            reasoning = stripped.reasoning;
        }
        console.log(`[FeishuMention] Response generated:`);
        console.log(`  - length=${result?.length || 0}`);
        console.log(`  - reasoning=${reasoning?.length || 0}`);
        console.log(`  - needsConfirmation=${needsConfirmation}`);
        console.log(`  - hasConfirmationData=${!!confirmationData}`);
        console.log(`  - confirmationDataLength=${confirmationData?.length || 0}`);
        console.log(`  - result preview: "${result?.substring(0, 100) || 'N/A'}..."`);

        // Thinking/reasoning is hidden by default; opt-in for debugging.
        const showThinking = process.env.SHOW_THINKING_PROCESS === "true";
        if (showThinking && reasoning && reasoning.length > 0) {
            console.log(`[Card] Appending thinking section with ${reasoning.length} chars of reasoning`);
            const thinkingSection = formatThinkingSection(reasoning);
            result = result + thinkingSection;
        }

        // Finalize card and send confirmation buttons if needed
        console.log(`[FeishuMention] Finalizing card. cardId=${card.cardId}, result length=${result?.length || 0}`);
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
        console.log(`[FeishuMention] Card finalized${finalizeResult.buttonMessageId ? ` (confirmation buttons: ${finalizeResult.buttonMessageId})` : ''}`);

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
                rootId: rootId,  // FIXED: Use thread root ID
                threadId: rootId,
                sendButtonsAsSeperateMessage: true
            }
        ).catch(() => {
            // If finalization fails, fall back to basic finalization
            return finalizeCard(card.cardId);
        });
    }
}
