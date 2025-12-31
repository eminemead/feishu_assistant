# Feishu OAuth Document Access

## Overview

Enables reading Feishu documents with **user's permission** via OAuth, instead of relying on docs being shared with the bot.

## How It Works

```
User pastes doc link → DPA Workflow detects link
                       ↓
        Check for user_access_token in Supabase
           ↓                    ↓
    Token exists            No token
         ↓                      ↓
   Read doc with          Try app token
   user's permission      (limited access)
         ↓                      ↓
   Summarize content      If fails, prompt
         ↓                 user to authorize
   Embed in issue              ↓
   description            Return auth link
```

## Setup

### 1. Feishu App Configuration

In Feishu Open Platform → Your App:

1. **Security Settings** → Add redirect URI:
   ```
   https://your-domain.com/oauth/feishu/callback
   ```

2. **Permissions** → Add scopes:
   - `docs:doc:readonly` - Read documents
   - `drive:drive:readonly` - Read drive files

### 2. Environment Variables

```bash
# Required
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# OAuth redirect (must match Feishu app settings)
FEISHU_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/feishu/callback
# Or defaults to:
PUBLIC_URL=https://your-domain.com
```

### 3. Database Migration

Run the migration to create token storage:

```bash
supabase migration up
# Or manually run: supabase/migrations/011_create_feishu_user_tokens.sql
```

## Usage Flow

### For Users

1. User creates issue with doc link:
   ```
   @bot create issue: 分析 CAC 下降原因，参考 https://nio.feishu.cn/docx/xxx
   ```

2. If not authorized, bot returns auth link

3. User clicks link → Feishu OAuth page → Authorize

4. Bot can now read user's docs

### For Issue Creation

When user pastes a doc link in issue creation request:

1. **Auto-detect** Feishu URLs in the query
2. **Read** doc content with user's OAuth token
3. **Summarize** content (max 400 chars)
4. **Embed** summary in issue description

Example output:
```markdown
**Title**: 分析 CAC 下降原因
**Description**: 分析上周 CAC 下降 20% 的原因

---
**📄 相关文档摘要**

### CAC 周报 2025-W01
上周 CAC 环比下降 20%，主要由于...
[查看文档](https://nio.feishu.cn/docx/xxx)
```

## API Reference

### `generateAuthUrl(userId)`

Generate OAuth URL for user authorization.

```typescript
import { generateAuthUrl } from "./lib/auth/feishu-oauth";
const url = generateAuthUrl("ou_xxx");
// https://open.feishu.cn/open-apis/authen/v1/authorize?...
```

### `getUserAccessToken(userId)`

Get valid access token (auto-refreshes if expired).

```typescript
import { getUserAccessToken } from "./lib/auth/feishu-oauth";
const token = await getUserAccessToken("ou_xxx");
if (token) {
  // Use token for API calls
}
```

### `readDocWithUserAuth(docUrl, userId)`

Read document with user's permission.

```typescript
import { readDocWithUserAuth } from "./lib/tools/feishu-docs-user-tool";

const result = await readDocWithUserAuth(
  "https://nio.feishu.cn/docx/xxx",
  "ou_xxx"
);

if (result.success) {
  console.log(result.title, result.content);
} else if (result.needsAuth) {
  console.log("Auth needed:", result.authUrl);
}
```

### `readAndSummarizeDocs(urls, userId)`

Read multiple docs and return summaries.

```typescript
import { readAndSummarizeDocs } from "./lib/tools/feishu-docs-user-tool";

const summaries = await readAndSummarizeDocs(
  ["https://nio.feishu.cn/docx/xxx", "https://nio.feishu.cn/docx/yyy"],
  "ou_xxx",
  300 // max summary length
);
```

## Token Storage

Tokens stored in `feishu_user_tokens` table:

| Column | Type | Description |
|--------|------|-------------|
| feishu_user_id | TEXT PK | User's open_id |
| access_token | TEXT | OAuth access token |
| refresh_token | TEXT | For renewing expired tokens |
| expires_at | TIMESTAMPTZ | Token expiration |
| scope | TEXT | Granted permissions |

Tokens are:
- Auto-refreshed when expired (using refresh_token)
- Deleted if refresh fails (user must re-authorize)
- Only accessible via service role (RLS protected)

## Security Considerations

1. **Tokens stored server-side** - Never exposed to client
2. **Auto-expiry** - Tokens have limited lifetime
3. **Scoped access** - Only request needed permissions
4. **User consent** - Explicit authorization required
5. **RLS protected** - Only service role can access tokens

## Fallback Behavior

If user hasn't authorized:
1. Try reading with app token (tenant_access_token)
2. If that fails, return error with auth link
3. User can authorize and retry

This ensures docs shared with the bot still work, while enabling broader access when user authorizes.

