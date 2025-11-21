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

    // Add buttons to card as elements
    console.log(`🎯 [CardButtons] About to add ${followups.length} followup buttons...`);
    await addFollowupButtons(cardId, followups, feishuClient);
    console.log(`🎯 [CardButtons] addFollowupButtons completed`);

    // Add image if provided
    if (imageKey) {
      try {
        await addImageElement(cardId, imageKey, feishuClient);
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
 * Add follow-up button elements to card
 */
async function addFollowupButtons(
  cardId: string,
  followups: FollowupOption[],
  client?: any
): Promise<void> {
  if (!client) client = feishuClient;
  
  try {
    console.log(`📌 [CardButtons] addFollowupButtons called with Feishu client`);
    console.log(`📌 [CardButtons] Feishu client ready: ${typeof client}, has cardkit: ${!!client?.cardkit}`);
    
    // Verify client is available
    if (!client || !client.cardkit) {
      console.error(`❌ [CardButtons] Feishu client not initialized. client=${typeof client}, client.cardkit=${typeof client?.cardkit}`);
      throw new Error("Feishu client (cardkit) is not available. This is a server initialization error.");
    }
    
    console.log(`📌 [CardButtons] Client verification passed, proceeding with adding buttons`);

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

    // Try to add as an image-style element first (simpler API)
    const sequence = getNextCardSequence(cardId);
    console.log(`📌 [CardButtons] Using cardElement.create with stringified element...`);
    
    const resp = await client.cardkit.v1.cardElement.create({
      path: {
        card_id: cardId,
      },
      data: {
        element: JSON.stringify(actionElement), // Stringify like image element does
        sequence: sequence,
      },
    });

    const isSuccess =
      typeof resp.success === "function"
        ? resp.success()
        : resp.code === 0 || resp.code === undefined;

    if (!isSuccess) {
      console.warn("⚠️ [CardButtons] cardElement.create failed (action elements may not be supported this way):", resp);
      // Don't throw - buttons are non-critical enhancement
      return;
    }

    console.log(`✅ [CardButtons] Added ${followups.length} buttons to card`);
  } catch (error) {
    console.error("⚠️ [CardButtons] Error adding follow-up buttons (non-critical):", error);
    // Don't rethrow - buttons are a nice-to-have feature
    return;
  }
}

/**
 * Add image element to card
 */
async function addImageElement(cardId: string, imageKey: string, client?: any): Promise<void> {
  if (!client) client = feishuClient;
  
  // Use shared sequence counter
  const sequence = getNextCardSequence(cardId);

  const imageElement = {
    tag: "img",
    img_key: imageKey,
  };
  const resp = await client.cardkit.v1.cardElement.create({
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
