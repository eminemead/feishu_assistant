# Feishu Authentication and Supabase RLS Integration

This directory contains the authentication and authorization infrastructure for integrating Feishu users with Supabase Row Level Security (RLS).

## Overview

The system authenticates users via Feishu and enforces data access control using Supabase RLS policies. This ensures that users can only access their own data and data they're authorized to view.

## Architecture

```
Feishu Message Event
    ↓
Extract User ID (extract-feishu-user-id.ts)
    ↓
Create/Update Supabase User (feishu-supabase-auth.ts)
    ↓
Generate JWT with User Context (supabase-jwt.ts)
    ↓
RLS Policies Enforce Data Access (database migrations)
    ↓
User Data Scope Filtering (user-data-scope.ts)
```

## Files

### `extract-feishu-user-id.ts`
Extracts Feishu user ID (`open_id`/`user_id`) from message events.

### `feishu-supabase-auth.ts`
Creates or retrieves Supabase users from Feishu user IDs using Supabase Admin API.

### `supabase-jwt.ts`
Generates Supabase-compatible JWTs with Feishu user context for RLS authentication.

### `user-data-scope.ts`
Gets user's authorized data access scope for filtering DuckDB/StarRocks queries.

## Environment Variables

Required environment variables:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

## Database Migrations

Run migrations in order:

1. `001_create_memory_tables.sql` - Creates memory tables with `user_id` columns
2. `002_create_rls_policies.sql` - Creates RLS policies for user-level access
3. `003_create_user_permissions.sql` - Creates user permissions table for data filtering

## Usage

### In Message Handlers

User ID is automatically extracted and passed through the call chain:

```typescript
// server.ts extracts userId
const userId = extractFeishuUserId(message, data);

// Passed to handlers
await handleNewMessage({ ..., userId });
```

### In Agents

User ID is available in `executionContext.feishuUserId`:

```typescript
// lib/agents/manager-agent.ts
if (userId) {
  executionContext.feishuUserId = userId;
}
```

### For Data Filtering

Use `getUserDataScope()` to filter queries:

```typescript
import { getUserDataScope } from '../auth/user-data-scope';

const scope = await getUserDataScope(feishuUserId);
// Filter queries by scope.allowedAccounts, scope.allowedDepartments, etc.
```

## RLS Policies

RLS policies ensure users can only access their own data:

- `agent_working_memory`: Users can only access their own working memory
- `agent_messages`: Users can only access their own messages
- `agent_chats`: Users can only access their own chats
- `user_data_permissions`: Users can only access their own permissions

## User Permissions

User permissions are stored in `user_data_permissions` table:

- `allowed_accounts`: Array of account IDs user can access
- `allowed_departments`: Array of departments user can access
- `allowed_regions`: Array of regions user can access

## Security Considerations

1. **Fail-Secure**: If user permissions cannot be retrieved, return empty scope (deny access)
2. **RLS Enforcement**: All database queries are automatically filtered by RLS policies
3. **JWT Validation**: JWTs are validated by Supabase using the JWT secret
4. **User Verification**: Feishu user IDs are validated before creating Supabase users

## Future Improvements

1. Pass `userId` through tool execution context for direct tool access
2. Implement caching for user data scope to reduce database queries
3. Add admin interface for managing user permissions
4. Implement audit logging for data access

