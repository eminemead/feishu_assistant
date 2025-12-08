import { tool } from "ai";
import { z } from "zod";
import {
  searchDocumentsBySemantic,
  formatDocumentRagHits,
} from "../rag/document-rag";

/**
 * Semantic-ish search tool over tracked documents.
 * Future: swap implementation to true vector search without changing callers.
 */
export const documentSemanticSearchTool = tool({
  description:
    "Search tracked documents semantically and return the best matches for the user.",
  parameters: z.object({
    query: z.string().min(2, "query too short"),
    userId: z.string().default("unknown").describe("Feishu user id for RLS"),
    limit: z.number().int().min(1).max(10).optional().default(5),
  }),
  execute: async ({ query, userId, limit = 5 }) => {
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
