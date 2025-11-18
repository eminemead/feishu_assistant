/**
 * Supabase JWT Generation for RLS
 * 
 * Generates Supabase-compatible JWTs with Feishu user context
 * These JWTs are used by RLS policies via auth.uid()
 */

import jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ [Auth] Supabase URL or ANON_KEY not configured. RLS features will be disabled.');
}

if (!SUPABASE_JWT_SECRET) {
  console.warn('⚠️ [Auth] SUPABASE_JWT_SECRET not configured. JWT generation will fail.');
}

/**
 * Generate Supabase-compatible JWT for Feishu user
 * 
 * The JWT contains the user ID in the `sub` field, which becomes `auth.uid()` in RLS policies.
 * This allows RLS policies to filter data based on the authenticated user.
 * 
 * @param feishuUserId - Feishu user ID (open_id/user_id)
 * @param expiresInSeconds - JWT expiration time in seconds (default: 1 hour)
 * @returns JWT token string
 */
export function generateSupabaseJWT(
  feishuUserId: string,
  expiresInSeconds: number = 60 * 60 // 1 hour default
): string {
  if (!SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET is not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    aud: 'authenticated',
    exp: now + expiresInSeconds,
    iat: now,
    iss: SUPABASE_URL,
    sub: feishuUserId, // This becomes auth.uid() in RLS policies
    email: `${feishuUserId}@feishu.local`,
    role: 'authenticated',
    app_metadata: {
      provider: 'feishu',
      feishu_user_id: feishuUserId
    },
    user_metadata: {
      feishu_user_id: feishuUserId,
      provider: 'feishu'
    }
  };
  
  return jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Create Supabase client with user context for RLS
 * 
 * This client will automatically enforce RLS policies based on the user's JWT.
 * All queries will be filtered by the user's ID via auth.uid().
 * 
 * @param feishuUserId - Feishu user ID (open_id/user_id)
 * @returns Supabase client configured with user JWT
 */
export function createSupabaseClientWithUser(feishuUserId: string): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ [Auth] Supabase not configured, returning null client');
    return null;
  }

  try {
    const jwtToken = generateSupabaseJWT(feishuUserId);
    
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${jwtToken}`
        }
      },
      auth: {
        persistSession: false, // Don't persist session in server-side context
        autoRefreshToken: false
      }
    });
  } catch (error) {
    console.error(`❌ [Auth] Failed to create Supabase client:`, error);
    return null;
  }
}

/**
 * Create Supabase admin client (bypasses RLS)
 * 
 * Use this only for administrative operations that need to bypass RLS.
 * Regular operations should use createSupabaseClientWithUser().
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️ [Auth] Supabase admin credentials not configured');
    return null;
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

