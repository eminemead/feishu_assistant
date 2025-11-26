/**
 * User Data Scope Management
 * 
 * Gets user's authorized data access scope for filtering DuckDB/StarRocks queries
 * This ensures users can only query data they're authorized to access
 */

import { createSupabaseClientWithUser } from './supabase-jwt';
import { getSupabaseUserId } from './feishu-supabase-id';
import type { UserDataScope } from './types';
import { getStarrocksUserScope } from '../starrocks/rls-provider';

/**
 * Get user's authorized data access scope
 * 
 * This determines what data the user can query from DuckDB/StarRocks.
 * Returns empty arrays if no permissions are found (fail-secure).
 * 
 * @param feishuUserId - Feishu user ID (open_id/user_id)
 * @returns User's data access scope
 */
export async function getUserDataScope(feishuUserId: string): Promise<UserDataScope> {
  const starrocksScope = await getStarrocksUserScope(feishuUserId);
  if (starrocksScope) {
    return starrocksScope;
  }

  const supabase = createSupabaseClientWithUser(feishuUserId);
  const supabaseUserId = getSupabaseUserId(feishuUserId);
  
  if (!supabase) {
    console.warn(`⚠️ [Auth] Supabase not configured, returning empty data scope for user: ${feishuUserId}`);
    // Fail-secure: return empty scope if Supabase not configured
    return {
      allowedAccounts: [],
      allowedDepartments: [],
      allowedRegions: []
    };
  }
  
  try {
    // Query user's permissions from Supabase
    // RLS policy ensures user can only access their own permissions
    const { data, error } = await supabase
      .from('user_data_permissions')
      .select('allowed_accounts, allowed_departments, allowed_regions')
      .eq('user_id', supabaseUserId)
      .single();
    
    if (error) {
      // If no permissions found, return empty scope (fail-secure)
      if (error.code === 'PGRST116') {
        console.log(`ℹ️ [Auth] No permissions found for user ${feishuUserId}, using empty scope`);
        return {
          allowedAccounts: [],
          allowedDepartments: [],
          allowedRegions: []
        };
      }
      
      console.error(`❌ [Auth] Error fetching user data scope:`, error);
      // Fail-secure: return empty scope on error
      return {
        allowedAccounts: [],
        allowedDepartments: [],
        allowedRegions: []
      };
    }
    
    if (!data) {
      console.log(`ℹ️ [Auth] No permissions data for user ${feishuUserId}, using empty scope`);
      return {
        allowedAccounts: [],
        allowedDepartments: [],
        allowedRegions: []
      };
    }
    
    return {
      allowedAccounts: data.allowed_accounts || [],
      allowedDepartments: data.allowed_departments || [],
      allowedRegions: data.allowed_regions || []
    };
  } catch (error) {
    console.error(`❌ [Auth] Exception fetching user data scope:`, error);
    // Fail-secure: return empty scope on exception
    return {
      allowedAccounts: [],
      allowedDepartments: [],
      allowedRegions: []
    };
  }
}

/**
 * Check if user has access to a specific account
 * 
 * @param feishuUserId - Feishu user ID
 * @param accountId - Account ID to check
 * @returns true if user has access, false otherwise
 */
export async function userHasAccountAccess(feishuUserId: string, accountId: string): Promise<boolean> {
  const scope = await getUserDataScope(feishuUserId);
  
  // If no accounts specified, deny access (fail-secure)
  if (scope.allowedAccounts.length === 0) {
    return false;
  }
  
  // Check if account is in allowed list
  return scope.allowedAccounts.includes(accountId);
}

/**
 * Check if user has access to a specific department
 * 
 * @param feishuUserId - Feishu user ID
 * @param department - Department name to check
 * @returns true if user has access, false otherwise
 */
export async function userHasDepartmentAccess(feishuUserId: string, department: string): Promise<boolean> {
  const scope = await getUserDataScope(feishuUserId);
  
  // If no departments specified, deny access (fail-secure)
  if (scope.allowedDepartments.length === 0) {
    return false;
  }
  
  // Check if department is in allowed list
  return scope.allowedDepartments.includes(department);
}

