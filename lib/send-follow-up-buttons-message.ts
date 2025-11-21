/**
 * Send Follow-up Buttons as Separate Message
 * 
 * Implementation of Hypothesis 1: Separate message for buttons
 * 
 * This is the most likely working solution for streaming + buttons.
 * Instead of trying to add buttons to the streaming card, we send them
 * in a completely separate message after streaming finishes.
 * 
 * Why this works:
 * - Feishu allows action elements in regular (non-streaming) messages
 * - Bypasses the 99992402 validation for streaming cards entirely
 * - Clean separation: streaming card for content, separate message for actions
 * - Matches Feishu's design patterns for interactive messages
 */

import { client as feishuClient } from "./feishu-utils";
import { FollowupOption } from "./tools/generate-followups-tool";

interface SendButtonsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: string;
}

/**
 * Send follow-up suggestions as interactive buttons in a separate message
 * 
 * Called AFTER streaming finalization to send buttons in a new message.
 * This works because the buttons aren't constrained by streaming_mode.
 * 
 * @param conversationId The Feishu conversation ID
 * @param followups Array of follow-up options to display as buttons
 * @param rootId The root message ID (for context)
 * @param threadId Optional thread ID if replying in thread
 * @returns Result with message ID or error
 */
export async function sendFollowupButtonsMessage(
  conversationId: string,
  followups: FollowupOption[],
  rootId: string,
  threadId?: string
): Promise<SendButtonsResult> {
  try {
    if (!followups || followups.length === 0) {
      return {
        success: false,
        error: "No follow-ups provided",
      };
    }

    console.log(`🔘 [FollowupButtons] Sending ${followups.length} buttons in separate message...`);

    // Convert followups to button elements
    const actions = followups.map((followup, index) => {
      const isFirst = index === 0;
      return {
        tag: "button",
        text: {
          content: followup.text,
          tag: "plain_text",
        },
        type: isFirst ? "primary" : "default",
        value: followup.text, // What gets sent when user clicks
      };
    });

    // Create card with action elements (this works in non-streaming messages)
    const cardData = {
      schema: "2.0",
      header: {
        title: {
          content: "Suggestions",
          tag: "plain_text",
        },
      },
      body: {
        elements: [
          {
            tag: "action",
            actions: actions,
          },
        ],
      },
    };

    // Send as separate message (NOT streaming_mode)
    console.log(`🔘 [FollowupButtons] Sending card message...`);
    
    // Create card first
    const createResp = await feishuClient.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: conversationId,
        msg_type: "interactive",
        content: JSON.stringify({
          type: "card",
          data: JSON.stringify(cardData),
        }),
      },
    });

    const isSuccess = typeof createResp.success === 'function' 
      ? createResp.success() 
      : (createResp.code === 0 || createResp.code === undefined);
    const responseData = createResp.data || createResp;

    if (!isSuccess || !responseData?.message_id) {
      console.error(`❌ [FollowupButtons] Failed to create message:`, JSON.stringify(createResp, null, 2));
      return {
        success: false,
        error: `Failed to create message: ${createResp.msg || createResp.error}`,
        details: JSON.stringify(createResp),
      };
    }

    console.log(`✅ [FollowupButtons] Successfully sent buttons message: ${responseData.message_id}`);

    return {
      success: true,
      messageId: responseData.message_id,
      details: `Sent ${followups.length} button(s) in message ${responseData.message_id}`,
    };
  } catch (error) {
    console.error(`❌ [FollowupButtons] Failed to send buttons:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Alternative: Send buttons with category headers
 * 
 * If followups are categorized, group buttons by category
 */
export async function sendFollowupButtonsMessageWithCategories(
  conversationId: string,
  followups: FollowupOption[],
  rootId: string,
  threadId?: string
): Promise<SendButtonsResult> {
  try {
    if (!followups || followups.length === 0) {
      return {
        success: false,
        error: "No follow-ups provided",
      };
    }

    console.log(`🔘 [FollowupButtons] Sending categorized buttons...`);

    // Group by category
    const byCategory = followups.reduce((acc, followup) => {
      const category = followup.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push(followup);
      return acc;
    }, {} as Record<string, FollowupOption[]>);

    // Create elements for each category
    const elements: any[] = [];

    for (const [category, items] of Object.entries(byCategory)) {
      // Add category header as text
      elements.push({
        tag: "markdown",
        content: `**${category}**`,
      });

      // Add buttons for this category
      const actions = items.map((item, idx) => ({
        tag: "button",
        text: {
          content: item.text,
          tag: "plain_text",
        },
        type: idx === 0 ? "default" : "default",
        value: item.text,
      }));

      elements.push({
        tag: "action",
        actions: actions,
      });
    }

    const cardData = {
      schema: "2.0",
      header: {
        title: {
          content: "Suggestions",
          tag: "plain_text",
        },
      },
      body: {
        elements: elements,
      },
    };

    const response = await sendCardMessage(
      conversationId,
      JSON.stringify(cardData),
      rootId,
      threadId
    );

    if (!response?.message_id) {
      return {
        success: false,
        error: "No message_id in response",
      };
    }

    console.log(`✅ [FollowupButtons] Sent categorized buttons: ${response.message_id}`);
    return {
      success: true,
      messageId: response.message_id,
    };
  } catch (error) {
    console.error(`❌ [FollowupButtons] Failed to send categorized buttons:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const _testOnly = {
  sendFollowupButtonsMessage,
  sendFollowupButtonsMessageWithCategories,
};
