/**
 * Enhanced card finalization with button follow-up suggestions
 * 
 * Implementation of Hypothesis 1: Send buttons in separate message
 * 
 * Strategy:
 * 1. Stream response in card with streaming_mode: true
 * 2. Add text-based suggestions to response
 * 3. Disable streaming mode
 * 4. Send buttons in SEPARATE message (no streaming_mode, so buttons work!)
 * 
 * This bypasses Feishu's 99992402 restriction entirely by putting buttons
 * in a non-streaming message where they're allowed.
 */

import { getNextCardSequence, client as feishuClient, updateCardElement } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";
import { formatSuggestionsAsMarkdown } from "./format-suggestions";
import { sendFollowupButtonsMessage } from "./send-follow-up-buttons-message";

export interface FinalizeCardConfig {
  /**
   * Feishu conversation ID (required for sending button message)
   * e.g., "oc_xxxxx" or "c_xxxxx"
   */
  conversationId?: string;
  
  /**
   * Root message ID (used as context for button message)
   * e.g., messageId for threading context
   */
  rootId?: string;
  
  /**
   * Thread ID if replying in thread
   */
  threadId?: string;
  
  /**
   * Whether to send buttons in separate message (Hypothesis 1)
   * Default: true
   */
  sendButtonsAsSeperateMessage?: boolean;
}

/**
 * Finalize card and add follow-up suggestions
 * This is called at the end of response generation
 * 
 * @param cardId Feishu card ID
 * @param elementId Markdown element ID for main content
 * @param finalContent Final response text to display
 * @param context Context for generating follow-up questions
 * @param maxFollowups Maximum number of suggestions to generate (default: 3)
 * @param config Configuration for button sending and other options
 * @returns Object with generated followups or error
 */
export async function finalizeCardWithFollowups(
  cardId: string,
  elementId: string,
  finalContent?: string,
  context?: string,
  maxFollowups?: number,
  config?: FinalizeCardConfig
): Promise<{
  followups?: FollowupOption[];
  buttonMessageId?: string;
  error?: string;
}> {
  try {
    console.log(`🎯 [CardSuggestions] Finalizing card with follow-ups: cardId=${cardId}, contentLength=${finalContent?.length || 0}`);

    // Step 1: Generate follow-up questions (while streaming is still active)
    console.log(`🎯 [CardSuggestions] Generating follow-up suggestions...`);
    const followups = await generateFollowupQuestions(
      finalContent || "",
      context,
      maxFollowups || 3
    );
    console.log(`🎯 [CardSuggestions] generateFollowupQuestions returned ${followups?.length || 0} followups`);

    let contentWithSuggestions = finalContent || '';
    
    // Step 2: If suggestions were generated, format and append them as text
    if (followups && followups.length > 0) {
      console.log(`🎯 [CardSuggestions] Formatting ${followups.length} suggestions as markdown...`);
      const suggestionsMarkdown = formatSuggestionsAsMarkdown(followups, {
        style: 'numbered',
        separator: true,
        emoji: true,
        category: false,
      });
      contentWithSuggestions = finalContent + suggestionsMarkdown;
      
      // Step 3: Update card element with suggestions (BEFORE disabling streaming)
      console.log(`🎯 [CardSuggestions] Updating card element with suggestions...`);
      await updateCardElement(cardId, elementId, contentWithSuggestions);
      console.log(`✅ [CardSuggestions] Card updated with ${followups.length} text-based suggestions`);
    } else {
      console.log(`⚠️ [CardSuggestions] No follow-ups generated`);
    }

    // Step 4: Finally, disable streaming mode
    console.log(`🎯 [CardSuggestions] Disabling streaming mode...`);
    await finalizeCardSettings(cardId, contentWithSuggestions, feishuClient);
    console.log(`✅ [CardSuggestions] Streaming mode disabled`);

    // Step 5: Send buttons in SEPARATE message (Hypothesis 1)
    // This works because non-streaming messages CAN have action elements!
    let buttonMessageId: string | undefined;
    
    if (followups && followups.length > 0 && config?.conversationId && config?.rootId) {
      console.log(`🔘 [CardSuggestions] Sending buttons in separate message (Hypothesis 1)...`);
      
      const buttonResult = await sendFollowupButtonsMessage(
        config.conversationId,
        followups,
        config.rootId,
        config.threadId
      );

      if (buttonResult.success && buttonResult.messageId) {
        buttonMessageId = buttonResult.messageId;
        console.log(`✅ [CardSuggestions] Buttons sent in separate message: ${buttonMessageId}`);
      } else {
        console.log(`⚠️ [CardSuggestions] Failed to send button message: ${buttonResult.error}`);
        // Text suggestions are already in the response, so this is a degradation, not a failure
      }
    } else if (followups && followups.length > 0) {
      console.log(`⚠️ [CardSuggestions] Config missing conversationId/rootId - buttons not sent in separate message`);
      console.log(`   Text-based suggestions are in response as fallback`);
    }

    return { followups, buttonMessageId };
  } catch (error) {
    console.error("❌ [CardSuggestions] Error finalizing card:", error);
    
    // Gracefully degrade: still disable streaming even if suggestions failed
    try {
      await finalizeCardSettings(cardId, finalContent, feishuClient);
    } catch (finalizeError) {
      console.error("❌ [CardSuggestions] Also failed to finalize settings:", finalizeError);
    }

    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Finalize card settings (disable streaming mode)
 */
async function finalizeCardSettings(
  cardId: string,
  finalContent?: string,
  client?: any
): Promise<void> {
  if (!client) client = feishuClient;
  
  // Use shared sequence counter so this call comes after all streaming updates
  const sequence = getNextCardSequence(cardId);

  const settingsData: any = {
    config: {
      streaming_mode: false,
    },
  };

  if (finalContent) {
    settingsData.summary = {
      content: finalContent.slice(0, 100), // Summary preview
    };
  }

  try {
    const resp = await client.cardkit.v1.card.settings({
      path: {
        card_id: cardId,
      },
      data: {
        settings: JSON.stringify(settingsData),
        sequence: sequence,
      },
    });

    const isSuccess =
      typeof resp.success === "function"
        ? resp.success()
        : resp.code === 0 || resp.code === undefined;

    if (!isSuccess) {
      console.warn("Failed to finalize card settings:", resp);
    }
  } catch (error) {
    console.warn("Failed to finalize card settings (non-critical):", error);
  }
}



/**
 * Export for testing
 */
export const _testOnly = {
  finalizeCardSettings,
};
