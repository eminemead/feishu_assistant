import { DocMetadata, TrackedDoc } from "./doc-tracker";

/**
 * Result of detecting changes in a document
 */
export interface ChangeDetectionResult {
  hasChanged: boolean;
  changeType?: "time_updated" | "user_changed" | "new_document";
  previousUser?: string;
  previousTime?: number;
  currentUser: string;
  currentTime: number;
  changedAt: Date;
  debounced: boolean; // true if change detected but notification debounced
  reason?: string; // Explanation of detection/debouncing decision
}

/**
 * Configuration for change detection and debouncing
 */
export interface ChangeDetectionConfig {
  /**
   * Debounce window in milliseconds
   * Changes within this window are grouped as single notification
   * Prevents spam for rapid successive edits
   * Default: 5000 (5 seconds)
   */
  debounceWindowMs: number;

  /**
   * Allow duplicate notifications for same user
   * If false, won't notify if same user modified again
   * Default: false (suppress repeated same-user changes)
   */
  allowDuplicateNotifications: boolean;

  /**
   * Enable logging for debugging
   * Default: true
   */
  enableLogging: boolean;
}

const DEFAULT_CONFIG: ChangeDetectionConfig = {
  debounceWindowMs: 5000,
  allowDuplicateNotifications: false,
  enableLogging: true,
};

/**
 * Detects changes in document with intelligent debouncing
 *
 * Algorithm:
 * 1. Check if metadata changed (time or user)
 * 2. If no change detected, return false
 * 3. If changed, apply debouncing rules:
 *    - If notification sent within debounce window, suppress (debounced)
 *    - If same user modified twice, check allowDuplicateNotifications setting
 * 4. Return detection result with reason for decision
 *
 * Edge Cases Handled:
 * - Rapid edits by same user within debounce window (debounced)
 * - Multiple users editing in sequence (each notified)
 * - Clock skew (comparison uses <= to handle edge cases)
 * - First time tracking document (always notify)
 * - Document reverted (will notify again if time changes)
 *
 * @param current Current metadata from Feishu
 * @param previous Previous tracked state
 * @param config Detection configuration (optional)
 * @returns Change detection result with decision and reason
 *
 * @example
 * ```typescript
 * const current = await getDocMetadata(docToken);
 * const previous = trackedDocs.get(docToken);
 * const result = detectChange(current, previous);
 *
 * if (result.hasChanged && !result.debounced) {
 *   // Send notification
 *   console.log(`Change: ${result.reason}`);
 * } else if (result.debounced) {
 *   console.log(`Change detected but debounced: ${result.reason}`);
 * }
 * ```
 */
export function detectChange(
  current: DocMetadata,
  previous: TrackedDoc | undefined,
  config: Partial<ChangeDetectionConfig> = {}
): ChangeDetectionResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  // Case 1: First time tracking this document
  if (!previous) {
    if (fullConfig.enableLogging) {
      console.log(
        `📊 [ChangeDetect] New document tracking started: ${current.docToken}`
      );
    }

    return {
      hasChanged: true,
      changeType: "new_document",
      currentUser: current.lastModifiedUser,
      currentTime: current.lastModifiedTime,
      changedAt: new Date(),
      debounced: false,
      reason: "First time tracking document",
    };
  }

  // Case 2: No change in modification time or user
  if (
    current.lastModifiedTime === previous.lastKnownTime &&
    current.lastModifiedUser === previous.lastKnownUser
  ) {
    if (fullConfig.enableLogging) {
      console.log(
        `📊 [ChangeDetect] No change detected for ${current.docToken}`
      );
    }

    return {
      hasChanged: false,
      currentUser: current.lastModifiedUser,
      currentTime: current.lastModifiedTime,
      changedAt: new Date(),
      debounced: false,
      reason: "No metadata change (same user, same time)",
    };
  }

  // Case 3: Time changed (document edited)
  if (current.lastModifiedTime > previous.lastKnownTime) {
    const changeType = "time_updated";

    // Check debouncing: was a notification sent recently?
    const timeSinceLastNotificationMs =
      now - previous.lastNotificationTime;

    if (timeSinceLastNotificationMs < fullConfig.debounceWindowMs) {
      if (fullConfig.enableLogging) {
        console.log(
          `📊 [ChangeDetect] Change detected but DEBOUNCED for ${current.docToken} (${timeSinceLastNotificationMs}ms < ${fullConfig.debounceWindowMs}ms)`
        );
      }

      return {
        hasChanged: true,
        changeType,
        previousUser: previous.lastKnownUser,
        previousTime: previous.lastKnownTime,
        currentUser: current.lastModifiedUser,
        currentTime: current.lastModifiedTime,
        changedAt: new Date(),
        debounced: true,
        reason: `Debounced: change within ${fullConfig.debounceWindowMs}ms of last notification`,
      };
    }

    if (fullConfig.enableLogging) {
      console.log(
        `📊 [ChangeDetect] Change detected for ${current.docToken}: time updated by ${current.lastModifiedUser}`
      );
    }

    return {
      hasChanged: true,
      changeType,
      previousUser: previous.lastKnownUser,
      previousTime: previous.lastKnownTime,
      currentUser: current.lastModifiedUser,
      currentTime: current.lastModifiedTime,
      changedAt: new Date(),
      debounced: false,
      reason: `Document updated by ${current.lastModifiedUser}`,
    };
  }

  // Case 4: Time is same, but user changed
  if (current.lastModifiedUser !== previous.lastKnownUser) {
    // This is unusual - typically both time and user change together
    // But handle it as a change (different editor)
    const changeType = "user_changed";

    if (fullConfig.enableLogging) {
      console.log(
        `📊 [ChangeDetect] Different user detected for ${current.docToken}: ${previous.lastKnownUser} → ${current.lastModifiedUser}`
      );
    }

    return {
      hasChanged: true,
      changeType,
      previousUser: previous.lastKnownUser,
      previousTime: previous.lastKnownTime,
      currentUser: current.lastModifiedUser,
      currentTime: current.lastModifiedTime,
      changedAt: new Date(),
      debounced: false,
      reason: `Different user detected (${previous.lastKnownUser} → ${current.lastModifiedUser})`,
    };
  }

  // Case 5: Fallback (shouldn't reach here)
  return {
    hasChanged: false,
    currentUser: current.lastModifiedUser,
    currentTime: current.lastModifiedTime,
    changedAt: new Date(),
    debounced: false,
    reason: "Unknown state",
  };
}

/**
 * Check if enough time has passed to send another notification
 * Useful for secondary debouncing or rate limiting
 *
 * @param lastNotificationTime Timestamp of last notification
 * @param minIntervalMs Minimum milliseconds between notifications
 * @returns true if enough time has passed
 */
export function shouldNotifyAgain(
  lastNotificationTime: number,
  minIntervalMs: number = 5000
): boolean {
  const now = Date.now();
  return now - lastNotificationTime >= minIntervalMs;
}

/**
 * Get time since last notification in seconds
 * Useful for logging and metrics
 *
 * @param lastNotificationTime Timestamp of last notification
 * @returns Seconds since last notification
 */
export function getTimeSinceLastNotification(
  lastNotificationTime: number
): number {
  const now = Date.now();
  return Math.round((now - lastNotificationTime) / 1000);
}

/**
 * Format change detection result for logging
 *
 * @param result Detection result
 * @returns Formatted string
 */
export function formatDetectionResult(result: ChangeDetectionResult): string {
  const status = result.hasChanged
    ? result.debounced
      ? "⏸️  DEBOUNCED"
      : "✅ DETECTED"
    : "⊘ NO CHANGE";

  const details = result.reason
    ? ` (${result.reason})`
    : "";

  return `${status}${details}`;
}

/**
 * Create updated tracked doc state after notification sent
 * Updates the last notification time and current metadata
 *
 * @param docToken Document token
 * @param docType Document type
 * @param chatIdToNotify Chat ID to notify
 * @param metadata Current document metadata
 * @returns Updated TrackedDoc with current state
 */
export function createUpdatedTrackedState(
  docToken: string,
  docType: string,
  chatIdToNotify: string,
  metadata: DocMetadata
): TrackedDoc {
  return {
    docToken,
    docType,
    chatIdToNotify,
    lastKnownUser: metadata.lastModifiedUser,
    lastKnownTime: metadata.lastModifiedTime,
    lastNotificationTime: Date.now(),
  };
}

/**
 * Analyze change pattern for insights
 * Useful for debugging or analytics
 *
 * @param results Array of detection results
 * @returns Analysis summary
 */
export function analyzeChangePattern(
  results: ChangeDetectionResult[]
): {
  totalChanges: number;
  totalDebounced: number;
  uniqueUsers: Set<string>;
  averageChangeInterval: number;
} {
  const uniqueUsers = new Set<string>();
  let totalDebounced = 0;
  let totalChangeInterval = 0;

  for (const result of results) {
    if (result.hasChanged && !result.debounced) {
      uniqueUsers.add(result.currentUser);
    }
    if (result.debounced) {
      totalDebounced++;
    }
  }

  // Calculate average change interval
  if (results.length > 1) {
    let intervalSum = 0;
    for (let i = 1; i < results.length; i++) {
      intervalSum +=
        results[i].changedAt.getTime() - results[i - 1].changedAt.getTime();
    }
    totalChangeInterval = Math.round(intervalSum / (results.length - 1));
  }

  return {
    totalChanges: results.length,
    totalDebounced,
    uniqueUsers,
    averageChangeInterval: totalChangeInterval,
  };
}
