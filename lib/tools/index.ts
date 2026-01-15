/**
 * Tool Factories & Tool Instances
 * 
 * Centralized exports for all Mastra tools.
 * 
 * ARCHITECTURE:
 * - Tool FACTORIES (createXxxTool): Create tool instances with configurable options
 * - Tool INSTANCES (xxxTool): Pre-configured tool instances for direct use
 * 
 * Usage:
 * - Production agents: Use factories with caching and devtools tracking
 * - Development/testing: Use factories without caching
 * - Direct use: Use pre-configured instances
 */

// ============================================
// TOOL FACTORIES (create with custom options)
// ============================================
export { createSearchWebTool } from "./search-web-tool";
export { createOkrReviewTool } from "./okr-review-tool";
export { createGitLabCliTool, type GitLabCliResult } from "./gitlab-cli-tool";
export { createFeishuChatHistoryTool, getChatMemberMapping, type ChatHistoryResult } from "./feishu-chat-history-tool";
export { createFeishuDocsTool } from "./feishu-docs-tool";
export { createBashToolkitTools } from "./bash-toolkit";
export { createExecuteWorkflowTool, executeWorkflowTool } from "./execute-workflow-tool";

// ============================================
// SEMANTIC LAYER TOOLS (Option C - structured queries)
// ============================================
// These replace raw SQL with structured metric/table queries
export { createQueryMetricTool, createGetMetricInfoTool } from "./query-metric";
export { createExploreTableTool, createGetTableSchemaInfoTool } from "./explore-table";
export {
  createListMetricsTool,
  createListTablesTool,
  createSearchSemanticLayerTool,
  createSemanticLayerTools,
} from "./semantic-layer-tools";

// ============================================
// DEPRECATED - Use semantic layer tools instead
// ============================================
/** @deprecated Use createQueryMetricTool instead. Raw SQL has security issues. */
export { createExecuteSqlTool } from "./execute-sql-tool";

// ============================================
// TOOL INSTANCES (pre-configured)
// ============================================

// Chart & Visualization tools
export { chartGenerationTool, CHART_TOOL_EXAMPLES, type ChartResponse, type ChartRequest } from "./chart-generation-tool";
export { visualizationTool, createVisualizationTool } from "./visualization-tool";

// RAG & Search tools
export { documentSemanticSearchTool } from "./document-semantic-search-tool";

// Follow-up generation tools
export { generateFollowupsTool, generateFollowupQuestions } from "./generate-followups-tool";

// TTS Voice tool (mlx-audio based)
export { createTtsVoiceTool, ttsVoiceTool, preloadTtsModel } from "./tts-voice-tool";

