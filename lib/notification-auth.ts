// Authentication and authorization helpers for the internal notification API.
//
// v1 design:
// - Callers authenticate via a static shared secret carried in the
//   `X-Notification-Auth` header.
// - Each secret maps to a logical client identity and a set of allowed
//   logical targets.
// - Configuration is supplied via NOTIFICATION_AUTH_CONFIG (JSON) so it can
//   be managed per-environment without code changes.
//
// This module is intentionally NOT tied to Hono types so it can be reused
// from tests or other frameworks.

import { NotificationSource } from "./notification-types";

export const NOTIFICATION_AUTH_HEADER = "x-notification-auth";

export interface NotificationClientConfig {
  /**
   * Stable identifier for this client, used in logs and metrics.
   * Examples:
   * - "cursor-dev"
   * - "amp-prod"
   * - "batch-doc-reports"
   */
  id: string;
  /**
   * High-level source category; this is typically aligned with the `meta.source`
   * field on NotificationMeta but is enforced by the server rather than the
   * caller.
   */
  source: NotificationSource;
  /**
   * List of logical targets this client is allowed to send to, e.g.:
   * - "dev_okrs_group"
   * - "okr_ops_group"
   *
   * If empty or omitted, the client will not be allowed to use
   * target.type === "logical_name".
   */
  allowedLogicalTargets?: string[];
}

export interface NotificationAuthContext extends NotificationClientConfig {}

/**
 * Parse NOTIFICATION_AUTH_CONFIG into a mapping from token → client config.
 *
 * Example env value (single line JSON):
 * {
 *   "token_cursor_dev_abc123": {
 *     "id": "cursor-dev",
 *     "source": "cursor",
 *     "allowedLogicalTargets": ["dev_okrs_group", "dev_playground"]
 *   },
 *   "token_amp_prod_xyz789": {
 *     "id": "amp-prod",
 *     "source": "amp",
 *     "allowedLogicalTargets": ["okr_ops_group", "finance_daily"]
 *   }
 * }
 */
function loadAuthConfig(): Record<string, NotificationClientConfig> {
  const raw = process.env.NOTIFICATION_AUTH_CONFIG;
  if (!raw) {
    // In development, it's helpful to log loudly; in production, this should
    // be treated as misconfiguration and surfaced via health checks.
    console.warn(
      "[NotificationAuth] NOTIFICATION_AUTH_CONFIG not set; internal notification API will reject all authenticated requests.",
    );
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, NotificationClientConfig>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("parsed config is not an object");
    }
    return parsed;
  } catch (error) {
    console.error(
      "[NotificationAuth] Failed to parse NOTIFICATION_AUTH_CONFIG:",
      error,
    );
    return {};
  }
}

// Lazy-loaded, process-wide auth config.
let cachedAuthConfig: Record<string, NotificationClientConfig> | null = null;

function getAuthConfig(): Record<string, NotificationClientConfig> {
  if (!cachedAuthConfig) {
    cachedAuthConfig = loadAuthConfig();
  }
  return cachedAuthConfig;
}

/**
 * Authenticate a request based on headers (or header-like key/value map).
 *
 * This does NOT perform target-level authorization; it only establishes the
 * caller identity and source category. Target checks are performed later in
 * the request handling flow using the returned context.
 */
export function authenticateNotificationRequest(
  headers: Record<string, string | undefined>,
): NotificationAuthContext {
  // Normalize header lookup to lowercase since HTTP headers are case-insensitive.
  const headerValue =
    headers[NOTIFICATION_AUTH_HEADER] ??
    headers[NOTIFICATION_AUTH_HEADER.toLowerCase()] ??
    headers["X-Notification-Auth"] ??
    headers["x-notification-auth"];

  if (!headerValue) {
    throw new Error("UNAUTHORIZED: missing X-Notification-Auth header");
  }

  const config = getAuthConfig();
  const clientConfig = config[headerValue];

  if (!clientConfig) {
    throw new Error("UNAUTHORIZED: invalid notification auth token");
  }

  return {
    id: clientConfig.id,
    source: clientConfig.source,
    allowedLogicalTargets: clientConfig.allowedLogicalTargets ?? [],
  };
}

