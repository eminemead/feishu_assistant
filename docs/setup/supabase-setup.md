# Supabase RLS Integration

This project uses Supabase as the OLTP database with Row Level Security (RLS) for data permission control.

**✅ Compatible with both Supabase Cloud and self-hosted Supabase OSS** - See [OSS Compatibility Guide](./docs/setup/supabase-oss-compatibility.md)

## Quick Start

1. **Set up Supabase**: See [Quick Start Guide](./docs/setup/QUICKSTART.md)
2. **Run migrations**: `bun run migrate:supabase`
3. **Test**: `bun run test:supabase`

## Features

- ✅ **Feishu Authentication**: Users authenticated via Feishu Node SDK
- ✅ **Row Level Security**: Database-level data access control
- ✅ **User Data Filtering**: DuckDB/StarRocks queries filtered by user permissions
- ✅ **Memory Management**: Persistent memory with user isolation

## Documentation

- [Quick Start](./docs/setup/QUICKSTART.md) - Get started in 5 minutes
- [Setup Guide](./docs/setup/supabase-setup-guide.md) - Detailed setup instructions
- [Implementation](./docs/implementation/supabase-rls-integration.md) - Architecture and implementation details
- [Auth Module](./lib/auth/README.md) - Authentication module documentation

## Scripts

```bash
# Setup and verification
bun run setup:supabase          # Verify Supabase configuration
bun run migrate:supabase         # Run database migrations
bun run test:supabase            # Test Supabase integration

# User permissions management
bun run permissions:set <user-id> --accounts=acc1,acc2
bun run permissions:get <user-id>
bun run permissions:list
```

## Environment Variables

Required Supabase environment variables:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
```

## Architecture

```
Feishu Message → Extract User ID → Create Supabase User → Generate JWT → RLS Enforcement
```

## Security

- **RLS Policies**: Enforce user-level data access at database level
- **Fail-Secure**: Returns empty scope if permissions cannot be retrieved
- **JWT Validation**: All JWTs validated by Supabase
- **User Isolation**: Users can only access their own data

## Support

For issues or questions:
1. Check [Setup Guide](./docs/setup/supabase-setup-guide.md)
2. Review [Implementation Docs](./docs/implementation/supabase-rls-integration.md)
3. Check server logs for detailed error messages

