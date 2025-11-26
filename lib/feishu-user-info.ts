/**
 * Feishu User Information Utilities
 * 
 * Functions to fetch user department, organization, and other info from Feishu
 * Uses the Contact API (contact:user scope)
 */

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
  mobile?: string;
  email?: string;
}

/**
 * Get user's department and organization information from Feishu
 * 
 * Requires scopes:
 * - contact:user.base (basic user info)
 * - contact:user.organization_info (department + org info)
 * 
 * @param feishuUserId - User's open_id or user_id
 * @returns User info including department and organization, or null if error
 */
export async function getUserDepartmentInfo(
  feishuUserId: string
): Promise<UserDepartmentInfo | null> {
  try {
    console.log(`📋 [Feishu] Fetching user info for: ${feishuUserId}`);
    
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
      console.warn(`⚠️ [Feishu] Failed to fetch user info for ${feishuUserId}`);
      return null;
    }

    const user = resp.data;
    
    const result: UserDepartmentInfo = {
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
      mobile: user.mobile,
      email: user.email,
    };

    console.log(`✅ [Feishu] User info: ${result.name} from ${result.primary_department}`);
    return result;
  } catch (error) {
    console.error(`❌ [Feishu] Error fetching user department info:`, error);
    return null;
  }
}

/**
 * Get department information (name, parent, ID)
 * 
 * @param departmentId - Department ID (open_department_id)
 * @returns Department info or null if error
 */
export async function getDepartmentInfo(departmentId: string) {
  try {
    console.log(`📋 [Feishu] Fetching department info: ${departmentId}`);
    
    const resp = await client.contact.department.get({
      path: {
        department_id: departmentId,
      },
      params: {
        department_id_type: "open_department_id",
      },
    });

    if (!resp.success()) {
      console.warn(`⚠️ [Feishu] Failed to fetch department ${departmentId}`);
      return null;
    }

    console.log(`✅ [Feishu] Department: ${resp.data?.name}`);
    return resp.data;
  } catch (error) {
    console.error(`❌ [Feishu] Error fetching department info:`, error);
    return null;
  }
}

/**
 * List all users in a department
 * 
 * Requires scope:
 * - contact:user.base
 * 
 * @param departmentId - Department ID (open_department_id)
 * @param pageSize - Pagination size (default 50)
 * @returns Array of users in the department
 */
export async function listDepartmentUsers(
  departmentId: string,
  pageSize: number = 50
) {
  try {
    console.log(`📋 [Feishu] Listing users in department: ${departmentId}`);
    
    const users = [];
    let count = 0;
    
    for await (const items of await client.contact.user.findByDepartmentWithIterator({
      data: {
        department_id: departmentId,
      },
      params: {
        user_id_type: "open_id",
        department_id_type: "open_department_id",
        page_size: pageSize,
      },
    })) {
      users.push(...items);
      count += items.length;
    }
    
    console.log(`✅ [Feishu] Found ${count} users in department`);
    return users;
  } catch (error) {
    console.error(`❌ [Feishu] Error listing department users:`, error);
    return [];
  }
}

/**
 * Search users by name or email
 * 
 * Requires scope:
 * - contact:user.base
 * 
 * @param query - Search query (name, email, mobile)
 * @param pageSize - Pagination size (default 50)
 * @returns Array of matching users
 */
export async function searchUsers(
  query: string,
  pageSize: number = 50
) {
  try {
    console.log(`📋 [Feishu] Searching users: ${query}`);
    
    const users = [];
    let count = 0;
    
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
      count += items.length;
    }
    
    console.log(`✅ [Feishu] Found ${count} matching users`);
    return users;
  } catch (error) {
    console.error(`❌ [Feishu] Error searching users:`, error);
    return [];
  }
}

/**
 * Get user ID by email or mobile number
 * 
 * Requires scope:
 * - contact:user.base
 * 
 * @param email - Email address (optional)
 * @param mobile - Mobile number (optional)
 * @returns List of matching user IDs
 */
export async function getUserIdByEmailOrMobile(
  email?: string,
  mobile?: string
) {
  try {
    console.log(`📋 [Feishu] Looking up user by email/mobile`);
    
    const resp = await client.contact.user.batchGetId({
      data: {
        ...(email ? { emails: [email] } : {}),
        ...(mobile ? { mobiles: [mobile] } : {}),
      },
    });

    if (!resp.success()) {
      console.warn(`⚠️ [Feishu] Failed to get user ID`);
      return [];
    }

    const userList = resp.data?.user_list || [];
    console.log(`✅ [Feishu] Found ${userList.length} user(s)`);
    return userList;
  } catch (error) {
    console.error(`❌ [Feishu] Error getting user ID:`, error);
    return [];
  }
}

/**
 * Cache for user info (in-memory, 5 minute TTL)
 * For production, use Redis or Supabase cache instead
 */
const USER_INFO_CACHE = new Map<string, {
  data: UserDepartmentInfo;
  expires: number;
}>();

/**
 * Get user info with caching
 * 
 * Caches for 5 minutes to reduce API calls
 * 
 * @param feishuUserId - User ID to fetch
 * @returns User info with department details
 */
export async function getUserDepartmentInfoCached(
  feishuUserId: string
): Promise<UserDepartmentInfo | null> {
  // Check cache
  const cached = USER_INFO_CACHE.get(feishuUserId);
  if (cached && cached.expires > Date.now()) {
    console.log(`💾 [Cache] User info from cache: ${feishuUserId}`);
    return cached.data;
  }
  
  // Fetch fresh
  const userInfo = await getUserDepartmentInfo(feishuUserId);
  
  // Cache for 5 minutes
  if (userInfo) {
    USER_INFO_CACHE.set(feishuUserId, {
      data: userInfo,
      expires: Date.now() + 5 * 60 * 1000 // 5 minutes
    });
  }
  
  return userInfo;
}

/**
 * Clear user info cache
 * Useful for testing or manual cache invalidation
 */
export function clearUserInfoCache() {
  USER_INFO_CACHE.clear();
  console.log("💾 [Cache] User info cache cleared");
}

/**
 * Get cache stats
 */
export function getUserInfoCacheStats() {
  let validCount = 0;
  let expiredCount = 0;
  const now = Date.now();
  
  for (const [_, entry] of USER_INFO_CACHE) {
    if (entry.expires > now) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    total: USER_INFO_CACHE.size,
    valid: validCount,
    expired: expiredCount,
  };
}
