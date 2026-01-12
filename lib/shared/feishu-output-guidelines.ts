export type FeishuOutputGuidelinesOptions = {
  /**
   * Human language name to enforce in the response.
   * Examples: "Mandarin Chinese (中文)", "English"
   */
  language?: string;
};

/**
 * Canonical output guidelines for ANY user-facing content rendered in Feishu cards.
 *
 * IMPORTANT:
 * - Use this for user-facing LLM generations (summaries, explanations, etc).
 * - Do NOT use this for strict-format parser prompts (e.g. classifier or "respond in exact format").
 */
export function feishuCardOutputGuidelines(
  opts: FeishuOutputGuidelinesOptions = {}
): string {
  const language = opts.language ?? "Mandarin Chinese (中文)";

  // Keep this block in sync with our Feishu card output guidelines.
  // NOTE: Keep it minimal and verbatim-ish; workflows should not invent their own format.
  return [
    `Respond in ${language}`,
    `Use Markdown formatted for Feishu/Lark cards (clear headings + bullets)`,
    `Be concise but complete; prefer short sections and bullet points`,
    `Avoid boilerplate preambles; start directly with the answer`,
  ].join("\n");
}

