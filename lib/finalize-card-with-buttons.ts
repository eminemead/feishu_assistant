/**
 * Enhanced card finalization with interactive button support
 */

import { getNextCardSequence, client as feishuClient } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";
import { CardButton } from "./card-button-utils";

/**
 * Finalize card and add follow-up button options
 * This is called at the end of response generation
 */
export async function finalizeCardWithFollowups(
  cardId: string,
  finalContent?: string,
  imageKey?: string,
  context?: string,
  maxFollowups?: number
): Promise<{
  followups?: FollowupOption[];
  error?: string;
}> {
  try {
    console.log(`🎯 [CardButtons] Finalizing card with follow-ups: cardId=${cardId}, contentLength=${finalContent?.length || 0}`);

    // First, finalize card settings (disable streaming mode)
    console.log(`🎯 [CardButtons] Calling finalizeCardSettings...`);
    await finalizeCardSettings(cardId, finalContent, feishuClient);
    console.log(`🎯 [CardButtons] finalizeCardSettings completed`);

    // Generate follow-up questions
    console.log(`🎯 [CardButtons] About to generate followup questions. finalContent="${finalContent?.substring(0, 50) || 'empty'}...", context="${context?.substring(0, 30) || 'empty'}..."`);
    const followups = await generateFollowupQuestions(
      finalContent || "",
      context,
      maxFollowups || 3
    );
    console.log(`🎯 [CardButtons] generateFollowupQuestions returned ${followups?.length || 0} followups`);

    if (!followups || followups.length === 0) {
      console.log(`⚠️ [CardButtons] No follow-ups generated, returning empty`);
      return { followups: [] };
    }

    // NOTE: Feishu CardKit API does not support adding action elements to cards after creation.
    // The cardElement.create, card.update, and card.batchUpdate APIs all return error 99992402
    // (field validation failed) when attempting to add action elements.
    // 
    // Alternative approach: suggestions will be displayed as text in the markdown content
    // when the response is streamed. The followups are generated but not displayed as buttons.
    
    console.log(`📝 [CardButtons] Generated ${followups.length} follow-up suggestions (displayed as text in markdown)`);
    console.log(`✅ [CardButtons] Card finalized with ${followups.length} follow-up suggestions`);
    return { followups };
  } catch (error) {
    console.error("❌ [CardButtons] Error finalizing card:", error);
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
