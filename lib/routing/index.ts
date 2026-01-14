/**
 * Routing Module - Intent-First Query Routing
 *
 * Provides deterministic routing for Feishu queries:
 * - Pattern-based intent classification
 * - Direct tool execution
 * - Workflow orchestration
 * - Agent fallback for novel queries
 *
 * Usage:
 * ```typescript
 * import { routeQuery } from "./routing";
 *
 * const result = await routeQuery(query, messages, {
 *   chatId,
 *   rootId,
 *   userId,
 *   onUpdate: async (text) => updateCard(text),
 * });
 * ```
 */

// Main router
export {
  routeQuery,
  wouldRouteToAgent,
  getRoutingDecision,
  type RouterResult,
  type RouterContext,
} from "./router";

// Intent classifier
export {
  classifyIntent,
  getIntentRules,
  addIntentRule,
  testClassification,
  type RouteTarget,
  type IntentRule,
  type ClassificationResult,
} from "./intent-classifier";

// Direct tool executor
export {
  executeDirectTool,
  formatToolResult,
  type DirectToolResult,
} from "./direct-tool-executor";
