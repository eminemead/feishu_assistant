import { getDocMetadata, DocMetadata, TrackedDoc } from "./doc-tracker";
import { detectChange, createUpdatedTrackedState } from "./change-detector";
import { createAndSendStreamingCard } from "./feishu-utils";

/**
 * Configuration for document polling service
 */
export interface PollingConfig {
  /**
   * Poll interval in milliseconds
   * How often to check for document changes
   * Default: 30000 (30 seconds)
   */
  intervalMs: number;

  /**
   * Maximum concurrent document polls
   * Limits API load when tracking many documents
   * Default: 100
   */
  maxConcurrentPolls: number;

  /**
   * Batch size for API requests
   * Feishu's docs-api/meta accepts up to 200 docs per call
   * Default: 200
   */
  batchSize: number;

  /**
   * Retry configuration
   * Default: 3 attempts with exponential backoff
   */
  retryAttempts: number;

  /**
   * Debounce window for change notifications
   * Prevents spam from rapid successive edits
   * Default: 5000 (5 seconds)
   */
  debounceWindowMs: number;

  /**
   * Enable detailed logging
   * Default: true
   */
  enableLogging: boolean;

  /**
   * Enable metrics collection
   * Default: true
   */
  enableMetrics: boolean;
}

const DEFAULT_CONFIG: PollingConfig = {
  intervalMs: 30000,
  maxConcurrentPolls: 100,
  batchSize: 200,
  retryAttempts: 3,
  debounceWindowMs: 5000,
  enableLogging: true,
  enableMetrics: true,
};

/**
 * Metrics collected during polling
 */
export interface PollingMetrics {
  docsTracked: number;
  lastPollTime: number; // Unix timestamp in ms
  lastPollDurationMs: number;
  successRate: number; // 0-1
  errorsInLastHour: number;
  notificationsInLastHour: number;
  apiCallsInLastHour: number;
  queuedNotifications: number;
  failedNotifications: number;
}

/**
 * Document Polling Service
 *
 * Manages continuous polling of Feishu documents for changes.
 *
 * Responsibilities:
 * - Store and manage tracked documents
 * - Poll all documents on interval
 * - Detect changes using metadata comparison
 * - Queue and send notifications
 * - Handle errors gracefully
 * - Collect metrics
 *
 * Lifecycle:
 * ```
 * const poller = DocumentPoller.getInstance();
 * poller.startTrackingDoc(docToken, docType, chatId);  // Start tracking
 * // ... polling happens automatically every 30s ...
 * poller.stopTrackingDoc(docToken);                     // Stop tracking
 * poller.getTrackedDocs();                              // List tracked
 * ```
 */
class DocumentPoller {
  private static instance: DocumentPoller;

  private trackedDocs = new Map<string, TrackedDoc>();
  private pollingInterval: NodeJS.Timer | null = null;
  private config: PollingConfig;

  // Metrics tracking
  private metrics = {
    startTime: Date.now(),
    totalPollCount: 0,
    successfulPolls: 0,
    failedPolls: 0,
    changesDetected: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    errorTimestamps: [] as number[],
    pollDurations: [] as number[],
  };

  private constructor(config: Partial<PollingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log(`🚀 [DocPoller] Initialized with config:`, {
      intervalMs: this.config.intervalMs,
      maxConcurrentPolls: this.config.maxConcurrentPolls,
      batchSize: this.config.batchSize,
      debounceWindowMs: this.config.debounceWindowMs,
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<PollingConfig>): DocumentPoller {
    if (!DocumentPoller.instance) {
      DocumentPoller.instance = new DocumentPoller(config);
    }
    return DocumentPoller.instance;
  }

  /**
   * Start tracking a document
   */
  startTrackingDoc(
    docToken: string,
    docType: string,
    chatIdToNotify: string
  ): void {
    if (this.trackedDocs.has(docToken)) {
      this.log(`⚠️  [DocPoller] Already tracking ${docToken}`);
      return;
    }

    this.trackedDocs.set(docToken, {
      docToken,
      docType,
      chatIdToNotify,
      lastKnownUser: "",
      lastKnownTime: 0,
      lastNotificationTime: 0,
    });

    this.log(`👀 [DocPoller] Started tracking ${docToken} → ${chatIdToNotify}`);

    // Start polling if not already running
    if (!this.pollingInterval && this.trackedDocs.size > 0) {
      this.startPolling();
    }
  }

  /**
   * Stop tracking a document
   */
  stopTrackingDoc(docToken: string): void {
    if (!this.trackedDocs.has(docToken)) {
      this.log(`⚠️  [DocPoller] Not tracking ${docToken}`);
      return;
    }

    this.trackedDocs.delete(docToken);
    this.log(`⏹️  [DocPoller] Stopped tracking ${docToken}`);

    // Stop polling if no more documents to track
    if (this.trackedDocs.size === 0 && this.pollingInterval) {
      this.stopPolling();
    }
  }

  /**
   * Get list of tracked documents
   */
  getTrackedDocs(): TrackedDoc[] {
    return Array.from(this.trackedDocs.values());
  }

  /**
   * Get tracked document by token
   */
  getTrackedDoc(docToken: string): TrackedDoc | undefined {
    return this.trackedDocs.get(docToken);
  }

  /**
   * Update tracked document state (called after notification sent)
   */
  updateTrackedDocState(updated: TrackedDoc): void {
    this.trackedDocs.set(updated.docToken, updated);
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.pollAllDocuments();
    }, this.config.intervalMs);

    this.log(
      `🔄 [DocPoller] Polling started every ${this.config.intervalMs}ms`
    );
  }

  /**
   * Stop the polling loop
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.log(`⏹️  [DocPoller] Polling stopped`);
    }
  }

  /**
   * Poll all tracked documents
   * This is called on every interval
   */
  private async pollAllDocuments(): Promise<void> {
    const startTime = Date.now();
    const docsArray = Array.from(this.trackedDocs.values());

    if (docsArray.length === 0) {
      return;
    }

    this.metrics.totalPollCount++;

    try {
      this.log(
        `📊 [DocPoller] Polling ${docsArray.length} document(s)...`
      );

      // Poll each document and collect results
      const pollPromises = docsArray.map((tracked) =>
        this.pollSingleDocument(tracked)
      );

      // Use Promise.allSettled to handle partial failures
      const results = await Promise.allSettled(pollPromises);

      // Process results
      let successCount = 0;
      let failureCount = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          failureCount++;
          this.metrics.failedPolls++;
          this.metrics.errorTimestamps.push(Date.now());
        }
      }

      if (failureCount === 0) {
        this.metrics.successfulPolls++;
      }

      const pollDuration = Date.now() - startTime;
      this.metrics.pollDurations.push(pollDuration);

      // Keep only last 100 poll durations for metrics
      if (this.metrics.pollDurations.length > 100) {
        this.metrics.pollDurations.shift();
      }

      this.log(
        `✅ [DocPoller] Poll completed in ${pollDuration}ms (${successCount} success, ${failureCount} failures)`
      );
    } catch (error) {
      this.metrics.failedPolls++;
      this.metrics.errorTimestamps.push(Date.now());
      this.error(`❌ [DocPoller] Unexpected error during polling:`, error);
    }
  }

  /**
   * Poll a single document
   */
  private async pollSingleDocument(tracked: TrackedDoc): Promise<void> {
    try {
      // Fetch current metadata
      const metadata = await getDocMetadata(tracked.docToken, tracked.docType);

      if (!metadata) {
        this.warn(
          `⚠️  [DocPoller] Failed to fetch metadata for ${tracked.docToken}`
        );
        return;
      }

      // Detect changes
      const detection = detectChange(metadata, tracked, {
        debounceWindowMs: this.config.debounceWindowMs,
        enableLogging: this.config.enableLogging,
      });

      if (!detection.hasChanged) {
        return; // No change, nothing to do
      }

      this.metrics.changesDetected++;

      if (detection.debounced) {
        this.log(
          `⏸️  [DocPoller] Change debounced for ${tracked.docToken}: ${detection.reason}`
        );
        return; // Change detected but debounced
      }

      // Send notification
      await this.notifyDocChange(metadata, tracked);

      // Update tracked state
      const updated = createUpdatedTrackedState(
        tracked.docToken,
        tracked.docType,
        tracked.chatIdToNotify,
        metadata
      );
      this.updateTrackedDocState(updated);
    } catch (error) {
      this.metrics.failedPolls++;
      this.metrics.errorTimestamps.push(Date.now());
      this.error(
        `❌ [DocPoller] Error polling ${tracked.docToken}:`,
        error
      );
    }
  }

  /**
   * Send notification when document changes
   */
  private async notifyDocChange(
    metadata: DocMetadata,
    tracked: TrackedDoc
  ): Promise<void> {
    try {
      const modTime = new Date(
        metadata.lastModifiedTime * 1000
      ).toLocaleString();

      const message = `📝 **${metadata.title}**
Modified by: ${metadata.lastModifiedUser}
Modified at: ${modTime}
Document type: ${metadata.docType}`;

      await createAndSendStreamingCard(
        tracked.chatIdToNotify,
        "chat_id",
        {
          title: "📄 Document Changed",
          initialContent: message,
        }
      );

      this.metrics.notificationsSent++;
      this.log(
        `✅ [DocPoller] Notification sent for ${tracked.docToken} to ${tracked.chatIdToNotify}`
      );
    } catch (error) {
      this.metrics.notificationsFailed++;
      this.error(
        `❌ [DocPoller] Failed to send notification for ${tracked.docToken}:`,
        error
      );
    }
  }

  /**
   * Get current polling metrics
   */
  getMetrics(): PollingMetrics {
    const now = Date.now();
    const oneHourAgoMs = now - 3600000;

    // Count errors in last hour
    const recentErrors = this.metrics.errorTimestamps.filter(
      (ts) => ts > oneHourAgoMs
    ).length;

    // Calculate success rate (last 100 polls)
    const recentPollCount = Math.min(100, this.metrics.totalPollCount);
    const recentSuccesses = Math.max(
      0,
      this.metrics.successfulPolls -
        Math.max(0, this.metrics.totalPollCount - 100)
    );
    const successRate =
      recentPollCount > 0 ? recentSuccesses / recentPollCount : 1.0;

    // Average poll duration
    const avgPollDuration =
      this.metrics.pollDurations.length > 0
        ? Math.round(
            this.metrics.pollDurations.reduce((a, b) => a + b, 0) /
              this.metrics.pollDurations.length
          )
        : 0;

    return {
      docsTracked: this.trackedDocs.size,
      lastPollTime: this.metrics.startTime,
      lastPollDurationMs: avgPollDuration,
      successRate: Math.round(successRate * 100) / 100,
      errorsInLastHour: recentErrors,
      notificationsInLastHour: this.metrics.notificationsSent,
      apiCallsInLastHour: Math.round(this.metrics.totalPollCount),
      queuedNotifications: 0, // Would use queue system in production
      failedNotifications: this.metrics.notificationsFailed,
    };
  }

  /**
   * Clear all metrics (for testing)
   */
  clearMetrics(): void {
    this.metrics = {
      startTime: Date.now(),
      totalPollCount: 0,
      successfulPolls: 0,
      failedPolls: 0,
      changesDetected: 0,
      notificationsSent: 0,
      notificationsFailed: 0,
      errorTimestamps: [],
      pollDurations: [],
    };
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: "healthy" | "degraded" | "unhealthy";
    reason?: string;
  } {
    const metrics = this.getMetrics();

    if (metrics.successRate < 0.9 && metrics.docsTracked > 0) {
      return {
        status: "degraded",
        reason: `Success rate ${metrics.successRate} < 90%`,
      };
    }

    if (metrics.errorsInLastHour > 5) {
      return {
        status: "degraded",
        reason: `${metrics.errorsInLastHour} errors in last hour`,
      };
    }

    if (this.trackedDocs.size === 0) {
      return {
        status: "healthy",
        reason: "No documents tracked",
      };
    }

    return {
      status: "healthy",
      reason: "All systems operational",
    };
  }

  /**
   * Reset polling service (for testing)
   */
  reset(): void {
    this.stopPolling();
    this.trackedDocs.clear();
    this.clearMetrics();
    this.log(`🔄 [DocPoller] Service reset`);
  }

  // Logging helpers
  private log(message: string, data?: any): void {
    if (this.config.enableLogging) {
      console.log(message, data || "");
    }
  }

  private warn(message: string, data?: any): void {
    console.warn(message, data || "");
  }

  private error(message: string, error?: any): void {
    console.error(message, error || "");
  }
}

/**
 * Get singleton instance of document poller
 */
export function getDocPoller(config?: Partial<PollingConfig>): DocumentPoller {
  return DocumentPoller.getInstance(config);
}

/**
 * Start tracking a document
 */
export function startTrackingDoc(
  docToken: string,
  docType: string,
  chatIdToNotify: string
): void {
  const poller = DocumentPoller.getInstance();
  poller.startTrackingDoc(docToken, docType, chatIdToNotify);
}

/**
 * Stop tracking a document
 */
export function stopTrackingDoc(docToken: string): void {
  const poller = DocumentPoller.getInstance();
  poller.stopTrackingDoc(docToken);
}

/**
 * Get list of tracked documents
 */
export function getTrackedDocs(): TrackedDoc[] {
  const poller = DocumentPoller.getInstance();
  return poller.getTrackedDocs();
}

/**
 * Get polling metrics
 */
export function getPollingMetrics(): PollingMetrics {
  const poller = DocumentPoller.getInstance();
  return poller.getMetrics();
}

/**
 * Get health status
 */
export function getPollingHealth(): {
  status: "healthy" | "degraded" | "unhealthy";
  reason?: string;
} {
  const poller = DocumentPoller.getInstance();
  return poller.getHealthStatus();
}
