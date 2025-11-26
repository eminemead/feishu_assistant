# Customized RLS Configuration Guide

## Overview

Your Supabase setup already has basic RLS in place (`user_id = auth.uid()`). This guide shows how to extend it with custom policies for department-based access, role-based access, and other scenarios.

---

## Current Setup

Your system uses:

1. **JWT with Feishu User ID**: `generateSupabaseJWT()` sets `sub: feishuUserId`
2. **Basic RLS**: `user_id = auth.uid()` filters rows by authenticated user
3. **Data Permissions Table**: `user_data_permissions` stores `allowed_accounts`, `allowed_departments`, `allowed_regions`

```sql
-- Current basic policy
CREATE POLICY "Users can access their own working memory"
ON agent_working_memory
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

---

## Customization Patterns

### Pattern 1: Department-Based Access

**Goal**: Users can only see data from their assigned departments.

#### Step 1: Extend JWT with Department

Modify `supabase-jwt.ts`:

```typescript
export function generateSupabaseJWT(
  feishuUserId: string,
  feishuDepartment?: string,  // Add this
  expiresInSeconds: number = 60 * 60
): string {
  const payload = {
    aud: 'authenticated',
    exp: now + expiresInSeconds,
    iat: now,
    iss: SUPABASE_URL,
    sub: feishuUserId,
    email: `${feishuUserId}@feishu.local`,
    role: 'authenticated',
    app_metadata: {
      provider: 'feishu',
      feishu_user_id: feishuUserId,
      feishu_department: feishuDepartment  // Add this
    },
    user_metadata: {
      feishu_user_id: feishuUserId,
      feishu_department: feishuDepartment,  // Add this
      provider: 'feishu'
    }
  };
  
  return jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}
```

#### Step 2: Create RLS Policy

Create new migration: `supabase/migrations/004_department_rls.sql`

```sql
-- Add department column to data tables (if needed)
ALTER TABLE okr_metrics ADD COLUMN IF NOT EXISTS department TEXT;

-- Create helper function to get user's department from JWT
CREATE OR REPLACE FUNCTION get_user_department()
RETURNS TEXT AS $$
BEGIN
  RETURN (auth.jwt() ->> 'app_metadata')::jsonb -> 'feishu_department'
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can only see data from their department
CREATE POLICY "Users can access their department data"
ON okr_metrics
FOR SELECT
USING (department = get_user_department());

-- Policy: Users can only insert data to their department
CREATE POLICY "Users can insert into their department"
ON okr_metrics
FOR INSERT
WITH CHECK (department = get_user_department());
```

#### Step 3: Use in Application

```typescript
// When extracting Feishu user, also get department
const userId = extractFeishuUserId(message, data);
const department = await getFeishuUserDepartment(userId); // From Feishu API

const jwt = generateSupabaseJWT(userId, department);
const supabase = createSupabaseClientWithUser(userId, department);

// Now queries are automatically filtered by department
const { data } = await supabase
  .from('okr_metrics')
  .select('*'); // Only returns rows where department matches user's department
```

---

### Pattern 2: Role-Based Access Control (RBAC)

**Goal**: Different roles (manager, viewer, editor) have different permissions.

#### Step 1: Create Roles Table

Migration: `supabase/migrations/005_roles_rls.sql`

```sql
-- Roles table
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'viewer', 'editor')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own roles
CREATE POLICY "Users can access their own roles"
ON user_roles
FOR ALL
USING (user_id = auth.uid());

-- Helper function to check if user has a role
CREATE OR REPLACE FUNCTION user_has_role(p_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get all user roles
CREATE OR REPLACE FUNCTION get_user_roles()
RETURNS TEXT[] AS $$
BEGIN
  RETURN COALESCE(
    ARRAY_AGG(role),
    ARRAY[]::TEXT[]
  )
  FROM user_roles
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Step 2: Role-Based Policies

```sql
-- Table with role-based access
CREATE TABLE okr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE okr_documents ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can see everything
CREATE POLICY "Admins can see all documents"
ON okr_documents
FOR SELECT
USING (user_has_role('admin'));

-- Policy: Managers can see their own + their reports' documents
CREATE POLICY "Managers can see team documents"
ON okr_documents
FOR SELECT
USING (
  user_has_role('manager') AND user_id IN (
    SELECT report_user_id FROM manager_reports WHERE manager_user_id = auth.uid()
  )
);

-- Policy: Viewers can only see their own documents
CREATE POLICY "Viewers can see own documents"
ON okr_documents
FOR SELECT
USING (
  user_has_role('viewer') AND user_id = auth.uid()
);

-- Policy: Editors can edit their own documents
CREATE POLICY "Editors can update own documents"
ON okr_documents
FOR UPDATE
USING (user_id = auth.uid() AND user_has_role('editor'))
WITH CHECK (user_id = auth.uid() AND user_has_role('editor'));
```

#### Step 3: Assign Roles to Users

Script: `scripts/assign-user-role.ts`

```typescript
import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';

export async function assignUserRole(feishuUserId: string, role: 'admin' | 'manager' | 'viewer' | 'editor') {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error('Supabase not configured');

  // First, get Supabase user by Feishu ID
  const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();
  const supabaseUser = users?.find(u => u.user_metadata?.feishu_user_id === feishuUserId);
  
  if (!supabaseUser) {
    throw new Error(`User not found: ${feishuUserId}`);
  }

  // Insert role
  const { data, error } = await supabase
    .from('user_roles')
    .insert([
      {
        user_id: supabaseUser.id,
        role: role
      }
    ]);

  if (error) throw error;
  console.log(`✅ Assigned role ${role} to user ${feishuUserId}`);
}

// Usage from CLI
const feishuUserId = process.argv[2];
const role = process.argv[3] as any;
await assignUserRole(feishuUserId, role);
```

---

### Pattern 3: Organization/Team Access

**Goal**: Users can only access data from their organization or team.

#### Step 1: Create Organizations Table

Migration: `supabase/migrations/006_organizations_rls.sql`

```sql
-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Organization membership
CREATE TABLE IF NOT EXISTS user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see orgs they're members of
CREATE POLICY "Users can see their organizations"
ON organizations
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM user_organizations
  WHERE org_id = id AND user_id = auth.uid()
));

-- Policy: Users can only see their own memberships
CREATE POLICY "Users can see their memberships"
ON user_organizations
FOR ALL
USING (user_id = auth.uid());

-- Data table with organization context
CREATE TABLE okr_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE okr_data ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see data from their orgs
CREATE POLICY "Users can see org data"
ON okr_data
FOR ALL
USING (org_id IN (
  SELECT org_id FROM user_organizations WHERE user_id = auth.uid()
));

-- Helper function to get user's orgs
CREATE OR REPLACE FUNCTION get_user_organizations()
RETURNS UUID[] AS $$
BEGIN
  RETURN COALESCE(
    ARRAY_AGG(org_id),
    ARRAY[]::UUID[]
  )
  FROM user_organizations
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Pattern 4: Attribute-Based Access Control (ABAC)

**Goal**: Access based on user attributes (department, level, region, etc.).

#### Step 1: Create Attributes Table

Migration: `supabase/migrations/007_attributes_rls.sql`

```sql
-- User attributes
CREATE TABLE user_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT,
  level TEXT CHECK (level IN ('junior', 'senior', 'lead', 'manager')),
  region TEXT,
  team TEXT,
  cost_center TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own attributes"
ON user_attributes
FOR ALL
USING (user_id = auth.uid());

-- Helper functions to get user attributes
CREATE OR REPLACE FUNCTION get_user_attribute(p_attr TEXT)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  CASE p_attr
    WHEN 'department' THEN
      SELECT department INTO v_value FROM user_attributes WHERE user_id = auth.uid();
    WHEN 'level' THEN
      SELECT level INTO v_value FROM user_attributes WHERE user_id = auth.uid();
    WHEN 'region' THEN
      SELECT region INTO v_value FROM user_attributes WHERE user_id = auth.uid();
    WHEN 'team' THEN
      SELECT team INTO v_value FROM user_attributes WHERE user_id = auth.uid();
  END CASE;
  RETURN v_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sensitive data table with attribute-based access
CREATE TABLE sensitive_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  min_level TEXT, -- 'junior' | 'senior' | 'lead' | 'manager'
  required_department TEXT,
  required_region TEXT,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sensitive_data ENABLE ROW LEVEL SECURITY;

-- Complex ABAC policy
CREATE POLICY "Access based on attributes"
ON sensitive_data
FOR SELECT
USING (
  -- User must own it OR
  user_id = auth.uid() OR
  -- User level must be sufficient
  (CASE get_user_attribute('level')
    WHEN 'junior' THEN min_level = 'junior'
    WHEN 'senior' THEN min_level IN ('junior', 'senior')
    WHEN 'lead' THEN min_level IN ('junior', 'senior', 'lead')
    WHEN 'manager' THEN TRUE
    ELSE FALSE
  END) AND
  -- Department must match (if specified)
  (required_department IS NULL OR get_user_attribute('department') = required_department) AND
  -- Region must match (if specified)
  (required_region IS NULL OR get_user_attribute('region') = required_region)
);
```

---

## Testing Your RLS Policies

### 1. Enable policy logging

```sql
-- View which policies are being applied
CREATE OR REPLACE FUNCTION log_rls_access()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, created_at)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_access AFTER SELECT ON agent_working_memory
  FOR EACH ROW EXECUTE FUNCTION log_rls_access();
```

### 2. Test with admin client

```typescript
import { createSupabaseAdminClient, createSupabaseClientWithUser } from './lib/auth/supabase-jwt';

async function testRLS(feishuUserId: string) {
  // Admin view (bypasses RLS)
  const admin = createSupabaseAdminClient();
  const { data: adminData } = await admin
    .from('agent_working_memory')
    .select('*');
  console.log('Admin sees:', adminData?.length, 'rows');

  // User view (RLS applied)
  const user = createSupabaseClientWithUser(feishuUserId);
  const { data: userData } = await user
    .from('agent_working_memory')
    .select('*');
  console.log('User sees:', userData?.length, 'rows');
}
```

### 3. Script to verify policies

Script: `scripts/verify-rls.ts`

```typescript
import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';

export async function verifyRLSPolicies() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error('Supabase not configured');

  // Get all policies
  const { data, error } = await supabase.rpc('get_rls_policies');
  
  if (error) {
    console.error('Error fetching RLS policies:', error);
    return;
  }

  console.log('RLS Policies:');
  data?.forEach((policy: any) => {
    console.log(`  ${policy.table}: ${policy.policy_name}`);
  });
}

// Run with: bun scripts/verify-rls.ts
```

---

## Best Practices

### ✅ Do

- **Fail-secure**: Deny access by default, grant explicitly
- **Use helper functions**: Makes policies readable and maintainable
- **Test policies**: Always test with real data before deploying
- **Index junction tables**: For `EXISTS` subqueries in policies
- **Use SECURITY DEFINER**: Functions that check permissions should be SECURITY DEFINER
- **Document policies**: Add comments explaining the access logic

### ❌ Don't

- **Use OR without care**: `OR` can accidentally grant access
- **Forget indexes**: Subqueries in policies are slow without indexes
- **Store secrets in JWT**: Only store IDs and roles, get sensitive data from tables
- **Bypass RLS in app code**: Always use `createSupabaseClientWithUser`, not admin client
- **Use `auth.jwt()` directly**: Prefer helper functions for maintainability

---

## Example: Multi-Tenant OKR System

Complete setup for department-based OKR access:

```sql
-- 1. Extend user attributes
ALTER TABLE user_attributes ADD COLUMN IF NOT EXISTS okr_scope TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. OKR table
CREATE TABLE okrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE okrs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: Users see OKRs from their authorized departments
CREATE POLICY "Users can access authorized department OKRs"
ON okrs
FOR SELECT
USING (
  department = ANY(
    COALESCE(
      (SELECT okr_scope FROM user_attributes WHERE user_id = auth.uid()),
      ARRAY[]::TEXT[]
    )
  )
);

-- 4. Users can edit their own OKRs
CREATE POLICY "Users can edit own OKRs"
ON okrs
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 5. Insert policy
CREATE POLICY "Users can create OKRs in authorized departments"
ON okrs
FOR INSERT
WITH CHECK (
  department = ANY(
    COALESCE(
      (SELECT okr_scope FROM user_attributes WHERE user_id = auth.uid()),
      ARRAY[]::TEXT[]
    )
  )
);
```

---

## Debugging RLS Issues

### Issue: "You don't have permissions to access this table"

```typescript
// Check 1: Is RLS enabled?
-- Run in Supabase SQL editor
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'your_table';

// Check 2: Are policies defined?
-- Run in Supabase SQL editor
SELECT * FROM pg_policies 
WHERE tablename = 'your_table';

// Check 3: Is JWT correct?
const jwt = generateSupabaseJWT(userId);
console.log('JWT payload:', jwt.split('.')[1]); // Middle part is the payload
// Decode base64 to verify it contains your user ID
```

### Issue: Users see each other's data

```typescript
// Problem: USING clause is wrong
CREATE POLICY "bad_policy" ON table_name
FOR SELECT
USING (true); -- ❌ This grants access to everyone!

// Solution: Always check user_id
CREATE POLICY "good_policy" ON table_name
FOR SELECT
USING (user_id = auth.uid()); -- ✅ This restricts to user only
```

### Issue: Inserts fail even though user should have access

```typescript
// Problem: WITH CHECK clause is missing
CREATE POLICY "bad_insert" ON table_name
FOR INSERT
WITH CHECK (user_id = auth.uid());
// ❌ This works, but...

// Solution: Both USING and WITH CHECK should match
CREATE POLICY "good_insert" ON table_name
FOR INSERT
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid()); // ✅ Explicit
```

---

## See Also

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- Current implementation: `lib/auth/user-data-scope.ts`, `supabase/migrations/003_*.sql`
