import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  searchDocumentsBySemantic,
  formatDocumentRagHits,
} from "../rag/document-rag";

/**
 * Semantic search result type
 */
interface SemanticSearchResult {
  success: boolean;
  hits?: any[];
  formatted?: string;
  mode?: string;
  error?: string;
}

/**
 * Semantic-ish search tool over tracked documents.
 * Future: swap implementation to true vector search without changing callers.
 */
export const documentSemanticSearchTool = createTool({
  id: "semantic_doc_search",
  description:
    "Search tracked documents semantically and return the best matches for the user.",
  inputSchema: z.object({
    query: z.string().min(2, "query too short").describe("Search query"),
    userId: z.string().default("unknown").describe("Feishu user id for RLS"),
    limit: z.number().int().min(1).max(10).optional().default(5).describe("Max results"),
  }),
  execute: async (inputData, context): Promise<SemanticSearchResult> => {
    // Support abort signal
    if (context?.abortSignal?.aborted) {
      return { success: false, error: "Search aborted" };
    }
    
    const { query, limit = 5 } = inputData;
    // Get userId from requestContext if available, fallback to input
    const userId = inputData.userId ?? context?.requestContext?.get("userId") as string ?? "unknown";
    
    try {
      const hits = await searchDocumentsBySemantic({ query, userId, limit });
      return {
        success: true,
        hits,
        formatted: formatDocumentRagHits(hits),
        mode: process.env.DOC_RAG_USE_VECTOR === "true" ? "vector" : "keyword-fallback",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
