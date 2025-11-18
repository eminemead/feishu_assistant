# Quick Start: Supabase RLS Setup

Quick guide to get Supabase RLS integration up and running.

## 1. Create Supabase Project

1. Sign up at https://supabase.com
2. Create a new project
3. Save your database password

## 2. Get Credentials

From Supabase Dashboard:

- **Settings > API**: Copy `Project URL`, `anon public` key, `service_role` key
- **Settings > API > JWT Secret**: Copy JWT secret
- **Settings > Database**: Copy connection string (replace `[YOUR-PASSWORD]`)

## 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your Supabase credentials
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# SUPABASE_JWT_SECRET=your-jwt-secret
# SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

## 4. Verify Configuration

```bash
bun run setup:supabase
```

## 5. Run Migrations

```bash
bun run migrate:supabase
```

## 6. Test Integration

```bash
bun run test:supabase test-user-123
```

## 7. Set User Permissions

```bash
# Set permissions for a Feishu user
bun run permissions:set <feishu-user-id> --accounts=acc1,acc2 --departments=dept1

# Check permissions
bun run permissions:get <feishu-user-id>

# List all permissions
bun run permissions:list
```

## Done! 🎉

Your Supabase RLS integration is now set up. The system will:

- ✅ Extract user IDs from Feishu messages
- ✅ Create Supabase users automatically
- ✅ Enforce RLS policies for data access
- ✅ Filter DuckDB queries by user permissions

## Next Steps

- See [Full Setup Guide](./supabase-setup-guide.md) for detailed instructions
- See [Implementation Docs](../implementation/supabase-rls-integration.md) for architecture details

