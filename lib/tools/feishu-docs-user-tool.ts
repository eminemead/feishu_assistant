/**
 * Feishu Docs Tool with User OAuth
 * 
 * Reads Feishu documents using user's access token (OAuth).
 * Falls back to app token if user hasn't authorized.
 * 
 * This enables reading docs the user has access to, not just docs shared with the bot.
 */

import { z } from "zod";
import { getUserAccessToken, generateAuthUrl, hasUserAuthorized } from "../auth/feishu-oauth";
import { getFeishuClient } from "../feishu-utils";
import * as lark from "@larksuiteoapi/node-sdk";

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!;

/**
 * Extract doc token from Feishu URL or use directly
 */
function extractDocToken(input: string): string {
  // If it's already a token (starts with common prefixes), return as-is
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }
  
  // Try to extract from various URL formats
  // https://nio.feishu.cn/docx/XXX
  // https://feishu.cn/docs/XXX
  const urlMatch = input.match(/\/(?:docs|docx|wiki)\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Return as-is if no pattern matches
  return input;
}

/**
 * Detect doc type from URL or token
 */
function detectDocType(input: string): "doc" | "docx" | "sheet" | "bitable" {
  if (input.includes("/sheets/") || input.startsWith("sht")) return "sheet";
  if (input.includes("/bitable/") || input.startsWith("bit")) return "bitable";
  if (input.includes("/docx/") || input.startsWith("docx")) return "docx";
  return "doc";
}

export interface DocReadResult {
  success: boolean;
  content?: string;
  title?: string;
  error?: string;
  needsAuth?: boolean;
  authUrl?: string;
}

/**
 * Read a Feishu document using user's OAuth token
 * Falls back to app token if user hasn't authorized
 * 
 * @param docUrl - Document URL or token
 * @param feishuUserId - User's open_id for OAuth lookup
 */
export async function readDocWithUserAuth(
  docUrl: string,
  feishuUserId: string
): Promise<DocReadResult> {
  const docToken = extractDocToken(docUrl);
  const docType = detectDocType(docUrl);

  console.log(`[DocReader] Reading doc: ${docToken} (type: ${docType}) for user: ${feishuUserId}`);

  // Try user token first
  const userToken = await getUserAccessToken(feishuUserId);

  if (userToken) {
    console.log(`[DocReader] Using user's OAuth token`);
    const result = await readDocWithToken(docToken, docType, userToken);
    
    if (result.success) {
      return result;
    }
    
    // If user token failed (maybe doc not accessible), log and continue to app token
    console.log(`[DocReader] User token failed: ${result.error}, trying app token`);
  }

  // Fallback to app token
  console.log(`[DocReader] Using app token (tenant_access_token)`);
  const appResult = await readDocWithAppToken(docToken, docType);

  if (appResult.success) {
    return appResult;
  }

  // Both failed - if user hasn't authorized, suggest auth
  if (!userToken) {
    const authUrl = generateAuthUrl(feishuUserId);
    return {
      success: false,
      error: `无法读取文档。可能是因为:\n1. Bot 没有文档访问权限\n2. 您还未授权 Bot 读取您的文档\n\n请点击以下链接授权: ${authUrl}`,
      needsAuth: true,
      authUrl,
    };
  }

  return appResult;
}

/**
 * Read document using user's access token
 */
async function readDocWithToken(
  docToken: string,
  docType: string,
  userToken: string
): Promise<DocReadResult> {
  try {
    // Use raw API call with user token
    const apiUrl = docType === "docx" || docType === "doc"
      ? `https://open.feishu.cn/open-apis/docx/v1/documents/${docToken}/raw_content`
      : `https://open.feishu.cn/open-apis/drive/v1/files/${docToken}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${userToken}`,
        "Content-Type": "application/json",
      },
    });

    const data: any = await response.json();

    if (data.code !== 0) {
      return {
        success: false,
        error: data.msg || `API error: ${data.code}`,
      };
    }

    const content = data.data?.content || "";
    const title = data.data?.document?.title || "Untitled";

    return {
      success: true,
      content,
      title,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Read document using app token (tenant_access_token)
 */
async function readDocWithAppToken(
  docToken: string,
  docType: string
): Promise<DocReadResult> {
  try {
    const client = getFeishuClient();

    if (docType === "docx" || docType === "doc") {
      // Try rawContent API first (returns plain text)
      try {
        const resp = await client.request({
          method: "GET",
          url: `/open-apis/docx/v1/documents/${docToken}/raw_content`,
        }) as any;

        if (resp.code === 0 && resp.data?.content) {
          return {
            success: true,
            content: resp.data.content,
            title: resp.data.document?.title || "Untitled",
          };
        }
      } catch (e) {
        // Fall through to content API
      }

      // Try structured content API
      const resp = (await client.request({
        method: "GET",
        url: `/open-apis/docx/v1/documents/${docToken}/content`,
      })) as any;

      const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);

      if (!isSuccess) {
        return {
          success: false,
          error: `Failed to read document: ${JSON.stringify(resp)}`,
        };
      }

      // Extract text from structured content
      let textContent = "";
      if (resp.data?.content) {
        const extractText = (node: any): string => {
          if (typeof node === "string") return node;
          if (node.text) return node.text;
          if (node.children) {
            return node.children.map(extractText).join("");
          }
          return "";
        };
        textContent = extractText(resp.data.content);
      }

      return {
        success: true,
        content: textContent || "Document is empty",
        title: resp.data?.title || "Untitled",
      };
    }

    // Sheets and Bitable - just get metadata for now
    return {
      success: false,
      error: `Document type '${docType}' content reading not fully implemented`,
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Summarize document content using LLM
 */
export async function summarizeDocContent(
  content: string,
  maxLength: number = 500
): Promise<string> {
  // For now, just truncate. In production, use LLM to summarize.
  if (content.length <= maxLength) {
    return content;
  }

  // Simple truncation with ellipsis
  return content.substring(0, maxLength) + "...";
}

/**
 * Read multiple docs and return summaries
 */
export async function readAndSummarizeDocs(
  docUrls: string[],
  feishuUserId: string,
  maxSummaryLength: number = 300
): Promise<Array<{
  url: string;
  title: string;
  summary: string;
  success: boolean;
  error?: string;
}>> {
  const results = await Promise.all(
    docUrls.map(async (url) => {
      const result = await readDocWithUserAuth(url, feishuUserId);
      
      if (result.success && result.content) {
        const summary = await summarizeDocContent(result.content, maxSummaryLength);
        return {
          url,
          title: result.title || "Untitled",
          summary,
          success: true,
        };
      }

      return {
        url,
        title: "Unknown",
        summary: "",
        success: false,
        error: result.error,
      };
    })
  );

  return results;
}

/**
 * Check if user needs to authorize and generate message with auth link
 */
export async function getAuthPromptIfNeeded(
  feishuUserId: string
): Promise<string | null> {
  const hasAuth = await hasUserAuthorized(feishuUserId);
  
  if (hasAuth) {
    return null;
  }

  const authUrl = generateAuthUrl(feishuUserId);
  return `📋 **需要授权文档访问**

为了读取您分享的飞书文档，需要您授权 Bot 访问权限。

👉 [点击这里授权](${authUrl})

授权后，Bot 可以读取您有权访问的所有飞书文档。`;
}

