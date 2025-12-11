import { tool, generateText, generateObject } from "ai";
import { z } from "zod";
import { getAutoRouterModel } from "../shared/model-fallback";

/**
 * Generates 2-3 follow-up questions or recommendations based on agent response
 * These will be rendered as interactive buttons on Feishu cards for user selection
 */
export const generateFollowupsTool = tool({
  description:
    "Generate follow-up questions or recommendations based on the agent response for user interaction via card buttons",
  parameters: z.object({
    response: z.string().describe("The agent's response text"),
    context: z
      .string()
      .optional()
      .describe("Additional context about the conversation topic"),
    maxOptions: z
      .number()
      .int()
      .min(2)
      .max(5)
      .default(3)
      .describe("Maximum number of follow-up options to generate (default 3)"),
  }),
  execute: async ({ response, context, maxOptions }) => {
    try {
      console.log(
        `🔄 [Followups] Generating ${maxOptions} follow-up questions for response: "${response.substring(0, 50)}..."`
      );

      const model = getAutoRouterModel();

      // Generate follow-up questions using the model
      const result = await generateObject({
        model,
        schema: z.object({
          followups: z.array(
            z.object({
              text: z
                .string()
                .max(60)
                .describe("Short follow-up question or recommendation (max 60 chars for button text)"),
              type: z
                .enum(["question", "recommendation", "action"])
                .describe("Type of follow-up"),
              rationale: z
                .string()
                .optional()
                .describe("Why this follow-up is relevant"),
            })
          ),
        }),
        prompt: `Based on this agent response, generate ${maxOptions} thoughtful follow-up questions or recommendations that users might want to explore next.

Agent Response: "${response}"
${context ? `\nContext: ${context}` : ""}

Each follow-up should be:
1. Concise (max 60 characters - must fit on a button)
2. Actionable and relevant to the response
3. Encourage deeper exploration or next steps

Return exactly ${maxOptions} follow-ups as JSON array.`,
      });

      // Limit to maxOptions
      const followups = result.followups.slice(0, maxOptions);

      console.log(`✅ [Followups] Generated ${followups.length} follow-up options`);
      return {
        followups,
        count: followups.length,
      };
    } catch (error) {
      console.error("❌ [Followups] Error generating follow-ups:", error);
      // Return default follow-ups on error
      return {
        followups: [
          {
            text: "Tell me more",
            type: "question",
          },
          {
            text: "How do I apply this?",
            type: "question",
          },
          {
            text: "What's next?",
            type: "action",
          },
        ],
        count: 3,
        error: true,
      };
    }
  },
});

/**
 * Type for follow-up option
 */
export interface FollowupOption {
  text: string;
  type: "question" | "recommendation" | "action";
  rationale?: string;
  id?: string;
  emoji?: string;
  category?: string;
}

/**
 * Generate follow-ups without using the tool system
 * Useful for direct use in response handling
 */
export async function generateFollowupQuestions(
  response: string,
  context?: string,
  maxOptions: number = 3
): Promise<FollowupOption[]> {
  try {
    console.log(
      `🔄 [Followups] Generating ${maxOptions} follow-up questions for response: "${response.substring(0, 50)}..."`
    );

    const model = getAutoRouterModel();
    if (!model) {
      console.error(`❌ [Followups] No model available`);
      throw new Error("Model not available");
    }

    // Create a timeout promise for safety (30 seconds max)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("generateText timeout after 30 seconds")), 30000);
    });

    // Use generateText with JSON parsing instead of generateObject
    const resultPromise = generateText({
      model,
      prompt: `Based on this agent response, generate exactly ${maxOptions} thoughtful follow-up questions or recommendations that users might want to explore next.

Agent Response: "${response}"
${context ? `\nContext: ${context}` : ""}

Each follow-up should be:
1. Concise (max 60 characters)
2. Actionable and relevant to the response
3. Encourage deeper exploration or next steps

Return ONLY a JSON array with this exact structure. No markdown, no code blocks, just raw JSON:
[
  {"text": "question text", "type": "question"},
  {"text": "recommendation text", "type": "recommendation"},
  {"text": "action text", "type": "action"}
]

Types must be: "question", "recommendation", or "action"`,
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);

    // Extract text from result - handle multiple response formats
    if (!result) {
      console.error(`❌ [Followups] generateText returned null/undefined`);
      throw new Error("generateText returned no result");
    }

    const text = typeof result === 'string' ? result : (result?.text || '');
    
    if (!text || text.length === 0) {
      console.error(`❌ [Followups] generateText returned empty result`);
      throw new Error("generateText returned empty text");
    }
    
    // Parse the JSON response
    console.log(`🔄 [Followups] LLM raw response (first 300 chars): "${text.substring(0, 300)}..."`);
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`❌ [Followups] Could not find JSON array in response. Looking for pattern starting with '[' and ending with ']'`);
      throw new Error("Could not extract JSON from response");
    }

    console.log(`🔄 [Followups] Extracted JSON (first 200 chars): "${jsonMatch[0].substring(0, 200)}..."`);
    
    let followups;
    try {
      followups = JSON.parse(jsonMatch[0]).slice(0, maxOptions);
    } catch (parseError) {
      console.error(`❌ [Followups] JSON parse failed:`, parseError);
      console.error(`   JSON text: "${jsonMatch[0].substring(0, 300)}..."`);
      throw parseError;
    }
    
    // Validate and add metadata
    const emojiMap: Record<string, string> = {
      question: '❓',
      recommendation: '💡',
      action: '⚡',
    };
    
    const categoryMap: Record<string, string> = {
      question: 'clarification',
      recommendation: 'suggestion',
      action: 'next-step',
    };
    
    const followupsWithMetadata = followups.map((f: any) => {
      const type = f.type || 'question';
      return {
        text: String(f.text).slice(0, 60), // Ensure max 60 chars
        type: type as "question" | "recommendation" | "action",
        emoji: emojiMap[type] || '📝',
        category: categoryMap[type] || 'other',
        id: `followup_${Math.random().toString(36).substr(2, 9)}`,
      };
    });
    
    console.log(`✅ [Followups] Generated ${followupsWithMetadata.length} follow-up options with metadata`);
    return followupsWithMetadata;
  } catch (error) {
    console.error("❌ [Followups] Error generating follow-ups:", error);
    // Return default follow-ups on error - with all required metadata
    return [
      {
        text: "Tell me more",
        type: "question",
        emoji: '❓',
        category: 'clarification',
        id: 'default_1',
      },
      {
        text: "How do I apply this?",
        type: "recommendation",
        emoji: '💡',
        category: 'suggestion',
        id: 'default_2',
      },
      {
        text: "What's next?",
        type: "action",
        emoji: '⚡',
        category: 'next-step',
        id: 'default_3',
      },
    ];
  }
}
