import { Show } from 'solid-js';
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { formatMessageTime, getMessageAuthor } from '~/lib/websocket-chat';

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
}

interface MessageItemProps {
  message: ChatMessage;
  isLatest: boolean;
}

// Helper function outside component to avoid recreation
const getUserInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export function MessageItem(props: MessageItemProps) {
  return (
    <div class={`flex gap-3 p-2 ${props.isLatest
      ? 'animate-in fade-in ease-out'
      : ''}`}>
      <Avatar class="h-8 w-8 flex-shrink-0">
        <Show when={props.message.userImage}>
          <AvatarImage src={props.message.userImage} alt={getMessageAuthor(props.message)} />
        </Show>
        <AvatarFallback class="text-xs">
          {props.message.type === 'system' ? '🤖' : getUserInitials(getMessageAuthor(props.message))}
        </AvatarFallback>
      </Avatar>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class={`font-medium text-sm ${props.message.type === 'system' ? 'text-blue-600' : ''}`}>
            {props.message.type === 'system' ? '🤖 System' : getMessageAuthor(props.message)}
          </span>
          <span class="text-xs text-muted-foreground">
            {formatMessageTime(props.message.timestamp)}
          </span>
          <Show when={props.message.type === 'system'}>
            <Badge variant="secondary" class="text-xs">
              System
            </Badge>
          </Show>
        </div>
        <p class={`text-sm break-words ${props.message.type === 'system' ? 'text-blue-700 bg-blue-50 p-2 rounded-md' : ''}`}>
          {props.message.content}
        </p>
      </div>
    </div>
  );
}