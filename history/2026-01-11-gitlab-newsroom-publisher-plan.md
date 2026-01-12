# GitLab → Feishu Newsroom Publisher Implementation Plan

**Bead**: `feishu_assistant-av8r`  
**Date**: 2026-01-11  
**Status**: Planning

## Goal

When writing markdown in hosted GitLab (issue or wiki), auto-publish to Feishu group with "newsroom production" quality.

---

## Architecture

```
┌─────────────────┐    webhook     ┌──────────────────────────┐
│  GitLab         │ ─────────────► │ gitlab-markdown-webhook  │
│  (issue/wiki)   │   issue/wiki   │ handler.ts               │
└─────────────────┘    events      └──────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │ gitlab-newsroom-transformer   │
                              │ - normalize markdown          │
                              │ - generate deck (LLM optional)│
                              │ - extract tags from labels    │
                              └───────────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │ newsroom-card.ts              │
                              │ - blue header (new)           │
                              │ - orange header (update)      │
                              │ - tag chips + markdown body   │
                              │ - metadata + GitLab link      │
                              └───────────────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │ Feishu Group                  │
                              │ - Root card (first publish)   │
                              │ - Reply cards (updates)       │
                              └───────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Database & Types (1h)

**Create migration**: `supabase/migrations/XXX_create_gitlab_feishu_newsroom.sql`

```sql
CREATE TABLE gitlab_feishu_newsroom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('issue', 'wiki')),
  external_id TEXT NOT NULL,  -- issue iid or wiki slug
  gitlab_url TEXT NOT NULL,
  feishu_chat_id TEXT NOT NULL,
  feishu_root_message_id TEXT,
  last_published_at TIMESTAMPTZ,
  last_gitlab_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_path, kind, external_id)
);

CREATE INDEX idx_gitlab_newsroom_lookup 
  ON gitlab_feishu_newsroom(project_path, kind, external_id);
```

**Types**: `lib/types/newsroom.ts`

```typescript
type GitlabMarkdownKind = 'issue' | 'wiki';

interface GitlabMarkdownEvent {
  kind: GitlabMarkdownKind;
  projectPath: string;
  externalId: string;
  title: string;
  markdown: string;
  authorName: string;
  authorUsername: string;
  url: string;
  action: 'created' | 'updated';
  updatedAt: string;
  labels?: string[];
}

interface NewsroomArticle {
  id: string;
  kind: 'issue' | 'wiki';
  title: string;
  deck?: string;
  bodyMarkdown: string;
  tags: string[];
  author: string;
  sourceUrl: string;
  updatedAt: string;
  createdOrUpdated: 'created' | 'updated';
}
```

### Phase 2: GitLab Webhook Handler (2h)

**File**: `lib/handlers/gitlab-markdown-webhook-handler.ts`

```typescript
export async function handleGitLabMarkdownWebhook(body: unknown): Promise<void> {
  // 1. Validate GitLab secret token
  // 2. Parse event type (issue vs wiki_page)
  // 3. Filter by label 'newsroom' or project whitelist
  // 4. Build GitlabMarkdownEvent
  // 5. Call publishNewsroomArticle(event)
}
```

**Wiring**: Add route in `server.ts`
```typescript
app.post('/api/webhooks/gitlab-markdown', async (c) => {
  await handleGitLabMarkdownWebhook(await c.req.json());
  return c.json({ ok: true });
});
```

### Phase 3: Markdown → Article Transformer (2h)

**File**: `lib/services/gitlab-newsroom-transformer.ts`

```typescript
export async function normalizeGitlabMarkdown(
  evt: GitlabMarkdownEvent
): Promise<NewsroomArticle> {
  // 1. Extract title
  // 2. Generate deck (first paragraph or LLM summary)
  // 3. Clean markdown body (strip metadata, enforce max length)
  // 4. Map labels → tags
  // 5. Return NewsroomArticle
}
```

Optional LLM deck generation:
```typescript
const deck = await generateText({
  model: getMastraModelSingle(),
  prompt: `Rewrite as a succinct, newsroom-style Chinese summary (≤40 chars): ${title} - ${firstParagraph}`,
});
```

### Phase 4: Newsroom Card Template (1.5h)

**File**: `lib/feishu-cards/newsroom-card.ts`

```typescript
export function buildNewsroomCard(article: NewsroomArticle): FeishuCardV2 {
  return {
    schema: "2.0",
    header: {
      title: { tag: "plain_text", content: article.title },
      subtitle: { tag: "plain_text", content: article.deck || "GitLab 更新" },
      template: article.createdOrUpdated === "created" ? "blue" : "orange",
    },
    body: {
      elements: [
        // Tag chips
        article.tags.length > 0 && {
          tag: "note",
          elements: article.tags.map(t => ({ tag: "plain_text", content: `#${t}` })),
        },
        // Main content
        { tag: "markdown", content: article.bodyMarkdown },
        { tag: "hr" },
        // Metadata
        {
          tag: "note",
          elements: [
            { tag: "plain_text", content: `${article.kind === "issue" ? "Issue" : "Wiki"} · 作者: ${article.author}` },
            { tag: "a", href: article.sourceUrl, content: "在 GitLab 中查看" },
          ],
        },
      ].filter(Boolean),
    },
  };
}
```

### Phase 5: Publish Logic with Threading (2h)

**File**: `lib/services/newsroom-publisher.ts`

```typescript
export async function publishNewsroomArticle(evt: GitlabMarkdownEvent): Promise<void> {
  const article = await normalizeGitlabMarkdown(evt);
  const card = buildNewsroomCard(article);
  
  // Lookup existing publication
  const existing = await getPublicationByGitlabRef(evt.projectPath, evt.kind, evt.externalId);
  
  const chatId = resolveTargetChat(evt.projectPath);
  
  if (!existing) {
    // First publish → create root message
    const resp = await feishuClient.im.message.create({
      receive_id_type: "chat_id",
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });
    await createPublication({
      projectPath: evt.projectPath,
      kind: evt.kind,
      externalId: evt.externalId,
      gitlabUrl: evt.url,
      feishuChatId: chatId,
      feishuRootMessageId: resp.data.message_id,
      lastPublishedAt: new Date(),
      lastGitlabUpdatedAt: new Date(evt.updatedAt),
    });
  } else {
    // Update → idempotency check
    if (new Date(evt.updatedAt) <= existing.lastGitlabUpdatedAt) {
      return; // Already processed
    }
    // Reply to root message
    await feishuClient.im.message.reply({
      message_id: existing.feishuRootMessageId,
      data: {
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });
    await updatePublication(existing.id, {
      lastPublishedAt: new Date(),
      lastGitlabUpdatedAt: new Date(evt.updatedAt),
    });
  }
}
```

### Phase 6: Config & Testing (1h)

**Config**: Target chat mapping
```typescript
const NEWSROOM_GROUPS: Record<string, string> = {
  "dpa/newsroom": "oc_xxx",  // Main newsroom
  DEFAULT: "oc_yyy",
};

function resolveTargetChat(projectPath: string): string {
  return NEWSROOM_GROUPS[projectPath] || NEWSROOM_GROUPS.DEFAULT;
}
```

**GitLab webhook setup**:
1. Go to GitLab project → Settings → Webhooks
2. URL: `https://your-domain/api/webhooks/gitlab-markdown`
3. Secret token: from env `GITLAB_WEBHOOK_SECRET`
4. Events: ☑ Issues, ☑ Wiki Page

---

## Files Summary

| File | Purpose |
|------|---------|
| `supabase/migrations/XXX_create_gitlab_feishu_newsroom.sql` | Persistence table |
| `lib/types/newsroom.ts` | Type definitions |
| `lib/handlers/gitlab-markdown-webhook-handler.ts` | Webhook entry point |
| `lib/services/gitlab-newsroom-transformer.ts` | MD → Article transform |
| `lib/feishu-cards/newsroom-card.ts` | Card template |
| `lib/services/newsroom-publisher.ts` | Publish + threading logic |
| `server.ts` | Route wiring |

---

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Phase 1: DB & Types | 1h |
| Phase 2: Webhook Handler | 2h |
| Phase 3: Transformer | 2h |
| Phase 4: Card Template | 1.5h |
| Phase 5: Publish Logic | 2h |
| Phase 6: Config & Test | 1h |
| **Total** | **~9.5h** |

---

## Future Enhancements (Optional)

1. **Datawrapper charts**: Detect ```chart blocks, render via existing viz infra
2. **Preview workflow**: Draft → approval → publish (like release notes)
3. **Bi-directional sync**: Comments on Feishu → GitLab
4. **Scheduled digest**: Daily/weekly summary card instead of per-update
