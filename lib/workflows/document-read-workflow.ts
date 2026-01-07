/**
 * Document Read Workflow (Mastra)
 *
 * Orchestrates end-to-end document reading with persistence:
 * 1) Fetch document content via user OAuth (or app token fallback)
 * 2) Persist metadata and snapshot to Supabase
 * 3) Optionally embed for RAG semantic search
 *
 * This provides a structured, observable way to read and store
 * Feishu documents, following the document-tracking-workflow pattern.
 *
 * @see document-tracking-workflow.ts for similar pattern
 */

import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { readDocWithUserAuth, DocReadResult } from "../tools/feishu-docs-user-tool";
import { storeDocumentSnapshot, storeDocumentMetadata } from "../doc-supabase";
import { createHash } from "crypto";

/**
 * Detect doc type from URL
 */
function detectDocType(url: string): string {
  if (url.includes("/sheets/")) return "sheet";
  if (url.includes("/bitable/")) return "bitable";
  if (url.includes("/docx/")) return "docx";
  if (url.includes("/wiki/")) return "wiki";
  return "doc";
}

/**
 * Extract doc token from URL
 */
function extractDocToken(url: string): string {
  const match = url.match(/\/(?:docs|docx|wiki|sheets|bitable)\/([a-zA-Z0-9_-]+)/i);
  return match?.[1] || url;
}

/**
 * Hash content for deduplication
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// ============================================================================
// Step 1: Fetch Document
// ============================================================================

const fetchDocumentStep = createStep({
  id: "fetch-document",
  description: "Fetch Feishu document content via user OAuth or app token",
  inputSchema: z.object({
    docUrl: z.string().min(1, "docUrl is required"),
    userId: z.string().min(1, "userId is required"),
    chatId: z.string().optional(),
    persistToSupabase: z.boolean().default(true),
    embedForRag: z.boolean().default(false),
  }),
  outputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    persistToSupabase: z.boolean(),
    embedForRag: z.boolean(),
    fetchResult: z.custom<DocReadResult>(),
  }),
  execute: async ({ inputData }) => {
    const { docUrl, userId, chatId, persistToSupabase, embedForRag } = inputData;

    console.log(`[DocReadWorkflow] Fetching doc: ${docUrl} for user: ${userId}`);

    const docToken = extractDocToken(docUrl);
    const docType = detectDocType(docUrl);

    const fetchResult = await readDocWithUserAuth(docUrl, userId);

    console.log(
      `[DocReadWorkflow] Fetch ${fetchResult.success ? "succeeded" : "failed"}: ${
        fetchResult.title || fetchResult.error
      }`
    );

    return {
      docUrl,
      docToken,
      docType,
      userId,
      chatId,
      persistToSupabase,
      embedForRag,
      fetchResult,
    };
  },
});

// ============================================================================
// Step 2: Persist to Supabase
// ============================================================================

const persistDocumentStep = createStep({
  id: "persist-document",
  description: "Store document metadata and content snapshot to Supabase",
  inputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    persistToSupabase: z.boolean(),
    embedForRag: z.boolean(),
    fetchResult: z.custom<DocReadResult>(),
  }),
  outputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    embedForRag: z.boolean(),
    fetchResult: z.custom<DocReadResult>(),
    persisted: z.boolean(),
    persistError: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    const {
      docUrl,
      docToken,
      docType,
      userId,
      chatId,
      persistToSupabase,
      embedForRag,
      fetchResult,
    } = inputData;

    // Skip persistence if disabled or fetch failed
    if (!persistToSupabase || !fetchResult.success) {
      return {
        docUrl,
        docToken,
        docType,
        userId,
        chatId,
        embedForRag,
        fetchResult,
        persisted: false,
        persistError: !persistToSupabase
          ? "Persistence disabled"
          : fetchResult.error,
      };
    }

    console.log(`[DocReadWorkflow] Persisting doc: ${docToken}`);

    try {
      const now = new Date().toISOString();

      // Store metadata
      const metadataStored = await storeDocumentMetadata({
        doc_token: docToken,
        title: fetchResult.title || "Untitled",
        doc_type: docType,
        owner_id: userId, // Reader as owner for now
        created_at: now,
        last_modified_user: userId,
        last_modified_at: now,
      });

      // Store content snapshot
      const content = fetchResult.content || "";
      const snapshotStored = await storeDocumentSnapshot({
        doc_token: docToken,
        doc_type: docType,
        content,
        content_hash: hashContent(content),
        fetched_at: now,
        is_latest: true,
      });

      const persisted = metadataStored || snapshotStored;

      console.log(
        `[DocReadWorkflow] Persist ${persisted ? "succeeded" : "failed"}: metadata=${metadataStored}, snapshot=${snapshotStored}`
      );

      return {
        docUrl,
        docToken,
        docType,
        userId,
        chatId,
        embedForRag,
        fetchResult,
        persisted,
        persistError: persisted ? undefined : "Failed to store in Supabase",
      };
    } catch (error: any) {
      console.error(`[DocReadWorkflow] Persist error:`, error.message);
      return {
        docUrl,
        docToken,
        docType,
        userId,
        chatId,
        embedForRag,
        fetchResult,
        persisted: false,
        persistError: error.message,
      };
    }
  },
});

// ============================================================================
// Step 3: Embed for RAG (Optional)
// ============================================================================

const embedDocumentStep = createStep({
  id: "embed-document",
  description: "Add document to RAG vector store for semantic search",
  inputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    embedForRag: z.boolean(),
    fetchResult: z.custom<DocReadResult>(),
    persisted: z.boolean(),
    persistError: z.string().optional(),
  }),
  outputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    title: z.string(),
    content: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
    needsAuth: z.boolean().optional(),
    authUrl: z.string().optional(),
    persisted: z.boolean(),
    embedded: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const {
      docUrl,
      docToken,
      docType,
      userId,
      chatId,
      embedForRag,
      fetchResult,
      persisted,
    } = inputData;

    const baseResult = {
      docUrl,
      docToken,
      docType,
      title: fetchResult.title || "Untitled",
      content: fetchResult.content || "",
      userId,
      chatId,
      success: fetchResult.success,
      error: fetchResult.error,
      needsAuth: fetchResult.needsAuth,
      authUrl: fetchResult.authUrl,
      persisted,
      embedded: false,
    };

    // Skip embedding if disabled or fetch failed
    if (!embedForRag || !fetchResult.success) {
      return baseResult;
    }

    console.log(`[DocReadWorkflow] Embedding doc: ${docToken} for RAG`);

    try {
      // Get shared vector store and embedder from memory factory
      const { getSharedVector } = await import("../memory-factory");
      const { getInternalEmbedding } = await import("../shared/internal-embedding");
      const { openai } = await import("@ai-sdk/openai");
      const { embed } = await import("ai");
      
      const vectorStore = getSharedVector();
      if (!vectorStore) {
        console.warn("[DocReadWorkflow] Vector store not available, skipping embedding");
        return baseResult;
      }

      // Get embedder - prefer internal NIO embedding, fallback to OpenAI
      const embedder = getInternalEmbedding() || openai.embedding("text-embedding-3-small");
      
      // Compute embedding for document content
      const content = fetchResult.content || "";
      const { embedding } = await embed({
        model: embedder,
        value: content.slice(0, 8000), // Limit to avoid token limits
      });

      // Upsert to vector store
      const indexName = "document_embeddings";
      await vectorStore.upsert({
        indexName,
        vectors: [embedding],
        metadata: [{
          content: content.slice(0, 2000), // Store truncated content in metadata
          title: fetchResult.title,
          docType,
          userId,
          docUrl,
          docToken,
          embeddedAt: new Date().toISOString(),
        }],
        ids: [docToken],
      });

      console.log(`[DocReadWorkflow] Embedded doc: ${docToken} (${embedding.length} dims)`);

      return {
        ...baseResult,
        embedded: true,
      };
    } catch (error: any) {
      // Embedding is optional - don't fail the workflow
      console.warn(`[DocReadWorkflow] Embedding failed (non-fatal):`, error.message);
      return baseResult;
    }
  },
});

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Document Read Workflow
 *
 * Fetches, persists, and optionally embeds Feishu documents.
 *
 * Input:
 * - docUrl: Feishu document URL
 * - userId: User's open_id for OAuth
 * - chatId: Optional chat context
 * - persistToSupabase: Whether to store in Supabase (default: true)
 * - embedForRag: Whether to add to RAG vector store (default: false)
 *
 * Output:
 * - Document content and metadata
 * - Persistence and embedding status
 */
export const documentReadWorkflow = createWorkflow({
  id: "document-read",
  description: "Fetch Feishu doc → persist to Supabase → embed for RAG",
  inputSchema: z.object({
    docUrl: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    persistToSupabase: z.boolean().default(true),
    embedForRag: z.boolean().default(false),
  }),
  outputSchema: z.object({
    docUrl: z.string(),
    docToken: z.string(),
    docType: z.string(),
    title: z.string(),
    content: z.string(),
    userId: z.string(),
    chatId: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
    needsAuth: z.boolean().optional(),
    authUrl: z.string().optional(),
    persisted: z.boolean(),
    embedded: z.boolean(),
  }),
})
  .then(fetchDocumentStep)
  .then(persistDocumentStep)
  .then(embedDocumentStep)
  .commit();

// ============================================================================
// Convenience Helper
// ============================================================================

export interface DocumentReadResult {
  docUrl: string;
  docToken: string;
  docType: string;
  title: string;
  content: string;
  userId: string;
  chatId?: string;
  success: boolean;
  error?: string;
  needsAuth?: boolean;
  authUrl?: string;
  persisted: boolean;
  embedded: boolean;
}

/**
 * Run the document read workflow imperatively.
 *
 * Can be invoked from:
 * - DPA assistant workflow (doc_read intent)
 * - Agents with document tools
 * - HTTP handlers
 * - Button callbacks
 *
 * @example
 * const result = await runDocumentReadWorkflow({
 *   docUrl: "https://xxx.feishu.cn/docx/abc123",
 *   userId: "ou_xxxx",
 *   persistToSupabase: true,
 *   embedForRag: true,
 * });
 */
export async function runDocumentReadWorkflow(params: {
  docUrl: string;
  userId: string;
  chatId?: string;
  persistToSupabase?: boolean;
  embedForRag?: boolean;
}): Promise<DocumentReadResult> {
  const run = await documentReadWorkflow.createRun();
  const result = await run.start({
    inputData: {
      docUrl: params.docUrl,
      userId: params.userId,
      chatId: params.chatId,
      persistToSupabase: params.persistToSupabase ?? true,
      embedForRag: params.embedForRag ?? false,
    },
  });

  // Extract result from workflow output
  const output = result as any;
  
  if (output.status === "success" && output.result) {
    return output.result as DocumentReadResult;
  }

  // Handle workflow failure
  return {
    docUrl: params.docUrl,
    docToken: extractDocToken(params.docUrl),
    docType: detectDocType(params.docUrl),
    title: "Unknown",
    content: "",
    userId: params.userId,
    chatId: params.chatId,
    success: false,
    error: output.error?.message || "Workflow execution failed",
    persisted: false,
    embedded: false,
  };
}
