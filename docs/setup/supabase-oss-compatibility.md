# Supabase OSS (Self-Hosted) Compatibility

## ✅ Full Compatibility

This implementation is **fully compatible** with self-hosted Supabase OSS. All code uses standard Supabase APIs and PostgreSQL features that work identically in both cloud and self-hosted deployments.

## Compatibility Checklist

### ✅ Environment Variables
- All Supabase URLs/configs read from environment variables
- No hardcoded cloud-specific URLs
- Works with any Supabase instance URL

### ✅ Supabase JS Client
- Uses `@supabase/supabase-js` which supports both cloud and OSS
- Standard API endpoints (`/auth/v1/admin`, `/rest/v1/`)
- No cloud-specific features used

### ✅ Database Connection
- Direct PostgreSQL connection via `postgres-js`
- Standard PostgreSQL features (RLS, triggers, functions)
- No cloud-specific database features

### ✅ Authentication API
- Uses standard Supabase Auth Admin API
- `auth.admin.getUserById()` - works in OSS
- `auth.admin.createUser()` - works in OSS
- JWT generation uses standard JWT library

### ✅ RLS Policies
- Standard PostgreSQL Row Level Security
- Uses `auth.uid()` function (standard Supabase)
- Works identically in cloud and OSS

### ✅ JWT Generation
- Uses `jsonwebtoken` library (standard)
- JWT `iss` (issuer) set to `SUPABASE_URL` (works with any URL)
- JWT secret validation works the same way

## Self-Hosted Setup Differences

### 1. Environment Variables

For self-hosted Supabase OSS, set:

```env
# Your self-hosted Supabase instance URL
SUPABASE_URL=https://your-supabase-instance.com

# Get from your Supabase OSS instance
SUPABASE_ANON_KEY=your-anon-key-from-oss
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-from-oss
SUPABASE_JWT_SECRET=your-jwt-secret-from-oss

# Direct PostgreSQL connection
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@your-db-host:5432/postgres
```

### 2. Getting Credentials from Self-Hosted Supabase

#### API Keys (ANON_KEY and SERVICE_ROLE_KEY)

In self-hosted Supabase OSS, these are typically:
- Found in your Supabase configuration files
- Set via environment variables in your Supabase deployment
- Available in the Supabase Studio UI (if enabled)

**Location in Supabase OSS:**
- Check your `supabase/config.toml` or environment variables
- Or access via Supabase Studio: Settings > API

#### JWT Secret

The JWT secret is used to sign/validate JWTs. In self-hosted OSS:
- Set in your Supabase configuration
- Must match between your application and Supabase instance
- Typically found in `supabase/config.toml` under `[auth]` section

**Example config.toml:**
```toml
[auth]
jwt_secret = "your-jwt-secret-here"
```

#### Database Connection String

For self-hosted PostgreSQL:
```env
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@localhost:5432/postgres
```

Or if using Docker:
```env
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db:5432/postgres
```

### 3. Running Migrations

Migrations work exactly the same:

```bash
# Using the migration script
bun run migrate:supabase

# Or directly with psql
psql $SUPABASE_DATABASE_URL -f supabase/migrations/001_create_memory_tables.sql
psql $SUPABASE_DATABASE_URL -f supabase/migrations/002_create_rls_policies.sql
psql $SUPABASE_DATABASE_URL -f supabase/migrations/003_create_user_permissions.sql
```

### 4. Testing

The test script works identically:

```bash
bun run test:supabase test-user-123
```

## Potential Considerations

### 1. API Endpoint Compatibility

Ensure your self-hosted Supabase OSS instance exposes the same API endpoints:
- `/auth/v1/admin/*` - For admin auth operations
- `/rest/v1/*` - For REST API operations

These are standard in Supabase OSS.

### 2. JWT Issuer Validation

The JWT issuer (`iss`) is set to `SUPABASE_URL`. Ensure:
- Your Supabase OSS instance accepts JWTs with this issuer
- The URL matches what Supabase expects (check your Supabase config)

### 3. CORS (if applicable)

If accessing Supabase from a browser, ensure CORS is configured in your Supabase OSS instance. This doesn't affect server-side usage.

### 4. Database Extensions

The migrations use standard PostgreSQL features. Ensure your PostgreSQL instance has:
- `uuid-ossp` extension (for `gen_random_uuid()`)
- Standard PostgreSQL functions (all standard)

## Verification Steps

1. **Test Connection**:
   ```bash
   bun run setup:supabase
   ```

2. **Test API Access**:
   ```bash
   bun run test:supabase test-user-123
   ```

3. **Verify RLS**:
   - Create two test users
   - Store data for each
   - Query as each user - should only see own data

## Differences from Cloud

| Feature | Cloud | Self-Hosted OSS |
|---------|-------|-----------------|
| URL | `*.supabase.co` | Your domain |
| Credentials | Dashboard UI | Config files/env vars |
| Setup | Click "New Project" | Deploy Supabase OSS |
| **Everything else** | **Identical** | **Identical** |

## Code Compatibility

All code is compatible because:

1. ✅ **No hardcoded URLs** - Everything uses environment variables
2. ✅ **Standard APIs** - Uses only standard Supabase/PostgreSQL APIs
3. ✅ **Standard libraries** - Uses `@supabase/supabase-js`, `postgres-js`, `jsonwebtoken`
4. ✅ **Standard SQL** - Migrations use standard PostgreSQL SQL

## Migration from Cloud to OSS

If migrating from Supabase Cloud to self-hosted OSS:

1. Update environment variables to point to your OSS instance
2. Export data from cloud (if needed)
3. Run migrations on OSS instance
4. Import data (if needed)
5. Update application environment variables
6. Test thoroughly

**No code changes required!**

## Support

For self-hosted Supabase OSS issues:
1. Check [Supabase OSS Documentation](https://supabase.com/docs/guides/self-hosting)
2. Verify your Supabase OSS instance is running correctly
3. Check API endpoints are accessible
4. Verify environment variables are correct

## Conclusion

✅ **This implementation is 100% compatible with self-hosted Supabase OSS.**

Simply point your environment variables to your self-hosted instance and everything will work identically to the cloud version.

