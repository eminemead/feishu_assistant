/**
 * Add button elements to streaming cards after creation
 * Uses cardElement.create API to add action elements to cards
 */

import { client } from "./feishu-utils";

export interface CardButton {
  id?: string;
  text: string;
  type?: "default" | "primary" | "danger";
  value?: string;
}

/**
 * Add action buttons to existing card using cardElement.create API
 * This works even with streaming mode enabled
 * 
 * @param cardId Feishu card ID
 * @param buttons Array of button definitions
 * @param sequence Current sequence number for the card
 * @returns Success status
 */
export async function addButtonsToCard(
  cardId: string,
  buttons: CardButton[],
  sequence: number
): Promise<boolean> {
  if (!buttons || buttons.length === 0) {
    console.log(`⚠️ [Buttons] No buttons to add`);
    return true;
  }

  try {
    console.log(`🔘 [Buttons] Adding ${buttons.length} buttons to card: ${cardId}`);

    // Create action element with buttons
    const actionElement = {
      tag: "action",
      actions: buttons.map((btn) => ({
        tag: "button",
        text: {
          content: btn.text,
          tag: "plain_text",
        },
        type: btn.type || "default",
        size: "medium",
        value: btn.value || btn.text,
      })),
    };

    // Use cardElement.create API to add the action element
    const resp = await client.cardkit.v1.cardElement.create({
      path: {
        card_id: cardId,
      },
      data: {
        element: JSON.stringify(actionElement),
        sequence: sequence,
      },
    });

    const isSuccess = typeof resp.success === 'function' 
      ? resp.success() 
      : (resp.code === 0 || resp.code === undefined);

    if (!isSuccess) {
      console.error("❌ [Buttons] Failed to add buttons:", resp);
      return false;
    }

    console.log(`✅ [Buttons] Successfully added ${buttons.length} buttons to card`);
    return true;
  } catch (error) {
    console.error("❌ [Buttons] Error adding buttons:", error);
    return false;
  }
}
