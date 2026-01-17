/**
 * Internal Model API Configuration (NIO Model Gateway)
 * 
 * Custom adapter for NIO's model gateway API:
 * https://modelgateway.nioint.com/publicService
 * 
 * Used as fallback when OpenRouter rate limits or fails.
 */

import { LanguageModel, generateText, streamText, CoreMessage } from "ai";

interface InternalApiRequest {
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  max_tokens: number;
  temperature: number;
  top_p: number;
  n: number;
  chat_template_kwargs?: { enable_thinking: boolean };
  stop?: string[];
}

interface InternalApiResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Check if internal model is configured
 */
export function hasInternalModel(): boolean {
  return (
    !!process.env.INTERNAL_MODEL_API_ENDPOINT &&
    !!process.env.INTERNAL_MODEL_NAME &&
    !!process.env.INTERNAL_MODEL_API_KEY
  );
}

/**
 * Get internal model instance
 * Returns null if not configured
 */
export function getInternalModel(): LanguageModel | null {
  if (!hasInternalModel()) {
    return null;
  }

  const endpoint = process.env.INTERNAL_MODEL_API_ENDPOINT!;
  const modelName = process.env.INTERNAL_MODEL_NAME!;
  const apiKey = process.env.INTERNAL_MODEL_API_KEY!;

  console.log(`🏠 [InternalModel] Initializing internal model: ${modelName}`);
  console.log(`🏠 [InternalModel] Endpoint: ${endpoint}`);

  /**
   * Call internal model API
   */
  async function callInternalAPI(request: InternalApiRequest): Promise<InternalApiResponse> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Internal model API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as InternalApiResponse;
  }

  /**
   * Create a language model wrapper for Vercel AI SDK
   */
  return {
    modelId: modelName,

    async doGenerate(params: any) {
      const messages = params.messages as CoreMessage[];
      
      const extractText = (content: any): string => {
        if (typeof content === "string") return content;
        if (!Array.isArray(content)) return "";
        for (const part of content as any[]) {
          if (
            part &&
            typeof part === "object" &&
            part.type === "text" &&
            typeof part.text === "string"
          ) {
            return part.text;
          }
        }
        return "";
      };

      // Convert CoreMessage format to internal API format
      const internalMessages = messages.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: extractText(msg.content),
      }));

      const request: InternalApiRequest = {
        model: modelName,
        messages: internalMessages,
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature || 0.7,
        top_p: params.topP || 0.9,
        n: 1,
        chat_template_kwargs: { enable_thinking: false },
        stop: params.stop,
      };

      const response = await callInternalAPI(request);
      const choice = response.choices[0];

      return {
        text: choice.message.content,
        finishReason: choice.finish_reason === "stop" ? "stop" : "length",
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
        },
      };
    },

    async doStream(params: any) {
      const messages = params.messages as CoreMessage[];
      
      const extractText = (content: any): string => {
        if (typeof content === "string") return content;
        if (!Array.isArray(content)) return "";
        for (const part of content as any[]) {
          if (
            part &&
            typeof part === "object" &&
            part.type === "text" &&
            typeof part.text === "string"
          ) {
            return part.text;
          }
        }
        return "";
      };

      // Convert CoreMessage format to internal API format
      const internalMessages = messages.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: extractText(msg.content),
      }));

      const request: InternalApiRequest = {
        model: modelName,
        messages: internalMessages,
        max_tokens: params.maxTokens || 2048,
        temperature: params.temperature || 0.7,
        top_p: params.topP || 0.9,
        n: 1,
        chat_template_kwargs: { enable_thinking: false },
        stop: params.stop,
      };

      const response = await callInternalAPI(request);
      const choice = response.choices[0];

      // Return as async iterable for streaming
      return {
        stream: async function* () {
          // Yield the complete response as a single chunk (internal API doesn't support streaming)
          yield {
            type: "text-delta" as const,
            text: choice.message.content,
          };
        },
        rawCall: { rawPrompt: "", rawSettings: {} },
      };
    },
  } as unknown as LanguageModel;
}

/**
 * Get internal model for logging/debugging
 */
export function getInternalModelInfo(): string {
  if (!hasInternalModel()) {
    return "Not configured";
  }
  return `${process.env.INTERNAL_MODEL_NAME} (${process.env.INTERNAL_MODEL_API_ENDPOINT})`;
}
