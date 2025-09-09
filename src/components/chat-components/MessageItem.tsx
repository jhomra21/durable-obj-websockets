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
  isGrouped?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
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
  const shouldShowAvatar = !props.isGrouped || props.isFirstInGroup;
  const shouldShowHeader = !props.isGrouped || props.isFirstInGroup;
  
  // Different spacing based on grouping
  const containerClasses = () => {
    let classes = 'flex gap-2';
    
    if (props.isGrouped) {
      // Grouped messages have tighter spacing
      if (props.isFirstInGroup) {
        classes += ' pt-3 pb-0.5 px-3'; // More space above first message in group
      } else if (props.isLastInGroup) {
        classes += ' pt-0.5 pb-3 px-3'; // More space below last message in group
      } else {
        classes += ' py-0.5 px-3'; // Tight spacing for middle messages
      }
    } else {
      // Non-grouped messages have more spacing
      classes += ' p-3';
    }
    
    if (props.isLatest) {
      classes += ' animate-in fade-in ease-out';
    }
    
    return classes;
  };

  return (
    <div class={containerClasses()}>
      <div class="flex-shrink-0 w-6">
        <Show when={shouldShowAvatar}>
          <Avatar class="h-6 w-6">
            <Show when={props.message.userImage}>
              <AvatarImage src={props.message.userImage} alt={getMessageAuthor(props.message)} />
            </Show>
            <AvatarFallback class="text-xs">
              {props.message.type === 'system' ? '🤖' : getUserInitials(getMessageAuthor(props.message))}
            </AvatarFallback>
          </Avatar>
        </Show>
      </div>
      <div class="flex-1 min-w-0">
        <Show when={shouldShowHeader}>
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
        </Show>
        <p class={`text-sm break-words ${props.message.type === 'system' ? 'text-blue-700 bg-blue-50 p-2 rounded-md' : ''}`}>
          {props.message.content}
        </p>
      </div>
    </div>
  );
}