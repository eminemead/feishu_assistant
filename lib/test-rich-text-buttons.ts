/**
 * Test Implementation: Hypothesis 2 - Rich Text Links Instead of Action Elements
 * 
 * Theory: NIO Chat embeds interactive elements in the markdown/rich text of the
 * streaming card, using markdown links or rich text elements that bypass the
 * "action element" restriction.
 * 
 * Feishu might allow:
 * - Markdown links: [Click me](action://something)
 * - Rich text with embedded actions
 * - Custom elements that aren't tagged as "action"
 * 
 * Testing approach:
 * 1. Create streaming card with markdown links embedded in response
 * 2. Stream response with interactive links
 * 3. Finalize card
 * 4. Observe if links render as clickable buttons
 */

import { updateCardElement } from "./feishu-utils";

/**
 * Format follow-ups as markdown links that might work in streaming cards
 * 
 * Theory: Markdown links might not trigger the 99992402 validation
 * because they're not "action" elements, just formatted text.
 */
export function formatFollowupsAsMarkdownLinks(
  followups: Array<{ text: string; category?: string }>
): string {
  const links = followups
    .map((f, idx) => `[${idx + 1}. ${f.text}](action://followup?text=${encodeURIComponent(f.text)})`)
    .join("\n");

  return `\n\n**Next steps:**\n${links}`;
}

/**
 * Test adding rich text links to streaming card
 * 
 * This tests Hypothesis 2: Maybe Feishu allows interactive elements
 * if they're embedded in markdown/rich text, not in action elements.
 */
export async function testRichTextButtonsInStreamingCard(
  cardId: string,
  elementId: string,
  responseContent: string,
  followups: Array<{ text: string; category?: string }>
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  try {
    console.log(`🔗 [RichTextButtons] Testing markdown links in streaming card...`);

    // Add markdown links to the response content
    const linksMarkdown = formatFollowupsAsMarkdownLinks(followups);
    const contentWithLinks = responseContent + linksMarkdown;

    // Try updating the streaming card with markdown links
    // Theory: If Feishu allows markdown links in streaming cards,
    // this should work without triggering 99992402
    console.log(`🔗 [RichTextButtons] Updating card with markdown links...`);
    
    await updateCardElement(cardId, elementId, contentWithLinks);

    console.log(`✅ [RichTextButtons] SUCCESS: Markdown links added to streaming card`);
    return {
      success: true,
      method: "markdown-links",
    };
  } catch (error) {
    console.error(`❌ [RichTextButtons] Failed:`, error);
    return {
      success: false,
      method: "markdown-links",
      error,
    };
  }
}

/**
 * Alternative: Test rich text elements with action callbacks
 * 
 * Some APIs support:
 * { tag: "rich_text", content: [...], elements: [ { type: "link", action: {...} } ] }
 */
export async function testRichTextWithEmbeddedActions(
  cardId: string
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  try {
    console.log(`🔗 [RichTextButtons] Testing rich text with embedded actions...`);

    // This is theoretical - need to check Feishu CardKit documentation
    // for the correct schema

    const richTextElement = {
      tag: "rich_text",
      content: [
        {
          type: "text",
          text: "Click here for follow-ups: ",
        },
        {
          type: "link",
          text: "Option 1",
          link: {
            url: "action://followup?text=Option%201",
          },
        },
      ],
    };

    console.log(`🔗 [RichTextButtons] Rich text element structure:`, richTextElement);
    console.log(`⚠️ [RichTextButtons] This is theoretical - needs CardKit docs verification`);

    return {
      success: false,
      method: "rich-text-with-actions",
      error: "Not implemented - needs CardKit documentation verification",
    };
  } catch (error) {
    console.error(`❌ [RichTextButtons] Failed:`, error);
    return {
      success: false,
      method: "rich-text-with-actions",
      error,
    };
  }
}

/**
 * Theory: Maybe interactive_text elements work in streaming
 */
export async function testInteractiveTextInStreamingCard(
  cardId: string,
  elementId: string,
  responseContent: string
): Promise<{
  success: boolean;
  method: string;
  error?: any;
}> {
  try {
    console.log(`🔗 [InteractiveText] Testing interactive_text elements...`);

    // Try adding interactive text (if it exists in Feishu API)
    // This is exploratory - schema might not exist

    const interactiveText = `${responseContent}

[Interactive Option 1](#action-1) | [Option 2](#action-2) | [Option 3](#action-3)`;

    await updateCardElement(cardId, elementId, interactiveText);

    console.log(`✅ [InteractiveText] SUCCESS: Interactive text elements added`);
    return {
      success: true,
      method: "interactive-text",
    };
  } catch (error) {
    console.error(`❌ [InteractiveText] Failed:`, error);
    return {
      success: false,
      method: "interactive-text",
      error,
    };
  }
}

export const _testOnly = {
  formatFollowupsAsMarkdownLinks,
  testRichTextButtonsInStreamingCard,
  testRichTextWithEmbeddedActions,
  testInteractiveTextInStreamingCard,
};
