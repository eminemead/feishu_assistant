/**
 * Enhanced card finalization with text-based follow-up suggestions
 * 
 * NOTE: Feishu CardKit API does not support adding action elements (buttons) to cards
 * after creation. Error 99992402 is returned for any attempt. See docs/implementation/feishu-api-findings.md
 * 
 * Alternative: Suggestions are displayed as formatted text in markdown content.
 */

import { getNextCardSequence, client as feishuClient, updateCardElement } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";
import { formatSuggestionsAsMarkdown } from "./format-suggestions";

/**
 * Finalize card and add follow-up text-based suggestions
 * This is called at the end of response generation
 * 
 * @param cardId Feishu card ID
 * @param elementId Markdown element ID for main content
 * @param finalContent Final response text to display
 * @param context Context for generating follow-up questions
 * @param maxFollowups Maximum number of suggestions to generate (default: 3)
 * @returns Object with generated followups or error
 */
export async function finalizeCardWithFollowups(
  cardId: string,
  elementId: string,
  finalContent?: string,
  context?: string,
  maxFollowups?: number
): Promise<{
  followups?: FollowupOption[];
  error?: string;
}> {
  try {
    console.log(`🎯 [CardSuggestions] Finalizing card with follow-ups: cardId=${cardId}, contentLength=${finalContent?.length || 0}`);

    // Step 1: Finalize card settings (disable streaming mode)
    console.log(`🎯 [CardSuggestions] Disabling streaming mode...`);
    await finalizeCardSettings(cardId, finalContent, feishuClient);
    console.log(`✅ [CardSuggestions] Streaming mode disabled`);

    // Step 2: Generate follow-up questions
    console.log(`🎯 [CardSuggestions] Generating follow-up suggestions...`);
    const followups = await generateFollowupQuestions(
      finalContent || "",
      context,
      maxFollowups || 3
    );
    console.log(`🎯 [CardSuggestions] generateFollowupQuestions returned ${followups?.length || 0} followups`);

    if (!followups || followups.length === 0) {
      console.log(`⚠️ [CardSuggestions] No follow-ups generated`);
      return { followups: [] };
    }

    // Step 3: Format suggestions as markdown
    console.log(`🎯 [CardSuggestions] Formatting ${followups.length} suggestions as markdown...`);
    const suggestionsMarkdown = formatSuggestionsAsMarkdown(followups, {
      style: 'numbered',
      separator: true,
      emoji: true,
      category: false,
    });

    // Step 4: Append suggestions to final content
    const contentWithSuggestions = (finalContent || '') + suggestionsMarkdown;

    // Step 5: Update card element with suggestions
    console.log(`🎯 [CardSuggestions] Updating card element with suggestions...`);
    const sequence = getNextCardSequence(cardId);
    await updateCardElement(cardId, elementId, contentWithSuggestions, sequence);
    console.log(`✅ [CardSuggestions] Card updated with ${followups.length} text-based suggestions`);

    return { followups };
  } catch (error) {
    console.error("❌ [CardSuggestions] Error finalizing card:", error);
    
    // Gracefully degrade: card still works even if suggestions fail
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
