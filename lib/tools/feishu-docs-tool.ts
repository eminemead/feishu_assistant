/**
 * Feishu Docs Tool Factory
 * 
 * Creates the Feishu docs access tool used by the DPA Mom Agent.
 * Reads and searches Feishu documents (Docs, Sheets, Bitable).
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getFeishuClient } from "../feishu-utils";
import { trackToolCall } from "../devtools-integration";

/**
 * Extract doc token from Feishu URL or use directly
 */
function extractDocToken(input: string): string {
  // If it's already a token (starts with common prefixes), return as-is
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }
  
  // Try to extract from URL
  const urlMatch = input.match(/\/docs\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Return as-is if no pattern matches
  return input;
}

/**
 * Feishu docs result type
 */
interface FeishuDocsResult {
  success: boolean;
  docToken: string;
  docType?: string;
  content?: string;
  title?: string;
  metadata?: {
    name?: string;
    token?: string;
    type?: string;
    size?: number;
    createdAt?: string;
    updatedAt?: string;
    ownerId?: string;
  };
  sheets?: Array<{ sheetId: string; title: string }>;
  message?: string;
  error?: string;
}

/**
 * Extract text from document content structure
 */
function extractTextFromContent(content: any): string {
  if (typeof content === "string") return content;
  if (content.text) return content.text;
  if (content.children) {
    return content.children.map(extractTextFromContent).join("");
  }
  return "";
}

/**
 * Core execution logic for Feishu docs
 */
async function executeFeishuDocs(params: {
  docToken: string;
  docType?: "doc" | "sheet" | "bitable";
  action?: "read" | "metadata";
}): Promise<FeishuDocsResult> {
  const client = getFeishuClient() as any;
  const token = extractDocToken(params.docToken);
  const type = params.docType || "doc";
  const operation = params.action || "read";
  
  try {
    if (operation === "metadata") {
      const resp = await client.drive.v1.file.get({
        path: { file_token: token },
        params: { token_type: type },
      });
      
      const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
      
      if (!isSuccess) {
        return {
          success: false,
          error: `Failed to get document metadata: ${JSON.stringify(resp)}`,
          docToken: token,
        };
      }
      
      return {
        success: true,
        docToken: token,
        docType: type,
        metadata: {
          name: resp.data?.file?.name,
          token: resp.data?.file?.token,
          type: resp.data?.file?.type,
          size: resp.data?.file?.size,
          createdAt: resp.data?.file?.created_time,
          updatedAt: resp.data?.file?.modified_time,
          ownerId: resp.data?.file?.owner_id,
        },
      };
    }
    
    // Read document content
    if (type === "doc") {
      const resp = await client.docx.v1.document.content({
        path: { document_id: token },
      });
      
      const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
      
      if (!isSuccess) {
        return {
          success: false,
          error: `Failed to read document: ${JSON.stringify(resp)}`,
          docToken: token,
        };
      }
      
      const textContent = resp.data?.content 
        ? extractTextFromContent(resp.data.content)
        : "";
      
      return {
        success: true,
        docToken: token,
        docType: type,
        content: textContent || "Document is empty or content could not be extracted",
        title: resp.data?.title || "Untitled",
      };
    }
    
    if (type === "sheet") {
      const resp = await client.sheets.v2.spreadsheet.get({
        path: { spreadsheet_token: token },
      });
      
      const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
      
      if (!isSuccess) {
        return {
          success: false,
          error: `Failed to read sheet: ${JSON.stringify(resp)}`,
          docToken: token,
        };
      }
      
      return {
        success: true,
        docToken: token,
        docType: type,
        title: resp.data?.spreadsheet?.title || "Untitled",
        sheets: resp.data?.spreadsheet?.sheets?.map((s: any) => ({
          sheetId: s.sheet_id,
          title: s.title,
        })) || [],
        message: "Sheet metadata retrieved. Use specific sheet APIs for detailed content.",
      };
    }
    
    // Bitable
    return {
      success: false,
      error: "Bitable reading not yet implemented. Please use Feishu API directly.",
      docToken: token,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to access document",
      docToken: token,
    };
  }
}

/**
 * Creates the Feishu docs access tool
 * 
 * Used by:
 * - DPA Mom Agent (production): With devtools tracking
 * 
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured Feishu docs tool instance
 */
export function createFeishuDocsTool(enableDevtoolsTracking: boolean = true) {
  return createTool({
    id: "feishu_docs",
    description: `Access and read Feishu documents (Docs, Sheets, Bitable).
    
Use this to:
- Read Feishu Docs content
- Get document metadata (name, owner, last modified, etc.)
- Access Sheets information
- Extract text content from documents

The docToken can be:
- A document token (e.g., "doccnxxxxx")
- A Feishu document URL (will extract token automatically)

Supported doc types:
- doc: Feishu Docs (rich text documents)
- sheet: Feishu Sheets (spreadsheets)
- bitable: Feishu Bitable (databases)`,
    inputSchema: z.object({
      docToken: z
        .string()
        .describe(
          "The Feishu document token or URL (e.g., 'doccnxxxxx' or full Feishu doc URL)",
        ),
      docType: z
        .enum(["doc", "sheet", "bitable"])
        .optional()
        .describe(
          "Document type (default: 'doc'). Use 'sheet' for spreadsheets, 'bitable' for databases.",
        ),
      action: z
        .enum(["read", "metadata"])
        .optional()
        .describe(
          "Action to perform: 'read' to get content, 'metadata' to get document info (default: 'read')",
        ),
    }),
execute: async (inputData, context): Promise<FeishuDocsResult> => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { success: false, docToken: inputData.docToken, error: "Request aborted" };
      }
      
      const params = {
        docToken: inputData.docToken,
        docType: inputData.docType,
        action: inputData.action,
      };
      
      if (enableDevtoolsTracking) {
        return trackToolCall("feishu_docs", executeFeishuDocs)(params);
      }
      
      return executeFeishuDocs(params);
    },
  });
}

