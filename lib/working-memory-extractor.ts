/**
 * Working Memory Extractor
 * 
 * Extracts key facts from agent responses for working memory storage.
 * This enables the bot to remember user preferences, team size, goals, etc.
 */

import type { MemoryContext } from "./memory-middleware";

/**
 * Patterns for extracting facts from responses
 */
const EXTRACTION_PATTERNS = [
  // Team size patterns
  { pattern: /team.*?(\d+)\s*(?:people|members|人)/i, key: "teamSize" },
  { pattern: /(\d+)\s*(?:people|members|人).*?team/i, key: "teamSize" },
  
  // Goal patterns
  { pattern: /(?:my|our)\s*goal\s*(?:is|:)\s*(.+?)(?:\.|$)/i, key: "goal" },
  { pattern: /目标(?:是|:)\s*(.+?)(?:\。|$)/i, key: "goal" },
  
  // Preference patterns
  { pattern: /(?:I|we)\s*prefer\s*(.+?)(?:\.|$)/i, key: "preference" },
  
  // Name patterns
  { pattern: /(?:my name is|I'm|I am)\s+(\w+)/i, key: "userName" },
];

/**
 * Extract facts from text
 */
export function extractFacts(text: string): Record<string, string> {
  const facts: Record<string, string> = {};
  
  for (const { pattern, key } of EXTRACTION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      facts[key] = match[1].trim();
    }
  }
  
  return facts;
}

/**
 * Extract facts from response and save to working memory
 * 
 * @param response - Agent response text to extract facts from
 * @param memoryContext - Memory context for saving
 * @returns Extracted facts (if any)
 */
export async function extractAndSaveWorkingMemory(
  response: string,
  memoryContext: MemoryContext | null
): Promise<Record<string, string> | null> {
  if (!memoryContext) {
    return null;
  }

  const facts = extractFacts(response);
  
  if (Object.keys(facts).length === 0) {
    return null;
  }

  console.log("[WorkingMemory] Extracted facts:", facts);
  
  // TODO: Save to working memory when Mastra Memory working memory API is integrated
  // For now, just return the extracted facts
  
  return facts;
}

/**
 * Check if text contains extractable facts
 */
export function hasFacts(text: string): boolean {
  return EXTRACTION_PATTERNS.some(({ pattern }) => pattern.test(text));
}

