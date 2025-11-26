# RLS Examples for Your Feishu Assistant

Real-world examples you can copy-paste for common scenarios.

---

## Example 1: Department-Based OKR Access

**Use Case**: Each department has its own OKRs. Users can only see/edit OKRs from their department.

### Migration

**File**: `supabase/migrations/004_department_okrs.sql`

```sql
-- Department OKR table
CREATE TABLE okr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB DEFAULT '{}'::JSONB,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_okr_documents_department ON okr_documents(department);
CREATE INDEX idx_okr_documents_user_id ON okr_documents(user_id);

ALTER TABLE okr_documents ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's department from JWT
CREATE OR REPLACE FUNCTION get_user_department()
RETURNS TEXT AS $$
BEGIN
  RETURN (auth.jwt() ->> 'app_metadata')::jsonb ->> 'feishu_department'::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy 1: Users can view OKRs from their department
CREATE POLICY "View department OKRs"
ON okr_documents
FOR SELECT
USING (department = get_user_department());

-- Policy 2: Users can insert OKRs to their department
CREATE POLICY "Insert department OKRs"
ON okr_documents
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  department = get_user_department()
);

-- Policy 3: Users can update/delete their own OKRs
CREATE POLICY "Update own OKRs"
ON okr_documents
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own OKRs"
ON okr_documents
FOR DELETE
USING (user_id = auth.uid());
```

### Usage

```typescript
// In your handler
import { createSupabaseClientWithUser } from './lib/auth/supabase-jwt';
import { getFeishuUserDepartment } from './lib/feishu-utils';

export async function handleOKRQuery(feishuUserId: string) {
  // Get user's department
  const department = await getFeishuUserDepartment(feishuUserId);
  
  // Create client with department context
  const supabase = createSupabaseClientWithUser(feishuUserId, department);
  
  // Query only sees current user's department OKRs
  const { data, error } = await supabase
    .from('okr_documents')
    .select('*')
    .eq('status', 'published');
  
  // Returns only rows where department = user's department
  return data;
}

// Insert new OKR
async function createOKR(feishuUserId: string, title: string, content: any) {
  const department = await getFeishuUserDepartment(feishuUserId);
  const supabase = createSupabaseClientWithUser(feishuUserId, department);
  
  // RLS automatically validates department matches
  const { data, error } = await supabase
    .from('okr_documents')
    .insert({
      user_id: feishuUserId,
      department, // Policy will verify this matches user's department
      title,
      content
    });
  
  if (error) {
    console.error('RLS violation or other error:', error);
  }
}
```

---

## Example 2: Manager/Team Access

**Use Case**: Managers can see/edit their team's data. Team members can only see their own.

### Migration

**File**: `supabase/migrations/005_manager_team_access.sql`

```sql
-- Team members table
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, manager_user_id)
);

CREATE INDEX idx_team_members_manager ON team_members(manager_user_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

-- Reports/documents that managers can access team's data
CREATE TABLE team_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_team_reports_user ON team_reports(user_id);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own team membership
CREATE POLICY "View own team"
ON team_members
FOR SELECT
USING (user_id = auth.uid() OR manager_user_id = auth.uid());

-- Policy: Managers see their team's reports OR users see their own
CREATE POLICY "View reports"
ON team_reports
FOR SELECT
USING (
  -- See own reports
  user_id = auth.uid() OR
  -- Manager sees team's reports
  user_id IN (
    SELECT user_id FROM team_members WHERE manager_user_id = auth.uid()
  )
);

-- Policy: Only write to own reports
CREATE POLICY "Update own reports"
ON team_reports
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### Setup Script

```typescript
// scripts/assign-manager.ts
import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';

async function assignManager(
  feishuUserId: string,
  managerFeishuUserId: string
) {
  const supabase = createSupabaseAdminClient();
  const { data: { users } } = await supabase.auth.admin.listUsers();
  
  const user = users?.find(u => u.user_metadata?.feishu_user_id === feishuUserId);
  const manager = users?.find(u => u.user_metadata?.feishu_user_id === managerFeishuUserId);
  
  if (!user || !manager) throw new Error('User not found');
  
  await supabase.from('team_members').insert({
    user_id: user.id,
    manager_user_id: manager.id
  });
}

// Usage: bun scripts/assign-manager.ts user123 manager456
const feishuUserId = process.argv[2];
const managerFeishuUserId = process.argv[3];
await assignManager(feishuUserId, managerFeishuUserId);
```

### Usage

```typescript
// Manager can see team's reports
async function getTeamReports(managerFeishuUserId: string) {
  const supabase = createSupabaseClientWithUser(managerFeishuUserId);
  
  // RLS policy allows manager to see all team member reports
  const { data } = await supabase
    .from('team_reports')
    .select('*');
  
  // Shows: own reports + all reports from team members
  return data;
}

// Team member sees only their own
async function getMyReports(feishuUserId: string) {
  const supabase = createSupabaseClientWithUser(feishuUserId);
  
  // RLS policy restricts to own reports
  const { data } = await supabase
    .from('team_reports')
    .select('*');
  
  // Shows: only own reports
  return data;
}
```

---

## Example 3: Role-Based Access (Admin/Manager/Viewer)

**Use Case**: Different roles have different access levels to sensitive data.

### Migration

**File**: `supabase/migrations/006_role_based_access.sql`

```sql
-- User roles
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);

-- Sensitive data with role-based access
CREATE TABLE budget_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_budget_data_department ON budget_data(department);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_data ENABLE ROW LEVEL SECURITY;

-- Users can see their own roles
CREATE POLICY "View own roles"
ON user_roles
FOR SELECT
USING (user_id = auth.uid());

-- Helper function to check role
CREATE OR REPLACE FUNCTION user_has_role(p_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complex role-based policy
CREATE POLICY "Role-based budget access"
ON budget_data
FOR SELECT
USING (
  -- Admins see everything
  user_has_role('admin') OR
  -- Managers see their department
  (user_has_role('manager') AND department = (
    SELECT department FROM user_attributes WHERE user_id = auth.uid()
  )) OR
  -- Viewers see nothing (fail-secure)
  FALSE
);
```

### Setup

```typescript
// scripts/assign-role.ts
import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';

async function assignRole(
  feishuUserId: string,
  role: 'admin' | 'manager' | 'viewer'
) {
  const supabase = createSupabaseAdminClient();
  const { data: { users } } = await supabase.auth.admin.listUsers();
  
  const user = users?.find(u => u.user_metadata?.feishu_user_id === feishuUserId);
  if (!user) throw new Error(`User not found: ${feishuUserId}`);
  
  const { error } = await supabase
    .from('user_roles')
    .insert({ user_id: user.id, role });
  
  if (error) console.error('Role assignment error:', error);
  else console.log(`✅ Assigned ${role} to ${feishuUserId}`);
}

// Run: bun scripts/assign-role.ts user123 admin
const userId = process.argv[2];
const role = process.argv[3] as any;
await assignRole(userId, role);
```

### Usage

```typescript
async function getBudgetData(feishuUserId: string) {
  const supabase = createSupabaseClientWithUser(feishuUserId);
  
  const { data, error } = await supabase
    .from('budget_data')
    .select('*');
  
  // Returns:
  // - Admin: all rows
  // - Manager: only their department's rows
  // - Viewer: no rows (empty result)
  return data;
}
```

---

## Example 4: Attribute-Based Access Control (ABAC)

**Use Case**: Access based on multiple user attributes (department, level, region).

### Migration

**File**: `supabase/migrations/007_attribute_based_access.sql`

```sql
-- User attributes
CREATE TABLE user_attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT,
  level TEXT CHECK (level IN ('junior', 'senior', 'lead', 'manager')),
  region TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_attributes_user ON user_attributes(user_id);

-- Confidential documents with access requirements
CREATE TABLE confidential_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  min_level TEXT CHECK (min_level IN ('junior', 'senior', 'lead', 'manager')),
  required_region TEXT, -- NULL means all regions
  required_department TEXT, -- NULL means all departments
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidential_docs ENABLE ROW LEVEL SECURITY;

-- Users see own attributes only
CREATE POLICY "View own attributes"
ON user_attributes
FOR SELECT
USING (user_id = auth.uid());

-- Helper to get user attribute
CREATE OR REPLACE FUNCTION get_user_attribute(p_attr TEXT)
RETURNS TEXT AS $$
BEGIN
  CASE p_attr
    WHEN 'department' THEN
      RETURN (SELECT department FROM user_attributes WHERE user_id = auth.uid());
    WHEN 'level' THEN
      RETURN (SELECT level FROM user_attributes WHERE user_id = auth.uid());
    WHEN 'region' THEN
      RETURN (SELECT region FROM user_attributes WHERE user_id = auth.uid());
  END CASE;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complex ABAC policy
CREATE POLICY "Attribute-based doc access"
ON confidential_docs
FOR SELECT
USING (
  -- Level check (hierarchy: junior < senior < lead < manager)
  (CASE get_user_attribute('level')
    WHEN 'junior' THEN min_level = 'junior'
    WHEN 'senior' THEN min_level IN ('junior', 'senior')
    WHEN 'lead' THEN min_level IN ('junior', 'senior', 'lead')
    WHEN 'manager' THEN TRUE
    ELSE FALSE
  END) AND
  -- Department check (NULL = all departments)
  (required_department IS NULL OR get_user_attribute('department') = required_department) AND
  -- Region check (NULL = all regions)
  (required_region IS NULL OR get_user_attribute('region') = required_region)
);
```

### Setup

```typescript
// scripts/setup-user-attributes.ts
import { createSupabaseAdminClient } from '../lib/auth/supabase-jwt';

async function setupUserAttributes(
  feishuUserId: string,
  attributes: {
    department?: string;
    level?: 'junior' | 'senior' | 'lead' | 'manager';
    region?: string;
  }
) {
  const supabase = createSupabaseAdminClient();
  const { data: { users } } = await supabase.auth.admin.listUsers();
  
  const user = users?.find(u => u.user_metadata?.feishu_user_id === feishuUserId);
  if (!user) throw new Error(`User not found: ${feishuUserId}`);
  
  await supabase
    .from('user_attributes')
    .upsert({
      user_id: user.id,
      ...attributes
    });
  
  console.log(`✅ Updated attributes for ${feishuUserId}`);
}

// Usage
await setupUserAttributes('user123', {
  department: 'engineering',
  level: 'senior',
  region: 'asia'
});
```

### Usage

```typescript
async function getConfidentialDocs(feishuUserId: string) {
  const supabase = createSupabaseClientWithUser(feishuUserId);
  
  const { data } = await supabase
    .from('confidential_docs')
    .select('*');
  
  // Returns only docs where:
  // - User's level >= min_level
  // - User's region matches (if specified)
  // - User's department matches (if specified)
  return data;
}
```

---

## Example 5: Custom Hybrid Approach

**Use Case**: Combine multiple RLS patterns for complex business logic.

### Migration

```sql
-- Combines department + manager + roles
CREATE TABLE shared_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  department TEXT NOT NULL,
  owner_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES shared_projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level TEXT CHECK (access_level IN ('view', 'edit', 'admin')),
  UNIQUE(project_id, user_id)
);

ALTER TABLE shared_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_access ENABLE ROW LEVEL SECURITY;

-- Complex policy: Owner + department members + explicitly shared users
CREATE POLICY "Hybrid project access"
ON shared_projects
FOR SELECT
USING (
  -- Owner has access
  owner_user_id = auth.uid() OR
  -- Department members have access
  department = get_user_department() OR
  -- Explicitly shared with user
  EXISTS (
    SELECT 1 FROM project_access
    WHERE project_id = id AND user_id = auth.uid()
  )
);
```

---

## Testing Your RLS

### Test Script

**File**: `scripts/test-rls.ts`

```typescript
import {
  createSupabaseAdminClient,
  createSupabaseClientWithUser
} from '../lib/auth/supabase-jwt';

async function testRLS(feishuUserId: string, department?: string) {
  console.log(`\n📋 Testing RLS for ${feishuUserId} (dept: ${department})`);
  
  // Admin view (bypass RLS)
  const admin = createSupabaseAdminClient();
  const { count: adminCount } = await admin
    .from('okr_documents')
    .select('*', { count: 'exact' });
  console.log(`  Admin sees: ${adminCount} rows`);
  
  // User view (RLS applied)
  const user = createSupabaseClientWithUser(feishuUserId, department);
  const { count: userCount } = await user
    .from('okr_documents')
    .select('*', { count: 'exact' });
  console.log(`  User sees: ${userCount} rows`);
  
  // List what user can see
  const { data: userRows } = await user
    .from('okr_documents')
    .select('id, department, title');
  console.log('  Content:', userRows);
}

// Run with: bun scripts/test-rls.ts userId department
const userId = process.argv[2] || 'test-user';
const dept = process.argv[3] || 'engineering';
await testRLS(userId, dept);
```

Run:
```bash
bun scripts/test-rls.ts user123 engineering
```

---

## Troubleshooting

### Policy not working?

```sql
-- Check policies exist
SELECT * FROM pg_policies WHERE tablename = 'your_table';

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename = 'your_table';

-- Check function syntax
SELECT * FROM information_schema.routines WHERE routine_name = 'get_user_department';
```

### JWT not working?

```typescript
// Decode and inspect JWT
import jwt from 'jsonwebtoken';

const token = generateSupabaseJWT('user123', 'engineering');
const decoded = jwt.decode(token) as any;

console.log(JSON.stringify(decoded, null, 2));
// Verify app_metadata.feishu_department is present
```

### Still seeing all rows?

```typescript
// Test with admin first to populate data
const admin = createSupabaseAdminClient();
await admin.from('okr_documents').insert({
  department: 'engineering',
  title: 'Test'
});

// Then query as user
const user = createSupabaseClientWithUser('user123', 'engineering');
const { data } = await user.from('okr_documents').select('*');
// Should see the row now
```

---

See also: `docs/CUSTOM_RLS_GUIDE.md` and `docs/RLS_QUICKSTART.md`
