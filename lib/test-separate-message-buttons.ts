/**
 * Test Implementation: Hypothesis 1 - Separate Message for Buttons
 * 
 * Theory: NIO Chat streams response in one card, then sends buttons in a
 * completely separate message. This bypasses Feishu's streaming + action element restriction.
 * 
 * Testing approach:
 * 1. Create streaming card (response content)
 * 2. Stream response
 * 3. Finalize card (disable streaming)
 * 4. Send SEPARATE message with button elements
 * 5. Monitor server logs to confirm both messages are sent
 */

import { client as feishuClient, sendCardMessage } from "./feishu-utils";
import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";

/**
 * Send follow-up buttons as a SEPARATE message (not in the streaming card)
 * 
 * This tests Hypothesis 1: buttons work fine in regular (non-streaming) messages,
 * so sending them separately should work.
 */
export async function sendButtonsAsSeperateMessage(
  conversationId: string,
  cardId: string, // For reference/logging only
  followups: FollowupOption[],
  rootId: string,
  threadId?: string // If replying in thread
): Promise<{
  success: boolean;
  separateCardId?: string;
  error?: string;
}> {
  try {
    console.log(`🔘 [SeparateButtonsMessage] Sending ${followups.length} buttons as separate message...`);

    // Create action elements from followups
    const actions = followups.map((f, idx) => ({
      tag: "button",
      text: {
        content: f.text,
        tag: "plain_text",
      },
      type: idx === 0 ? "primary" : "default" as const,
      value: f.text, // User clicks button → sends this text as input
    }));

    // Wrap buttons in action element
    const cardData = {
      schema: "2.0",
      header: {
        title: {
          content: "Follow-up suggestions",
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

    // Send as separate message (NOT streaming)
    const resp = await (sendCardMessage as any)(
      conversationId,
      JSON.stringify(cardData),
      rootId,
      threadId
    );

    console.log(`✅ [SeparateButtonsMessage] Sent buttons as separate card: ${(resp as any).message_id}`);
    return {
      success: true,
      separateCardId: (resp as any).message_id,
    };
  } catch (error) {
    console.error(`❌ [SeparateButtonsMessage] Failed to send buttons:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Full test: Create streaming card, stream content, then send buttons separately
 * 
 * This is a complete test of Hypothesis 1
 */
export async function testStreamingCardWithSeparateButtons(
  conversationId: string,
  responseText: string,
  context: string,
  rootId: string,
  threadId?: string
): Promise<{
  success: boolean;
  mainCardId?: string;
  buttonCardId?: string;
  error?: string;
}> {
  try {
    console.log(`🧪 [TestSeparateButtons] Starting test...`);
    
    // Step 1: Create streaming card with just the response
    console.log(`🧪 [TestSeparateButtons] Step 1: Creating streaming card...`);
    const { createStreamingCard } = await import("./feishu-utils");
    const { cardId } = await createStreamingCard({
      title: "Assistant Response",
      initialContent: responseText,
    });

    console.log(`🧪 [TestSeparateButtons] Step 2: Streaming would happen here (simulating...)...`);
    // In real flow, we'd stream response content to cardId
    // For this test, we just have static content

    // Step 3: Generate follow-ups
    console.log(`🧪 [TestSeparateButtons] Step 3: Generating follow-up questions...`);
    const followups = await generateFollowupQuestions(responseText, context, 3);
    
    if (!followups || followups.length === 0) {
      console.log(`⚠️ [TestSeparateButtons] No follow-ups generated`);
      return { success: true, mainCardId: cardId };
    }

    // Step 4: Send buttons as separate message
    console.log(`🧪 [TestSeparateButtons] Step 4: Sending buttons as separate message...`);
    const buttonResult = await sendButtonsAsSeperateMessage(
      conversationId,
      cardId,
      followups,
      rootId,
      threadId
    );

    if (!buttonResult.success) {
      console.error(`❌ [TestSeparateButtons] Button message failed:`, buttonResult.error);
      return {
        success: false,
        mainCardId: cardId,
        error: buttonResult.error,
      };
    }

    console.log(`✅ [TestSeparateButtons] Test complete!`);
    console.log(`   Main card: ${cardId}`);
    console.log(`   Buttons card: ${buttonResult.separateCardId}`);

    return {
      success: true,
      mainCardId: cardId,
      buttonCardId: buttonResult.separateCardId,
    };
  } catch (error) {
    console.error(`❌ [TestSeparateButtons] Test failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const _testOnly = {
  sendButtonsAsSeperateMessage,
  testStreamingCardWithSeparateButtons,
};
