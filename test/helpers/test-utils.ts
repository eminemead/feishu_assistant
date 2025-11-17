/**
 * Test utilities and helpers
 */

import { CoreMessage } from "ai";

/**
 * Create a test message array
 * Ensures content is always a string (not null/undefined)
 */
export function createTestMessages(content: string, role: "user" | "assistant" = "user"): CoreMessage[] {
  // Ensure content is a valid string
  const safeContent = content || "test message";
  
  return [
    {
      role,
      content: safeContent,
    } as CoreMessage,
  ];
}

/**
 * Wait for async operations to complete
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a string contains any of the given keywords (case-insensitive)
 */
export function containsKeywords(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase();
  return keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Extract agent name from response or logs
 */
export function extractAgentName(text: string): string | null {
  const match = text.match(/(?:routing to|handoff|agent)[:\s]+(\w+)/i);
  return match ? match[1] : null;
}

