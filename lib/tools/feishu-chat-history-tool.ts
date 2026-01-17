/**
 * Feishu Chat History Tool Factory
 * 
 * Creates the Feishu chat history tool used by the DPA Mom Agent.
 * Accesses group chat histories and message threads.
 * 
 * NOTE: Uses native fetch instead of Feishu SDK to avoid axios/bun compatibility issues.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { parseMessageContent } from "../feishu-utils";
import { trackToolCall } from "../devtools-integration";

// Cache access token (expires in 2 hours, refresh at 1.5 hours)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get Feishu tenant access token using native fetch
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 30 min buffer)
  if (cachedToken && cachedToken.expiresAt > now + 30 * 60 * 1000) {
    return cachedToken.token;
  }
  
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  
  if (!appId || !appSecret) {
    throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET must be set");
  }
  
  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  
  const data = await resp.json() as any;
  if (data.code !== 0) {
    throw new Error(`Failed to get access token: ${data.msg}`);
  }
  
  // Cache token (expires in ~2 hours)
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: now + (data.expire || 7200) * 1000,
  };
  
  return cachedToken.token;
}

// Cache for user_id → open_id mapping per chat
const chatMemberCache = new Map<string, { mapping: Map<string, string>; expiresAt: number }>();

/**
 * Get user_id → open_id mapping for a chat's members
 * This is needed because message.list returns open_id but we often have user_id
 * @exported for use in workflows
 */
export async function getChatMemberMapping(chatId: string): Promise<Map<string, string>> {
  const now = Date.now();
  const cached = chatMemberCache.get(chatId);
  
  // Cache for 10 minutes
  if (cached && cached.expiresAt > now) {
    return cached.mapping;
  }
  
  const token = await getAccessToken();
  const mapping = new Map<string, string>();
  
  try {
    // Get members with user_id
    const userIdResp = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/chats/${chatId}/members?member_id_type=user_id`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const userIdData = await userIdResp.json() as any;
    
    // Get members with open_id
    const openIdResp = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/chats/${chatId}/members`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    const openIdData = await openIdResp.json() as any;
    
    if (userIdData.code === 0 && openIdData.code === 0) {
      const userIdItems = userIdData.data?.items || [];
      const openIdItems = openIdData.data?.items || [];
      
      // Match by name (both lists should have same order and names)
      for (let i = 0; i < userIdItems.length && i < openIdItems.length; i++) {
        const userId = userIdItems[i]?.member_id;
        const openId = openIdItems[i]?.member_id;
        if (userId && openId) {
          mapping.set(userId, openId);
        }
      }
      
      console.log(`[ChatHistory] Cached ${mapping.size} user_id→open_id mappings for chat ${chatId}`);
    }
  } catch (error) {
    console.error(`[ChatHistory] Failed to get chat member mapping: ${error}`);
  }
  
  chatMemberCache.set(chatId, { mapping, expiresAt: now + 10 * 60 * 1000 });
  return mapping;
}

/**
 * Fetch chat messages using native fetch (bypasses SDK axios issues with Bun)
 */
async function fetchChatMessagesNative(params: {
  chatId: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
}): Promise<{ code: number; msg?: string; data?: { items: any[] } }> {
  const token = await getAccessToken();
  
  // Feishu im/v1/messages has strict validation. In practice page_size > 50 can be rejected.
  const requested = params.limit || 50;
  const pageSize = Math.min(Math.max(requested, 1), 50);

  const queryParams = new URLSearchParams({
    container_id_type: "chat",
    container_id: params.chatId,
    page_size: String(pageSize),
    // NOTE: keep sort_type, but we’ll retry without it if validation fails.
    sort_type: "ByCreateTimeDesc",
  });
  
  if (params.startTime) queryParams.append("start_time", params.startTime);
  if (params.endTime) queryParams.append("end_time", params.endTime);
  
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?${queryParams}`;
  console.log(`[ChatHistory] Fetching URL: ${url}`);
  
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  const data = await resp.json() as any;
  if (data.code !== 0) {
    console.log(`[ChatHistory] API error: code=${data.code}, msg=${data.msg}`);
  }

  // Some tenants reject sort_type or other params with "field validation failed".
  // Retry once with minimal params to improve robustness.
  if (data.code === 99992402 && queryParams.has("sort_type")) {
    console.log(`[ChatHistory] Retrying without sort_type due to validation failure...`);
    queryParams.delete("sort_type");
    const retryUrl = `https://open.feishu.cn/open-apis/im/v1/messages?${queryParams}`;
    const retryResp = await fetch(retryUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const retryData = await retryResp.json() as any;
    if (retryData.code !== 0) {
      console.log(`[ChatHistory] Retry API error: code=${retryData.code}, msg=${retryData.msg}`);
    }
    return retryData;
  }

  return data;
}

/**
 * Core implementation using native fetch (works with Bun)
 */
async function fetchChatHistoryImpl({ chatId, limit, startTime, endTime, senderId }: { 
  chatId: string; 
  limit?: number; 
  startTime?: string;
  endTime?: string;
  senderId?: string;
}) {
  try {
    // Use native fetch instead of SDK (SDK's axios has issues with Bun)
    const resp = await fetchChatMessagesNative({
      chatId,
      limit: limit || 50,
      startTime,
      endTime,
    });
    
    if (resp.code !== 0 || !resp.data?.items) {
      return {
        success: false,
        error: `Failed to fetch chat history: ${resp.msg || JSON.stringify(resp)}`,
        chatId,
      };
    }
    
    // Parse messages
    let messages = resp.data.items.map((msg: any) => {
      const isBot = msg.sender?.sender_type === "app";
      const content = msg.body?.content;
      let text = "";
      
      if (content) {
        try {
          text = parseMessageContent(content);
        } catch (e) {
          text = content;
        }
      }
      
      // Handle both old SDK format (sender.sender_id) and new native fetch format (sender.id)
      const senderId = msg.sender?.sender_id?.user_id 
        || msg.sender?.sender_id?.open_id 
        || msg.sender?.id  // Native fetch returns sender.id directly
        || "";
      
      return {
        messageId: msg.message_id,
        sender: {
          id: senderId,
          idType: msg.sender?.id_type || "open_id",
          type: msg.sender?.sender_type,
          name: msg.sender?.sender_type === "user" ? "User" : "Bot",
        },
        content: text,
        createTime: msg.create_time,
        isBot,
      };
    });
    
    // Filter by senderId if provided
    if (senderId) {
      // Get user_id → open_id mapping for this chat
      const memberMapping = await getChatMemberMapping(chatId);
      
      // If senderId looks like a user_id (not ou_xxx), try to resolve it
      const resolvedOpenId = senderId.startsWith("ou_") 
        ? senderId 
        : memberMapping.get(senderId);
      
      console.log(`[ChatHistory] Filtering by senderId: ${senderId} → resolvedOpenId: ${resolvedOpenId || "not found"}`);
      
      messages = messages.filter((msg: any) => {
        const msgSenderId = msg.sender?.id;
        // Match exact or resolved open_id
        return msgSenderId === senderId || msgSenderId === resolvedOpenId;
      });
      
      console.log(`[ChatHistory] Filtered to ${messages.length} messages from sender`);
    }
    
    return {
      success: true,
      chatId,
      messageCount: messages.length,
      messages: messages.reverse(), // Reverse to show oldest first
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to fetch chat history",
      chatId,
    };
  }
}

/**
 * Programmatic API (non-tool) for server-side prefetch.
 * This lets request handlers fetch recent messages and inject them into the agent prompt,
 * so "analyze last N messages" works even if we didn't ingest those messages as events.
 */
export async function fetchChatHistory(params: {
  chatId: string;
  limit?: number;
  startTime?: string;
  endTime?: string;
  senderId?: string;
}) {
  return fetchChatHistoryImpl(params);
}

/**
 * Chat history result type
 * 
 * Exported for use in workflows that call the tool directly.
 * Pattern: `const result = await (chatHistoryTool.execute as any)({...}) as ChatHistoryResult`
 */
export interface ChatHistoryResult {
  success: boolean;
  chatId: string;
  messageCount?: number;
  messages?: Array<{
    messageId: string;
    sender: { id: string; idType: string; type: string; name: string };
    content: string;
    createTime: string;
    isBot: boolean;
  }>;
  error?: string;
}

export function createFeishuChatHistoryTool(enableDevtoolsTracking: boolean = true) {
  return createTool({
    id: "feishu_chat_history",
    description: `Access Feishu group chat histories and message threads. 
    
Use this to:
- Retrieve chat history from group chats
- Search messages by time range
- Filter messages by specific sender (for feedback collection)
- Get context from previous conversations

The chatId is typically in format: "oc_xxxxx" (group chat) or "ou_xxxxx" (private chat).
Time format: Unix timestamp in seconds (e.g., "1703001600" for 2023-12-20).
Use senderId to filter messages from a specific user (e.g., "ou_xxx").`,
    inputSchema: z.object({
      chatId: z
        .string()
        .describe(
          "The Feishu chat ID (group chat or private chat ID, e.g., 'oc_xxxxx')",
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of messages to retrieve (default: 20, max: 50). Feishu may reject > 50.",
        ),
      startTime: z
        .string()
        .optional()
        .describe(
          "Start time filter (Unix timestamp in seconds, e.g., '1703001600')",
        ),
      endTime: z
        .string()
        .optional()
        .describe(
          "End time filter (Unix timestamp in seconds, e.g., '1703088000')",
        ),
      senderId: z
        .string()
        .optional()
        .describe("Filter messages by sender's user_id or open_id (e.g., 'ou_xxx')"),
    }),
execute: async (inputData, context): Promise<ChatHistoryResult> => {
      // Support abort signal
      if (context?.abortSignal?.aborted) {
        return { success: false, chatId: inputData.chatId, error: "Request aborted" };
      }
      
      const params = {
        chatId: inputData.chatId,
        limit: inputData.limit,
        startTime: inputData.startTime,
        endTime: inputData.endTime,
        senderId: inputData.senderId,
      };
      
      if (enableDevtoolsTracking) {
        return trackToolCall("feishu_chat_history", fetchChatHistoryImpl)(params);
      }
      
      return fetchChatHistoryImpl(params);
    },
  });
}

