# RLS Configuration Quick Start

## 5-Minute Setup

### 1. Add Department to JWT

**File**: `lib/auth/supabase-jwt.ts`

```typescript
// Change function signature
export function generateSupabaseJWT(
  feishuUserId: string,
  feishuDepartment?: string,  // NEW
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
      feishu_department: feishuDepartment  // NEW
    },
    user_metadata: {
      feishu_user_id: feishuUserId,
      feishu_department: feishuDepartment,  // NEW
      provider: 'feishu'
    }
  };
  
  return jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

// Update helper function
export function createSupabaseClientWithUser(
  feishuUserId: string,
  feishuDepartment?: string  // NEW
): SupabaseClient | null {
  try {
    const jwtToken = generateSupabaseJWT(feishuUserId, feishuDepartment);
    // ... rest stays the same
  }
}
```

### 2. Create Migration

**File**: `supabase/migrations/004_department_rls.sql`

```sql
-- Helper function to get department from JWT
CREATE OR REPLACE FUNCTION get_user_department()
RETURNS TEXT AS $$
BEGIN
  RETURN (auth.jwt() ->> 'app_metadata')::jsonb ->> 'feishu_department'::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create department-aware RLS policy
-- Example for OKR data table
CREATE TABLE IF NOT EXISTS okr_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  title TEXT,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE okr_metrics ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users see OKRs from their department only
CREATE POLICY "Department-based OKR access"
ON okr_metrics
FOR SELECT
USING (department = get_user_department());

-- Policy 2: Users can insert OKRs to their department
CREATE POLICY "Users insert to own department"
ON okr_metrics
FOR INSERT
WITH CHECK (
  user_id = auth.uid() AND
  department = get_user_department()
);

-- Policy 3: Users can update own OKRs
CREATE POLICY "Users update own OKRs"
ON okr_metrics
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

Run migration:
```bash
bun scripts/run-migrations.ts
```

### 3. Update Your Handler

**File**: `lib/handle-app-mention.ts` (or wherever you handle events)

```typescript
import { extractFeishuUserId } from './auth/extract-feishu-user-id';
import { getFeishuUserDepartment } from './feishu-utils'; // NEW

export async function handleNewAppMention(data: FeishuMentionData) {
  const userId = extractFeishuUserId(data);
  
  // NEW: Get department from Feishu
  const department = await getFeishuUserDepartment(userId);
  
  // NEW: Pass to JWT
  const supabase = createSupabaseClientWithUser(userId, department);
  
  // Now queries are automatically filtered by department
  const { data: metrics } = await supabase
    .from('okr_metrics')
    .select('*'); // Only shows their department's OKRs
}
```

Add helper in `lib/feishu-utils.ts`:

```typescript
/**
 * Get user's department from Feishu
 * Requires 'contact:user.base' scope
 */
export async function getFeishuUserDepartment(
  userId: string
): Promise<string | undefined> {
  try {
    const resp = await client.contact.user.get({
      user_id: userId,
      user_id_type: 'open_id'
    });
    
    // Department IDs are returned, map to department names if needed
    return resp.data?.departments?.[0]?.id || undefined;
  } catch (error) {
    console.error(`Failed to get department for user ${userId}:`, error);
    return undefined;
  }
}
```

### 4. Test It

```bash
# Run via Supabase SQL editor in dashboard
-- Test 1: Check policies are active
SELECT * FROM pg_policies WHERE tablename = 'okr_metrics';

-- Test 2: Insert test data
INSERT INTO okr_metrics (user_id, department, title, metrics)
VALUES (
  'feishu-user-1', 
  'engineering', 
  'Q4 OKRs', 
  '{"goals": []}'::jsonb
);

-- Test 3: As admin, should see all
SELECT * FROM okr_metrics;

-- Test 4: As user (create client with JWT), should see filtered
-- Go to your TypeScript code to test
```

---

## Common Patterns

### Pattern: Role-Based (Admin/Manager/Viewer)

**Migration**:
```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'manager', 'viewer')),
  UNIQUE(user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Policy for sensitive data
CREATE POLICY "Role-based data access"
ON sensitive_data
FOR SELECT
USING (
  -- Admins see all
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  OR
  -- Managers see team's data
  (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'manager')
   AND user_id IN (SELECT report_user_id FROM manager_reports WHERE manager_id = auth.uid()))
  OR
  -- Viewers see only their own
  (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'viewer')
   AND user_id = auth.uid())
);
```

**Setup**:
```typescript
import { createSupabaseAdminClient } from './lib/auth/supabase-jwt';

async function assignRole(feishuUserId: string, role: string) {
  const supabase = createSupabaseAdminClient();
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users?.find(u => u.user_metadata?.feishu_user_id === feishuUserId);
  
  if (!user) throw new Error(`User not found: ${feishuUserId}`);
  
  await supabase
    .from('user_roles')
    .insert({ user_id: user.id, role });
}

// Usage
await assignRole('user123', 'manager');
```

### Pattern: Organization/Team

**Migration**:
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, org_id)
);

CREATE TABLE org_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  content JSONB
);

ALTER TABLE org_data ENABLE ROW LEVEL SECURITY;

-- Users can only see org_data from their organizations
CREATE POLICY "Users see their org data"
ON org_data
FOR SELECT
USING (org_id IN (
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
));
```

### Pattern: Attribute-Based (ABAC)

**Migration**:
```sql
CREATE TABLE user_attributes (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  department TEXT,
  level TEXT, -- 'junior', 'senior', 'lead', 'manager'
  region TEXT
);

CREATE TABLE confidential_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_level TEXT, -- Minimum level to access
  required_region TEXT, -- NULL = any region
  content JSONB
);

ALTER TABLE confidential_data ENABLE ROW LEVEL SECURITY;

-- Complex ABAC policy
CREATE POLICY "Attribute-based access"
ON confidential_data
FOR SELECT
USING (
  -- Level check
  (SELECT level FROM user_attributes WHERE user_id = auth.uid())::text 
  IN ('manager', 'lead', 'senior') AND
  -- Region check
  (required_region IS NULL OR
   (SELECT region FROM user_attributes WHERE user_id = auth.uid()) = required_region)
);
```

---

## Debugging

### Check Active Policies

```sql
-- List all RLS policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

-- Check specific table
SELECT * FROM pg_policies WHERE tablename = 'okr_metrics';

-- Verify RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename IN ('okr_metrics', 'agent_working_memory');
```

### Test JWT Contents

```typescript
import jwt from 'jsonwebtoken';

const token = generateSupabaseJWT('user123', 'engineering');
const decoded = jwt.decode(token) as any;

console.log('JWT payload:', JSON.stringify(decoded, null, 2));
// Should show: app_metadata.feishu_department = 'engineering'
```

### Dry Run Query

```typescript
// Create client as admin (bypasses RLS)
const admin = createSupabaseAdminClient();
const { data: allRows } = await admin
  .from('okr_metrics')
  .select('department, count(*)');
  
console.log('Total rows:', allRows); // Shows all departments

// Create client as user (applies RLS)
const user = createSupabaseClientWithUser('user123', 'engineering');
const { data: userRows } = await user
  .from('okr_metrics')
  .select('*');
  
console.log('User sees:', userRows?.length, 'rows'); // Shows only engineering
```

---

## Production Checklist

- [ ] All policies have `SECURITY DEFINER` functions
- [ ] Policies fail-secure (deny by default)
- [ ] Helper functions are tested
- [ ] RLS is enabled on all sensitive tables
- [ ] Indexes added for `EXISTS` subqueries
- [ ] Migration files are in version control
- [ ] Tested with real user data
- [ ] Performance tested (policies are fast enough)
- [ ] Error handling works (user sees auth error, not data error)

---

## See Also

- Full guide: `docs/CUSTOM_RLS_GUIDE.md`
- Your current setup: `supabase/migrations/002_*.sql`
- JWT generation: `lib/auth/supabase-jwt.ts`
- Feishu user mapping: `lib/auth/feishu-supabase-auth.ts`
