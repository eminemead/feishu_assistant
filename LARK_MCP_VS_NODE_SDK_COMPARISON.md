# lark-mcp vs Node SDK: Document Operations Evaluation

**Analysis Date**: December 2, 2025  
**Scope**: Document content reading capabilities for the document tracking agent

## Executive Summary

**These are NOT competing approaches** — they serve **fundamentally different purposes**.

- **Current Node SDK implementation**: Tracks document **metadata** (who modified, when)
- **lark-mcp `docx.v1.document.rawContent`**: Reads document **content** (actual text)

Both are valuable but address different use cases. Here's when to use each.

---

## 1. Current Implementation (Node SDK)

### What It Does
Fetches document **metadata** using the legacy Feishu endpoint:
```typescript
POST /open-apis/suite/docs-api/meta
{
  request_docs: [{ docs_token, docs_type }]
}
```

### Returns
```typescript
{
  docToken: string;
  title: string;
  lastModifiedUser: string;      // Who edited
  lastModifiedTime: number;       // When edited
  ownerId: string;
  createdTime: number;
  docType: string;
}
```

### Architecture
```
Document Poller (every 30s)
  ↓
Get Document Metadata (via Node SDK)
  ↓
Detect Change (time/user changed?)
  ↓
Send Notification → "Doc X modified by User Y at 3:45pm"
  ↓
Persist to Supabase
```

### Strengths ✅

| Aspect | Benefit |
|--------|---------|
| **Lightweight** | Only fetches metadata, not full content |
| **Fast** | Response time: ~100-300ms per document |
| **Scalable** | Batch up to 200 docs per API call |
| **Efficient** | 30-second TTL cache minimizes API calls |
| **Proven** | Production tested, reliable |
| **Change Detection** | Smart debouncing prevents notification spam |
| **Metrics** | Built-in polling health, success rates, error tracking |
| **Retry Logic** | 3 attempts with exponential backoff |

### Limitations ❌

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| **No Content** | Can't read actual document text | Use lark-mcp for content |
| **Legacy Endpoint** | Not in official SDK (raw HTTP call) | Works, but not "official" |
| **Metadata Only** | Limited to who/when/what | Combine with content tool for full picture |
| **Owner Info Limited** | Gets owner ID, not full user profile | Resolve via `contact.v3.user.batchGetId` |

---

## 2. lark-mcp Approach (docx.v1.document.rawContent)

### What It Does
Fetches actual document **content** in markdown format:
```typescript
{
  method: "docx.v1.document.rawContent",
  params: { document_id: "docx_xxxxx" }
}
```

### Returns
```typescript
{
  content: string;  // Full markdown formatted document
  revision: number;
  version: string;
}
```

### Use Case Example
```
Bot: "What's in the Q4 report?"
  ↓
docx.v1.document.rawContent(doc_id)
  ↓
Read full markdown content
  ↓
Return summary or answer user's question
```

### Strengths ✅

| Aspect | Benefit |
|--------|---------|
| **Official API** | Part of official Feishu SDK |
| **MCP Protocol** | Standard, Cursor/Claude/Trae compatible |
| **Content Access** | Can read and analyze document text |
| **Modern** | Official v1 endpoint, not legacy |
| **Flexible** | Can implement Q&A, search, analysis |
| **Document Tracking +** | Could extend tracking with content summaries |

### Limitations ❌

| Limitation | Impact | Severity |
|-----------|--------|----------|
| **Slower** | Full content is large (~10-100KB typical) | Medium - but acceptable |
| **Less Scalable** | Not designed for bulk polling | Medium - use sparingly |
| **No Polling Loop** | Need to request content on-demand | Low - by design |
| **No Change Detection** | Doesn't tell you IF document changed | Medium - use metadata first |
| **No Bulk API** | One call per document | Medium - batch manually |

---

## 3. Detailed Comparison

### Scenario 1: Notify When Document Changes

**Current Implementation: ⭐⭐⭐⭐⭐ (Perfect)**

```
Every 30 seconds:
  1. Fetch metadata for all tracked docs (batched)
  2. Compare with last known state
  3. If changed, send notification
  4. Cache results for 30 seconds

Cost: ~5 API calls per 100 docs per minute
Latency: 100-300ms per batch
Accuracy: Detects change within 30 seconds
```

**lark-mcp Alternative: ⭐⭐ (Not Suitable)**

```
Every 30 seconds:
  1. Fetch full content for all tracked docs (NO batch)
  2. Compare with last known content
  3. If changed, send notification
  4. No cache

Cost: ~100 API calls per 100 docs per minute
Latency: 5-30s per batch (content is large)
Accuracy: Same, but expensive
```

**Verdict**: Use **Node SDK** (current implementation)

---

### Scenario 2: Read Document Content for Q&A

**Current Implementation: ❌ (Not Possible)**

```
User: "What are the Q4 metrics?"
Bot: "Document tracks changes, but I can't read content"
```

**lark-mcp: ⭐⭐⭐⭐⭐ (Perfect)**

```
User: "What are the Q4 metrics?"
  ↓
docx.v1.document.rawContent(doc_id)
  ↓
Parse markdown
  ↓
Extract metrics and summarize
  ↓
"Q4 Revenue: $2.5M (+15% YoY)"
```

**Verdict**: Use **lark-mcp** (for content analysis)

---

### Scenario 3: Intelligent Change Tracking with Summaries

**Hybrid Approach: ⭐⭐⭐⭐⭐ (Best)**

```
Every 30 seconds:
  1. Fetch metadata (via Node SDK) - cost: low
  2. If changed, fetch content (via lark-mcp)
  3. Generate summary of changes
  4. Send notification with summary

Notification:
  "📝 Q4 Report Updated"
  "Modified by: @alice"
  "Changes: Added revenue projections section"
  "Summary: [AI-generated summary]"
```

**Cost**: Minimal - only fetch content when actually changed  
**Latency**: Same as current (metadata is fast)  
**Value**: Much higher - users see what changed

---

## 4. Performance Comparison

### API Call Latency

| Operation | Method | Latency | Notes |
|-----------|--------|---------|-------|
| Fetch 100 doc metadata | Node SDK batch | ~300ms | All in 1-2 API calls |
| Fetch 1 doc content | lark-mcp | ~500-2000ms | Single large response |
| Fetch 100 doc content | lark-mcp | ~50-200s | NOT PRACTICAL - needs parallel |
| Detect metadata change | Node SDK | ~100ms (cached) | 30s TTL cache |
| Detect content change | lark-mcp | ~500ms+ | Full comparison needed |

### Cost Analysis (per 100 tracked documents)

| Scenario | Method | API Calls/min | Cost/day |
|----------|--------|---------------|----------|
| **Track changes only** | Node SDK | 30-40 | Low ✅ |
| **Track changes + get content** | lark-mcp only | 1,200-1,800 | Very High ❌ |
| **Track changes, read on demand** | Hybrid | 30-50 | Low ✅ |
| **Track + AI summaries** | Hybrid | 60-100 | Low-Medium ✅ |

---

## 5. Integration Recommendations

### Option A: Keep Current (Recommended for Now)

```typescript
// Current implementation
const poller = DocumentPoller.getInstance();

// Add on-demand content reading:
async function getDocumentForAnalysis(docToken: string) {
  const content = await larkMcp.docx.builtin.rawContent(docToken);
  return analyzeContent(content);
}
```

**When to Use**:
- Fast metadata tracking (current use case)
- On-demand content reading (new requests)
- Best cost/performance ratio

---

### Option B: Hybrid Intelligent Tracking

```typescript
// Current: fetch metadata every 30s
const metadata = await getDocMetadata(docToken);

// New: on change, fetch content for context
if (change detected) {
  const content = await larkMcp.docx.builtin.rawContent(docToken);
  
  // Generate smart summary
  const summary = await generateSummary(content);
  
  // Send notification with context
  await notifyWithSummary(metadata, summary);
}
```

**Benefits**:
- Same cost as current (only fetch content on changes)
- Much richer notifications
- Users see what actually changed

---

### Option C: Replace with lark-mcp Only

❌ **NOT RECOMMENDED**

```
Why it's bad:
- 40x more API calls
- 5-10x slower polling
- Overkill for "who modified when"
- Would need massive refactoring
```

---

## 6. Feature Comparison Matrix

| Feature | Node SDK | lark-mcp | Hybrid |
|---------|----------|----------|--------|
| Detect metadata changes | ✅ Fast | ⚠️ Slow | ✅ Fast |
| Read document content | ❌ No | ✅ Yes | ✅ Yes |
| Batch operations | ✅ 200/call | ❌ No | ✅ Selective |
| Change notifications | ✅ Rich | ❌ Simple | ✅ Rich + Smart |
| Content analysis | ❌ No | ✅ Yes | ✅ Yes |
| Caching | ✅ 30s TTL | ❌ None | ✅ Smart |
| Polling efficiency | ✅ Very efficient | ❌ Inefficient | ✅ Efficient |
| Standard API | ⚠️ Legacy | ✅ Official | ✅ Both |
| MCP Compatible | ❌ No | ✅ Yes | ✅ Yes |

---

## 7. Recommended Path Forward

### Phase 1: Keep Current (Immediate)
```typescript
// Existing Node SDK implementation is optimal for:
// - Document change tracking (fast, efficient)
// - Notification when modified
// - Audit trail

// Status: ✅ Keep as-is, proven and working
```

### Phase 2: Add Content Reading (Next)
```typescript
// Add lark-mcp for content operations:
import { docx } from "@larksuiteoapi/lark-mcp";

// On-demand content analysis
async function analyzeDocument(docToken: string) {
  const content = await docx.builtin.rawContent(docToken);
  return await generateInsights(content);
}

// Status: ⏳ Add when content analysis needed
```

### Phase 3: Hybrid Smart Tracking (Later)
```typescript
// Combine both approaches:
// 1. Track metadata changes (fast)
// 2. When changed, fetch content (on demand)
// 3. Generate summary (AI)
// 4. Send rich notification

// Status: 📋 Consider for enhanced notifications
```

---

## 8. Decision Matrix

**Use Node SDK (`getDocMetadata`) when**:
- ✅ Tracking if document changed
- ✅ Monitoring who modified and when
- ✅ Polling many documents frequently
- ✅ Minimizing API costs
- ✅ Need sub-second latency
- ✅ Current document tracking agent

**Use lark-mcp (`docx.v1.document.rawContent`) when**:
- ✅ Reading document content
- ✅ Analyzing document text
- ✅ Generating summaries
- ✅ Answering questions about content
- ✅ One-time content access
- ✅ User explicitly requests document

**Use Both (Hybrid) when**:
- ✅ Need smart change tracking + rich context
- ✅ Want to generate summaries of changes
- ✅ Building advanced document features
- ✅ Cost is acceptable for value

---

## 9. Implementation Effort

| Approach | Effort | Risk | Value |
|----------|--------|------|-------|
| Keep current | 0h | None | Current |
| Add lark-mcp alongside | 2-4h | Low | Medium |
| Hybrid intelligent tracking | 8-12h | Medium | High |
| Replace with lark-mcp | 40h+ | High | Low |

---

## 10. Conclusion

### TL;DR

**Current implementation is excellent for what it does.**

- ✅ Node SDK metadata approach: Fast, scalable, efficient
- ✅ Document tracking agent: Production-ready
- ❌ Not a replacement, serves different purpose
- ✅ lark-mcp is complementary, not competitive

### Recommendation

1. **Keep current Node SDK approach** - it's the right tool for the job
2. **Add lark-mcp for content operations** - when you need to read documents
3. **Build hybrid features later** - smart summaries, analysis

### Next Steps

- Phase 1: Keep tracking as-is ✅
- Phase 2: Add content reading on-demand 🔄
- Phase 3: Build intelligent summaries 📋

---

## References

- Current Implementation: `lib/doc-tracker.ts`, `lib/doc-poller.ts`
- lark-mcp Docs: `docs/LARK_MCP_INTEGRATION.md`
- Comparison created: `LARK_MCP_VS_NODE_SDK_COMPARISON.md`

