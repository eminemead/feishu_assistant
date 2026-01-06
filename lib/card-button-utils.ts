/**
 * Utilities for rendering interactive buttons on Feishu cards
 * Reference: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components/interactive-components/button
 */

export interface CardButton {
  id: string;
  text: string;
  type?: "default" | "primary" | "danger";
  size?: "small" | "medium" | "large";
  value?: string;
}

/**
 * Create a button element for Feishu card (v2.0)
 */
export function createButtonElement(button: CardButton): any {
  return {
    tag: "button",
    text: {
      content: button.text,
      tag: "plain_text",
    },
    type: button.type || "default",
    size: button.size || "medium",
    value: button.value || button.text, // Value sent back in callback
  };
}

/**
 * Create a row of buttons to add to card body
 */
export function createButtonRow(buttons: CardButton[]): any {
  return {
    tag: "div",
    flex: [1, 1],
    elements: buttons.map((btn) => ({
      tag: "button",
      text: {
        content: btn.text,
        tag: "plain_text",
      },
      type: btn.type || "default",
      width: "100%",
      size: btn.size || "medium",
      value: btn.value || btn.text,
    })),
  };
}

/**
 * Add button container to card body with follow-up options
 */
export function addFollowupButtonsToCard(
  cardData: any,
  buttons: CardButton[],
  containerLabel?: string
): any {
  const updatedCard = JSON.parse(JSON.stringify(cardData)); // Deep copy

  // Add to card body if it exists, otherwise create one
  if (!updatedCard.body) {
    updatedCard.body = {
      elements: [],
    };
  }

  if (!updatedCard.body.elements) {
    updatedCard.body.elements = [];
  }

  // Add label if provided
  if (containerLabel) {
    updatedCard.body.elements.push({
      tag: "text",
      content: containerLabel,
      text_size: "small",
    });
  }

  // Add separator
  updatedCard.body.elements.push({
    tag: "markdown",
    content: "",
  });

  // Add action element with buttons
  updatedCard.body.elements.push({
    tag: "action",
    actions: buttons.map((btn) => ({
      tag: "button",
      text: {
        content: btn.text,
        tag: "plain_text",
      },
      type: btn.type || "default",
      size: btn.size || "medium",
      value: btn.value || btn.text,
    })),
  });

  return updatedCard;
}

/**
 * Create a simple button card structure
 * Useful for quick button layouts
 */
export function createSimpleButtonCard(
  title: string,
  content: string,
  buttons: CardButton[]
): any {
  return {
    schema: "2.0",
    header: {
      title: {
        content: title,
        tag: "plain_text",
      },
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: content,
        },
        {
          tag: "div",
          text: {
            content: "",
            tag: "plain_text",
          },
        },
        {
          tag: "action",
          actions: buttons.map((btn) => ({
            tag: "button",
            text: {
              content: btn.text,
              tag: "plain_text",
            },
            type: btn.type || "default",
            size: btn.size || "medium",
            value: btn.value || btn.text,
          })),
        },
      ],
    },
  };
}

/**
 * Extract button value from card action callback
 * Handles string values in format "chatId|rootId::buttonText" or plain strings
 */
export function extractButtonValue(actionValue: any): string | null {
  if (typeof actionValue === "string") {
    // Check for context-encoded format: "chatId|rootId::buttonText"
    if (actionValue.includes("::")) {
      const parts = actionValue.split("::");
      return parts.slice(1).join("::"); // Return everything after first ::
    }
    return actionValue;
  }
  if (actionValue && typeof actionValue === "object") {
    // Legacy object fallback
    return actionValue.text || actionValue.value || null;
  }
  return null;
}

/**
 * Extract context (chatId, rootId) from card action value string
 * Format: "chatId|rootId::buttonText"
 */
export function extractButtonContext(actionValue: any): { chatId: string; rootId: string } | null {
  if (typeof actionValue === "string" && actionValue.includes("::")) {
    const contextPart = actionValue.split("::")[0]; // Get "chatId|rootId"
    const parts = contextPart.split("|");
    if (parts.length >= 2) {
      return {
        chatId: parts[0],
        rootId: parts[1],
      };
    }
  }
  // Legacy object format fallback
  if (actionValue && typeof actionValue === "object" && actionValue.context) {
    const parts = actionValue.context.split("|");
    if (parts.length >= 2) {
      return {
        chatId: parts[0],
        rootId: parts[1],
      };
    }
  }
  return null;
}
