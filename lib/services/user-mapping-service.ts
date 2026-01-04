/**
 * User Mapping Service
 * 
 * Maps between Feishu open_id/user_id and GitLab usernames.
 * Provides both database lookups and fallback heuristics.
 */

import { createClient } from '@supabase/supabase-js';
import { feishuIdToEmpAccount } from '../auth/feishu-account-mapping';

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
