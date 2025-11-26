# Supabase RLS Configuration Guide - Complete Index

Comprehensive guide to configuring custom Row Level Security (RLS) in your Feishu assistant.

## 📚 Documentation Files

### 1. **RLS_SUMMARY.md** - Start Here
**What**: High-level overview of RLS and how to extend it  
**Best for**: Understanding what RLS is and which pattern to choose  
**Length**: 2 min read  

Contents:
- Current baseline setup
- Available patterns (with complexity levels)
- Common mistakes
- Quick links to other docs

**👉 Start here if you're new to RLS.**

---

### 2. **RLS_QUICKSTART.md** - 5-Minute Setup
**What**: Step-by-step implementation guide for common patterns  
**Best for**: Getting RLS working quickly  
**Length**: 10 min read + 5 min setup  

Contents:
- Department-based access (most common)
- Role-based patterns (Admin/Manager/Viewer)
- Organization/Team access
- Attribute-based access
- Testing and debugging

**👉 Use this to implement your first RLS policy.**

---

### 3. **RLS_EXAMPLES.md** - Copy-Paste Code
**What**: Real-world working examples with complete SQL + TypeScript  
**Best for**: Copy-pasting patterns into your codebase  
**Length**: Reference document  

Contains:
1. **Department-Based OKRs** - Users see only their dept's data
2. **Manager/Team Access** - Managers see team reports
3. **Role-Based Budgets** - Admin/Manager/Viewer different access
4. **Attribute-Based (ABAC)** - Level + dept + region checks
5. **Hybrid Projects** - Combination of patterns

Each with:
- Complete SQL migration
- Setup scripts
- Usage examples
- Test cases

**👉 Copy examples directly into your migrations.**

---

### 4. **CUSTOM_RLS_GUIDE.md** - Deep Dive
**What**: Comprehensive reference covering all RLS concepts  
**Best for**: Understanding RLS deeply, troubleshooting  
**Length**: 30 min read  

Sections:
- Current setup overview
- 4 customization patterns explained
- Testing strategies
- Best practices & anti-patterns
- Debugging guide

**👉 Read this when you need deeper understanding.**

---

### 5. **RLS_ARCHITECTURE.md** - Visual Reference
**What**: ASCII diagrams and flow charts showing how RLS works  
**Best for**: Visual learners, understanding the complete flow  
**Length**: Reference document  

Shows:
- End-to-end data flow (Feishu event → RLS policy → results)
- JWT payload structure
- Policy types with examples
- Performance considerations
- Security layers
- Testing matrix
- Decision tree for choosing patterns

**👉 Use this to visualize how everything fits together.**

---

## 🎯 Quick Navigation by Use Case

### I want to...

**Understand what RLS is**
→ Start with `RLS_SUMMARY.md`

**Implement department-based access**
→ Use `RLS_QUICKSTART.md` (Pattern 1)

**Allow managers to see team data**
→ Use `RLS_EXAMPLES.md` (Example 2)

**Create role-based permissions (Admin/Manager/Viewer)**
→ Use `RLS_EXAMPLES.md` (Example 3)

**Implement attribute-based access (multiple conditions)**
→ Use `RLS_EXAMPLES.md` (Example 4)

**Debug why RLS isn't working**
→ Check `CUSTOM_RLS_GUIDE.md` (Debugging section)

**Understand the architecture**
→ Read `RLS_ARCHITECTURE.md`

---

## 🛠️ Implementation Path

### Step 1: Choose Your Pattern

```
What access control do you need?
├─ Users see only their own data
│  └─ You're already done (current setup)
│
├─ Users see data from their department
│  └─ Department-Based (RLS_QUICKSTART.md Pattern 1)
│
├─ Managers see team's data
│  └─ Manager/Team (RLS_EXAMPLES.md Example 2)
│
├─ Different roles have different access
│  └─ Role-Based (RLS_EXAMPLES.md Example 3)
│
├─ Access based on multiple attributes
│  └─ ABAC (RLS_EXAMPLES.md Example 4)
│
└─ Combination of above
   └─ Hybrid (RLS_EXAMPLES.md Example 5)
```

### Step 2: Read the Relevant Documentation

- **Quick setup**: RLS_QUICKSTART.md
- **Deep understanding**: CUSTOM_RLS_GUIDE.md
- **Copy-paste code**: RLS_EXAMPLES.md
- **Understand flow**: RLS_ARCHITECTURE.md

### Step 3: Implement

1. Create migration file: `supabase/migrations/00X_name.sql`
2. Copy SQL from documentation
3. Update TypeScript code if needed (usually in `lib/auth/supabase-jwt.ts`)
4. Run migration: `bun scripts/run-migrations.ts`
5. Test with: `bun scripts/test-rls.ts`

### Step 4: Test

```bash
# Test your RLS implementation
bun scripts/test-rls.ts user123 department

# Check if policies are in place
# (Run in Supabase SQL editor)
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

---

## 📋 Concepts Explained

### RLS (Row Level Security)
PostgreSQL feature that automatically filters rows based on the authenticated user.

### JWT (JSON Web Token)
Signed token containing user ID and metadata (department, role, etc.). Passed in every request's Authorization header.

### Policy
SQL rule that defines which rows a user can access. Example: `WHERE department = get_user_department()`

### auth.uid()
PostgreSQL function that returns the current user's ID from the JWT's `sub` field.

### SECURITY DEFINER
SQL function flag that means the function runs with special permissions and can't be exploited by users.

---

## 🔑 Key Files in Your Codebase

| File | Purpose |
|------|---------|
| `lib/auth/supabase-jwt.ts` | Generates JWT with user context |
| `lib/auth/feishu-supabase-auth.ts` | Maps Feishu users to Supabase |
| `lib/auth/user-data-scope.ts` | Gets user's allowed data access |
| `supabase/migrations/002_*.sql` | Current RLS policies |
| `supabase/migrations/003_*.sql` | User permissions table |

---

## ✅ Production Checklist

Before deploying RLS to production:

- [ ] Policies defined for all sensitive tables
- [ ] RLS enabled on all tables
- [ ] Tested with real user data
- [ ] Performance verified (no slow queries)
- [ ] Error handling in place
- [ ] Migration files in git
- [ ] Helper functions documented
- [ ] Audit logging configured
- [ ] Backup tested
- [ ] Rollback plan documented

---

## 🆘 Troubleshooting

### Policy not being applied?
```sql
-- Check 1: Is RLS enabled?
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'your_table';

-- Check 2: Are policies defined?
SELECT * FROM pg_policies WHERE tablename = 'your_table';
```

### JWT not working?
```typescript
// Decode and inspect JWT
import jwt from 'jsonwebtoken';
const token = generateSupabaseJWT('user123', 'engineering');
const decoded = jwt.decode(token);
console.log(decoded); // Check it has your data
```

### Still seeing wrong data?
```typescript
// Test with admin (bypasses RLS)
const admin = createSupabaseAdminClient();
const { count } = await admin.from('table').select('*', { count: 'exact' });

// Test as user (RLS applied)
const user = createSupabaseClientWithUser('user123', 'eng');
const { count: userCount } = await user.from('table').select('*', { count: 'exact' });
// Should be different counts
```

**See full debugging guide in `CUSTOM_RLS_GUIDE.md`**

---

## 📖 Learning Path

### For Beginners
1. Read `RLS_SUMMARY.md` (2 min)
2. Look at `RLS_ARCHITECTURE.md` diagrams (5 min)
3. Follow `RLS_QUICKSTART.md` Pattern 1 (10 min)
4. Test with `scripts/test-rls.ts` (5 min)

**Total: ~30 minutes to working department-based RLS**

### For Intermediate Users
1. Read `CUSTOM_RLS_GUIDE.md` (30 min)
2. Pick pattern from `RLS_EXAMPLES.md`
3. Copy complete example
4. Implement and test

**Total: ~1-2 hours for complex patterns**

### For Advanced Users
1. Reference `CUSTOM_RLS_GUIDE.md` sections as needed
2. Combine patterns from `RLS_EXAMPLES.md`
3. Write custom SQL policies
4. Optimize with proper indexing

---

## 🔗 Related Documentation

- **Supabase RLS Docs**: https://supabase.com/docs/guides/auth/row-level-security
- **PostgreSQL Security**: https://www.postgresql.org/docs/current/sql-createpolicy.html
- **Your JWT setup**: `lib/auth/supabase-jwt.ts`
- **Current RLS policies**: `supabase/migrations/002_*.sql`
- **User mapping**: `lib/auth/feishu-supabase-auth.ts`

---

## 💡 Pro Tips

1. **Start simple**: Begin with basic `user_id = auth.uid()` policies, then extend
2. **Test early**: Always test RLS with real data before deploying
3. **Use indexes**: Add indexes for columns in `EXISTS` clauses for performance
4. **Fail secure**: Policies deny by default; grant access explicitly
5. **Document policies**: Comment what each policy does for future maintenance

---

## 📞 Need Help?

### I have a question about...

**Basic RLS concepts**
→ Read `RLS_SUMMARY.md` or `RLS_ARCHITECTURE.md`

**How to implement a pattern**
→ Check `RLS_EXAMPLES.md` for similar example

**Why RLS isn't working**
→ See `CUSTOM_RLS_GUIDE.md` Debugging section

**Performance issues**
→ Check `RLS_ARCHITECTURE.md` Performance section

**PostgreSQL syntax**
→ See `CUSTOM_RLS_GUIDE.md` code examples

---

## 🎓 Example Walkthrough

Let's implement department-based OKR access:

```
1. UNDERSTAND (5 min)
   └─ Read RLS_QUICKSTART.md "Step 1: Add Department to JWT"

2. CREATE MIGRATION (2 min)
   └─ Copy SQL from RLS_EXAMPLES.md "Example 1: Department-Based OKRs"

3. UPDATE CODE (2 min)
   └─ Modify lib/auth/supabase-jwt.ts to include department in JWT

4. DEPLOY (1 min)
   └─ Run: bun scripts/run-migrations.ts

5. TEST (5 min)
   └─ Run: bun scripts/test-rls.ts user123 engineering

6. VERIFY
   └─ Query should return only engineering department's OKRs ✅
```

**Total: ~15 minutes to working implementation**

---

## Version History

- **v1.0** (Nov 2025) - Initial comprehensive guide
  - RLS_SUMMARY.md - Overview
  - RLS_QUICKSTART.md - Quick implementation
  - RLS_EXAMPLES.md - Real-world patterns
  - CUSTOM_RLS_GUIDE.md - Deep dive
  - RLS_ARCHITECTURE.md - Visual reference
  - RLS_INDEX.md - This file

---

## Next Steps

1. **Choose your pattern** - Use decision tree in RLS_SUMMARY.md
2. **Read relevant docs** - 5-30 min depending on pattern
3. **Implement** - Follow examples in RLS_EXAMPLES.md or RLS_QUICKSTART.md
4. **Test** - Use scripts/test-rls.ts to verify
5. **Monitor** - Track performance and access patterns

Good luck! 🚀
