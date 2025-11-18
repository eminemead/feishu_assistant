# Supabase Setup Guide

Complete guide for setting up Supabase with RLS for the Feishu Assistant.

**Note**: This guide covers Supabase Cloud. For self-hosted Supabase OSS, see [OSS Compatibility Guide](./supabase-oss-compatibility.md).

## Prerequisites

1. Supabase account (sign up at https://supabase.com) OR self-hosted Supabase OSS instance
2. Feishu Assistant codebase with dependencies installed

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in:
   - **Name**: feishu-assistant (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to your users
4. Click "Create new project"
5. Wait for project to be provisioned (~2 minutes)

## Step 2: Get Supabase Credentials

Once your project is ready:

1. Go to **Settings** > **API**
2. Copy the following values:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

3. Go to **Settings** > **API** > **JWT Secret**
   - Copy the JWT Secret → `SUPABASE_JWT_SECRET`

4. Go to **Settings** > **Database** > **Connection string**
   - Select "URI" tab
   - Copy the connection string → `SUPABASE_DATABASE_URL`
   - Replace `[YOUR-PASSWORD]` with your database password

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env` (if not already done):
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   SUPABASE_JWT_SECRET=your-jwt-secret-here
   SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
   ```

3. Verify configuration:
   ```bash
   bun scripts/setup-supabase.ts
   ```

## Step 4: Run Database Migrations

### Option A: Using the Migration Script (Recommended)

```bash
bun scripts/run-migrations.ts
```

This will:
- Run all migrations in order
- Track applied migrations
- Skip already-applied migrations

### Option B: Using Supabase SQL Editor

1. Go to Supabase Dashboard > **SQL Editor**
2. Run each migration file in order:
   - `supabase/migrations/001_create_memory_tables.sql`
   - `supabase/migrations/002_create_rls_policies.sql`
   - `supabase/migrations/003_create_user_permissions.sql`

### Option C: Using Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Step 5: Verify Setup

1. **Check Tables**:
   - Go to Supabase Dashboard > **Table Editor**
   - You should see:
     - `agent_working_memory`
     - `agent_messages`
     - `agent_chats`
     - `user_data_permissions`
     - `schema_migrations` (if using migration script)

2. **Check RLS Policies**:
   - Go to Supabase Dashboard > **Authentication** > **Policies**
   - Verify policies exist for all memory tables

3. **Run Tests**:
   ```bash
   bun scripts/test-supabase.ts test-user-123
   ```

## Step 6: Configure User Permissions

Set up user data permissions for data filtering:

```bash
# Set permissions for a user
bun scripts/manage-user-permissions.ts set <feishu-user-id> \
  --accounts=account1,account2 \
  --departments=dept1,dept2 \
  --regions=region1,region2

# Get permissions for a user
bun scripts/manage-user-permissions.ts get <feishu-user-id>

# List all users with permissions
bun scripts/manage-user-permissions.ts list
```

### Example

```bash
# Allow user to access specific accounts
bun scripts/manage-user-permissions.ts set ou_abc123 \
  --accounts=emp001,emp002,emp003 \
  --departments=Sales,Marketing

# Check permissions
bun scripts/manage-user-permissions.ts get ou_abc123
```

## Step 7: Test with Real Feishu Messages

1. Send a message via Feishu to your bot
2. Check server logs for:
   - `👤 [Auth] Extracted user ID: <user-id>`
   - `✅ [Auth] Created new Supabase user: <user-id>`
3. Verify in Supabase Dashboard:
   - **Authentication** > **Users**: Should see new user
   - **Table Editor** > **agent_messages**: Should see message stored

## Troubleshooting

### Migration Errors

**Error**: `relation "auth.users" does not exist`
- **Solution**: Ensure you're using the correct database connection string

**Error**: `permission denied for table`
- **Solution**: Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly

### RLS Not Working

**Issue**: Users can see other users' data
- **Solution**: 
  1. Verify RLS is enabled: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`
  2. Check policies exist: `SELECT * FROM pg_policies WHERE tablename = 'table_name';`
  3. Verify JWT is being generated correctly

### User Creation Fails

**Error**: `User already exists`
- **Solution**: This is normal - the function will retrieve existing user

**Error**: `Invalid JWT secret`
- **Solution**: Verify `SUPABASE_JWT_SECRET` matches your project's JWT secret

## Security Best Practices

1. **Never commit `.env` file** - It contains sensitive credentials
2. **Use Service Role Key only server-side** - Never expose it to clients
3. **Rotate credentials regularly** - Especially if exposed
4. **Monitor RLS policies** - Regularly audit who can access what data
5. **Use least privilege** - Only grant necessary permissions

## Next Steps

- [Set up user permissions](./supabase-setup-guide.md#step-6-configure-user-permissions)
- [Test RLS enforcement](./supabase-setup-guide.md#step-7-test-with-real-feishu-messages)
- [Monitor usage](./supabase-setup-guide.md#monitoring)

## Monitoring

### Check User Activity

```sql
-- View recent memory usage
SELECT user_id, COUNT(*) as message_count
FROM agent_messages
GROUP BY user_id
ORDER BY message_count DESC
LIMIT 10;
```

### Check RLS Enforcement

```sql
-- Test RLS (run as different users)
SET LOCAL role authenticated;
SET LOCAL request.jwt.claim.sub = 'test-user-id';

SELECT * FROM agent_working_memory;
-- Should only return rows for test-user-id
```

## Support

For issues:
1. Check [Supabase Documentation](https://supabase.com/docs)
2. Review [Implementation Documentation](../implementation/supabase-rls-integration.md)
3. Check server logs for detailed error messages

