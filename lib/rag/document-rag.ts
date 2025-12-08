/**
 * Document RAG scaffolding
 *
 * Provides semantic search over tracked documents using Supabase PostgreSQL
 * with pgvector extension for vector similarity search.
 *
 * Architecture:
 * - Uses Supabase's PostgreSQL database (via SUPABASE_DATABASE_URL)
 * - pgvector extension enabled via migration (005_enable_pgvector_and_document_embeddings.sql)
 * - Vector embeddings stored in document_embeddings table with RLS
 * - Falls back to keyword search if vector store unavailable
 *
 * Configuration:
 * - DOC_RAG_USE_VECTOR=true: Enable vector search (requires pgvector migration)
 * - DOC_RAG_VECTOR_TABLE: Table name (default: "document_embeddings")
 * - DOC_RAG_EMBEDDER: Embedding model (default: "openai/text-embedding-3-small")
 * - SUPABASE_DATABASE_URL: PostgreSQL connection string from Supabase
 *
 * This file is structured so we can swap the vector implementation later
 * without changing callers.
 */

import { getDocMetadata } from "../doc-tracker";
import { getPersistence, setPersistenceUserId } from "../doc-persistence";

export interface DocumentRagHit {
  docToken: string;
  title: string;
  docType: string;
  score: number;
  snippet: string;
  lastModifiedBy?: string;
  lastModifiedTime?: number;
}

/**
 * Very small scoring function using keyword overlap (fallback).
 */
function basicScore(query: string, text: string): number {
  const qTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const t = text.toLowerCase();
  if (qTokens.length === 0) return 0;
  let hits = 0;
  for (const token of qTokens) {
    if (t.includes(token)) hits += 1;
  }
  return hits / qTokens.length;
}

const VECTOR_ENABLED = process.env.DOC_RAG_USE_VECTOR === "true";
const VECTOR_TABLE = process.env.DOC_RAG_VECTOR_TABLE || "document_embeddings";
const VECTOR_EMBEDDER = process.env.DOC_RAG_EMBEDDER || "openai/text-embedding-3-small";
const SUPABASE_DATABASE_URL = process.env.SUPABASE_DATABASE_URL;

type VectorStore = {
  upsert?: (docs: Array<{ id: string; content: string; metadata?: any }>) => Promise<void>;
  search?: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<{ id: string; score: number; metadata?: any }>>;
};

let vectorStore: VectorStore | null = null;

async function ensureVectorStore(): Promise<VectorStore | null> {
  if (!VECTOR_ENABLED) return null;
  if (!SUPABASE_DATABASE_URL) {
    console.warn("[DocRAG] SUPABASE_DATABASE_URL not set; skipping vector store.");
    console.warn("[DocRAG] Set SUPABASE_DATABASE_URL to use Supabase PostgreSQL for vector search.");
    return null;
  }
  if (vectorStore) return vectorStore;

  try {
    // Lazy import to avoid build-time dependency if env not set.
    // Uses Supabase's PostgreSQL connection (SUPABASE_DATABASE_URL)
    // Requires pgvector extension enabled via migration 005_enable_pgvector_and_document_embeddings.sql
    const modPg = await import("@mastra/pg").catch(() => null);
    const modRag = await import("@mastra/rag").catch(() => null);

    if (!modPg || !("PgVector" in modPg) || !modRag) {
      console.warn("[DocRAG] PgVector or @mastra/rag unavailable; falling back to keyword search.");
      console.warn("[DocRAG] Ensure @mastra/pg and @mastra/rag are installed and pgvector migration is run.");
      return null;
    }

    const PgVector: any = (modPg as any).PgVector;
    // Connect to Supabase PostgreSQL using the same connection string as memory-mastra.ts
    // This uses Supabase's PostgreSQL database with pgvector extension
    vectorStore = new PgVector({
      connectionString: SUPABASE_DATABASE_URL, // Supabase PostgreSQL connection
      tableName: VECTOR_TABLE, // document_embeddings table (created by migration)
    });
    console.log(`✅ [DocRAG] Vector store initialized using Supabase PostgreSQL (table: ${VECTOR_TABLE})`);
    return vectorStore;
  } catch (error) {
    console.warn("[DocRAG] Failed to init vector store, fallback will be used:", error);
    console.warn("[DocRAG] Verify: 1) pgvector migration applied, 2) SUPABASE_DATABASE_URL correct, 3) table exists");
    return null;
  }
}

async function keywordSearch(
  query: string,
  userId: string,
  limit: number
): Promise<DocumentRagHit[]> {
  // Scope persistence to user for RLS safety
  setPersistenceUserId(userId);
  const persistence = getPersistence();
  const tracked = await persistence.getTrackedDocs(true);

  const hits: DocumentRagHit[] = [];

  for (const doc of tracked) {
    const meta = (await getDocMetadata(doc.docToken, doc.docType)) || undefined;
    const title = meta?.title || doc.title || doc.docToken;
    const bag = `${title} ${doc.notes ?? ""} ${meta?.ownerId ?? ""} ${meta?.docType ?? ""}`;
    const score = basicScore(query, bag);
    if (score <= 0) continue;

    hits.push({
      docToken: doc.docToken,
      title,
      docType: doc.docType,
      score,
      snippet: `Owner: ${meta?.ownerId ?? "unknown"}; Last modified by: ${
        meta?.lastModifiedUser ?? "unknown"
      }`,
      lastModifiedBy: meta?.lastModifiedUser,
      lastModifiedTime: meta?.lastModifiedTime,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

async function vectorSearch(
  query: string,
  userId: string,
  limit: number
): Promise<DocumentRagHit[] | null> {
  const store = await ensureVectorStore();
  if (!store || !store.search) return null;

  // Scope persistence to user for RLS safety
  setPersistenceUserId(userId);
  const persistence = getPersistence();
  const tracked = await persistence.getTrackedDocs(true);

  // Attempt to import rag helpers for embedding and querying.
  const modRag: any = await import("@mastra/rag").catch(() => null);
  if (!modRag) return null;

  const createVectorQueryTool = modRag.createVectorQueryTool as any;
  if (!createVectorQueryTool) return null;

  // Ensure documents are present; for now we just upsert minimal content
  if (store.upsert) {
    const docs = await Promise.all(
      tracked.map(async (doc) => {
        const meta = (await getDocMetadata(doc.docToken, doc.docType)) || undefined;
        const title = meta?.title || doc.title || doc.docToken;
        const content = `${title}\n${doc.notes ?? ""}\nOwner: ${meta?.ownerId ?? ""}\nType: ${
          meta?.docType ?? ""
        }`;
        return {
          id: doc.docToken,
          content,
          metadata: {
            title,
            docType: doc.docType,
            ownerId: meta?.ownerId,
            lastModifiedUser: meta?.lastModifiedUser,
            lastModifiedTime: meta?.lastModifiedTime,
          },
        };
      })
    );

    await store.upsert(docs);
  }

  // Build a vector query tool on the fly.
  const vectorTool = createVectorQueryTool({
    vectorStore: store,
    embedder: VECTOR_EMBEDDER,
  });

  if (!vectorTool?.execute) return null;

  const result: any = await vectorTool.execute({ query, limit });
  const results = result?.matches || result?.results || [];

  if (!results || results.length === 0) return [];

  return results.map((r: any, idx: number) => ({
    docToken: r.id || r.docToken || `doc-${idx + 1}`,
    title: r.metadata?.title || r.id || `Doc ${idx + 1}`,
    docType: r.metadata?.docType || "doc",
    score: r.score ?? r.similarity ?? 0.0,
    snippet:
      r.metadata?.snippet ||
      r.metadata?.contentSnippet ||
      `Rank ${idx + 1}`,
    lastModifiedBy: r.metadata?.lastModifiedUser,
    lastModifiedTime: r.metadata?.lastModifiedTime,
  }));
}

export async function searchDocumentsBySemantic(params: {
  query: string;
  userId: string;
  limit?: number;
}): Promise<DocumentRagHit[]> {
  const { query, userId, limit = 5 } = params;
  if (!query.trim()) return [];

  // Try vector search first if enabled, otherwise fallback to keyword search
  const vectorHits = await vectorSearch(query, userId, limit);
  if (vectorHits && vectorHits.length > 0) {
    return vectorHits;
  }

  return keywordSearch(query, userId, limit);
}

/**
 * Convenience helper to describe hits for card rendering or agent responses.
 */
export function formatDocumentRagHits(hits: DocumentRagHit[]): string {
  if (!hits.length) return "No tracked documents matched.";
  return hits
    .map(
      (h, idx) =>
        `${idx + 1}. ${h.title} (${h.docType}) — token ${h.docToken}\n   Score: ${h.score.toFixed(
          2
        )}; ${h.snippet}`
    )
    .join("\n");
}
