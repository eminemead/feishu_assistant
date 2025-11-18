# Next Steps: Supabase RLS Integration

## ✅ Implementation Complete

All code changes have been implemented. The following features are ready:

- ✅ Feishu user ID extraction from message events
- ✅ Supabase user creation and management
- ✅ JWT generation for RLS authentication
- ✅ Database schema with RLS policies
- ✅ User data scope filtering
- ✅ Memory provider migration to Supabase
- ✅ DuckDB query filtering by user permissions

## 🚀 Setup Instructions

### Step 1: Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Save your database password securely

### Step 2: Get Credentials

From Supabase Dashboard:
- **Settings > API**: Copy Project URL, anon key, service_role key
- **Settings > API > JWT Secret**: Copy JWT secret
- **Settings > Database**: Copy connection string

### Step 3: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit .env and add your Supabase credentials:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# SUPABASE_JWT_SECRET=your-jwt-secret
# SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

### Step 4: Verify Configuration

```bash
bun run setup:supabase
```

This will check that all environment variables are configured correctly.

### Step 5: Run Database Migrations

```bash
bun run migrate:supabase
```

This will:
- Create memory tables (`agent_working_memory`, `agent_messages`, `agent_chats`)
- Create user permissions table (`user_data_permissions`)
- Enable RLS policies on all tables
- Track applied migrations

### Step 6: Test Integration

```bash
bun run test:supabase test-user-123
```

This will test:
- User creation
- JWT generation
- Supabase client creation
- User data scope retrieval
- Memory provider creation
- RLS enforcement

### Step 7: Configure User Permissions

Set permissions for Feishu users to control data access:

```bash
# Set permissions for a user
bun run permissions:set <feishu-user-id> \
  --accounts=account1,account2 \
  --departments=department1 \
  --regions=region1

# Example:
bun run permissions:set ou_abc123 \
  --accounts=emp001,emp002,emp003 \
  --departments=Sales,Marketing

# Check permissions
bun run permissions:get <feishu-user-id>

# List all users with permissions
bun run permissions:list
```

### Step 8: Test with Real Feishu Messages

1. Start your server: `bun run dev`
2. Send a message via Feishu to your bot
3. Check server logs for:
   - `👤 [Auth] Extracted user ID: <user-id>`
   - `✅ [Auth] Created new Supabase user: <user-id>`
4. Verify in Supabase Dashboard:
   - **Authentication > Users**: Should see new user
   - **Table Editor**: Should see data stored with correct `user_id`

## 📚 Documentation

- **[Quick Start](./docs/setup/QUICKSTART.md)** - Get started in 5 minutes
- **[Setup Guide](./docs/setup/supabase-setup-guide.md)** - Detailed setup instructions
- **[Implementation](./docs/implementation/supabase-rls-integration.md)** - Architecture details
- **[Auth Module](./lib/auth/README.md)** - Authentication module docs

## 🔧 Available Scripts

```bash
# Setup and verification
bun run setup:supabase          # Verify configuration
bun run migrate:supabase         # Run migrations
bun run test:supabase            # Test integration

# User permissions
bun run permissions:set <user-id> [options]  # Set permissions
bun run permissions:get <user-id>            # Get permissions
bun run permissions:list                     # List all permissions
```

## 🔒 Security Features

1. **RLS Policies**: Database-level enforcement ensures users can only access their own data
2. **Fail-Secure**: Returns empty scope if permissions cannot be retrieved (denies access)
3. **JWT Validation**: All JWTs validated by Supabase using JWT secret
4. **User Isolation**: Memory and messages are isolated per user

## ⚠️ Important Notes

1. **Service Role Key**: Keep `SUPABASE_SERVICE_ROLE_KEY` secret - never expose it to clients
2. **JWT Secret**: Keep `SUPABASE_JWT_SECRET` secret - required for JWT validation
3. **Database Password**: Keep your database password secure
4. **Environment Variables**: Never commit `.env` file to version control

## 🐛 Troubleshooting

### Migration Errors

**Error**: `relation "auth.users" does not exist`
- Ensure you're using the correct database connection string

**Error**: `permission denied`
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly

### RLS Not Working

- Verify RLS is enabled: Check Supabase Dashboard > Table Editor > RLS enabled
- Check policies exist: Supabase Dashboard > Authentication > Policies
- Verify JWT is being generated: Check server logs

### User Creation Fails

- Check Supabase Dashboard > Authentication > Users
- Verify environment variables are correct
- Check server logs for detailed error messages

## 📊 Monitoring

### Check User Activity

```sql
-- View recent memory usage
SELECT user_id, COUNT(*) as message_count
FROM agent_messages
GROUP BY user_id
ORDER BY message_count DESC
LIMIT 10;
```

### Verify RLS Enforcement

Test that users can only see their own data:
1. Create two test users
2. Store data for each user
3. Query as each user - should only see own data

## ✨ What's Next?

After setup is complete:

1. **Configure User Permissions**: Set up data access permissions for your users
2. **Monitor Usage**: Check Supabase Dashboard for user activity
3. **Test RLS**: Verify users can only access their own data
4. **Production Deployment**: Deploy with proper environment variables

## 🆘 Need Help?

1. Check [Setup Guide](./docs/setup/supabase-setup-guide.md) for detailed instructions
2. Review [Implementation Docs](./docs/implementation/supabase-rls-integration.md) for architecture
3. Check server logs for detailed error messages
4. Verify environment variables are set correctly

---

**Status**: ✅ Ready for setup and testing

