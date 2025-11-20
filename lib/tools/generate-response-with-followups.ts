/**
 * Helper to integrate follow-up question generation with response handling
 * This wraps the response generation to add follow-up buttons to cards
 */

import { generateFollowupQuestions, FollowupOption } from "./generate-followups-tool";
import { addFollowupButtonsToCard, CardButton } from "../card-button-utils";

export interface ResponseWithFollowups {
  response: string;
  followups: FollowupOption[];
  cardData?: any;
}

/**
 * Generate a response and automatically add follow-up button options
 * This is called after agent generates main response
 */
export async function enhanceResponseWithFollowups(
  response: string,
  cardData?: any,
  context?: string,
  maxOptions?: number
): Promise<ResponseWithFollowups> {
  console.log(`📌 [ResponseEnhancer] Enhancing response with follow-up buttons`);

  try {
    // Generate follow-up questions
    const followups = await generateFollowupQuestions(response, context, maxOptions || 3);

    console.log(`✅ [ResponseEnhancer] Generated ${followups.length} follow-ups`);

    // If card data provided, add buttons to it
    let enhancedCard = cardData;
    if (cardData) {
      const buttons: CardButton[] = followups.map((followup, index) => ({
        id: `followup_${index}`,
        text: followup.text,
        type: "default",
        size: "medium",
        value: followup.text, // Send the question back as the value
      }));

      enhancedCard = addFollowupButtonsToCard(
        cardData,
        buttons,
        "What would you like to explore?"
      );

      console.log(`✅ [ResponseEnhancer] Added ${buttons.length} buttons to card`);
    }

    return {
      response,
      followups,
      cardData: enhancedCard,
    };
  } catch (error) {
    console.error("❌ [ResponseEnhancer] Error enhancing response:", error);
    // Return response without follow-ups on error
    return {
      response,
      followups: [],
      cardData,
    };
  }
}

/**
 * Create card data with response and follow-up buttons
 * Used when creating new cards
 */
export async function createCardWithFollowups(
  title: string,
  response: string,
  context?: string,
  maxOptions?: number
): Promise<ResponseWithFollowups> {
  console.log(`📝 [CardBuilder] Creating card with title: "${title}"`);

  try {
    // Generate follow-up questions
    const followups = await generateFollowupQuestions(response, context, maxOptions || 3);

    // Create button elements
    const buttons: CardButton[] = followups.map((followup, index) => ({
      id: `followup_${index}`,
      text: followup.text,
      type: "default",
      size: "medium",
      value: followup.text,
    }));

    // Build card structure
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
          {
            tag: "markdown",
            content: response,
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
              value: btn.value,
            })),
          },
        ],
      },
    };

    console.log(
      `✅ [CardBuilder] Created card with ${buttons.length} follow-up buttons`
    );

    return {
      response,
      followups,
      cardData,
    };
  } catch (error) {
    console.error("❌ [CardBuilder] Error creating card:", error);
    // Return card without buttons on error
    return {
      response,
      followups: [],
      cardData: {
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
              content: response,
            },
          ],
        },
      },
    };
  }
}
