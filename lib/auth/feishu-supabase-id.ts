import { createHash } from 'crypto';

/**
 * Generate a deterministic Supabase user ID (UUID v5 style) from a Feishu user ID.
 *
 * Supabase requires UUID primary keys for auth.users. Feishu IDs are arbitrary strings,
 * so we hash them into a stable UUID so the same Feishu user always maps to the same
 * Supabase user id. This allows us to reference Supabase auth tables and RLS policies
 * using auth.uid().
 *
 * @param feishuUserId - Feishu open_id/user_id
 * @returns Deterministic UUID string
 */
export function getSupabaseUserId(feishuUserId: string): string {
  const hash = createHash('sha1')
    .update('feishu-supabase-namespace:')
    .update(feishuUserId)
    .digest();

  const bytes = Buffer.from(hash.slice(0, 16));

  // Set UUID version (v5) and variant bits per RFC 4122
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

