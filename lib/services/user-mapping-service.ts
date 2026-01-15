/**
 * User Mapping Service
 * 
 * Maps between Feishu open_id/user_id and GitLab usernames.
 * Provides both database lookups and fallback heuristics.
 * 
 * Enhanced for Feishu Task → GitLab integration:
 * - Fetches Feishu user info to derive GitLab username
 * - Caches mappings in Supabase for future lookups
 */

import { createClient } from '@supabase/supabase-js';
import { feishuIdToEmpAccount } from '../auth/feishu-account-mapping';
import { client as feishuClient } from '../feishu-utils';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface UserMapping {
  feishuOpenId: string;
  feishuUserId?: string;
  gitlabUsername: string;
  displayName?: string;
}

/**
 * Get GitLab username from Feishu open_id
 * 
 * Strategy:
 * 1. Check database for explicit mapping
 * 2. Fall back to heuristic (strip @nio.com)
 */
export async function getGitlabUsername(feishuOpenId: string): Promise<string | null> {
  // Try database first
  const { data } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('gitlab_username')
    .eq('feishu_open_id', feishuOpenId)
    .single();

  if (data?.gitlab_username) {
    return data.gitlab_username;
  }

  // Fall back to heuristic
  return feishuIdToEmpAccount(feishuOpenId);
}

/**
 * Get Feishu open_id from GitLab username
 */
export async function getFeishuOpenId(gitlabUsername: string): Promise<string | null> {
  const { data } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('feishu_open_id')
    .eq('gitlab_username', gitlabUsername)
    .single();

  return data?.feishu_open_id || null;
}

/**
 * Save or update user mapping
 */
export async function saveUserMapping(mapping: UserMapping): Promise<void> {
  const { error } = await supabase
    .from('feishu_gitlab_user_mappings')
    .upsert({
      feishu_open_id: mapping.feishuOpenId,
      feishu_user_id: mapping.feishuUserId,
      gitlab_username: mapping.gitlabUsername,
      display_name: mapping.displayName,
    }, {
      onConflict: 'feishu_open_id',
    });

  if (error) {
    console.error('❌ [UserMapping] Failed to save mapping:', error);
    throw error;
  }

  console.log(`✅ [UserMapping] Saved: ${mapping.feishuOpenId} → ${mapping.gitlabUsername}`);
}

/**
 * Batch lookup: get Feishu open_ids for multiple GitLab usernames
 */
export async function getFeishuOpenIdsForGitlabUsers(
  gitlabUsernames: string[]
): Promise<Map<string, string>> {
  if (gitlabUsernames.length === 0) return new Map();

  const { data } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('gitlab_username, feishu_open_id')
    .in('gitlab_username', gitlabUsernames);

  const result = new Map<string, string>();
  if (data) {
    for (const row of data) {
      result.set(row.gitlab_username, row.feishu_open_id);
    }
  }
  return result;
}

/**
 * Get all user mappings (for admin/debug)
 */
export async function getAllUserMappings(): Promise<UserMapping[]> {
  const { data, error } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ [UserMapping] Failed to fetch mappings:', error);
    return [];
  }

  return (data || []).map(row => ({
    feishuOpenId: row.feishu_open_id,
    feishuUserId: row.feishu_user_id,
    gitlabUsername: row.gitlab_username,
    displayName: row.display_name,
  }));
}

// ============================================================================
// Enhanced User Resolution (Phase 3 - User Mapping)
// ============================================================================

/**
 * Resolve GitLab username from Feishu open_id with full lookup chain:
 * 1. Check Supabase cache
 * 2. Fetch Feishu user info via API
 * 3. Derive GitLab username from email (strip @nio.com)
 * 4. Cache result for future lookups
 */
export async function resolveGitlabUsername(feishuOpenId: string): Promise<string | null> {
  // 1. Check cache in Supabase
  const { data } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('gitlab_username')
    .eq('feishu_open_id', feishuOpenId)
    .single();
  
  if (data?.gitlab_username) {
    return data.gitlab_username;
  }
  
  // 2. Fetch Feishu user info via API
  try {
    const userInfo = await feishuClient.contact.v3.user.get({
      path: { user_id: feishuOpenId },
      params: { user_id_type: 'open_id' },
    });
    
    const isSuccess = (userInfo.code === 0 || userInfo.code === undefined);
    if (!isSuccess || !userInfo.data?.user) {
      console.warn(`⚠️ [UserMapping] Failed to fetch Feishu user ${feishuOpenId}:`, userInfo);
      // Fall back to heuristic
      return feishuIdToEmpAccount(feishuOpenId);
    }
    
    // 3. Derive GitLab username from email (strip @nio.com)
    const user = userInfo.data.user;
    const email = user.email || user.enterprise_email;
    
    if (!email) {
      console.warn(`⚠️ [UserMapping] No email found for Feishu user ${feishuOpenId}`);
      return feishuIdToEmpAccount(feishuOpenId);
    }
    
    const gitlabUsername = email.split('@')[0];
    
    // 4. Cache for future lookups
    await supabase.from('feishu_gitlab_user_mappings').upsert({
      feishu_open_id: feishuOpenId,
      feishu_user_id: user.user_id,
      gitlab_username: gitlabUsername,
      display_name: user.name,
    }, {
      onConflict: 'feishu_open_id',
    });
    
    console.log(`✅ [UserMapping] Resolved and cached: ${feishuOpenId} → ${gitlabUsername} (${user.name})`);
    return gitlabUsername;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [UserMapping] Error fetching Feishu user ${feishuOpenId}:`, errorMsg);
    // Fall back to heuristic
    return feishuIdToEmpAccount(feishuOpenId);
  }
}

/**
 * Resolve multiple Feishu users to GitLab usernames
 * Batch version for efficiency
 */
export async function resolveGitlabUsernames(
  feishuOpenIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  
  if (feishuOpenIds.length === 0) return result;
  
  // Check cache first
  const { data: cachedMappings } = await supabase
    .from('feishu_gitlab_user_mappings')
    .select('feishu_open_id, gitlab_username')
    .in('feishu_open_id', feishuOpenIds);
  
  const cached = new Set<string>();
  if (cachedMappings) {
    for (const row of cachedMappings) {
      result.set(row.feishu_open_id, row.gitlab_username);
      cached.add(row.feishu_open_id);
    }
  }
  
  // Resolve uncached users
  const uncached = feishuOpenIds.filter(id => !cached.has(id));
  for (const feishuOpenId of uncached) {
    const gitlabUsername = await resolveGitlabUsername(feishuOpenId);
    if (gitlabUsername) {
      result.set(feishuOpenId, gitlabUsername);
    }
  }
  
  return result;
}
