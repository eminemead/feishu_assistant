/**
 * Convert Feishu user IDs to emp_ad_account identifiers.
 *
 * Current rule: feishu_user_id = emp_ad_account + "@nio.com".
 * This helper strips the domain (case-insensitive) and returns the account part.
 *
 * @param feishuUserId - Feishu user ID (open_id/user_id)
 * @returns emp_ad_account string or null if unable to derive
 */
export function feishuIdToEmpAccount(feishuUserId?: string | null): string | null {
  if (!feishuUserId) {
    return null;
  }

  const trimmed = feishuUserId.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  const suffix = '@nio.com';

  if (lowered.endsWith(suffix)) {
    return trimmed.slice(0, trimmed.length - suffix.length);
  }

  const atIndex = trimmed.indexOf('@');
  if (atIndex > 0) {
    return trimmed.slice(0, atIndex);
  }

  return trimmed;
}

