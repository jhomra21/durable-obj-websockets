import type { ChatMessage } from '../../api/chat';

// Type guards for runtime validation
export function isValidChatMessage(data: any): data is ChatMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.id === 'string' &&
    typeof data.userId === 'string' &&
    typeof data.userName === 'string' &&
    typeof data.content === 'string' &&
    typeof data.timestamp === 'number' &&
    (data.type === 'text' || data.type === 'system') &&
    (data.userImage === undefined || typeof data.userImage === 'string')
  );
}

export function isValidWebSocketMessage(data: any): boolean {
  if (typeof data !== 'object' || data === null) return false;
  
  switch (data.type) {
    case 'message':
      return isValidChatMessage(data.message);
    case 'history':
      return Array.isArray(data.messages) && data.messages.every(isValidChatMessage);
    case 'userCount':
      return (
        typeof data.count === 'number' && 
        data.count >= 0 &&
        (data.connectedUsers === undefined || (
          Array.isArray(data.connectedUsers) &&
          data.connectedUsers.every((user: any) => 
            typeof user === 'object' &&
            user !== null &&
            typeof user.userId === 'string' &&
            typeof user.userName === 'string' &&
            (user.userImage === undefined || typeof user.userImage === 'string')
          )
        ))
      );
    case 'rateLimit':
      return (
        typeof data.retryAfterMs === 'number' && data.retryAfterMs >= 0 &&
        typeof data.limit === 'number' && data.limit > 0 &&
        typeof data.windowMs === 'number' && data.windowMs > 0
      );
    case 'pong':
      return true;
    default:
      return false;
  }
}

// Sanitize message content
export function sanitizeMessageContent(content: string): string {
  return content
    .trim()
    .slice(0, 2000) // Limit message length (matches server limit)
    .replace(/[<>]/g, ''); // Basic XSS prevention
}