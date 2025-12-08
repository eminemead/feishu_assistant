import { Agent } from "@ai-sdk-tools/agents";
import { getPrimaryModel } from "../shared/model-fallback";
import { handleDocumentCommand } from "../handle-doc-commands";
import { tool } from "ai";
import { z } from "zod";
import { documentSemanticSearchTool } from "../tools/document-semantic-search-tool";

/**
 * DocumentTracking Agent Skeleton
 * 
 * This agent handles:
 * - Starting document tracking (@bot watch <doc>)
 * - Checking document status (@bot check <doc>)
 * - Stopping tracking (@bot unwatch <doc>)
 * - Listing tracked documents (@bot watched)
 * - Viewing change history (@bot tracking:history <doc>)
 * 
 * Architecture:
 * - Parses user commands for document tracking operations
 * - Routes to appropriate actions (watch, check, unwatch, etc.)
 * - Returns formatted responses as Feishu cards
 * 
 * TODO: Phase 1 Implementation
 * - [ ] Implement metadata fetching from Feishu docs-api/meta
 * - [ ] Implement change detection algorithm
 * - [ ] Implement polling infrastructure
 * - [ ] Implement persistence layer (Supabase)
 * - [ ] Implement bot commands and UX
 */

// Configuration for document tracking
export const DOCUMENT_TRACKING_CONFIG = {
  pollingIntervalMs: 30000, // 30 seconds
  maxConcurrentPolls: 100,
  batchSize: 200,
  retryAttempts: 3,
  retryBackoffMs: [100, 500, 2000],
  debounceWindowMs: 5000, // 5 seconds
  enableMetrics: true,
};

// Types for document tracking
export interface TrackedDocument {
  docToken: string;
  docType: string; // 'doc', 'sheet', 'bitable', 'docx'
  chatIdToNotify: string;
  startedTrackingAt: number;
  lastModifiedUser?: string;
  lastModifiedTime?: number;
  isActive: boolean;
  createdByUserId?: string;
  notes?: string;
}

export interface DocumentMetadata {
  documentToken: string;
  title: string;
  ownerId: string;
  createdTime: number; // Unix timestamp in seconds
  lastModifiedUser?: string;
  lastModifiedTime: number; // Unix timestamp in seconds
  docType: string;
}

export interface ChangeDetectionResult {
  docToken: string;
  changed: boolean;
  changedBy?: string;
  changedAt?: number;
  previousUser?: string;
  previousTime?: number;
}

/**
 * Create tool for executing document tracking commands
 */
function createDocumentCommandTool() {
  return tool({
    description: "Execute document tracking commands like watch, check, unwatch, etc.",
    parameters: z.object({
      command: z.enum(["watch", "check", "unwatch", "watched", "tracking:status", "tracking:help"]),
      documentInput: z.string().optional().describe("Document URL, token, or search term"),
      groupId: z.string().optional().describe("Optional group/chat ID to notify"),
    }),
    execute: async (params) => {
      // Parse command and execute
      const { command, documentInput = "", groupId } = params;
      
      // Reconstruct message format for handler
      let message = `@bot ${command}`;
      if (documentInput) {
        message += ` ${documentInput}`;
      }
      if (groupId) {
        message += ` in:${groupId}`;
      }
      
      // Note: In real usage, chatId and userId would come from context
      // For now, we return a message for the agent to handle
      try {
        const handled = await handleDocumentCommand({
          message,
          chatId: "unknown", // Would be set from context
          userId: "unknown", // Would be set from context
          botUserId: "bot", // Would be set from context
        });
        
        return {
          success: handled,
          message: `Command executed: ${command}${documentInput ? ` with "${documentInput}"` : ""}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}

/**
 * Initialize document tracking agent
 * 
 * The agent uses the primary model to:
 * 1. Understand user intent (watch, check, unwatch, etc.)
 * 2. Extract document tokens from URLs or user input
 * 3. Execute document tracking commands
 * 4. Provide helpful responses for Feishu cards
 */
export function getDocumentTrackingAgent(): Agent {
  return new Agent({
    name: "DocumentTracking",
    model: getPrimaryModel(),
    instructions: getDocumentTrackingInstructions(),
    tools: {
      executeDocCommand: createDocumentCommandTool(),
      semanticDocSearch: documentSemanticSearchTool,
    },
  });
}

/**
 * Get system instructions for document tracking agent
 */
function getDocumentTrackingInstructions(): string {
  return `You are a Feishu document tracking specialist agent. You help users monitor document changes.

COMMANDS YOU SUPPORT:
1. @bot watch <doc_url_or_token> [in:<group>]
   → Start tracking a document for changes
   → Extract document token from Feishu URL if provided
   → Default: notify in current chat group

2. @bot check <doc_url_or_token>
   → Show current document status
   → Display: who modified, when, recent changes
   → Format as card with metadata

3. @bot unwatch <doc_url_or_token>
   → Stop tracking this document
   → Confirm with status message

4. @bot watched [group:<name>]
   → List all documents being tracked
   → Optional: filter by group name
   → Show tracking duration and last change

5. @bot tracking:history <doc_token>
   → Show change history for this document
   → Display last 5-10 changes with timestamps
   → Show who made each change

6. @bot tracking:status
   → Show poller statistics
   → Display: docs tracked, last poll time, error rate

7. Semantic search (tool)
   → Use semanticDocSearch tool when user asks to find/locate a tracked doc by keywords
   → Return top matches with doc token and title

IMPORTANT RULES:
- Extract document tokens from Feishu URLs: https://feishu.cn/docs/{doc_token}
- If token extraction fails, ask user for clarification
- Always confirm actions (watch/unwatch) with status cards
- Format responses as Feishu card markdown
- Do NOT tag users in responses (@user format is forbidden)
- Current date: ${new Date().toISOString().split("T")[0]}
- Provide helpful error messages for common issues
- Handle permissions errors gracefully

RESPONSE FORMAT:
Use Feishu card markdown format with:
- Clear title (e.g., "📄 Document Tracking Started")
- Structured content with doc metadata
- Action buttons for quick commands
- Clean formatting for readability

NATURAL LANGUAGE ALTERNATIVES:
- "Watch this doc" → Extract from context
- "Monitor OKR spreadsheet" → Search by title
- "Any changes?" → Check recent changes
- "Stop watching" → Stop tracking referenced doc

EDGE CASES:
- Invalid document tokens → Ask for valid URL/token
- Permission denied → Explain permissions required
- Document not found → Suggest checking URL
- Already tracking → Offer to update settings
- Rate limits → Inform user and retry`;
}

/**
 * Placeholder for document tracking agent initialization
 * Currently returns minimal agent stub
 */
export function initializeDocumentTracking(): void {
  // TODO: Phase 1 Implementation
  // 1. Initialize polling service
  // 2. Load tracked documents from Supabase
  // 3. Start polling loop
  // 4. Set up change detection
  // 5. Set up notification dispatcher
  
  console.log("[DocumentTracking] Agent initialized (skeleton only - Phase 1 pending)");
}

/**
 * TODO: Phase 1 Implementation Tasks
 * 
 * 1. Metadata Fetching (lib/feishu/metadata-fetcher.ts)
 *    - Wrap Feishu docs-api/meta endpoint
 *    - Implement caching
 *    - Handle errors and retry logic
 *    - Type safety for response structure
 * 
 * 2. Change Detection (lib/feishu/change-detector.ts)
 *    - Compare metadata between polls
 *    - Debounce rapid changes
 *    - Track change attribution
 *    - Prevent duplicate notifications
 * 
 * 3. Polling Service (lib/feishu/polling-service.ts)
 *    - Manage polling loop
 *    - Batch API requests
 *    - Handle partial failures
 *    - Implement graceful degradation
 * 
 * 4. Persistence (lib/supabase/document-tracking.ts)
 *    - Create database tables
 *    - Sync state to database
 *    - Restore state on startup
 *    - Maintain audit trail
 * 
 * 5. Tools (lib/agents/document-tracking-tools.ts)
 *    - watchDocument: Start tracking
 *    - checkDocumentStatus: Get current status
 *    - unwatchDocument: Stop tracking
 *    - listTrackedDocuments: List all tracked
 *    - getChangeHistory: Show change history
 * 
 * 6. Routing (lib/agents/manager-agent.ts)
 *    - Recognize doc tracking keywords
 *    - Route to DocumentTracking agent
 *    - Pass context (chat_id, user_id, etc.)
 */
