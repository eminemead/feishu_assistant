# DPA Mom Tools RAG Evaluation

## Overview

Evaluating whether `feishu_chat_history` and `feishu_docs` tools should be migrated to Mastra RAG for semantic search capabilities.

---

## Current Architecture

### Current Tools (Direct API Access)

**1. Feishu Chat History Tool** (`feishu_chat_history`)
- **Pattern**: Direct API call to Feishu SDK
- **Access Method**: Requires `chatId` (must know specific chat)
- **Retrieval**: Fetches messages by time range, limit
- **Search**: No semantic search - only time-based filtering
- **Use Case**: "Get messages from chat X between time Y and Z"

**2. Feishu Docs Tool** (`feishu_docs`)
- **Pattern**: Direct API call to Feishu SDK
- **Access Method**: Requires `docToken` (must know specific document)
- **Retrieval**: Fetches document content or metadata
- **Search**: No semantic search - only direct document access
- **Use Case**: "Read document X" or "Get metadata for document Y"

### Current RAG Implementation (Document Tracking)

**File**: `lib/rag/document-rag.ts`

**Pattern**: Mastra RAG with PgVector
- **Indexing**: Documents are chunked, embedded, stored in vector DB
- **Access Method**: Semantic search by query (no need to know docToken)
- **Retrieval**: Vector similarity search returns relevant chunks
- **Search**: Semantic search over indexed content
- **Use Case**: "Find documents about topic X" (without knowing specific docs)

---

## Key Differences: Direct Tools vs RAG

| Aspect | Direct Tools (Current) | Mastra RAG |
|--------|------------------------|------------|
| **Access Pattern** | Requires specific ID (chatId/docToken) | Query-based (no ID needed) |
| **Search Type** | Time-based filtering / Direct fetch | Semantic similarity search |
| **Indexing** | None (on-demand fetch) | Pre-indexed (chunked + embedded) |
| **Use Case** | "Get chat X" or "Read doc Y" | "Find docs about topic X" |
| **Latency** | API call latency | Vector search latency (usually faster) |
| **Context** | Full document/chat | Relevant chunks only |
| **Maintenance** | No indexing overhead | Requires indexing pipeline |

---

## Evaluation: Do They Fit Mastra RAG?

### ✅ **Feishu Docs Tool → RAG: GOOD FIT**

**Reasons:**
1. **Documents are static** - Once indexed, content doesn't change frequently
2. **Semantic search is valuable** - Users often want "docs about X" not "doc Y"
3. **Already partially implemented** - `document-rag.ts` exists for tracked docs
4. **Chunking benefits** - Large docs can be searched at chunk level
5. **Metadata filtering** - Can filter by docType, owner, date via metadata

**Current Gap:**
- `feishu_docs` tool reads documents on-demand
- RAG implementation (`document-rag.ts`) only indexes **tracked** documents
- Need to index **all accessible documents** for dpa_mom, not just tracked ones

**Migration Path:**
```typescript
// Instead of direct doc access:
feishu_docs({ docToken: "doccn123", action: "read" })

// Use RAG semantic search:
feishu_docs_rag({ query: "project status update", limit: 5 })
// Returns: [{ docToken, title, snippet, score }, ...]
```

### ⚠️ **Feishu Chat History Tool → RAG: PARTIAL FIT**

**Reasons FOR RAG:**
1. **Semantic search valuable** - "Find discussions about topic X"
2. **Cross-chat search** - Search across multiple chats simultaneously
3. **Context retrieval** - Find relevant past conversations

**Reasons AGAINST RAG:**
1. **Chats are ephemeral** - New messages arrive constantly, requires frequent re-indexing
2. **Time-based queries common** - "What did we discuss yesterday?" (time > semantics)
3. **Real-time access needed** - Users want latest messages, not indexed history
4. **High indexing overhead** - Every new message needs embedding + storage

**Hybrid Approach:**
- **RAG for historical search**: Index older messages (e.g., > 7 days old)
- **Direct API for recent**: Use current tool for recent messages (< 7 days)
- **Combined tool**: Search RAG index + recent API results

---

## Evaluation Criteria

### 1. **Search Pattern Analysis**

**Question**: Do users search by:
- ✅ **Content/Topic** → RAG fits (semantic search)
- ❌ **Specific ID** → Direct tool fits (known resource)
- ⚠️ **Time range** → Hybrid approach (time filtering + RAG)

**For dpa_mom:**
- **Docs**: Mostly content-based ("find docs about X") → **RAG fits**
- **Chats**: Mix of time-based ("yesterday's discussion") and content-based → **Hybrid fits**

### 2. **Indexing Overhead**

**Question**: How often does content change?

| Content Type | Update Frequency | RAG Suitability |
|--------------|------------------|-----------------|
| Documents | Low (days/weeks) | ✅ High - Index once, search many |
| Chat Messages | High (minutes/hours) | ⚠️ Medium - Requires incremental indexing |

**Evaluation:**
- **Docs**: Low overhead → **Good for RAG**
- **Chats**: High overhead → **Consider hybrid or time-windowed indexing**

### 3. **Query Patterns**

**Current Tool Usage:**
```typescript
// Direct access (requires knowledge of resource)
feishu_docs({ docToken: "doccn123" })
feishu_chat_history({ chatId: "oc_abc123", startTime: "1703001600" })
```

**RAG Usage:**
```typescript
// Semantic search (no resource knowledge needed)
feishu_docs_rag({ query: "Q4 OKR review", limit: 5 })
feishu_chat_history_rag({ query: "discussion about project X", limit: 10 })
```

**Evaluation:**
- If users often know specific IDs → **Direct tools sufficient**
- If users search by topic → **RAG provides better UX**

### 4. **Performance & Cost**

**Direct Tools:**
- **Latency**: API call time (200-500ms typical)
- **Cost**: API calls only (no storage/embedding)
- **Scalability**: Linear with requests

**RAG:**
- **Latency**: Vector search (50-200ms typical) + embedding query (100-300ms)
- **Cost**: Embedding API calls + storage + indexing
- **Scalability**: Better for large document sets (sub-linear search)

**Evaluation:**
- **Small doc set** (< 100 docs) → **Direct tools may be faster**
- **Large doc set** (> 100 docs) → **RAG scales better**

### 5. **Context Quality**

**Direct Tools:**
- Returns full document/chat → **May include irrelevant content**
- Agent must filter → **More tokens, higher cost**

**RAG:**
- Returns relevant chunks → **Focused context**
- Pre-filtered → **Fewer tokens, lower cost**

**Evaluation:**
- **RAG provides better context quality** for LLM consumption

---

## Recommended Approach

### Phase 1: Migrate Feishu Docs to RAG ✅

**Action:**
1. Create `feishu_docs_rag` tool using Mastra RAG
2. Index all accessible Feishu documents (not just tracked)
3. Replace or supplement `feishu_docs` tool

**Implementation:**
```typescript
// New RAG-based tool
export function createFeishuDocsRagTool() {
  return tool({
    description: "Semantically search Feishu documents by content/topic",
    parameters: z.object({
      query: z.string().describe("Search query (e.g., 'Q4 OKR review')"),
      docType: z.enum(["doc", "sheet", "bitable"]).optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ query, docType, limit }) => {
      // Use Mastra RAG to search indexed documents
      const results = await searchFeishuDocsRag({ query, docType, limit });
      return { success: true, results };
    },
  });
}
```

**Benefits:**
- ✅ Semantic search without knowing docToken
- ✅ Better context quality (relevant chunks)
- ✅ Scales to large document sets

### Phase 2: Hybrid Chat History ⚠️

**Action:**
1. Keep `feishu_chat_history` for recent messages (< 7 days)
2. Add `feishu_chat_history_rag` for historical semantic search (> 7 days)
3. Combine results in agent logic

**Implementation:**
```typescript
// Hybrid approach
export function createFeishuChatHistoryHybridTool() {
  return tool({
    description: "Search chat history semantically (recent + historical)",
    parameters: z.object({
      query: z.string().describe("Search query"),
      chatId: z.string().optional().describe("Specific chat (optional)"),
      daysBack: z.number().default(7).describe("Days to search back"),
      limit: z.number().default(10),
    }),
    execute: async ({ query, chatId, daysBack, limit }) => {
      const cutoffDate = Date.now() - daysBack * 24 * 60 * 60 * 1000;
      
      // Recent: Direct API
      const recent = await getRecentChatHistory({ chatId, since: cutoffDate });
      
      // Historical: RAG search
      const historical = await searchChatHistoryRag({ query, before: cutoffDate });
      
      return { recent, historical, combined: [...recent, ...historical] };
    },
  });
}
```

**Benefits:**
- ✅ Real-time access to recent messages
- ✅ Semantic search over historical data
- ⚠️ More complex implementation

---

## Evaluation Checklist

Use this checklist to evaluate RAG fit for any tool:

- [ ] **Content is searchable by topic** (not just by ID)
- [ ] **Content changes infrequently** (low indexing overhead)
- [ ] **Users don't always know specific IDs** (semantic search needed)
- [ ] **Large content set** (benefits from vector search)
- [ ] **Context quality matters** (chunking improves relevance)
- [ ] **Cross-resource search valuable** (search across multiple items)

**Scoring:**
- **5-6 checks** → Strong RAG fit
- **3-4 checks** → Partial fit (consider hybrid)
- **0-2 checks** → Direct tools sufficient

**For Feishu Docs**: ✅ **5/6** (strong fit)
**For Chat History**: ⚠️ **3/6** (partial fit - hybrid recommended)

---

## Implementation Steps

### Step 1: Evaluate Current Usage

**Metrics to collect:**
1. How often do users search by topic vs. specific ID?
2. What's the average document/chat size?
3. How frequently do documents/chats update?
4. What's the query latency requirement?

**Action:**
```typescript
// Add logging to current tools
trackToolCall("feishu_docs", async (params) => {
  // Log: docToken provided vs query-based usage
  // Log: document size, access frequency
  return executeFeishuDocs(params);
});
```

### Step 2: Index Documents for RAG

**Action:**
1. Create indexing pipeline for Feishu documents
2. Use existing `document-rag.ts` as reference
3. Index all accessible documents (not just tracked)

**Code:**
```typescript
// Index all accessible Feishu documents
async function indexFeishuDocuments(userId: string) {
  const docs = await getAllAccessibleDocs(userId);
  const vectorStore = await ensureVectorStore();
  
  for (const doc of docs) {
    const content = await fetchDocContent(doc.docToken);
    const chunks = await chunkDocument(content);
    const embeddings = await embedChunks(chunks);
    
    await vectorStore.upsert({
      indexName: "feishu_docs",
      vectors: embeddings,
      metadata: chunks.map(chunk => ({
        docToken: doc.docToken,
        title: doc.title,
        docType: doc.docType,
        text: chunk.text,
      })),
    });
  }
}
```

### Step 3: Create RAG Tools

**Action:**
1. Create `createFeishuDocsRagTool()` using Mastra RAG
2. Test semantic search quality
3. Compare with direct tool performance

### Step 4: A/B Testing

**Action:**
1. Deploy both tools (direct + RAG)
2. Route queries based on pattern:
   - Known ID → Direct tool
   - Topic query → RAG tool
3. Measure user satisfaction, latency, cost

### Step 5: Migration Decision

**Decision Criteria:**
- ✅ RAG provides better search results
- ✅ Latency acceptable (< 500ms)
- ✅ Cost acceptable (embedding + storage)
- ✅ Users prefer semantic search

**If all criteria met** → Migrate to RAG
**If partial** → Keep hybrid approach
**If not met** → Keep direct tools

---

## Conclusion

### Feishu Docs Tool → RAG: **RECOMMENDED** ✅

**Rationale:**
- Documents are static, semantic search valuable
- Already have RAG infrastructure
- Better context quality for LLM
- Scales to large document sets

### Feishu Chat History Tool → RAG: **HYBRID RECOMMENDED** ⚠️

**Rationale:**
- Recent messages need real-time access (direct API)
- Historical messages benefit from semantic search (RAG)
- High indexing overhead for real-time chats
- Hybrid approach balances both needs

### Next Steps

1. **Implement Feishu Docs RAG tool** (high priority)
2. **Evaluate chat history usage patterns** (collect metrics)
3. **Design hybrid chat history tool** (if metrics support it)
4. **A/B test RAG vs direct tools** (measure quality/cost)

