/**
 * Alternative: Add buttons as DIRECT elements, not wrapped in action tag
 * 
 * Theory: Feishu rejects `tag: "action"` in streaming cards,
 * but might accept direct `tag: "button"` elements
 */

import { client, getNextCardSequence } from "./feishu-utils";

export interface ButtonElement {
  text: string;
  value?: string;
  type?: "default" | "primary" | "danger";
}

/**
 * Add buttons as direct card body elements (no action wrapper)
 * 
 * Instead of:
 * { tag: "action", actions: [{ tag: "button", ... }] }
 * 
 * Try:
 * { tag: "button", ... }
 * { tag: "button", ... }
 */
export async function addDirectButtonsToCard(
  cardId: string,
  buttons: ButtonElement[],
  sequence: number
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  console.log(`🔘 [DirectButtons] Testing direct button elements (no action wrapper)...`);

  if (!buttons || buttons.length === 0) {
    return { success: false, method: "direct-buttons", error: "No buttons provided" };
  }

  try {
    // Add each button as a direct element
    // Try a few approaches:

    // Approach 1: Add a button row (div containing buttons)
    console.log(`🔘 [DirectButtons] Approach 1: Button row in div container...`);
    
    const buttonRowElement = {
      tag: "div",
      flex: [1, 1],
      elements: buttons.map((btn) => ({
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

    let resp = await client.cardkit.v1.cardElement.create({
      path: { card_id: cardId },
      data: {
        type: "append",
        elements: JSON.stringify(buttonRowElement),
        sequence: sequence,
      },
    });

    let isSuccess = resp.code === 0 || resp.code === undefined;

    if (isSuccess) {
      console.log(`✅ [DirectButtons] SUCCESS with div container!`);
      return { success: true, method: "div-container" };
    }

    console.log(`⚠️ [DirectButtons] Div container failed: ${resp.msg}`);

    // Approach 2: Add individual buttons directly
    console.log(`🔘 [DirectButtons] Approach 2: Individual button elements...`);

    const nextSeq = sequence + 1;
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const buttonElement = {
        tag: "button",
        text: {
          content: btn.text,
          tag: "plain_text",
        },
        type: btn.type || "default",
        size: "medium",
        value: btn.value || btn.text,
      };

      resp = await client.cardkit.v1.cardElement.create({
        path: { card_id: cardId },
        data: {
          type: "append",
          elements: JSON.stringify(buttonElement),
          sequence: nextSeq + i,
        },
      });

      isSuccess = resp.code === 0 || resp.code === undefined;

      if (!isSuccess) {
        console.log(`⚠️ [DirectButtons] Individual button ${i + 1} failed: ${resp.msg}`);
        return {
          success: false,
          method: "individual-buttons",
          error: { code: resp.code, msg: resp.msg },
        };
      }
    }

    console.log(`✅ [DirectButtons] SUCCESS with individual buttons!`);
    return { success: true, method: "individual-buttons" };

  } catch (error) {
    console.log(`❌ [DirectButtons] Exception:`, error);
    return { success: false, method: "direct-buttons", error };
  }
}
