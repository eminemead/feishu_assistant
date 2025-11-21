/**
 * Generate button suggestions in parallel with response streaming
 * 
 * This enables real interactive buttons on Feishu cards by generating suggestions
 * BEFORE streaming starts, so buttons can be included in initial card creation.
 */

import { generateFollowupQuestions, FollowupOption } from "./tools/generate-followups-tool";

export interface ButtonSuggestion {
  id: string;
  text: string;
  value: string;
  type?: "default" | "primary" | "danger";
}

/**
 * Generate button suggestions (to be included in card at creation time)
 * This runs in parallel with response generation
 * 
 * @param context Message or context to generate suggestions from
 * @param maxButtons Maximum number of buttons to generate (default: 3)
 * @returns Array of button suggestions or empty array on failure
 */
export async function generateButtonSuggestions(
  context: string,
  maxButtons: number = 3
): Promise<ButtonSuggestion[]> {
  try {
    console.log(`🔘 [Buttons] Generating ${maxButtons} button suggestions from context...`);
    
    // Use existing followup question generator
    const followups = await generateFollowupQuestions(context, undefined, maxButtons);
    
    if (!followups || followups.length === 0) {
      console.log(`⚠️ [Buttons] No followups generated`);
      return [];
    }

    // Convert followups to button format
    const buttons: ButtonSuggestion[] = followups.map((followup, idx) => ({
      id: `btn_followup_${idx + 1}`,
      text: followup.text,
      value: followup.text, // Use text as value for button click
      type: idx === 0 ? "primary" : "default", // First button is primary
    }));

    console.log(`✅ [Buttons] Generated ${buttons.length} button suggestions`);
    return buttons;
  } catch (error) {
    console.error("❌ [Buttons] Failed to generate button suggestions:", error);
    return []; // Graceful degradation - continue without buttons
  }
}

/**
 * Generate buttons in parallel with response
 * Useful when you want buttons ready ASAP
 * 
 * @param contextPromise Promise that resolves to context string
 * @param maxButtons Maximum number of buttons
 * @returns Promise that resolves to button suggestions
 */
export async function generateButtonsParallel(
  contextPromise: Promise<string>,
  maxButtons: number = 3
): Promise<ButtonSuggestion[]> {
  try {
    const context = await contextPromise;
    return generateButtonSuggestions(context, maxButtons);
  } catch (error) {
    console.error("❌ [Buttons] Parallel generation failed:", error);
    return [];
  }
}
