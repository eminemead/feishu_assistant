/**
 * Internal Embedding Model Configuration (NIO Model Gateway)
 * 
 * Custom adapter for NIO's embedding API:
 * https://modelgateway.nioint.com/publicService
 * 
 * Replaces OpenAI embeddings with internal model to reduce costs.
 */

import { EmbeddingModel } from "ai";

interface InternalEmbeddingRequest {
  model: string;
  input: string;
  truncate_prompt_tokens: number;
}

interface InternalEmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Check if internal embedding model is configured
 */
export function hasInternalEmbedding(): boolean {
  return (
    !!process.env.INTERNAL_MODEL_API_ENDPOINT &&
    !!process.env.INTERNAL_MODEL_API_KEY
  );
}

/**
 * Get internal embedding model instance
 * Returns null if not configured
 */
export function getInternalEmbedding(): EmbeddingModel | null {
  if (!hasInternalEmbedding()) {
    return null;
  }

  const endpoint = process.env.INTERNAL_MODEL_API_ENDPOINT!;
  const apiKey = process.env.INTERNAL_MODEL_API_KEY!;
  const modelName = "Text-Embedding-V1";

  console.log(`🏠 [InternalEmbedding] Initializing internal embedding: ${modelName}`);
  console.log(`🏠 [InternalEmbedding] Endpoint: ${endpoint}`);

  /**
   * Call internal embedding API
   */
  async function callInternalEmbeddingAPI(request: InternalEmbeddingRequest): Promise<InternalEmbeddingResponse> {
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
        `Internal embedding API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data as InternalEmbeddingResponse;
  }

  /**
   * Create an embedding model wrapper for Vercel AI SDK
   */
  return {
    modelId: modelName,

    async doEmbed(params: any) {
      const values = params.values as string[];
      
      // Process each value individually (API doesn't support batch)
      const embeddings: number[][] = [];
      
      for (const text of values) {
        const request: InternalEmbeddingRequest = {
          model: modelName,
          input: text,
          truncate_prompt_tokens: 512,
        };

        const response = await callInternalEmbeddingAPI(request);
        
        if (response.data && response.data.length > 0) {
          embeddings.push(response.data[0].embedding);
        } else {
          throw new Error(`No embedding returned for text: ${text}`);
        }
      }

      return {
        embeddings,
        usage: {
          promptTokens: 0, // API doesn't return token count for embeddings
        },
      };
    },
  } as unknown as EmbeddingModel;
}

/**
 * Get internal embedding model for logging/debugging
 */
export function getInternalEmbeddingInfo(): string {
  if (!hasInternalEmbedding()) {
    return "Not configured";
  }
  return `Text-Embedding-V1 (${process.env.INTERNAL_MODEL_API_ENDPOINT})`;
}
