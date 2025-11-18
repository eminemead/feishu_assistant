/**
 * Feishu to Supabase Authentication Integration
 * 
 * Creates or retrieves Supabase users from Feishu user IDs
 * Uses Supabase Admin API (Service Role) to manage users
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️ [Auth] Supabase credentials not configured. RLS features will be disabled.');
}

/**
 * Create Supabase admin client (bypasses RLS)
 * Only use this for user management operations
 */
const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Create or get Supabase user from Feishu user ID
 * 
 * Uses Feishu user ID (open_id/user_id) as the Supabase user ID
 * This ensures consistent mapping between Feishu and Supabase users
 * 
 * @param feishuUserId - Feishu user ID (open_id or user_id)
 * @returns Supabase user ID (same as feishuUserId)
 */
export async function getOrCreateSupabaseUser(feishuUserId: string): Promise<string | null> {
  if (!supabaseAdmin) {
    console.warn('⚠️ [Auth] Supabase not configured, skipping user creation');
    return null;
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(feishuUserId);
    
    if (existingUser?.user && !getUserError) {
      console.log(`✅ [Auth] Found existing Supabase user: ${feishuUserId}`);
      return existingUser.user.id;
    }
    
    // User doesn't exist, create new user
    // Use Feishu user ID as the Supabase user ID for consistent mapping
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      id: feishuUserId, // Use Feishu user ID as Supabase user ID
      email: `${feishuUserId}@feishu.local`, // Placeholder email (not used for auth)
      email_confirm: true, // Auto-confirm since we're using Feishu auth
      user_metadata: {
        feishu_user_id: feishuUserId,
        provider: 'feishu',
        created_at: new Date().toISOString()
      },
      app_metadata: {
        provider: 'feishu',
        feishu_user_id: feishuUserId
      }
    });
    
    if (createError) {
      // If user already exists (race condition), try to get it again
      if (createError.message.includes('already exists') || createError.message.includes('duplicate')) {
        const { data: retryUser } = await supabaseAdmin.auth.admin.getUserById(feishuUserId);
        if (retryUser?.user) {
          console.log(`✅ [Auth] User created by another process, retrieved: ${feishuUserId}`);
          return retryUser.user.id;
        }
      }
      console.error(`❌ [Auth] Failed to create Supabase user: ${createError.message}`);
      return null;
    }
    
    if (!newUser?.user) {
      console.error(`❌ [Auth] User creation returned no user data`);
      return null;
    }
    
    console.log(`✅ [Auth] Created new Supabase user: ${feishuUserId}`);
    return newUser.user.id;
  } catch (error) {
    console.error(`❌ [Auth] Error in getOrCreateSupabaseUser:`, error);
    return null;
  }
}

/**
 * Get Supabase user by Feishu user ID
 * 
 * @param feishuUserId - Feishu user ID
 * @returns Supabase user ID if found, null otherwise
 */
export async function getSupabaseUser(feishuUserId: string): Promise<string | null> {
  if (!supabaseAdmin) {
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(feishuUserId);
    
    if (error || !data?.user) {
      return null;
    }
    
    return data.user.id;
  } catch (error) {
    console.error(`❌ [Auth] Error getting Supabase user:`, error);
    return null;
  }
}

