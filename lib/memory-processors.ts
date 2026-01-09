/**
 * Memory Processors - Token management for agent context
 */

import { TokenLimiter, ToolCallFilter } from "@mastra/core/processors";

const VERBOSE_TOOLS = [
  "chart_generation",
  "okr_visualization", 
  "okr_chart_streaming",
  "mgr_okr_review",
  "feishu_docs",
];

// Filters verbose tool results, then limits tokens. TokenLimiter must be last.
export const inputProcessors = [
  new ToolCallFilter({ exclude: VERBOSE_TOOLS }),
  new TokenLimiter(100000),
];
