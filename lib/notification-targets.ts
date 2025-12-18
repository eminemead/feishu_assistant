// Target resolution for the internal notification API.
//
// This module maps logical targets (human-meaningful names) to concrete
// Feishu destinations (chat_id, user_id, open_id, email).
//
// Configuration is supplied via NOTIFICATION_TARGETS (JSON), for example:
//
// {
//   "dev_okrs_group": { "type": "chat_id", "value": "oc_xxx_dev" },
//   "okr_ops_group":  { "type": "chat_id", "value": "oc_xxx_prod" }
// }
//
// This keeps environment-specific chat IDs out of code and lets operators
// change routing without modifying callers or recompiling.

import { NotificationTarget, NotificationTargetSchema } from "./notification-types";
import type { NotificationAuthContext } from "./notification-auth";

export interface ResolvedTarget {
  receiveIdType: "chat_id" | "user_id" | "open_id" | "email";
  receiveId: string;
}

interface RawTargetConfig {
  type: "chat_id" | "user_id" | "open_id" | "email";
  value: string;
}

type TargetConfigMap = Record<string, RawTargetConfig>;

function loadTargetConfig(): TargetConfigMap {
  const raw = process.env.NOTIFICATION_TARGETS;
  if (!raw) {
    console.warn(
      "[NotificationTargets] NOTIFICATION_TARGETS not set; logical_name targets will not resolve.",
    );
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as TargetConfigMap;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("parsed config is not an object");
    }
    return parsed;
  } catch (error) {
    console.error(
      "[NotificationTargets] Failed to parse NOTIFICATION_TARGETS:",
      error,
    );
    return {};
  }
}

let cachedTargets: TargetConfigMap | null = null;

function getTargetConfig(): TargetConfigMap {
  if (!cachedTargets) {
    cachedTargets = loadTargetConfig();
  }
  return cachedTargets;
}

/**
 * Resolve a NotificationTarget to a concrete Feishu receive_id_type / receive_id
 * pair, enforcing logical target authorization based on the caller identity.
 */
export function resolveNotificationTarget(
  target: NotificationTarget,
  auth: NotificationAuthContext,
): ResolvedTarget {
  // Validate target structurally (defensive) before processing.
  NotificationTargetSchema.parse(target);

  if (target.type === "logical_name") {
    const logicalName = target.value;

    const allowed = auth.allowedLogicalTargets ?? [];
    if (!allowed.includes(logicalName)) {
      throw new Error(
        `FORBIDDEN: client "${auth.id}" is not allowed to send to logical target "${logicalName}"`,
      );
    }

    const config = getTargetConfig();
    const resolved = config[logicalName];

    if (!resolved) {
      throw new Error(
        `INVALID_TARGET: logical target "${logicalName}" is not configured in NOTIFICATION_TARGETS`,
      );
    }

    return {
      receiveIdType: resolved.type,
      receiveId: resolved.value,
    };
  }

  // For concrete targets we currently trust the caller, but this function is
  // the right place to add future per-client restrictions (e.g. only allow
  // certain chat_ids per client).
  switch (target.type) {
    case "chat_id":
      return { receiveIdType: "chat_id", receiveId: target.value };
    case "user_id":
      return { receiveIdType: "user_id", receiveId: target.value };
    case "open_id":
      return { receiveIdType: "open_id", receiveId: target.value };
    case "email":
      return { receiveIdType: "email", receiveId: target.value };
    default: {
      // This should be unreachable thanks to the discriminated union, but keep
      // a defensive guard here in case of schema drift.
      const exhaustiveCheck: never = target;
      throw new Error(
        `INVALID_TARGET: unsupported target type ${(exhaustiveCheck as any)?.type}`,
      );
    }
  }
}

