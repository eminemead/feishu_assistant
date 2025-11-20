import * as lark from "@larksuiteoapi/node-sdk";
import { client } from "./feishu-utils";

/**
 * Card callback request structure from Feishu
 * Reference: https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-callback-communication
 */
export interface CardActionCallback {
  schema: string; // "2.0"
  header: {
    event_id: string;
    event_type: string;
    create_time: string;
    token: string;
    app_id: string;
  };
  event: {
    action: {
      action_id: string;
      action_type: string; // "select" | "button" | "form_submit" | etc.
      value?: any; // Button value or form data
    };
    trigger: {
      trigger_type: string; // "card.action.trigger"
    };
    operator: {
      operator_id: string;
      operator_type: string; // "user"
    };
    token: string;
  };
}

/**
 * Card action response structure to send back to Feishu
 */
export interface CardActionResponse {
  toast?: {
    type: "success" | "fail" | "warning"; // Toast type
    content: string;
  };
  card?: {
    type: "raw" | "template";
    data: string; // JSON stringified card data
    template_id?: string;
    template_variable?: Record<string, any>;
  };
}

/**
 * Handler for card action callbacks
 * When users click buttons or interact with cards, Feishu sends a callback to this endpoint
 */
export async function handleCardAction(
  payload: CardActionCallback
): Promise<CardActionResponse> {
  try {
    // Validate required fields
    if (!payload?.header || !payload?.event) {
      throw new Error("Missing required fields: header or event");
    }

    const eventId = payload.header?.event_id;
    const appId = payload.header?.app_id;
    const actionId = payload.event?.action?.action_id;
    const actionValue = payload.event?.action?.value;
    const operatorId = payload.event?.operator?.operator_id;

    // Validate action_id is present
    if (!actionId) {
      throw new Error("Missing required field: action_id");
    }

    console.log(`🎯 [CardAction] Handling card action: action_id=${actionId}, operator=${operatorId}`);

    // TODO: Implement actual action handlers based on action_id
    // For now, return a simple success response
    // In production, you might:
    // 1. Update card UI based on button clicks
    // 2. Log analytics
    // 3. Trigger backend operations
    // 4. Update card content dynamically

    // Example: If button is a "Refresh" button, update card content
    // Example: If form is submitted, process the data
    
    return {
      toast: {
        type: "success",
        content: `Action ${actionId} received successfully`,
      },
    };
  } catch (error) {
    console.error("❌ [CardAction] Error handling card action:", error);
    return {
      toast: {
        type: "fail",
        content: "Failed to process card action",
      },
    };
  }
}

/**
 * Parse and validate card action callback from Feishu
 * The payload comes encrypted via webhook, need to handle verification
 */
export async function parseCardActionCallback(
  headers: Record<string, string>,
  body: string,
  eventDispatcher: lark.EventDispatcher
): Promise<CardActionCallback | null> {
  try {
    // For webhook mode, the SDK EventDispatcher handles decryption
    // We need to manually parse if using raw body
    const payload = JSON.parse(body);

    // Validate schema version
    if (payload.schema !== "2.0") {
      console.warn(
        `⚠️ [CardAction] Unsupported callback schema version: ${payload.schema}`
      );
    }

    // Validate event type
    if (
      payload.event?.trigger?.trigger_type !== "card.action.trigger" &&
      payload.event?.trigger?.trigger_type !== "card.action.trigger_v1"
    ) {
      console.warn(
        `⚠️ [CardAction] Unexpected event type: ${payload.event?.trigger?.trigger_type}`
      );
    }

    return payload as CardActionCallback;
  } catch (error) {
    console.error("❌ [CardAction] Failed to parse card action callback:", error);
    return null;
  }
}

/**
 * Helper: Update card content in response to action
 * @param cardId - The card ID to update
 * @param newCardData - New card JSON data
 */
export function createCardUpdateResponse(
  cardId: string,
  newCardData: any
): CardActionResponse {
  return {
    card: {
      type: "raw",
      data: JSON.stringify(newCardData),
    },
  };
}

/**
 * Helper: Create a toast notification response
 * @param type - Toast type: success | fail | warning
 * @param content - Toast message
 */
export function createToastResponse(
  type: "success" | "fail" | "warning",
  content: string
): CardActionResponse {
  return {
    toast: {
      type,
      content,
    },
  };
}
