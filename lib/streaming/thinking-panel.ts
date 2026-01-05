/**
 * Thinking Panel - Collapsible UI for model reasoning traces
 * 
 * Provides utilities for separating reasoning from response text
 * and rendering reasoning in a collapsible Feishu card panel.
 */

/**
 * Result of streaming with separated reasoning and text
 */
export interface StreamingResult {
  text: string;
  reasoning: string;
  hasReasoning: boolean;
}

/**
 * Build a collapsible panel element for thinking/reasoning content
 * Uses Feishu Card JSON v2 collapsible_panel component
 * 
 * @param reasoning - The reasoning/thinking text to display
 * @param elementId - Unique element ID for the panel
 * @returns Card element JSON for collapsible panel
 */
export function buildThinkingPanelElement(
  reasoning: string,
  elementId: string = `thinking_${Date.now()}`
): object {
  return {
    tag: "collapsible_panel",
    expanded: false,
    element_id: elementId,
    header: {
      title: {
        tag: "plain_text",
        content: "🧠 Show thinking process",
      },
      vertical_align: "center",
      icon: {
        tag: "standard_icon",
        token: "down-small-ccm_outlined",
        color: "grey",
        size: "16px 16px",
      },
      icon_position: "right",
      icon_expanded_angle: -180,
    },
    border: {
      color: "grey",
      corner_radius: "5px",
    },
    background_color: "bg_body_overlay",
    vertical_spacing: "8px",
    padding: "8px 8px 8px 8px",
    elements: [
      {
        tag: "markdown",
        content: formatReasoningContent(reasoning),
      },
    ],
  };
}

/**
 * Format reasoning content for display
 * Cleans up and formats the reasoning text
 */
function formatReasoningContent(reasoning: string): string {
  if (!reasoning || reasoning.trim().length === 0) {
    return "*No thinking trace available*";
  }
  
  // Limit length to prevent card overflow
  const maxLength = 2000;
  let formatted = reasoning.trim();
  
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength) + "\n\n*... (truncated)*";
  }
  
  // Escape any problematic characters for Feishu markdown
  formatted = formatted
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  return formatted;
}

/**
 * Strip thinking tags from text if present (fallback for models that embed thinking)
 * Handles <think>...</think> and similar patterns
 */
export function stripThinkingTags(text: string): { text: string; reasoning: string } {
  // Match <think>...</think> pattern (case insensitive, multiline)
  const thinkPattern = /<think>([\s\S]*?)<\/think>/gi;
  const matches = text.match(thinkPattern);
  
  if (!matches || matches.length === 0) {
    return { text, reasoning: "" };
  }
  
  // Extract all thinking content
  let reasoning = "";
  for (const match of matches) {
    const content = match.replace(/<\/?think>/gi, "").trim();
    if (content) {
      reasoning += (reasoning ? "\n\n" : "") + content;
    }
  }
  
  // Remove thinking tags from text
  const cleanedText = text.replace(thinkPattern, "").trim();
  
  return { text: cleanedText, reasoning };
}

/**
 * Create inline thinking indicator for streaming display
 * Shows a subtle indicator while thinking is in progress
 */
export function createThinkingIndicator(isThinking: boolean): string {
  if (isThinking) {
    return "> 🧠 *Thinking...*\n\n";
  }
  return "";
}
