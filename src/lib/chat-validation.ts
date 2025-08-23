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
      return typeof data.count === 'number' && data.count >= 0;
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
    .slice(0, 1000) // Limit message length
    .replace(/[<>]/g, ''); // Basic XSS prevention
}