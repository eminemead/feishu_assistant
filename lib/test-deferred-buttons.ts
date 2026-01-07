/**
 * Test: Add buttons AFTER disabling streaming mode
 * 
 * Theory: Feishu might reject action elements only while streaming is active.
 * If we disable streaming first, then add buttons, it might work.
 * 
 * This is the deferred button approach (Option 5).
 */

import { client, getNextCardSequence } from "./feishu-utils";

export interface TestButton {
  text: string;
  value?: string;
  type?: "default" | "primary" | "danger";
}

/**
 * Test implementation: Add buttons AFTER streaming is disabled
 * 
 * Sequence:
 * 1. Create streaming card (markdown element only)
 * 2. Stream content to markdown element  
 * 3. Disable streaming_mode via card.settings
 * 4. THEN try to add action element with buttons
 * 
 * @param cardId Feishu card ID
 * @param buttons Button definitions
 * @param sequence Current sequence number
 * @returns Success status and error details
 */
export async function testAddButtonsAfterStreamingDisabled(
  cardId: string,
  buttons: TestButton[],
  sequence: number
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  console.log(`🧪 [ButtonTest] Testing deferred button addition (Option 5)...`);
  console.log(`🧪 [ButtonTest] Prerequisites: streaming_mode should already be disabled`);

  if (!buttons || buttons.length === 0) {
    return { success: false, method: "cardElement.create", error: "No buttons provided" };
  }

  try {
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

    console.log(`🧪 [ButtonTest] Attempting to add ${buttons.length} buttons via cardElement.create...`);

    // Try using cardElement.create API (same as we tried before, but after streaming disabled)
    const resp = await client.cardkit.v1.cardElement.create({
      path: {
        card_id: cardId,
      },
      data: {
        element: JSON.stringify(actionElement),
        sequence: sequence,
      },
    });

    const isSuccess = resp.code === 0
      ? resp.code === 0 || resp.code === undefined
      : resp.code === 0 || resp.code === undefined;

    if (isSuccess) {
      console.log(`✅ [ButtonTest] SUCCESS! Buttons added after streaming disabled`);
      console.log(`🎉 [ButtonTest] Option 5 works - deferred button addition is viable!`);
      return { success: true, method: "cardElement.create" };
    } else {
      console.log(`❌ [ButtonTest] Failed with response code ${resp.code}`);
      console.log(`❌ [ButtonTest] Error: ${resp.msg}`);
      return {
        success: false,
        method: "cardElement.create",
        error: {
          code: resp.code,
          msg: resp.msg,
          data: resp.data,
        },
      };
    }
  } catch (error) {
    console.log(`❌ [ButtonTest] Exception occurred:`, error);
    return {
      success: false,
      method: "cardElement.create",
      error,
    };
  }
}

/**
 * Alternative approach: Try using card.update instead of cardElement.create
 * Some APIs might have different behaviors
 */
export async function testAddButtonsViaCardUpdate(
  cardId: string,
  buttons: TestButton[],
  sequence: number
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  console.log(`🧪 [ButtonTest] Testing alternative: card.update API...`);

  if (!buttons || buttons.length === 0) {
    return { success: false, method: "card.update", error: "No buttons provided" };
  }

  try {
    // Try updating card body to add action element
    const updateData = {
      body: {
        elements: [
          {
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
          },
        ],
      },
      sequence: sequence,
    };

    console.log(`🧪 [ButtonTest] Attempting card.update with action element...`);

    const resp = await client.cardkit.v1.card.update({
      path: {
        card_id: cardId,
      },
      data: JSON.stringify(updateData),
    });

    const isSuccess = resp.code === 0
      ? resp.code === 0 || resp.code === undefined
      : resp.code === 0 || resp.code === undefined;

    if (isSuccess) {
      console.log(`✅ [ButtonTest] SUCCESS via card.update!`);
      return { success: true, method: "card.update" };
    } else {
      console.log(`❌ [ButtonTest] card.update failed: ${resp.msg}`);
      return {
        success: false,
        method: "card.update",
        error: {
          code: resp.code,
          msg: resp.msg,
        },
      };
    }
  } catch (error) {
    console.log(`❌ [ButtonTest] card.update exception:`, error);
    return {
      success: false,
      method: "card.update",
      error,
    };
  }
}
