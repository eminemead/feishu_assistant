# RLS Architecture Reference

Visual guide to how RLS works in your Feishu assistant.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FEISHU EVENT                             │
│  (User sends message in Feishu chat)                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              EXTRACT USER CONTEXT                               │
│  const userId = extractFeishuUserId(message, data)             │
│  const dept = await getFeishuUserDepartment(userId)            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│           GENERATE JWT WITH CONTEXT                             │
│  const jwt = generateSupabaseJWT(userId, dept)                 │
│                                                                 │
│  JWT Payload:                                                   │
│  {                                                               │
│    sub: "user123" (← becomes auth.uid())                       │
│    app_metadata: {                                              │
│      feishu_department: "engineering"                           │
│    }                                                             │
│  }                                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│         CREATE AUTHENTICATED CLIENT                             │
│  const supabase = createSupabaseClientWithUser(userId, dept)   │
│                                                                 │
│  Client headers:                                                │
│  Authorization: "Bearer {jwt_token}"                            │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│            EXECUTE QUERY (WITH RLS)                             │
│  const { data } = await supabase                                │
│    .from('okr_documents')                                       │
│    .select('*')                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│        RLS POLICY EVALUATION (PostgreSQL)                       │
│                                                                 │
│  SELECT * FROM okr_documents                                    │
│  WHERE department = get_user_department()                       │
│        ^                                                         │
│        └─ Applies USING clause from policy                      │
│                                                                 │
│  IF user_id = 'engineering' THEN                               │
│    ✅ RETURN rows where department = 'engineering'              │
│  ELSE                                                            │
│    ❌ DENY access (no rows returned)                            │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│               RETURN FILTERED RESULTS                           │
│  data = [{                                                       │
│    id: "...",                                                    │
│    department: "engineering",  ← Only engineering rows          │
│    title: "Q4 OKRs",                                             │
│    ...                                                           │
│  }]                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## RLS Policy Types

### 1. User Isolation (Current)

```sql
CREATE POLICY "Users access own data"
ON agent_working_memory
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

Effect: user_123 → sees only rows where user_id = 'user_123'
```

### 2. Department-Based

```sql
CREATE POLICY "Department access"
ON okr_documents
FOR SELECT
USING (department = get_user_department());

Effect: user_123 (dept=eng) → sees only rows where dept = 'engineering'
```

### 3. Hierarchical (Manager sees team)

```sql
CREATE POLICY "Manager team access"
ON reports
FOR SELECT
USING (
  user_id = auth.uid() OR
  user_id IN (
    SELECT report_user_id FROM team_members 
    WHERE manager_user_id = auth.uid()
  )
);

Effect: manager_123 → sees own rows + all direct report rows
```

### 4. Role-Based

```sql
CREATE POLICY "Role-based access"
ON budget_data
FOR SELECT
USING (
  user_has_role('admin') OR
  (user_has_role('manager') AND dept matches)
);

Effect: depends on user's role assignment
```

### 5. Attribute-Based (ABAC)

```sql
CREATE POLICY "Complex ABAC"
ON sensitive_data
FOR SELECT
USING (
  level_check() AND
  department_check() AND
  region_check()
);

Effect: access based on multiple user attributes
```

## Data Flow with RLS

### Scenario: Department Isolation

```
Feishu Event arrives
├─ User: alice@engineering
├─ Dept: engineering
└─ Message: "Show OKRs"

▼

Generate JWT
├─ sub: alice_id
└─ app_metadata.feishu_department: "engineering"

▼

Query: SELECT * FROM okr_documents

▼

PostgreSQL RLS Evaluation
├─ Policy: WHERE department = get_user_department()
├─ get_user_department() → "engineering" (from JWT)
├─ Filter: WHERE department = 'engineering'
└─ Result: Only engineering OKRs

▼

Response
├─ ✅ Alice sees: Q4 Engineering OKRs
└─ ✅ Alice can't access: Sales OKRs, Product OKRs
```

### Scenario: Manager Hierarchy

```
Feishu Event arrives
├─ User: bob@manager
└─ Message: "Show team reports"

▼

Generate JWT
├─ sub: bob_id
└─ app_metadata: { role: "manager" }

▼

Query: SELECT * FROM reports

▼

PostgreSQL RLS Evaluation
├─ Policy: 
│  WHERE user_id = auth.uid() OR
│        user_id IN (SELECT report_user_id FROM team_members 
│                   WHERE manager_user_id = auth.uid())
├─ Condition 1: user_id = 'bob_id' (own reports)
├─ Condition 2: Check team_members table for bob's reports
└─ Result: Own reports + team member reports

▼

Response
├─ ✅ Bob sees: Own reports + alice's + charlie's reports
└─ ✅ Bob can't access: Other manager's reports
```

## RLS vs Application Logic

### Application-Level (Less Secure)

```typescript
// ❌ BAD: Trust application to filter
const allData = await supabaseAdmin.from('table').select('*');
const filtered = allData.filter(row => row.department === userDept);
// Problem: If code has bug, user sees all data!
```

### RLS-Level (More Secure)

```typescript
// ✅ GOOD: PostgreSQL enforces filtering
const supabase = createSupabaseClientWithUser(userId, dept);
const filtered = await supabase.from('table').select('*');
// Problem: Database itself enforces it - no way around it!
```

## Performance Considerations

### Good RLS Performance

```sql
-- ✅ Direct column comparison (FAST)
CREATE POLICY "Direct match"
ON table
FOR SELECT
USING (department = get_user_department());

-- Execution: Uses index, O(1) lookup
```

### Bad RLS Performance

```sql
-- ❌ Subquery without index (SLOW)
CREATE POLICY "Subquery"
ON table
FOR SELECT
USING (user_id IN (
  SELECT user_id FROM big_table 
  WHERE complex_condition = true
));

-- Execution: Full table scan for every row!
-- Fix: Add index on big_table(user_id)
```

## Testing Matrix

```
┌────────────┬──────────────────┬──────────────────┐
│ User Role  │ Query Result     │ Expected         │
├────────────┼──────────────────┼──────────────────┤
│ alice      │ 5 rows (eng)     │ ✅ Correct       │
│            │                  │                  │
│ bob        │ 3 rows (sales)   │ ✅ Correct       │
│            │                  │                  │
│ manager    │ 10 rows (team)   │ ✅ Correct       │
│            │                  │                  │
│ viewer     │ 0 rows           │ ✅ Correct       │
│            │ (no access)      │ (deny-secure)    │
└────────────┴──────────────────┴──────────────────┘
```

## Security Layers

```
┌─────────────────────────────────────────────┐
│         Application Layer                   │
│  • Validate input                            │
│  • Check permissions in code                │
│  • Log user actions                         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Supabase JWT Layer                  │
│  • User ID in JWT                           │
│  • Department/role in JWT                   │
│  • Expiration time                          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         PostgreSQL RLS Layer                │
│  • Policy enforcement (HARD LIMIT)          │
│  • Can't be bypassed from application       │
│  • Even admin can't accidentally leak data  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Physical Database                   │
│  • Encrypted at rest                        │
│  • Encrypted in transit                     │
│  • Backups encrypted                        │
└─────────────────────────────────────────────┘

Defense in Depth: Each layer prevents leaks
```

## Decision Tree: Which Pattern?

```
START
  │
  ├─ Is access based on user_id only?
  │  └─ YES → User Isolation (current setup)
  │
  ├─ Do users see data from their department?
  │  └─ YES → Department-Based
  │
  ├─ Do managers see team data?
  │  └─ YES → Hierarchical (Manager/Team)
  │
  ├─ Are there fixed roles (admin/manager/viewer)?
  │  └─ YES → Role-Based
  │
  ├─ Is access based on multiple attributes?
  │  └─ YES → Attribute-Based (ABAC)
  │
  └─ Need combination of above?
     └─ YES → Hybrid
```

## Implementation Steps

```
1. PLAN
   ├─ Identify data sensitivity levels
   ├─ Map users to permissions
   └─ Choose RLS pattern

2. CODE
   ├─ Create migration SQL
   ├─ Add helper functions
   ├─ Update JWT generation (if needed)
   └─ Test with real data

3. DEPLOY
   ├─ Run migration
   ├─ Verify policies exist
   ├─ Check performance
   └─ Monitor for issues

4. MONITOR
   ├─ Watch for RLS violations
   ├─ Track query performance
   ├─ Audit access patterns
   └─ Update policies as needed
```

## See Also

- Detailed patterns: `RLS_EXAMPLES.md`
- Quick start: `RLS_QUICKSTART.md`  
- Full guide: `CUSTOM_RLS_GUIDE.md`
