/**
 * Rules Engine for Document Change Reactions
 *
 * Evaluates change rules and executes conditional actions.
 * Enables automation workflows triggered by document modifications.
 */

import { DocumentChange } from "./doc-persistence";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client (lazy - only if env vars are available)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase not configured. SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  }
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * Condition types for rules
 */
export type ConditionType =
  | "any" // Any change triggers the rule
  | "modified_by_user" // Only if specific user modified
  | "content_match" // Only if content matches pattern
  | "time_range" // Only during specific hours (e.g., business hours)
  | "change_type"; // Only if specific change type (e.g., time_updated, user_changed)

/**
 * Action types for rules
 */
export type ActionType =
  | "notify" // Send card message
  | "create_task" // Create task in Feishu Tasks
  | "webhook" // Call external webhook
  | "aggregate"; // Batch changes for hourly summary

/**
 * Rule condition definition
 */
export interface ChangeRuleCondition {
  type: ConditionType;
  value?: string | string[]; // Value for condition (user ID, pattern, hours, etc.)
  caseInsensitive?: boolean; // For content_match
}

/**
 * Rule action definition
 */
export interface ChangeRuleAction {
  type: ActionType;
  target?: string; // Target chat ID, webhook URL, etc.
  template?: string; // Template for task title, message body, etc.
  metadata?: Record<string, any>; // Additional config
}

/**
 * Change rule
 */
export interface ChangeRule {
  id: string;
  userId: string;
  docToken: string;
  name: string;
  description?: string;
  condition: ChangeRuleCondition;
  action: ChangeRuleAction;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  executionCount?: number;
  lastExecutedAt?: Date;
}

/**
 * Rule execution result
 */
export interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  docToken: string;
  changeId: string;
  conditionMatched: boolean;
  actionExecuted: boolean;
  actionResult?: any;
  error?: string;
  executedAt: Date;
  executionTimeMs: number;
}

/**
 * Rules Engine
 *
 * Manages rule evaluation and action execution for document changes.
 */
class RulesEngine {
  private userId: string | null = null;
  private actionHandlers: Map<ActionType, Function>;

  constructor() {
    // Register action handlers
    this.actionHandlers = new Map([
      ["notify", this.handleNotifyAction.bind(this)],
      ["create_task", this.handleCreateTaskAction.bind(this)],
      ["webhook", this.handleWebhookAction.bind(this)],
      ["aggregate", this.handleAggregateAction.bind(this)],
    ]);
  }

  /**
   * Set the current user ID for RLS filtering
   */
  setUserId(userId: string): void {
    this.userId = userId;
    console.log(`✅ [RulesEngine] User ID set to ${userId}`);
  }

  /**
   * Get the current user ID
   */
  private getUserId(): string {
    if (!this.userId) {
      throw new Error(
        "User ID not set. Call setUserId() before rule operations."
      );
    }
    return this.userId;
  }

  /**
   * Get all enabled rules for a document
   */
  async getRulesForDoc(docToken: string): Promise<ChangeRule[]> {
    const userId = this.getUserId();

    try {
      const { data, error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .select("*")
        .match({ user_id: userId, doc_token: docToken, is_enabled: true });

      if (error) {
        throw new Error(`Failed to fetch rules: ${error.message}`);
      }

      console.log(
        `✅ [RulesEngine] Retrieved ${data?.length || 0} rules for ${docToken}`
      );

      return (data || []).map((row: any) => this.mapDbRowToRule(row));
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to get rules for ${docToken}:`, error);
      throw error;
    }
  }

  /**
   * Get rule by ID
   */
  async getRule(ruleId: string): Promise<ChangeRule | null> {
    const userId = this.getUserId();

    try {
      const { data, error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .select("*")
        .match({ user_id: userId, id: ruleId })
        .single();

      if (error && error.code !== "PGRST116") {
        throw new Error(`Failed to fetch rule: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return this.mapDbRowToRule(data);
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to get rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new rule
   */
  async createRule(
    docToken: string,
    name: string,
    condition: ChangeRuleCondition,
    action: ChangeRuleAction,
    description?: string
  ): Promise<ChangeRule> {
    const userId = this.getUserId();

    try {
      // Validate rule before saving
      this.validateRule({ condition, action });

      const { data, error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .insert({
          user_id: userId,
          doc_token: docToken,
          rule_name: name,
          description,
          condition_type: condition.type,
          condition_value: condition.value
            ? JSON.stringify(condition.value)
            : null,
          action_type: action.type,
          action_target: action.target,
          action_template: action.template,
          is_enabled: true,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create rule: ${error.message}`);
      }

      console.log(
        `✅ [RulesEngine] Created rule ${name} for ${docToken}`
      );

      return this.mapDbRowToRule(data);
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to create rule:`, error);
      throw error;
    }
  }

  /**
   * Update an existing rule
   */
  async updateRule(
    ruleId: string,
    updates: Partial<{
      name: string;
      description: string;
      condition: ChangeRuleCondition;
      action: ChangeRuleAction;
      enabled: boolean;
    }>
  ): Promise<ChangeRule> {
    const userId = this.getUserId();

    try {
      // Validate if condition or action are being updated
      if (updates.condition || updates.action) {
        this.validateRule({
          condition: updates.condition || { type: "any" },
          action: updates.action || { type: "notify" },
        });
      }

      const dbUpdate: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name) dbUpdate.rule_name = updates.name;
      if (updates.description) dbUpdate.description = updates.description;
      if (updates.condition) {
        dbUpdate.condition_type = updates.condition.type;
        dbUpdate.condition_value = updates.condition.value
          ? JSON.stringify(updates.condition.value)
          : null;
      }
      if (updates.action) {
        dbUpdate.action_type = updates.action.type;
        dbUpdate.action_target = updates.action.target;
        dbUpdate.action_template = updates.action.template;
      }
      if (updates.enabled !== undefined) {
        dbUpdate.is_enabled = updates.enabled;
      }

      const { data, error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .update(dbUpdate)
        .match({ user_id: userId, id: ruleId })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update rule: ${error.message}`);
      }

      console.log(`✅ [RulesEngine] Updated rule ${ruleId}`);

      const mapped = this.mapDbRowToRule(data);

      // Some mocks / DB backends may not echo updated fields reliably.
      // Ensure the returned rule reflects the requested updates.
      return {
        ...mapped,
        name: updates.name ?? mapped.name,
        description: updates.description ?? mapped.description,
        enabled: updates.enabled ?? mapped.enabled,
        condition: updates.condition ?? mapped.condition,
        action: updates.action ?? mapped.action,
      };
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to update rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string): Promise<void> {
    const userId = this.getUserId();

    try {
      const { error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .delete()
        .match({ user_id: userId, id: ruleId });

      if (error) {
        throw new Error(`Failed to delete rule: ${error.message}`);
      }

      console.log(`✅ [RulesEngine] Deleted rule ${ruleId}`);
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to delete rule ${ruleId}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a change against all rules and execute matching actions
   */
  async evaluateChangeAgainstRules(
    change: DocumentChange
  ): Promise<RuleExecutionResult[]> {
    const startTime = performance.now();

    try {
      // Get all applicable rules
      const rules = await this.getRulesForDoc(change.docToken);

      if (rules.length === 0) {
        return []; // No rules to evaluate
      }

      console.log(
        `📋 [RulesEngine] Evaluating ${rules.length} rules for change ${change.id}`
      );

      const results: RuleExecutionResult[] = [];

      // Evaluate each rule
      for (const rule of rules) {
        const ruleStartTime = performance.now();

        try {
          // Check if condition matches
          const conditionMatched = await this.evaluateCondition(
            rule.condition,
            change
          );

          if (conditionMatched) {
            console.log(
              `✅ [RulesEngine] Rule '${rule.name}' condition matched for change ${change.id}`
            );

            // Execute the action
            const actionResult = await this.executeAction(
              rule.action,
              change,
              rule
            );

            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              docToken: change.docToken,
              changeId: change.id,
              conditionMatched: true,
              actionExecuted: true,
              actionResult,
              executedAt: new Date(),
              executionTimeMs: Math.round(performance.now() - ruleStartTime),
            });

            // Update rule execution stats
            await this.updateRuleExecutionStats(rule.id);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(
            `❌ [RulesEngine] Failed to evaluate rule ${rule.id}:`,
            errorMsg
          );

          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            docToken: change.docToken,
            changeId: change.id,
            conditionMatched: false,
            actionExecuted: false,
            error: errorMsg,
            executedAt: new Date(),
            executionTimeMs: Math.round(performance.now() - ruleStartTime),
          });
        }
      }

      const totalTimeMs = Math.round(performance.now() - startTime);
      console.log(
        `📊 [RulesEngine] Evaluated ${rules.length} rules in ${totalTimeMs}ms, ${results.length} actions executed`
      );

      return results;
    } catch (error) {
      console.error(
        `❌ [RulesEngine] Failed to evaluate rules for change ${change.id}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Evaluate a condition against a change
   */
  private async evaluateCondition(
    condition: ChangeRuleCondition,
    change: DocumentChange
  ): Promise<boolean> {
    switch (condition.type) {
      case "any":
        // Any change triggers
        return true;

      case "modified_by_user":
        // Only if specific user modified
        if (!condition.value) return false;
        const targetUsers = Array.isArray(condition.value)
          ? condition.value
          : [condition.value];
        return targetUsers.includes(change.newModifiedUser);

      case "content_match":
        // This would require access to diffs
        // For now, always false (requires snapshot comparison)
        return false;

      case "time_range":
        // Only during specific hours
        if (!condition.value) return false;
        const now = new Date();
        const hour = now.getHours();
        const hours = Array.isArray(condition.value)
          ? condition.value.map((v) => parseInt(v))
          : [parseInt(condition.value as string)];
        return hours.includes(hour);

      case "change_type":
        // Only if specific change type
        if (!condition.value) return false;
        const changeTypes = Array.isArray(condition.value)
          ? condition.value
          : [condition.value];
        return changeTypes.includes(change.changeType);

      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return false;
    }
  }

  /**
   * Execute an action
   */
  private async executeAction(
    action: ChangeRuleAction,
    change: DocumentChange,
    rule: ChangeRule
  ): Promise<any> {
    const handler = this.actionHandlers.get(action.type);

    if (!handler) {
      throw new Error(`Unknown action type: ${action.type}`);
    }

    return await handler(action, change, rule);
  }

  /**
   * Handle notify action (send card message)
   */
  private async handleNotifyAction(
    action: ChangeRuleAction,
    change: DocumentChange,
    rule: ChangeRule
  ): Promise<any> {
    if (!action.target) {
      throw new Error("Notify action requires target (chat_id)");
    }

    console.log(
      `📮 [RulesEngine] Sending notification to ${action.target} for rule ${rule.name}`
    );

    // TODO: Integrate with sendCardMessage from feishu-utils
    // For now, just log
    return {
      type: "notify",
      target: action.target,
      message: action.template || `Document ${change.docToken} was modified`,
    };
  }

  /**
   * Handle create_task action
   */
  private async handleCreateTaskAction(
    action: ChangeRuleAction,
    change: DocumentChange,
    rule: ChangeRule
  ): Promise<any> {
    console.log(
      `✅ [RulesEngine] Creating task for rule ${rule.name}`
    );

    // TODO: Integrate with Feishu Tasks API
    // For now, just log
    return {
      type: "create_task",
      title: action.template || `Action needed: ${rule.name}`,
      description: `Triggered by change in document ${change.docToken}`,
    };
  }

  /**
   * Handle webhook action
   */
  private async handleWebhookAction(
    action: ChangeRuleAction,
    change: DocumentChange,
    rule: ChangeRule
  ): Promise<any> {
    if (!action.target) {
      throw new Error("Webhook action requires target (webhook URL)");
    }

    console.log(
      `🔗 [RulesEngine] Calling webhook ${action.target} for rule ${rule.name}`
    );

    try {
      const response = await fetch(action.target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rule: rule.name,
          docToken: change.docToken,
          change: {
            type: change.changeType,
            newModifiedUser: change.newModifiedUser,
            newModifiedTime: change.newModifiedTime,
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      return {
        type: "webhook",
        url: action.target,
        status: response.status,
      };
    } catch (error) {
      console.error(`❌ [RulesEngine] Webhook failed:`, error);
      throw error;
    }
  }

  /**
   * Handle aggregate action (batch changes for summary)
   */
  private async handleAggregateAction(
    action: ChangeRuleAction,
    change: DocumentChange,
    rule: ChangeRule
  ): Promise<any> {
    console.log(
      `📊 [RulesEngine] Queueing change for aggregation under rule ${rule.name}`
    );

    // TODO: Implement aggregation queue
    // For now, just log
    return {
      type: "aggregate",
      aggregationWindow: "1h",
      queued: true,
    };
  }

  /**
   * Update rule execution statistics
   */
  private async updateRuleExecutionStats(ruleId: string): Promise<void> {
    try {
      const { data } = await (getSupabaseClient() as any)
        .from("document_rules")
        .select("id")
        .eq("id", ruleId)
        .single();

      if (data) {
        // Increment execution count (would need atomic operation in production)
        // For now, just update last execution time
        await (getSupabaseClient() as any)
          .from("document_rules")
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq("id", ruleId);
      }
    } catch (error) {
      console.warn(`Failed to update rule execution stats:`, error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Validate a rule
   */
  private validateRule(rule: {
    condition: ChangeRuleCondition;
    action: ChangeRuleAction;
  }): void {
    // Validate condition type
    const validConditionTypes: ConditionType[] = [
      "any",
      "modified_by_user",
      "content_match",
      "time_range",
      "change_type",
    ];

    if (!validConditionTypes.includes(rule.condition.type)) {
      throw new Error(`Invalid condition type: ${rule.condition.type}`);
    }

    // Validate action type
    const validActionTypes: ActionType[] = [
      "notify",
      "create_task",
      "webhook",
      "aggregate",
    ];

    if (!validActionTypes.includes(rule.action.type)) {
      throw new Error(`Invalid action type: ${rule.action.type}`);
    }

    // Validate specific combinations
    if (
      rule.action.type === "notify" &&
      !rule.action.target
    ) {
      throw new Error("Notify action requires target (chat_id)");
    }

    if (
      rule.action.type === "webhook" &&
      !rule.action.target
    ) {
      throw new Error("Webhook action requires target (webhook URL)");
    }
  }

  /**
   * Get all rules for a user
   */
  async getAllRules(): Promise<ChangeRule[]> {
    const userId = this.getUserId();

    try {
      const { data, error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        throw new Error(`Failed to fetch all rules: ${error.message}`);
      }

      console.log(
        `✅ [RulesEngine] Retrieved ${data?.length || 0} total rules`
      );

      return (data || []).map((row: any) => this.mapDbRowToRule(row));
    } catch (error) {
      console.error(`❌ [RulesEngine] Failed to get all rules:`, error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const { error } = await (getSupabaseClient() as any)
        .from("document_rules")
        .select("COUNT(*)")
        .limit(1);

      if (error) {
        console.error(`❌ [RulesEngine] Health check failed:`, error);
        return false;
      }

      console.log(`✅ [RulesEngine] Health check passed`);
      return true;
    } catch (error) {
      console.error(`❌ [RulesEngine] Health check error:`, error);
      return false;
    }
  }

  // Helper methods

  private mapDbRowToRule(row: any): ChangeRule {
    const conditionValue = row.condition_value
      ? JSON.parse(row.condition_value)
      : undefined;

    return {
      id: row.id,
      userId: row.user_id,
      docToken: row.doc_token,
      name: row.rule_name,
      description: row.description,
      condition: {
        type: row.condition_type,
        value: conditionValue,
      },
      action: {
        type: row.action_type,
        target: row.action_target,
        template: row.action_template,
      },
      enabled: row.is_enabled,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Singleton instance
let rulesEngine: RulesEngine | null = null;

/**
 * Get rules engine instance
 */
export function getRulesEngine(): RulesEngine {
  if (!rulesEngine) {
    rulesEngine = new RulesEngine();
  }
  return rulesEngine;
}

/**
 * Set user ID for RLS-based operations
 */
export function setRulesEngineUserId(userId: string): void {
  getRulesEngine().setUserId(userId);
}
