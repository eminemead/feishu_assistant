/**
 * Extract Feishu User ID from message events
 * 
 * Feishu message events can have user ID in different locations:
 * - message.sender.sender_id
 * - message.sender.open_id
 * - message.sender.user_id
 * - data.sender.open_id
 * - data.sender.user_id
 */

export function extractFeishuUserId(message: any, data: any): string | null {
  // Try multiple possible locations for user ID
  // Priority: sender_id > open_id > user_id
  
  // Check message.sender first (most common location)
  if (message?.sender) {
    if (message.sender.sender_id) {
      return message.sender.sender_id;
    }
    if (message.sender.open_id) {
      return message.sender.open_id;
    }
    if (message.sender.user_id) {
      return message.sender.user_id;
    }
  }
  
  // Check data.sender as fallback
  if (data?.sender) {
    if (data.sender.open_id) {
      return data.sender.open_id;
    }
    if (data.sender.user_id) {
      return data.sender.user_id;
    }
    if (data.sender.sender_id) {
      return data.sender.sender_id;
    }
  }
  
  // If no user ID found, return null
  // This should be logged as a warning
  console.warn('⚠️ [Auth] Could not extract user ID from Feishu event', {
    messageSender: message?.sender,
    dataSender: data?.sender
  });
  
  return null;
}

