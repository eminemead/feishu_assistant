/**
 * Rules Integration Layer
 *
 * Wires rules engine into the document tracking workflow.
 * Evaluates and executes rules asynchronously without blocking polling.
 */

import {
  getRulesEngine,
  setRulesEngineUserId,
  RuleExecutionResult,
} from "./rules-engine";
import { DocumentChange } from "./doc-persistence";

/**
 * Configuration for rules integration
 */
export interface RulesIntegrationConfig {
  enabled: boolean; // Enable/disable rules evaluation
  async: boolean; // Execute rules asynchronously (don't block polling)
  timeout: number; // Max time to wait for rule evaluation (ms)
  batchSize: number; // Max rules to evaluate per batch
}

const DEFAULT_CONFIG: RulesIntegrationConfig = {
  enabled: true,
  async: true,
  timeout: 5000,
  batchSize: 100,
};

/**
 * Queue for async rule evaluation
 */
class RuleEvaluationQueue {
  private queue: Array<{
    change: DocumentChange;
    timestamp: number;
  }> = [];

  private isProcessing = false;
  private batchSize: number;
  private timeout: number;

  constructor(batchSize: number, timeout: number) {
    this.batchSize = batchSize;
    this.timeout = timeout;
    this.startProcessing();
  }

  /**
   * Add change to queue
   */
  enqueue(change: DocumentChange): void {
    this.queue.push({
      change,
      timestamp: Date.now(),
    });
  }

  /**
   * Start processing queue
   */
  private startProcessing(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000); // Process every second
  }

  /**
   * Process queued changes
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get batch from queue
      const batch = this.queue.splice(0, this.batchSize);

      for (const item of batch) {
        try {
          // Evaluate rules for this change
          const results = await getRulesEngine().evaluateChangeAgainstRules(
            item.change
          );

          if (results.length > 0) {
            console.log(
              `📋 [RulesIntegration] Executed ${results.length} rules for change ${item.change.id}`
            );
          }
        } catch (error) {
          console.error(
            `❌ [RulesIntegration] Failed to process queued change:`,
            error
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}

let evaluationQueue: RuleEvaluationQueue | null = null;

/**
 * Get or create evaluation queue
 */
function getEvaluationQueue(config: RulesIntegrationConfig): RuleEvaluationQueue {
  if (!evaluationQueue) {
    evaluationQueue = new RuleEvaluationQueue(config.batchSize, config.timeout);
  }
  return evaluationQueue;
}

/**
 * Evaluate a detected change against rules
 *
 * Called by doc-poller.ts when a change is detected.
 * Can be synchronous (blocks) or async (queued).
 */
export async function evaluateChangeRules(
  change: DocumentChange,
  config: Partial<RulesIntegrationConfig> = {}
): Promise<RuleExecutionResult[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return []; // Rules disabled
  }

  try {
    if (fullConfig.async) {
      // Queue for async evaluation, return immediately
      const queue = getEvaluationQueue(fullConfig);
      queue.enqueue(change);
      console.log(
        `⏳ [RulesIntegration] Queued change ${change.id} for async rule evaluation`
      );
      return [];
    } else {
      // Synchronous evaluation (blocks polling)
      console.log(
        `🔍 [RulesIntegration] Evaluating rules synchronously for change ${change.id}`
      );

      const timeoutPromise = new Promise<RuleExecutionResult[]>(
        (_, reject) => {
          setTimeout(
            () =>
              reject(new Error("Rule evaluation timeout")),
            fullConfig.timeout
          );
        }
      );

      const evaluationPromise = getRulesEngine().evaluateChangeAgainstRules(
        change
      );

      return await Promise.race([evaluationPromise, timeoutPromise]);
    }
  } catch (error) {
    console.error(
      `❌ [RulesIntegration] Failed to evaluate change rules:`,
      error
    );
    // Don't throw - evaluation failure shouldn't break polling
    return [];
  }
}

/**
 * Initialize rules system with user ID
 */
export function initializeRulesSystem(userId: string): void {
  setRulesEngineUserId(userId);
  console.log(`✅ [RulesIntegration] Rules system initialized for user ${userId}`);
}

/**
 * Get queue statistics
 */
export function getRuleQueueStats(
  config: Partial<RulesIntegrationConfig> = {}
): {
  queueSize: number;
  isAsyncEnabled: boolean;
} {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  const queue = getEvaluationQueue(fullConfig);
  return {
    queueSize: queue.getQueueSize(),
    isAsyncEnabled: fullConfig.async,
  };
}

/**
 * Wait for all queued rules to be processed
 *
 * Useful for testing and graceful shutdown
 */
export async function drainRuleQueue(
  config: Partial<RulesIntegrationConfig> = {},
  maxWaitMs: number = 30000
): Promise<void> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (!fullConfig.async) {
    return; // No queue in sync mode
  }

  const queue = getEvaluationQueue(fullConfig);
  const startTime = Date.now();

  while (queue.getQueueSize() > 0) {
    if (Date.now() - startTime > maxWaitMs) {
      console.warn(
        `⚠️  [RulesIntegration] Queue drain timeout after ${maxWaitMs}ms, ${queue.getQueueSize()} items remaining`
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`✅ [RulesIntegration] Rule queue drained successfully`);
}

/**
 * Example rules for common use cases
 */
export const EXAMPLE_RULES = {
  /**
   * Notify specific user of any change
   */
  notifyUser: (docToken: string, userId: string, chatId: string) => ({
    docToken,
    name: `Notify ${userId} of changes`,
    condition: { type: "modified_by_user" as const, value: userId },
    action: { type: "notify" as const, target: chatId },
  }),

  /**
   * Notify only during business hours
   */
  businessHoursOnly: (docToken: string, chatId: string) => ({
    docToken,
    name: "Notify during business hours (9-17)",
    condition: { type: "time_range" as const, value: ["9", "10", "11", "12", "13", "14", "15", "16", "17"] },
    action: { type: "notify" as const, target: chatId },
  }),

  /**
   * Create task on specific change type
   */
  createTaskOnMajorChange: (docToken: string) => ({
    docToken,
    name: "Create task on major changes",
    condition: { type: "change_type" as const, value: "user_changed" },
    action: {
      type: "create_task" as const,
      template: "Review document changes for {{docTitle}}",
    },
  }),

  /**
   * Send to webhook on any change
   */
  webhookNotification: (
    docToken: string,
    webhookUrl: string
  ) => ({
    docToken,
    name: "Webhook notification",
    condition: { type: "any" as const },
    action: { type: "webhook" as const, target: webhookUrl },
  }),

  /**
   * Aggregate changes for hourly summary
   */
  hourlySummary: (docToken: string, chatId: string) => ({
    docToken,
    name: "Hourly change summary",
    condition: { type: "any" as const },
    action: { type: "aggregate" as const, target: chatId },
  }),
};

/**
 * Get statistics about rule execution
 */
export async function getRuleStatistics(): Promise<{
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  rulesByType: Record<string, number>;
}> {
  try {
    const allRules = await getRulesEngine().getAllRules();

    const stats = {
      totalRules: allRules.length,
      enabledRules: allRules.filter((r) => r.enabled).length,
      disabledRules: allRules.filter((r) => !r.enabled).length,
      rulesByType: {} as Record<string, number>,
    };

    // Count by action type
    for (const rule of allRules) {
      const actionType = rule.action.type;
      stats.rulesByType[actionType] = (stats.rulesByType[actionType] || 0) + 1;
    }

    return stats;
  } catch (error) {
    console.error(
      `❌ [RulesIntegration] Failed to get rule statistics:`,
      error
    );
    throw error;
  }
}
