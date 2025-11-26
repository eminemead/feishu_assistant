# Getting User Department & Organization Info from Feishu SDK

**Short answer: YES!** The Feishu SDK provides Contact APIs to fetch user information including department and organization details.

---

## Available APIs

### 1. Get Single User Info (Most Common)

```typescript
import * as lark from "@larksuiteoapi/node-sdk";

const client = new lark.Client({
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  domain: lark.Domain.Feishu,
});

// Get user with department info
const resp = await client.contact.user.get({
  path: {
    user_id: "feishu_open_id", // or user_id, union_id
  },
  params: {
    user_id_type: "open_id", // "open_id" | "user_id" | "union_id"
    department_id_type: "open_department_id", // "department_id" | "open_department_id"
  },
});

const user = resp.data;
console.log({
  name: user?.name,
  department_ids: user?.department_ids, // Array of department IDs
  departments: user?.departments, // Array of department objects
});
```

### 2. Get User by Email or Mobile Number

```typescript
const resp = await client.contact.user.batchGetId({
  data: {
    emails: ["user@company.com"],
    mobiles: ["+1234567890"],
  },
});

// Returns user IDs, then you can use get() above
const userIds = resp.data?.user_list?.map(u => u.user_id);
```

### 3. List All Users in a Department

```typescript
const resp = await client.contact.user.findByDepartment({
  data: {
    department_id: "od-xxx", // open_department_id
  },
  params: {
    user_id_type: "open_id",
    department_id_type: "open_department_id",
    page_size: 50,
  },
});

// Automatically handles pagination
for await (const items of await client.contact.user.findByDepartmentWithIterator({
  data: { department_id: "od-xxx" },
  params: { page_size: 50 },
})) {
  console.log(items); // Each item is a user
}
```

### 4. Search Users

```typescript
const resp = await client.contact.user.searchUsers({
  data: {
    query: "john", // Search by name
    content: "john@company.com", // Or search by email/mobile
  },
  params: {
    user_id_type: "open_id",
    page_size: 50,
  },
});

for await (const items of await client.contact.user.searchUsersWithIterator({
  data: { query: "engineering" },
})) {
  console.log(items);
}
```

---

## What User Information is Available?

When you call `user.get()`, the response includes:

```typescript
{
  // IDs
  user_id: string;              // User ID in tenant
  open_id: string;              // User ID in this app
  union_id: string;             // User ID across apps by same developer
  
  // Basic info
  name: string;                 // User name
  en_name?: string;             // English name
  email?: string;               // Work email
  mobile?: string;              // Mobile number
  
  // Department & Organization
  department_ids: string[];                    // ✅ List of department IDs
  departments: Array<{
    department_id: string;                    // Department ID
    department_name: string;                  // Department name
    parent_department_id?: string;            // Parent department
  }>;
  
  // Organization (requires scope)
  organization?: {
    organization_id: string;
    organization_name: string;
  };
  
  // Employment info
  employment_type?: string;     // "full_time" | "part_time" | "contractor"
  work_city?: string;
  job_title?: string;
  job_level?: string;
  
  // Status
  is_frozen: boolean;
  active: boolean;
  
  // And more...
}
```

---

## Real-World Example: Extract Department + Org

```typescript
/**
 * Get user's department and organization information
 * 
 * @param feishuUserId - User's open_id or user_id
 * @returns Department name and organization info
 */
export async function getUserDepartmentInfo(feishuUserId: string) {
  try {
    const resp = await client.contact.user.get({
      path: {
        user_id: feishuUserId,
      },
      params: {
        user_id_type: "open_id",
        department_id_type: "open_department_id",
      },
    });

    if (!resp.success() || !resp.data) {
      console.error("Failed to fetch user info");
      return null;
    }

    const user = resp.data;
    
    return {
      user_id: user.user_id,
      name: user.name,
      primary_department: user.departments?.[0]?.department_name,
      all_departments: user.departments?.map(d => ({
        id: d.department_id,
        name: d.department_name,
        parent_id: d.parent_department_id,
      })) || [],
      organization_id: user.organization?.organization_id,
      organization_name: user.organization?.organization_name,
      employment_type: user.employment_type,
      job_title: user.job_title,
    };
  } catch (error) {
    console.error(`Error fetching user department info: ${error}`);
    return null;
  }
}
```

Use in your handlers:

```typescript
import { getUserDepartmentInfo } from "./lib/feishu-user-info";

export async function handleNewAppMention(data: FeishuMentionData) {
  const userId = extractFeishuUserId(data);
  
  // Get department info
  const userInfo = await getUserDepartmentInfo(userId);
  
  // Use in JWT (extends basic RLS)
  const jwt = generateSupabaseJWT(
    userId, 
    userInfo?.primary_department  // ← Department for RLS
  );
  
  console.log(`User ${userInfo?.name} from ${userInfo?.primary_department} department`);
}
```

---

## Required Permissions

To get department/organization info, your app needs these **scopes**:

```typescript
// Minimum required scopes:
// - contact:user.base - Get basic user info (required)
// - contact:user.organization_info - Get organization info (optional)
// - contact:user - Access contacts as app
```

Set these in **Developer Console** > **Development Configuration** > **Permission & Scopes** > **Contacts**.

### Scope Reference

| Scope | What it returns |
|-------|-----------------|
| `contact:user.base` | User ID, name, email, mobile (basic) |
| `contact:user.organization_info` | Department IDs, organization info |
| `contact:user.job_level` | Job level, job family |
| `contact:user.employment_info` | Employment type, work city, job title |
| `contact:user.gender` | User gender |
| `contact:user.seat_info` | Seat/office information |
| `contact:user.department_path` | Full department path (requires user_access_token) |

---

## Implementation in Your Codebase

### Step 1: Create Helper Module

**File: `lib/feishu-user-info.ts`**

```typescript
import * as lark from "@larksuiteoapi/node-sdk";
import { client } from "./feishu-utils";

export interface UserDepartmentInfo {
  user_id: string;
  name: string;
  primary_department?: string;
  all_departments: Array<{
    id: string;
    name: string;
    parent_id?: string;
  }>;
  organization_id?: string;
  organization_name?: string;
  employment_type?: string;
  job_title?: string;
  work_city?: string;
}

/**
 * Get user's department and organization information from Feishu
 */
export async function getUserDepartmentInfo(
  feishuUserId: string
): Promise<UserDepartmentInfo | null> {
  try {
    const resp = await client.contact.user.get({
      path: {
        user_id: feishuUserId,
      },
      params: {
        user_id_type: "open_id",
        department_id_type: "open_department_id",
      },
    });

    if (!resp.success() || !resp.data) {
      console.warn(`⚠️ Failed to fetch user info for ${feishuUserId}`);
      return null;
    }

    const user = resp.data;
    
    return {
      user_id: user.user_id || feishuUserId,
      name: user.name || "Unknown",
      primary_department: user.departments?.[0]?.department_name,
      all_departments: user.departments?.map(d => ({
        id: d.department_id || "",
        name: d.department_name || "",
        parent_id: d.parent_department_id,
      })) || [],
      organization_id: user.organization?.organization_id,
      organization_name: user.organization?.organization_name,
      employment_type: user.employment_type,
      job_title: user.job_title,
      work_city: user.work_city,
    };
  } catch (error) {
    console.error(`❌ Error fetching user department info:`, error);
    return null;
  }
}

/**
 * Get department information (name, parent, etc.)
 */
export async function getDepartmentInfo(departmentId: string) {
  try {
    const resp = await client.contact.department.get({
      path: {
        department_id: departmentId,
      },
      params: {
        department_id_type: "open_department_id",
      },
    });

    if (!resp.success()) {
      return null;
    }

    return resp.data;
  } catch (error) {
    console.error(`Error fetching department info:`, error);
    return null;
  }
}

/**
 * List all users in a department
 */
export async function listDepartmentUsers(
  departmentId: string,
  pageSize: number = 50
) {
  try {
    const users = [];
    
    for await (const items of await client.contact.user.findByDepartmentWithIterator({
      data: {
        department_id: departmentId,
      },
      params: {
        user_id_type: "open_id",
        page_size: pageSize,
      },
    })) {
      users.push(...items);
    }
    
    return users;
  } catch (error) {
    console.error(`Error listing department users:`, error);
    return [];
  }
}

/**
 * Search users by name or email
 */
export async function searchUsers(query: string, pageSize: number = 50) {
  try {
    const users = [];
    
    for await (const items of await client.contact.user.searchUsersWithIterator({
      data: {
        query: query,
      },
      params: {
        user_id_type: "open_id",
        page_size: pageSize,
      },
    })) {
      users.push(...items);
    }
    
    return users;
  } catch (error) {
    console.error(`Error searching users:`, error);
    return [];
  }
}
```

### Step 2: Use in Your Handlers

**File: `lib/handle-app-mention.ts`**

```typescript
import { getUserDepartmentInfo } from "./feishu-user-info";
import { generateSupabaseJWT } from "./auth/supabase-jwt";

export async function handleNewAppMention(data: FeishuMentionData) {
  const userId = extractFeishuUserId(data);
  
  // Get user's department from Feishu
  const userInfo = await getUserDepartmentInfo(userId);
  
  // Create JWT with department context (for RLS)
  const department = userInfo?.primary_department || "unknown";
  const jwt = generateSupabaseJWT(userId, department);
  
  const supabase = createSupabaseClientWithUser(userId, department);
  
  // Now queries are automatically filtered by department
  const { data: okrs } = await supabase
    .from('okr_metrics')
    .select('*')
    .eq('department', department); // RLS will enforce this anyway
  
  console.log(`User ${userInfo?.name} from ${department} has ${okrs?.length || 0} OKRs`);
}
```

### Step 3: Extend Your User Data Sync

**File: `lib/auth/feishu-supabase-auth.ts`**

```typescript
export async function getOrCreateSupabaseUser(
  feishuUserId: string,
  userInfo?: UserDepartmentInfo
): Promise<string | null> {
  // ... existing code ...
  
  // When creating user, store department + org info
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    id: feishuUserId,
    email: `${feishuUserId}@feishu.local`,
    email_confirm: true,
    user_metadata: {
      feishu_user_id: feishuUserId,
      feishu_department: userInfo?.primary_department,
      feishu_all_departments: userInfo?.all_departments,
      feishu_organization: userInfo?.organization_name,
      feishu_job_title: userInfo?.job_title,
      provider: 'feishu',
      created_at: new Date().toISOString()
    },
    app_metadata: {
      provider: 'feishu',
      feishu_user_id: feishuUserId,
      feishu_department: userInfo?.primary_department
    }
  });
  
  // ... rest of function ...
}
```

---

## Example: Complete Flow

```typescript
// 1. User sends message in Feishu
// Event arrives in webhook/WebSocket

// 2. Extract user ID
const userId = extractFeishuUserId(message, data);

// 3. Get user's department from Feishu API
const userInfo = await getUserDepartmentInfo(userId);
// Result: { name: "Alice", primary_department: "engineering", ... }

// 4. Create JWT with department context
const jwt = generateSupabaseJWT(userId, userInfo?.primary_department);

// 5. Create RLS-enabled Supabase client
const supabase = createSupabaseClientWithUser(userId, userInfo?.primary_department);

// 6. Query is automatically filtered by RLS policy
const { data: okrs } = await supabase
  .from('okr_metrics')
  .select('*');
// Returns only engineering department OKRs (RLS applied)

// 7. Process and respond
```

---

## Caching (Recommended)

User info doesn't change frequently, so cache it:

```typescript
/**
 * Get user info with caching (5 minutes)
 */
const USER_CACHE = new Map<string, { data: UserDepartmentInfo; expires: number }>();

export async function getUserDepartmentInfoCached(
  feishuUserId: string
): Promise<UserDepartmentInfo | null> {
  // Check cache
  const cached = USER_CACHE.get(feishuUserId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  // Fetch fresh
  const userInfo = await getUserDepartmentInfo(feishuUserId);
  
  // Cache for 5 minutes
  if (userInfo) {
    USER_CACHE.set(feishuUserId, {
      data: userInfo,
      expires: Date.now() + 5 * 60 * 1000
    });
  }
  
  return userInfo;
}
```

Or use Redis/Supabase cache:

```typescript
import { cache } from "./cache"; // Your cache utility

export async function getUserDepartmentInfoCached(feishuUserId: string) {
  return cache.remember(
    `user:${feishuUserId}`,
    60 * 5, // 5 minutes
    () => getUserDepartmentInfo(feishuUserId)
  );
}
```

---

## Error Handling

User info might fail due to:
- User doesn't exist
- Permission scope missing
- Network error
- Rate limit

```typescript
try {
  const userInfo = await getUserDepartmentInfo(userId);
  
  if (!userInfo) {
    // Graceful fallback: use empty department
    console.warn(`Could not fetch department for ${userId}, using fallback`);
    const jwt = generateSupabaseJWT(userId, "unknown");
    // Continue with empty department
  } else {
    // Use department from Feishu
    const jwt = generateSupabaseJWT(userId, userInfo.primary_department);
  }
} catch (error) {
  console.error(`Error getting user info: ${error}`);
  // Graceful degradation: continue without department
  const jwt = generateSupabaseJWT(userId);
}
```

---

## Troubleshooting

### "User not found" Error
- Verify user_id_type matches the ID you're passing
- Use `open_id` for mention events (standard in Feishu)

### "Permission denied" Error
- Check your app has `contact:user.base` scope
- Check app permissions are set in Developer Console
- For department_path, use `user_access_token` instead of `tenant_access_token`

### Department info is null
- Ensure scope `contact:user.organization_info` is enabled
- Check user is assigned to a department in Feishu admin

### Performance: Slow API calls
- Implement caching (see above)
- Batch requests if getting multiple users
- Use `findByDepartmentWithIterator` for efficient pagination

---

## Complete Example File

See `lib/feishu-user-info.ts` above for complete implementation to add to your codebase.

---

## Related Documentation

- Feishu Contact API: https://open.feishu.cn/document/server-docs/contact-v3/user/get
- SDK usage: [@larksuiteoapi/node-sdk](https://www.npmjs.com/package/@larksuiteoapi/node-sdk)
- Your RLS setup: `docs/RLS_QUICKSTART.md`
- Current JWT generation: `lib/auth/supabase-jwt.ts`
