/**
 * Feishu Chat History Tool Factory
 * 
 * Creates the Feishu chat history tool used by the DPA Mom Agent.
 * Accesses group chat histories and message threads.
 * 
 * NOTE: This is a tool factory for creating tool instances, NOT a shared tool
 * between agents. Each agent has its own tool instances scoped to that agent.
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { getFeishuClient } from "../feishu-utils";
import { parseMessageContent } from "../feishu-utils";
import { trackToolCall } from "../devtools-integration";

/**
 * Creates the Feishu chat history tool
 * 
 * Used by:
 * - DPA Mom Agent (production): With devtools tracking
 * 
 * @param enableDevtoolsTracking - Whether to enable devtools tracking (default: true)
 * @returns Configured Feishu chat history tool instance
 */
export function createFeishuChatHistoryTool(enableDevtoolsTracking: boolean = true) {
  const executeFn = enableDevtoolsTracking
    ? trackToolCall(
        "feishu_chat_history",
        async ({ chatId, limit, startTime, endTime }: { 
          chatId: string; 
          limit?: number; 
          startTime?: string;
          endTime?: string;
        }) => {
          const client = getFeishuClient();
          
          try {
            // Build query parameters
            const params: any = {
              container_id_type: "chat_id",
              container_id: chatId,
              page_size: limit || 50,
            };
            
            // Add time filters if provided
            if (startTime) {
              params.start_time = startTime;
            }
            if (endTime) {
              params.end_time = endTime;
            }
            
            const resp = await client.im.message.list({
              params,
            });
            
            const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
            
            if (!isSuccess || !resp.data?.items) {
              return {
                success: false,
                error: `Failed to fetch chat history: ${JSON.stringify(resp)}`,
                chatId,
              };
            }
            
            // Parse messages
            const messages = resp.data.items.map((msg: any) => {
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
              
              return {
                messageId: msg.message_id,
                sender: {
                  id: msg.sender?.sender_id?.user_id || msg.sender?.sender_id?.open_id,
                  type: msg.sender?.sender_type,
                  name: msg.sender?.sender_type === "user" ? "User" : "Bot",
                },
                content: text,
                createTime: msg.create_time,
                isBot,
              };
            });
            
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
      )
    : async ({ chatId, limit, startTime, endTime }: { 
        chatId: string; 
        limit?: number; 
        startTime?: string;
        endTime?: string;
      }) => {
        const client = getFeishuClient();
        
        try {
          const params: any = {
            container_id_type: "chat_id",
            container_id: chatId,
            page_size: limit || 50,
          };
          
          if (startTime) params.start_time = startTime;
          if (endTime) params.end_time = endTime;
          
          const resp = await client.im.message.list({ params });
          
          const isSuccess = typeof resp.success === 'function' ? resp.success() : (resp.code === 0 || resp.code === undefined);
          
          if (!isSuccess || !resp.data?.items) {
            return {
              success: false,
              error: `Failed to fetch chat history: ${JSON.stringify(resp)}`,
              chatId,
            };
          }
          
          const messages = resp.data.items.map((msg: any) => {
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
            
            return {
              messageId: msg.message_id,
              sender: {
                id: msg.sender?.sender_id?.user_id || msg.sender?.sender_id?.open_id,
                type: msg.sender?.sender_type,
                name: msg.sender?.sender_type === "user" ? "User" : "Bot",
              },
              content: text,
              createTime: msg.create_time,
              isBot,
            };
          });
          
          return {
            success: true,
            chatId,
            messageCount: messages.length,
            messages: messages.reverse(),
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message || "Failed to fetch chat history",
            chatId,
          };
        }
      };

  // Base tool definition
  // @ts-ignore - Type instantiation depth issue
  const feishuChatHistoryToolBase = tool({
    description: `Access Feishu group chat histories and message threads. 
    
Use this to:
- Retrieve chat history from group chats
- Search messages by time range
- Get context from previous conversations

The chatId is typically in format: "oc_xxxxx" (group chat) or "ou_xxxxx" (private chat).
Time format: Unix timestamp in seconds (e.g., "1703001600" for 2023-12-20).`,
    // @ts-ignore
    parameters: zodSchema(
      z.object({
        chatId: z
          .string()
          .describe("The Feishu chat ID (group chat or private chat ID, e.g., 'oc_xxxxx')"),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of messages to retrieve (default: 50, max: 100)"),
        startTime: z
          .string()
          .optional()
          .describe("Start time filter (Unix timestamp in seconds, e.g., '1703001600')"),
        endTime: z
          .string()
          .optional()
          .describe("End time filter (Unix timestamp in seconds, e.g., '1703088000')"),
      })
    ),
    execute: executeFn,
  });

  return feishuChatHistoryToolBase;
}

