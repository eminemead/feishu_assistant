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

import { client as feishuClient, sendCardMessage } from "./feishu-utils";
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

    // Create card with button components (NOT action elements)
    // Feishu Card JSON 2.0 no longer supports "action" tag
    // Instead, use "button" components directly in elements array
    // See: https://open.feishu.cn/document/feishu-cards/card-json-v2-components/interactive-components/button
    
    // Encode context in action_id so we can extract it from the callback
    // Format: chatId|rootId|followup (encode context needed for response generation)
    const contextPrefix = `${conversationId}|${rootId}`;
    
    const buttonElements = followups.map((followup, index) => {
      const isFirst = index === 0;
      // Include context in action_id so callback handler can extract it
      const actionId = `${contextPrefix}|${index}`;
      return {
        tag: "button",
        text: {
          content: followup.text,
          tag: "plain_text",
        },
        type: isFirst ? "primary" : "default",
        behaviors: [
          {
            type: "callback",
            action_id: actionId,  // Context encoded in action_id
            value: followup.text, // What gets sent when user clicks
          },
        ],
      };
    });

    // Create card with button components (JSON 2.0 style)
    const cardData = {
      schema: "2.0",  // Standard v2 - now with button components instead of action elements
      header: {
        title: {
          content: "Suggestions",
          tag: "plain_text",
        },
      },
      body: {
        elements: buttonElements,  // Buttons directly in elements array
      },
    };

    // TRY APPROACH 1: Create card via CardKit first, then send via message
    console.log(`🔘 [FollowupButtons] Creating card via CardKit...`);
    
    let cardEntityId: string | undefined;
    try {
      const cardCreateResp = await feishuClient.cardkit.v1.card.create({
        data: {
          type: "card_json",
          data: JSON.stringify(cardData),
        },
      });
      
      const isCardSuccess = typeof cardCreateResp.success === 'function' 
        ? cardCreateResp.success() 
        : (cardCreateResp.code === 0 || cardCreateResp.code === undefined);
      
      if (isCardSuccess && cardCreateResp.data?.card_id) {
        cardEntityId = cardCreateResp.data.card_id;
        console.log(`🔘 [FollowupButtons] Card created: ${cardEntityId}`);
      } else {
        console.warn(`⚠️ [FollowupButtons] CardKit creation failed:`, cardCreateResp);
      }
    } catch (error) {
      console.warn(`⚠️ [FollowupButtons] CardKit creation error:`, error);
    }
    
    // If CardKit succeeded, send via message reference
    // Use im.message.reply to send as thread reply (not standalone chat message)
    let createResp: any;
    const messageContent = JSON.stringify({
      type: "card",
      data: cardEntityId ? { card_id: cardEntityId } : JSON.stringify(cardData),
    });

    if (rootId) {
      // Send as reply in thread
      console.log(`🔘 [FollowupButtons] Sending as thread reply to rootId=${rootId}...`);
      
      if (cardEntityId) {
        createResp = await feishuClient.im.message.reply({
          path: {
            message_id: rootId,
          },
          data: {
            msg_type: "interactive",
            content: JSON.stringify({
              type: "card",
              data: {
                card_id: cardEntityId,
              },
            }),
            reply_in_thread: true,
          },
        });
      } else {
        // Fallback: Try inline card data
        console.log(`🔘 [FollowupButtons] CardKit failed, trying inline card...`);
        createResp = await feishuClient.im.message.reply({
          path: {
            message_id: rootId,
          },
          data: {
            msg_type: "interactive",
            content: JSON.stringify({
              type: "card",
              data: JSON.stringify(cardData),
            }),
            reply_in_thread: true,
          },
        });
      }
    } else {
      // Fallback: Send to chat if no rootId
      console.log(`⚠️ [FollowupButtons] No rootId, sending to chat instead of thread...`);
      
      if (cardEntityId) {
        createResp = await feishuClient.im.message.create({
          params: {
            receive_id_type: "chat_id",
          },
          data: {
            receive_id: conversationId,
            msg_type: "interactive",
            content: JSON.stringify({
              type: "card",
              data: {
                card_id: cardEntityId,
              },
            }),
          },
        });
      } else {
        createResp = await feishuClient.im.message.create({
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
      }
    }
    
    console.log(`🔘 [FollowupButtons] API response:`, JSON.stringify(createResp, null, 2).substring(0, 500) + "...");

    const isSuccess = typeof createResp.success === 'function' 
      ? createResp.success() 
      : (createResp.code === 0 || createResp.code === undefined);
    const responseData = createResp.data || createResp;

    console.log(`🔘 [FollowupButtons] isSuccess=${isSuccess}, code=${createResp.code}, has message_id=${!!responseData?.message_id}`);

    if (!isSuccess || !responseData?.message_id) {
      console.error(`❌ [FollowupButtons] Failed to create message`);
      console.error(`   Code: ${createResp.code}`);
      console.error(`   Msg: ${createResp.msg}`);
      console.error(`   Error: ${createResp.error}`);
      console.error(`   Full response:`, JSON.stringify(createResp, null, 2));
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
