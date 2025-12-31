/**
 * Feishu OAuth Service
 * 
 * Manages user_access_token for reading documents with user's permission.
 * 
 * Flow:
 * 1. User requests doc access → generateAuthUrl()
 * 2. User authorizes in Feishu → callback with code
 * 3. exchangeCodeForToken() → store in Supabase
 * 4. getUserAccessToken() → retrieve for API calls
 */

import { createClient } from "@supabase/supabase-js";
import * as lark from "@larksuiteoapi/node-sdk";

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// OAuth redirect URI - must be registered in Feishu app settings
const OAUTH_REDIRECT_URI = process.env.FEISHU_OAUTH_REDIRECT_URI || 
  `${process.env.PUBLIC_URL || "http://localhost:3000"}/oauth/feishu/callback`;

// Feishu OAuth endpoints
const FEISHU_OAUTH_AUTHORIZE_URL = "https://open.feishu.cn/open-apis/authen/v1/authorize";
const FEISHU_OAUTH_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const FEISHU_OAUTH_REFRESH_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";

// Supabase admin client for token storage
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

/**
 * User token stored in database
 */
export interface FeishuUserToken {
  feishu_user_id: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string; // ISO timestamp
  scope: string;
  created_at: string;
  updated_at: string;
}

/**
 * Generate OAuth authorization URL
 * User clicks this to grant document access permission
 * 
 * @param feishuUserId - User's open_id (used as state for callback)
 * @param scopes - OAuth scopes to request (default: doc read)
 */
export function generateAuthUrl(
  feishuUserId: string,
  scopes: string[] = ["docs:doc:readonly", "drive:drive:readonly"]
): string {
  const state = Buffer.from(JSON.stringify({ 
    userId: feishuUserId,
    ts: Date.now() 
  })).toString("base64url");

  const params = new URLSearchParams({
    app_id: FEISHU_APP_ID,
    redirect_uri: OAUTH_REDIRECT_URI,
    scope: scopes.join(" "),
    state,
  });

  return `${FEISHU_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for user_access_token
 * Called from OAuth callback endpoint
 */
export async function exchangeCodeForToken(
  code: string,
  state: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Decode state to get user ID
    const stateData = JSON.parse(Buffer.from(state, "base64url").toString());
    const feishuUserId = stateData.userId;

    if (!feishuUserId) {
      return { success: false, error: "Invalid state: missing userId" };
    }

    // Exchange code for token
    const response = await fetch(FEISHU_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: FEISHU_APP_ID,
        client_secret: FEISHU_APP_SECRET,
        code,
        redirect_uri: OAUTH_REDIRECT_URI,
      }),
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data?.access_token) {
      console.error("[OAuth] Token exchange failed:", data);
      return { 
        success: false, 
        error: data.msg || data.message || "Token exchange failed" 
      };
    }

    const tokenData = data.data;
    
    // Calculate expiry time
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Store token in Supabase
    await storeUserToken({
      feishu_user_id: feishuUserId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type || "Bearer",
      expires_at: expiresAt,
      scope: tokenData.scope || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    console.log(`✅ [OAuth] Token stored for user: ${feishuUserId}`);
    return { success: true, userId: feishuUserId };

  } catch (error: any) {
    console.error("[OAuth] exchangeCodeForToken error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Store user token in Supabase
 */
async function storeUserToken(token: FeishuUserToken): Promise<void> {
  if (!supabase) {
    console.warn("[OAuth] Supabase not configured, token not stored");
    return;
  }

  const { error } = await supabase
    .from("feishu_user_tokens")
    .upsert(token, { onConflict: "feishu_user_id" });

  if (error) {
    console.error("[OAuth] Failed to store token:", error);
    throw error;
  }
}

/**
 * Get valid user_access_token for a user
 * Automatically refreshes if expired
 * 
 * @returns access_token string or null if not authorized
 */
export async function getUserAccessToken(
  feishuUserId: string
): Promise<string | null> {
  if (!supabase) {
    console.warn("[OAuth] Supabase not configured");
    return null;
  }

  const { data, error } = await supabase
    .from("feishu_user_tokens")
    .select("*")
    .eq("feishu_user_id", feishuUserId)
    .single();

  if (error || !data) {
    console.log(`[OAuth] No token found for user: ${feishuUserId}`);
    return null;
  }

  const token = data as FeishuUserToken;
  const expiresAt = new Date(token.expires_at);
  const now = new Date();

  // Token still valid (with 5 min buffer)
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return token.access_token;
  }

  // Token expired or expiring soon - refresh it
  console.log(`[OAuth] Token expired/expiring for user: ${feishuUserId}, refreshing...`);
  
  const refreshed = await refreshUserToken(feishuUserId, token.refresh_token);
  return refreshed;
}

/**
 * Refresh expired user_access_token
 */
async function refreshUserToken(
  feishuUserId: string,
  refreshToken: string
): Promise<string | null> {
  try {
    const response = await fetch(FEISHU_OAUTH_REFRESH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: FEISHU_APP_ID,
        client_secret: FEISHU_APP_SECRET,
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();

    if (data.code !== 0 || !data.data?.access_token) {
      console.error("[OAuth] Token refresh failed:", data);
      // Delete invalid token
      await supabase?.from("feishu_user_tokens").delete().eq("feishu_user_id", feishuUserId);
      return null;
    }

    const tokenData = data.data;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Update token in database
    await storeUserToken({
      feishu_user_id: feishuUserId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || refreshToken,
      token_type: tokenData.token_type || "Bearer",
      expires_at: expiresAt,
      scope: tokenData.scope || "",
      created_at: new Date().toISOString(), // preserve original?
      updated_at: new Date().toISOString(),
    });

    console.log(`✅ [OAuth] Token refreshed for user: ${feishuUserId}`);
    return tokenData.access_token;

  } catch (error: any) {
    console.error("[OAuth] refreshUserToken error:", error);
    return null;
  }
}

/**
 * Check if user has authorized document access
 */
export async function hasUserAuthorized(feishuUserId: string): Promise<boolean> {
  const token = await getUserAccessToken(feishuUserId);
  return token !== null;
}

/**
 * Revoke user's OAuth token (user can re-authorize later)
 */
export async function revokeUserToken(feishuUserId: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from("feishu_user_tokens")
    .delete()
    .eq("feishu_user_id", feishuUserId);

  if (error) {
    console.error("[OAuth] Failed to revoke token:", error);
  } else {
    console.log(`✅ [OAuth] Token revoked for user: ${feishuUserId}`);
  }
}

/**
 * Create a Feishu client using user's access token
 * This client can access docs the user has permission to read
 */
export async function createUserFeishuClient(
  feishuUserId: string
): Promise<{ client: lark.Client; userToken: string } | null> {
  const userToken = await getUserAccessToken(feishuUserId);
  
  if (!userToken) {
    return null;
  }

  // Create client with app credentials (still needed for API structure)
  const client = new lark.Client({
    appId: FEISHU_APP_ID,
    appSecret: FEISHU_APP_SECRET,
    appType: lark.AppType.SelfBuild,
    domain: lark.Domain.Feishu,
  });

  return { client, userToken };
}

