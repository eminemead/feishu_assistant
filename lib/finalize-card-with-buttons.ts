/**
 * Card finalization with confirmation buttons
 * 
 * Handles:
 * 1. Confirmation buttons (Confirm/Cancel) for workflows needing user approval
 * 2. Finalizing streaming cards (disable streaming mode)
 * 
 * NOTE: LLM-generated follow-up suggestions removed - they were generic and unhelpful.
 */

import { getNextCardSequence, client as feishuClient, updateCardElement } from "./feishu-utils";
import { FollowupOption } from "./tools/generate-followups-tool";
import { sendFollowupButtonsMessage } from "./send-follow-up-buttons-message";

/**
 * Send confirmation buttons (Confirm/Cancel) for actions that need user confirmation
 * Used for destructive or important operations like issue creation
 */
async function sendConfirmationButtons(
  conversationId: string,
  confirmationData: string,
  rootId: string,
  threadId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log(`🔘 [Confirmation] Sending confirmation buttons...`);
    
    // Use the same button format as follow-up buttons
    // The confirmation callback handler will recognize the __gitlab_confirm__ prefix
    const confirmationButtons: FollowupOption[] = [
      { text: "✅ 确认创建 / Confirm", value: `__gitlab_confirm__:${confirmationData}` },
      { text: "❌ 取消 / Cancel", value: "__gitlab_cancel__" },
    ];
    
    // Use the existing sendFollowupButtonsMessage function
    return await sendFollowupButtonsMessage(
      conversationId,
      confirmationButtons,
      rootId,
      threadId
    );
  } catch (error: any) {
    console.error(`❌ [Confirmation] Error sending buttons:`, error);
    return { success: false, error: error.message };
  }
}

export interface FinalizeCardConfig {
  /**
   * Feishu conversation ID (required for sending button message)
   * e.g., "oc_xxxxx" or "c_xxxxx"
   */
  conversationId?: string;
  
  /**
   * Root message ID (used as context for button message)
   * e.g., messageId for threading context
   */
  rootId?: string;
  
  /**
   * Thread ID if replying in thread
   */
  threadId?: string;
  
  /**
   * Whether to send buttons in separate message (Hypothesis 1)
   * Default: true
   */
  sendButtonsAsSeperateMessage?: boolean;
  
  /**
   * If set, send confirmation buttons (Confirm/Cancel) instead of follow-ups
   * The value is JSON-encoded data to be passed to the confirmation callback
   */
  confirmationData?: string;
}

/**
 * Finalize card and optionally show confirmation buttons
 * 
 * @param cardId Feishu card ID
 * @param elementId Markdown element ID for main content
 * @param finalContent Final response text to display
 * @param _context Unused (kept for API compatibility)
 * @param _maxFollowups Unused (kept for API compatibility)
 * @param config Configuration for confirmation buttons
 * @returns Object with buttonMessageId if confirmation sent
 */
export async function finalizeCardWithFollowups(
  cardId: string,
  elementId: string,
  finalContent?: string,
  _context?: string,
  _maxFollowups?: number,
  config?: FinalizeCardConfig
): Promise<{
  followups?: FollowupOption[];
  buttonMessageId?: string;
  error?: string;
}> {
  try {
    console.log(`🎯 [CardFinalize] Finalizing card: cardId=${cardId}, contentLength=${finalContent?.length || 0}`);

    // Handle confirmation flow (e.g., GitLab issue creation needs Confirm/Cancel)
    if (config?.confirmationData && config?.conversationId && config?.rootId) {
      console.log(`🔘 [CardFinalize] Sending confirmation buttons...`);
      
      // Update card content with final preview BEFORE disabling streaming
      if (finalContent && elementId) {
        await updateCardElement(cardId, elementId, finalContent);
      }
      
      // Disable streaming mode
      await finalizeCardSettings(cardId, finalContent, feishuClient);
      
      // Send confirmation buttons
      const confirmationResult = await sendConfirmationButtons(
        config.conversationId,
        config.confirmationData,
        config.rootId,
        config.threadId
      );
      
      if (confirmationResult.success) {
        console.log(`✅ [CardFinalize] Confirmation buttons sent: ${confirmationResult.messageId}`);
      } else {
        console.log(`⚠️ [CardFinalize] Failed to send confirmation buttons: ${confirmationResult.error}`);
      }
      
      return { buttonMessageId: confirmationResult.messageId };
    }

    // No confirmation needed - just finalize the card
    if (finalContent && elementId) {
      await updateCardElement(cardId, elementId, finalContent);
    }
    
    await finalizeCardSettings(cardId, finalContent, feishuClient);
    console.log(`✅ [CardFinalize] Card finalized`);
    
    return { followups: [] };
  } catch (error) {
    console.error("❌ [CardFinalize] Error finalizing card:", error);
    
    // Gracefully degrade: still disable streaming even if something failed
    try {
      await finalizeCardSettings(cardId, finalContent, feishuClient);
    } catch (finalizeError) {
      console.error("❌ [CardFinalize] Also failed to finalize settings:", finalizeError);
    }

    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Finalize card settings (disable streaming mode)
 */
async function finalizeCardSettings(
  cardId: string,
  finalContent?: string,
  client?: any
): Promise<void> {
  if (!client) client = feishuClient;
  
  // Use shared sequence counter so this call comes after all streaming updates
  const sequence = getNextCardSequence(cardId);

  const settingsData: any = {
    config: {
      streaming_mode: false,
    },
  };

  if (finalContent) {
    settingsData.summary = {
      content: finalContent.slice(0, 100), // Summary preview
    };
  }

  try {
    const resp = await client.cardkit.v1.card.settings({
      path: {
        card_id: cardId,
      },
      data: {
        settings: JSON.stringify(settingsData),
        sequence: sequence,
      },
    });

    const isSuccess =
      resp.code === 0
        ? resp.code === 0 || resp.code === undefined
        : resp.code === 0 || resp.code === undefined;

    if (!isSuccess) {
      console.warn("Failed to finalize card settings:", resp);
    }
  } catch (error) {
    console.warn("Failed to finalize card settings (non-critical):", error);
  }
}



/**
 * Export for testing
 */
export const _testOnly = {
  finalizeCardSettings,
};
