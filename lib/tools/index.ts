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
export { createExecuteSqlTool } from "./execute-sql-tool";
export { createExecuteWorkflowTool, executeWorkflowTool } from "./execute-workflow-tool";

// ============================================
// TOOL INSTANCES (pre-configured)
// ============================================

// Chart & Visualization tools
export { chartGenerationTool, CHART_TOOL_EXAMPLES, type ChartResponse, type ChartRequest } from "./chart-generation-tool";
export { visualizationTool, quickBarChart, quickPieChart, quickLineChart } from "./visualization-tool";
export { okrChartStreamingTool } from "./okr-chart-streaming-tool";

// RAG & Search tools
export { documentSemanticSearchTool } from "./document-semantic-search-tool";

// Follow-up generation tools
export { generateFollowupsTool, generateFollowupQuestions } from "./generate-followups-tool";

