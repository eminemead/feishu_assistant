/**
 * Intent Classifier - Deterministic Pattern-Based Routing
 *
 * Classifies user queries into intents using regex patterns.
 * NO LLM - pure deterministic routing for predictable behavior.
 *
 * Priority order:
 * 1. Document commands (watch/check/unwatch) - existing behavior
 * 2. Slash commands (/collect, /创建, etc.) - existing behavior
 * 3. Pattern-matched intents (GitLab create, OKR analysis, etc.)
 * 4. Fallback to LLM agent
 */

export type RouteTarget =
  | { type: "workflow"; workflowId: string }
  | { type: "tool"; toolId: string }
  | { type: "doc-command" }  // Special case: handled by existing doc command handler
  | { type: "slash-command"; command: string }  // Special case: handled by existing slash handler
  | { type: "agent" };  // Fallback to LLM

export interface IntentRule {
  id: string;
  patterns: RegExp[];
  target: RouteTarget;
  priority: number;  // Lower = checked first (0-100)
  description?: string;
  examples?: string[];
}

/**
 * Intent classification result
 */
export interface ClassificationResult {
  intent: string;
  target: RouteTarget;
  confidence: "exact" | "pattern" | "fallback";
  matchedPattern?: string;
}

/**
 * Core intent rules - ordered by priority
 *
 * Priority bands:
 * 0-9: Special commands (doc commands, slash commands)
 * 10-29: High-confidence workflows (create operations, analysis)
 * 30-49: Medium-confidence direct tools (read operations)
 * 50-69: Low-confidence patterns
 * 100: Fallback (agent)
 */
const INTENT_RULES: IntentRule[] = [
  // ============================================================
  // Priority 0-9: Special commands (preserve existing behavior)
  // ============================================================
  {
    id: "doc_command",
    patterns: [
      /^(watch|check|unwatch|watched|tracking:\w+)\s+/i,
    ],
    target: { type: "doc-command" },
    priority: 0,
    description: "Document tracking commands",
    examples: ["watch https://...", "check doc", "unwatch doc"],
  },
  {
    id: "slash_command",
    patterns: [
      // Match any command starting with / followed by known commands
      /^\/(?:collect|收集|创建|create|list|列表|help|帮助|status|update|comment|close|sync)(?:\s|$)/i,
    ],
    target: { type: "slash-command", command: "" },  // Command extracted at runtime
    priority: 1,
    description: "Slash commands routed to dpa-assistant workflow",
    examples: ["/collect", "/创建 bug issue", "/list issues"],
  },
  {
    id: "gitlab_confirm",
    patterns: [/^__gitlab_confirm__:/i, /^__gitlab_cancel__/i],
    target: { type: "workflow", workflowId: "dpa-assistant" },
    priority: 2,
    description: "GitLab confirmation callbacks",
    examples: ["__gitlab_confirm__:{...}", "__gitlab_cancel__"],
  },
  {
    id: "feishu_task_confirm",
    patterns: [/^__feishu_task_confirm__:/i, /^__feishu_task_cancel__/i],
    target: { type: "workflow", workflowId: "feishu-task" },
    priority: 3,
    description: "Feishu task confirmation callbacks",
    examples: ["__feishu_task_confirm__:{...}", "__feishu_task_cancel__"],
  },

  // ============================================================
  // Priority 10-19: GitLab Operations
  // ============================================================
  {
    id: "gitlab_create_issue",
    patterns: [
      /创建.*(issue|问题|工单|bug|需求)/i,
      /create.*(issue|bug|ticket)/i,
      /新建.*(issue|工单|问题)/i,
      /帮我.*开个.*(issue|工单)/i,
      /提个.*(bug|issue|问题)/i,
      /记录.*问题/i,
    ],
    target: { type: "workflow", workflowId: "dpa-assistant" },
    priority: 10,
    description: "GitLab issue creation - needs confirmation",
    examples: ["创建一个bug issue", "帮我开个工单", "create an issue for this"],
  },
  {
    id: "gitlab_update_issue",
    patterns: [
      /更新.*(issue|工单)/i,
      /update.*issue/i,
      /修改.*(issue|工单)/i,
      /关闭.*(issue|工单)/i,
      /close.*issue/i,
    ],
    target: { type: "workflow", workflowId: "dpa-assistant" },
    priority: 11,
    description: "GitLab issue update - needs confirmation",
    examples: ["更新issue #123", "关闭这个工单"],
  },
  {
    id: "gitlab_read",
    patterns: [
      /列出.*(issue|工单|问题)/i,
      /show.*issues/i,
      /list.*issues/i,
      /查看.*(issue|工单)/i,
      /(有哪些|多少).*(issue|工单)/i,
      /我的.*(issue|工单)/i,
      /issue.*状态/i,
    ],
    target: { type: "tool", toolId: "gitlab_cli" },
    priority: 30,
    description: "GitLab read operations - direct tool",
    examples: ["列出我的issues", "show open issues", "查看工单状态"],
  },

  // ============================================================
  // Priority 12-19: Feishu Task Operations
  // ============================================================
  {
    id: "feishu_task",
    patterns: [
      /^\/(?:task|todo|任务|待办)(?:\s|$)/i,
      /^(?:task|todo)\s+/i,
      /(?:创建|新建|添加|记录|安排).*(任务|待办)/i,
      /(?:任务|待办).*(创建|新建|添加|记录)/i,
      /(?:完成|标记完成|done|complete|finish|reopen|uncomplete).*(任务|待办|task|todo)/i,
      /(?:列出|查看|list|show).*(任务|待办|tasks?|todos?)/i,
      /飞书.*(任务|task|todo)/i,
    ],
    target: { type: "workflow", workflowId: "feishu-task" },
    priority: 13,
    description: "Feishu task operations",
    examples: ["创建一个任务", "list tasks", "/task fix bug"],
  },
  // ============================================================
  // Priority 10-19: OKR Operations
  // ============================================================
  {
    id: "okr_analysis",
    patterns: [
      /OKR.*分析/i,
      /分析.*OKR/i,
      /OKR.*报告/i,
      /OKR.*report/i,
      /指标覆盖率.*分析/i,
      /analyze.*OKR/i,
      /OKR.*趋势/i,
      /OKR.*对比/i,
      /各.*公司.*OKR/i,
      /城市.*OKR.*覆盖/i,
    ],
    target: { type: "workflow", workflowId: "okr-analysis" },
    priority: 10,
    description: "OKR analysis - full workflow with charts",
    examples: ["分析Q4的OKR覆盖率", "OKR分析报告", "各城市OKR对比"],
  },
  {
    id: "okr_quick_lookup",
    patterns: [
      /查.*OKR.*数据/i,
      /OKR.*(数字|数值)/i,
      /has.?metric.*percentage/i,
      /指标覆盖率是多少/i,
    ],
    target: { type: "tool", toolId: "mgr_okr_review" },
    priority: 31,
    description: "OKR quick data lookup - direct tool",
    examples: ["查一下OKR数据", "指标覆盖率是多少"],
  },

  // ============================================================
  // Priority 10-19: Document Operations
  // ============================================================
  {
    id: "doc_track_setup",
    patterns: [
      /监控.*文档/i,
      /track.*doc/i,
      /文档.*变化.*通知/i,
      /订阅.*文档/i,
      /关注.*文档.*更新/i,
    ],
    target: { type: "workflow", workflowId: "document-tracking" },
    priority: 12,
    description: "Document tracking setup - workflow",
    examples: ["监控这个文档的变化", "订阅文档更新通知"],
  },
  {
    id: "doc_read",
    patterns: [
      /读.*文档/i,
      /查看.*doc/i,
      /打开.*文档/i,
      /文档.*内容/i,
      /看.*文档/i,
      /read.*doc/i,
    ],
    target: { type: "tool", toolId: "feishu_docs" },
    priority: 32,
    description: "Document reading - direct tool",
    examples: ["读一下这个文档", "查看文档内容"],
  },

  // ============================================================
  // Priority 10-19: Release Notes
  // ============================================================
  {
    id: "release_notes",
    patterns: [
      /release.*notes/i,
      /发布.*日志/i,
      /changelog/i,
      /发布.*通知/i,
      /版本.*更新.*日志/i,
    ],
    target: { type: "workflow", workflowId: "release-notes" },
    priority: 15,
    description: "Release notes generation - workflow",
    examples: ["generate release notes", "发布日志"],
  },

  // ============================================================
  // Priority 30-49: Direct Tool Operations
  // ============================================================
  {
    id: "chat_history",
    patterns: [
      /最近.*聊/i,
      /群里.*(说|聊|讨论)/i,
      /chat.*history/i,
      /搜.*消息/i,
      /之前.*说.*什么/i,
      /回顾.*讨论/i,
    ],
    target: { type: "tool", toolId: "feishu_chat_history" },
    priority: 33,
    description: "Chat history search - direct tool",
    examples: ["最近群里聊了什么", "搜索之前的消息"],
  },
  {
    id: "visualization",
    patterns: [
      /画.*图/i,
      /生成.*图表/i,
      /create.*chart/i,
      /visualize/i,
      /可视化/i,
    ],
    target: { type: "tool", toolId: "visualization" },
    priority: 35,
    description: "Visualization/chart generation - direct tool",
    examples: ["画个柱状图", "生成饼图"],
  },

  // ============================================================
  // Priority 50-69: Feedback & Collection (DPA-specific)
  // ============================================================
  {
    id: "feedback_collection",
    patterns: [
      /总结.*反馈/i,
      /收集.*反馈/i,
      /summarize.*feedback/i,
      /feedback.*summary/i,
      /整理.*意见/i,
    ],
    target: { type: "workflow", workflowId: "dpa-assistant" },
    priority: 50,
    description: "Feedback collection and summarization",
    examples: ["总结 @xxx 的反馈", "收集大家的意见"],
  },
];

/**
 * Extract slash command from query
 */
function extractSlashCommand(query: string): string | null {
  const match = query.match(/^\/([^\s]+)/);
  return match ? `/${match[1].toLowerCase()}` : null;
}

/**
 * Classify a query into an intent
 *
 * @param query - User query text (after bot mention removal)
 * @returns Classification result with target and confidence
 */
export function classifyIntent(query: string): ClassificationResult {
  const trimmed = query.trim();

  // Sort rules by priority
  const sortedRules = [...INTENT_RULES].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        console.log(`[IntentClassifier] Matched: ${rule.id} (priority=${rule.priority}) for: "${trimmed.substring(0, 50)}..."`);

        // Special handling for slash commands - extract the actual command
        if (rule.target.type === "slash-command") {
          const cmd = extractSlashCommand(trimmed);
          if (cmd) {
            return {
              intent: rule.id,
              target: { type: "slash-command", command: cmd },
              confidence: "exact",
              matchedPattern: pattern.source,
            };
          }
        }

        return {
          intent: rule.id,
          target: rule.target,
          confidence: rule.priority < 20 ? "exact" : "pattern",
          matchedPattern: pattern.source,
        };
      }
    }
  }

  // No match - fallback to agent
  console.log(`[IntentClassifier] No match, fallback to agent for: "${trimmed.substring(0, 50)}..."`);
  return {
    intent: "unknown",
    target: { type: "agent" },
    confidence: "fallback",
  };
}

/**
 * Get all intent rules (for testing/introspection)
 */
export function getIntentRules(): IntentRule[] {
  return INTENT_RULES;
}

/**
 * Add a custom intent rule at runtime
 */
export function addIntentRule(rule: IntentRule): void {
  INTENT_RULES.push(rule);
  console.log(`[IntentClassifier] Added rule: ${rule.id}`);
}

/**
 * Test classification without executing (for debugging)
 */
export function testClassification(queries: string[]): Array<{ query: string; result: ClassificationResult }> {
  return queries.map(query => ({
    query,
    result: classifyIntent(query),
  }));
}
