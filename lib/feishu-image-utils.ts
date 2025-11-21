/**
 * Feishu Image Upload and Sending Utilities
 * 
 * Functions to upload images to Feishu and send them in messages/cards
 */

import * as lark from "@larksuiteoapi/node-sdk";
import { client } from "./feishu-utils";

/**
 * Upload an image to Feishu and get the image_key
 * 
 * @param imageBuffer - Image buffer (PNG, JPG, etc.)
 * @param imageType - Type of image: "message" or "card"
 * @returns image_key that can be used in messages/cards
 */
export async function uploadImageToFeishu(
  imageBuffer: Buffer,
  imageType: "message" | "card" = "message"
): Promise<string> {
  // Feishu SDK image upload API
  // Note: Verify exact API path - might be:
  // - client.im.v1.image.create()
  // - client.im.image.create()
  // - client.file.image.create()
  
  // Based on Feishu SDK patterns, try:
  const resp = await (client as any).im.v1.image.create({
    data: {
      image_type: imageType,
      image: imageBuffer,
    },
  });

  if (!resp.success() || !resp.data?.image_key) {
    // Fallback: Try alternative API paths if first fails
    // This needs to be verified against actual SDK documentation
    throw new Error(`Failed to upload image: ${JSON.stringify(resp)}. Please verify the correct API path in @larksuiteoapi/node-sdk documentation.`);
  }

  return resp.data.image_key;
}

/**
 * Send an image message directly
 * 
 * @param receiveId - Chat ID or user ID
 * @param receiveIdType - Type of receive ID
 * @param imageKey - Image key from uploadImageToFeishu
 * @returns Message ID
 */
export async function sendImageMessage(
  receiveId: string,
  receiveIdType: "chat_id" | "open_id" | "user_id" | "email",
  imageKey: string
): Promise<string> {
  const resp = await client.im.message.create({
    params: {
      receive_id_type: receiveIdType,
    },
    data: {
      receive_id: receiveId,
      msg_type: "image",
      content: JSON.stringify({
        image_key: imageKey,
      }),
    },
  });

  if (!resp.success() || !resp.data?.message_id) {
    throw new Error("Failed to send image message");
  }

  return resp.data.message_id;
}

/**
 * Add image to an existing card
 * 
 * @param cardId - Card ID
 * @param elementId - Element ID (or auto-generate)
 * @param imageKey - Image key from uploadImageToFeishu
 * @param altText - Alt text for accessibility
 */
export async function addImageToCard(
  cardId: string,
  imageKey: string,
  elementId?: string,
  altText?: string
): Promise<void> {
  // Create image element
  const imageElement = {
    tag: "img",
    img_key: imageKey,
    alt: {
      tag: "plain_text",
      content: altText || "OKR Metrics Visualization",
    },
    title: {
      tag: "plain_text",
      content: "OKR Metrics Heatmap",
    },
    mode: "fit_horizontal", // or "crop_center"
    preview: true,
  };

  // If elementId provided, update existing element
  // Otherwise, we'd need to add to card body (requires card update)
  if (elementId) {
    const resp = await client.cardkit.v1.cardElement.update({
      path: {
        card_id: cardId,
        element_id: elementId,
      },
      data: {
        content: JSON.stringify(imageElement),
      },
    });

    if (!resp.success()) {
      throw new Error("Failed to add image to card");
    }
  } else {
    // Need to update card body to add new element
    // This requires fetching current card, modifying, and updating
    throw new Error("Adding new image element requires card body update - use elementId for existing elements");
  }
}

/**
 * Create a card with an image element
 * 
 * @param imageKey - Image key from uploadImageToFeishu
 * @param title - Card title
 * @param description - Optional description text
 * @returns Card ID and element ID
 */
export async function createCardWithImage(
  imageKey: string,
  title: string = "OKR Metrics Visualization",
  description?: string
): Promise<{ cardId: string; cardEntityId: string; elementId: string }> {
  const elementId = `img_${Date.now()}`;
  
  const cardData = {
    schema: "2.0",
    header: {
      title: {
        content: title,
        tag: "plain_text",
      },
    },
    body: {
      elements: [
        ...(description
          ? [
              {
                tag: "markdown",
                content: description,
              },
            ]
          : []),
        {
          tag: "img",
          img_key: imageKey,
          alt: {
            tag: "plain_text",
            content: "OKR Metrics Heatmap",
          },
          title: {
            tag: "plain_text",
            content: title,
          },
          mode: "fit_horizontal",
          preview: true,
          element_id: elementId,
        },
      ],
    },
  };

  const resp = await client.cardkit.v1.card.create({
    data: {
      type: "card_json",
      data: JSON.stringify(cardData),
    },
  });

  if (!resp.success() || !resp.data?.card_entity_id || !resp.data?.card_id) {
    throw new Error("Failed to create card with image");
  }

  return {
    cardId: resp.data.card_id,
    cardEntityId: resp.data.card_entity_id,
    elementId,
  };
}

