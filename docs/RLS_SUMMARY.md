# RLS Configuration Summary

Your Supabase setup already has basic RLS. Here's how to customize it.

## Files Created

Three comprehensive guides:

1. **RLS_QUICKSTART.md** - 5-minute setup for common patterns
2. **CUSTOM_RLS_GUIDE.md** - Deep dive into RLS concepts and patterns  
3. **RLS_EXAMPLES.md** - Copy-paste examples for real scenarios

## Current Setup (Baseline)

```
JWT with user_id → RLS policy checks user_id = auth.uid()
```

**Files**:
- `lib/auth/supabase-jwt.ts` - JWT generation
- `lib/auth/feishu-supabase-auth.ts` - Feishu → Supabase user mapping
- `supabase/migrations/002_create_rls_policies.sql` - Current policies
- `supabase/migrations/003_create_user_permissions.sql` - Permissions table

## How to Extend It

### Step 1: Choose Your Pattern

| Pattern | Use Case | Complexity |
|---------|----------|-----------|
| Department-based | Each dept has own data | ⭐ Low |
| Manager/Team | Managers see team data | ⭐ Low |
| Role-based (Admin/Manager/Viewer) | Different permission levels | ⭐⭐ Medium |
| Attribute-based (ABAC) | Multiple access dimensions | ⭐⭐⭐ High |
| Hybrid | Combine multiple patterns | ⭐⭐⭐ High |

### Step 2: Follow the Pattern

Each pattern has:
- **Migration SQL** - Copy-paste into `supabase/migrations/00X_*.sql`
- **Code changes** - Update `lib/auth/supabase-jwt.ts` if needed
- **Usage example** - How to query with RLS applied

### Step 3: Test

```bash
# Run migration
bun scripts/run-migrations.ts

# Test with example
bun scripts/test-rls.ts userId department
```

## Concepts

### RLS Policy Structure

```sql
CREATE POLICY "Name"
ON table_name
FOR SELECT/INSERT/UPDATE/DELETE
USING (condition)        -- Read access: which rows user can see
WITH CHECK (condition);  -- Write access: which rows user can modify
```

### JWT to RLS Flow

```
1. User action → Feishu event
2. Extract Feishu user ID + dept/role
3. generateSupabaseJWT(userId, dept) → JWT token
4. createSupabaseClientWithUser(userId, dept) → Auth header with JWT
5. Query executed → RLS policy checks auth.uid() + custom logic
6. Only matching rows returned
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `generateSupabaseJWT(userId, dept)` | Create JWT with user context |
| `createSupabaseClientWithUser(userId, dept)` | Create RLS-enabled client |
| `get_user_department()` | SQL function: extract dept from JWT |
| `user_has_role(role)` | SQL function: check user role |

## Common Mistakes

❌ **Don't**:
- Use `OR` in USING clause without care (grants access)
- Forget indexes on `EXISTS` subqueries (slow!)
- Store secrets in JWT (only use IDs/roles)
- Use admin client in app code (bypasses RLS)
- Assume RLS works without testing

✅ **Do**:
- Start with deny-by-default policies
- Test with real data before production
- Use helper functions (more readable)
- Add indexes for performance
- Document what each policy does

## Examples Included

1. **Department-based OKRs** - Users see only their dept's data
2. **Manager/Team access** - Managers see team's reports
3. **Role-based budgets** - Admin/Manager/Viewer different levels
4. **ABAC confidential** - Access based on level + dept + region
5. **Hybrid projects** - Owner + dept + explicit share

Each with complete SQL + TypeScript code.

## Quick Links

- **Setup**: Start with `RLS_QUICKSTART.md`
- **Learn**: Read `CUSTOM_RLS_GUIDE.md` for concepts
- **Implement**: Use `RLS_EXAMPLES.md` to copy code
- **Debug**: See troubleshooting sections

## Production Checklist

- [ ] Policies defined for all sensitive tables
- [ ] RLS enabled on all tables
- [ ] Tested with real user data
- [ ] Performance verified (no slow subqueries)
- [ ] Error handling in place
- [ ] Migration files in git
- [ ] Helper functions documented
- [ ] Audit logging in place

## Support

Run tests:
```bash
bun scripts/test-rls.ts user123 engineering
```

Check policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

Debug JWT:
```typescript
const decoded = jwt.decode(generateSupabaseJWT('user123', 'eng'));
console.log(decoded); // Verify payload
```
