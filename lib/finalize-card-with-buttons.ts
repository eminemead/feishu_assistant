/**
 * Enhanced card finalization with button follow-up suggestions
 * 
 * Attempts to add real interactive buttons using cardElement.create API.
 * Falls back to text-based suggestions if button addition fails.
 * 
 * See lib/add-buttons-to-card.ts for button element creation.
 */

import { getNextCardSequence, client as feishuClient, updateCardElement } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";
import { formatSuggestionsAsMarkdown } from "./format-suggestions";
import { addDirectButtonsToCard } from "./add-direct-buttons-to-card";

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

    // Step 5: TEST - Try adding buttons as DIRECT elements (no action wrapper)
    // Theory: Feishu rejects `tag: "action"` but might accept direct `tag: "button"` elements
    if (followups && followups.length > 0) {
      console.log(`🔘 [CardSuggestions] Testing direct button elements (EXPERIMENTAL)...`);
      const buttonSequence = getNextCardSequence(cardId);
      const directButtons = followups.map((f, idx) => ({
        text: f.text,
        value: f.text,
        type: idx === 0 ? "primary" as const : "default" as const,
      }));

      const directResult = await addDirectButtonsToCard(
        cardId,
        directButtons,
        buttonSequence
      );

      if (directResult.success) {
        console.log(`🎉 [CardSuggestions] EXPERIMENTAL: Direct buttons work! (no action wrapper)`);
        // If direct buttons work, we might want to remove the text suggestions
        // For now, keep them as fallback
      } else {
        console.log(`⚠️ [CardSuggestions] Direct buttons failed: ${directResult.method}`);
      }
    }

    return { followups };
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
