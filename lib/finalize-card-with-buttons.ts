/**
 * Enhanced card finalization with interactive button support
 */

import { client } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";
import { CardButton } from "./card-button-utils";

// Track card sequences for button elements (separate from content sequences)
const cardButtonSequences = new Map<string, number>();

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
    console.log(`🎯 [CardButtons] Finalizing card with follow-ups: cardId=${cardId}`);

    // First, finalize card settings (disable streaming mode)
    await finalizeCardSettings(cardId, finalContent);

    // Generate follow-up questions
    const followups = await generateFollowupQuestions(
      finalContent || "",
      context,
      maxFollowups || 3
    );

    if (!followups || followups.length === 0) {
      console.log(`⚠️ [CardButtons] No follow-ups generated`);
      return { followups: [] };
    }

    // Add buttons to card as elements
    await addFollowupButtons(cardId, followups);

    // Add image if provided
    if (imageKey) {
      try {
        await addImageElement(cardId, imageKey);
      } catch (error) {
        console.error("Failed to add image (non-critical):", error);
      }
    }

    console.log(`✅ [CardButtons] Card finalized with ${followups.length} follow-up buttons`);
    return { followups };
  } catch (error) {
    console.error("❌ [CardButtons] Error finalizing card with buttons:", error);
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
  finalContent?: string
): Promise<void> {
  if (!cardButtonSequences.has(cardId)) {
    cardButtonSequences.set(cardId, 0);
  }
  const sequence = cardButtonSequences.get(cardId)! + 1;
  cardButtonSequences.set(cardId, sequence);

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
 * Add follow-up button elements to card
 */
async function addFollowupButtons(
  cardId: string,
  followups: FollowupOption[]
): Promise<void> {
  try {
    if (!cardButtonSequences.has(cardId)) {
      cardButtonSequences.set(cardId, 0);
    }
    const sequence = cardButtonSequences.get(cardId)! + 1;
    cardButtonSequences.set(cardId, sequence);

    // Create action element with buttons
    const actionElement = {
      tag: "action",
      actions: followups.map((followup, index) => ({
        tag: "button",
        text: {
          content: followup.text,
          tag: "plain_text",
        },
        type: "default",
        size: "medium",
        value: followup.text, // Button value is the follow-up question
      })),
    };

    console.log(
      `📌 [CardButtons] Adding ${followups.length} button elements to card: cardId=${cardId}`
    );

    const resp = await client.cardkit.v1.card.element.create({
      path: {
        card_id: cardId,
      },
      data: {
        element: JSON.stringify(actionElement),
        sequence: sequence,
      },
    });

    const isSuccess =
      typeof resp.success === "function"
        ? resp.success()
        : resp.code === 0 || resp.code === undefined;

    if (!isSuccess) {
      console.error("Failed to add button elements:", resp);
      throw new Error("Failed to add button elements to card");
    }

    console.log(`✅ [CardButtons] Added ${followups.length} buttons to card`);
  } catch (error) {
    console.error("❌ [CardButtons] Error adding follow-up buttons:", error);
    throw error;
  }
}

/**
 * Add image element to card
 */
async function addImageElement(cardId: string, imageKey: string): Promise<void> {
  if (!cardButtonSequences.has(cardId)) {
    cardButtonSequences.set(cardId, 0);
  }
  const sequence = cardButtonSequences.get(cardId)! + 1;
  cardButtonSequences.set(cardId, sequence);

  const imageElement = {
    tag: "img",
    img_key: imageKey,
  };

  const resp = await client.cardkit.v1.card.element.create({
    path: {
      card_id: cardId,
    },
    data: {
      element: JSON.stringify(imageElement),
      sequence: sequence,
    },
  });

  const isSuccess =
    typeof resp.success === "function"
      ? resp.success()
      : resp.code === 0 || resp.code === undefined;

  if (!isSuccess) {
    console.error("Failed to add image element:", resp);
    throw new Error("Failed to add image element to card");
  }

  console.log(`✅ [CardButtons] Image added to card: cardId=${cardId}`);
}

/**
 * Export for testing
 */
export const _testOnly = {
  addFollowupButtons,
  finalizeCardSettings,
  addImageElement,
};
