/**
 * Execute Workflow Tool
 * 
 * Allows the unified agent to spawn deterministic workflows.
 * Used for multi-step operations that need explicit control flow.
 * 
 * Registered workflows:
 * - dpa-assistant: GitLab issue creation with confirmation
 * - okr-analysis: OKR data + charts + insights
 * - document-tracking: Document change monitoring
 */

import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { executeSkillWorkflow, getAvailableWorkflows } from "../workflows";

const executeWorkflowSchema = z.object({
  workflowId: z.enum(["dpa-assistant", "okr-analysis", "document-tracking", "feishu-task"])
    .describe("ID of workflow to execute"),
  query: z.string().describe("User query to pass to workflow"),
  params: z.record(z.any()).optional().describe("Additional workflow parameters"),
});

export const executeWorkflowTool = createTool({
  id: "execute_workflow",
  description: `Execute a deterministic workflow for multi-step operations.

Available workflows:
- **dpa-assistant**: GitLab issue creation with confirmation buttons. Use for: creating issues, updating linked issues.
- **okr-analysis**: Complete OKR analysis with data query, chart generation, and insights. Use for: "分析OKR", "OKR分析", comprehensive OKR reports.
- **document-tracking**: Set up document change tracking. Use for: "watch doc", "track document changes".
- **feishu-task**: Feishu task creation with GitLab linking + confirmation. Use for: "创建任务", "list tasks", "complete task".

Use this tool when the user needs a multi-step operation with explicit confirmation or complex data processing.`,
  inputSchema: executeWorkflowSchema,
  execute: async (input) => {
    const { workflowId, query, params = {} } = input;
    
    console.log(`[ExecuteWorkflow] Starting workflow: ${workflowId}`);
    console.log(`[ExecuteWorkflow] Query: "${query}"`);
    
    try {
      const result = await executeSkillWorkflow(workflowId, {
        query,
        ...params,
      });

      console.log(`[ExecuteWorkflow] Workflow ${workflowId} complete (success=${result.success}, duration=${result.durationMs}ms)`);

      // Return structured result
      return {
        success: result.success,
        response: result.response,
        durationMs: result.durationMs,
        needsConfirmation: result.needsConfirmation || false,
        confirmationData: result.confirmationData,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExecuteWorkflow] Error executing ${workflowId}:`, errorMsg);
      
      return {
        success: false,
        response: `Workflow execution failed: ${errorMsg}`,
        error: errorMsg,
      };
    }
  },
});

/**
 * Factory function to create execute_workflow tool
 */
export function createExecuteWorkflowTool() {
  return executeWorkflowTool;
}

/**
 * Get list of available workflows (for agent introspection)
 */
export function listAvailableWorkflows(): string[] {
  return getAvailableWorkflows();
}
