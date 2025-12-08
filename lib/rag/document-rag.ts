/**
 * Document RAG scaffolding
 *
 * Lightweight semantic-ish search over tracked documents. This is a placeholder
 * until a full vector store is wired (e.g., PgVector + @mastra/rag). We score
 * by simple keyword overlap so the tool is safe to call today and can be
 * swapped for true embeddings later without changing callers.
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
 * Very small scoring function using keyword overlap.
 * Future: replace with embedding similarity.
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

export async function searchDocumentsBySemantic(params: {
  query: string;
  userId: string;
  limit?: number;
}): Promise<DocumentRagHit[]> {
  const { query, userId, limit = 5 } = params;
  if (!query.trim()) return [];

  // Scope persistence to user for RLS safety
  setPersistenceUserId(userId);
  const persistence = getPersistence();
  const tracked = await persistence.getTrackedDocs(true);

  const hits: DocumentRagHit[] = [];

  for (const doc of tracked) {
    const meta =
      (await getDocMetadata(doc.docToken, doc.docType)) || undefined;
    const title = meta?.title || doc.title || doc.docToken;
    const bag =
      `${title} ${doc.notes ?? ""} ${meta?.ownerId ?? ""} ${meta?.docType ?? ""}`;
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
