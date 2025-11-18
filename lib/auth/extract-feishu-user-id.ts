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
  // Feishu subscription mode has sender_id as object with open_id field
  // Webhook mode has direct open_id or user_id fields
  
  // Check message.sender first (most common location)
  if (message?.sender) {
    // sender_id is an object with open_id, union_id, user_id fields
    if (message.sender.sender_id?.open_id) {
      return message.sender.sender_id.open_id;
    }
    if (message.sender.open_id && typeof message.sender.open_id === 'string') {
      return message.sender.open_id;
    }
    if (message.sender.user_id && typeof message.sender.user_id === 'string') {
      return message.sender.user_id;
    }
  }
  
  // Check data.sender as fallback
  if (data?.sender) {
    // Same structure as message.sender
    if (data.sender.sender_id?.open_id) {
      return data.sender.sender_id.open_id;
    }
    if (data.sender.open_id && typeof data.sender.open_id === 'string') {
      return data.sender.open_id;
    }
    if (data.sender.user_id && typeof data.sender.user_id === 'string') {
      return data.sender.user_id;
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

