import { For, Show } from 'solid-js';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { formatMessageTime, getMessageAuthor } from '~/lib/websocket-chat';
import type { WebSocketState } from '~/lib/websocket-chat';

interface MessageListProps {
  state: WebSocketState;
  connect: () => void;
  clearError: () => void;
  scrollAreaRef: (el: HTMLDivElement) => void;
  latestMessageId: () => string | null;
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

export function MessageList(props: MessageListProps) {
  const connectionStatusDetails = () => {
    switch (props.state.connectionStatus) {
      case 'idle':
        return { text: 'Ready to connect', color: 'text-muted-foreground', icon: '⚪' };
      case 'connecting':
        return { text: 'Connecting...', color: 'text-yellow-600', icon: '🟡' };
      case 'connected':
        return { text: 'Connected', color: 'text-green-600', icon: '🟢' };
      case 'disconnected':
        return { text: 'Disconnected', color: 'text-red-600', icon: '🔴' };
      case 'reconnecting':
        return { text: `Reconnecting... (attempt ${props.state.reconnectAttempts})`, color: 'text-orange-600', icon: '🟠' };
      case 'error':
        return { text: 'Connection error', color: 'text-red-600', icon: '❌' };
      default:
        return { text: 'Unknown', color: 'text-muted-foreground', icon: '❓' };
    }
  };

  return (
    <div class="flex-1 min-h-0 overflow-hidden">
      <Card class="h-full border-0 shadow-none">
        <CardContent class="p-0 h-full">
          <Show
            when={!props.state.error || props.state.connectionStatus === 'connected'}
            fallback={
              <div class="flex items-center justify-center h-full text-muted-foreground animate-in fade-in duration-300">
                <div class="text-center space-y-3">
                  <div class="text-4xl animate-pulse">{connectionStatusDetails().icon}</div>
                  <div>
                    <p class="text-lg font-medium mb-1">{connectionStatusDetails().text}</p>
                    <p class="text-sm mb-3">
                      {props.state.connectionStatus === 'error' ? 'There was a problem connecting to the chat.' :
                        props.state.connectionStatus === 'disconnected' ? 'You have been disconnected from the chat.' :
                          'Unable to connect to the chat server.'}
                    </p>
                    <div class="flex gap-2 justify-center">
                      <Button variant="outline" size="sm" onClick={props.connect} disabled={props.state.isConnecting}>
                        {props.state.isConnecting ? '⏳ Connecting...' : '🔄 Try Again'}
                      </Button>
                      <Show when={props.state.error}>
                        <Button variant="ghost" size="sm" onClick={props.clearError}>
                          Dismiss Error
                        </Button>
                      </Show>
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            <div
              ref={props.scrollAreaRef}
              class="px-4 overflow-y-auto h-full"
              data-chat-scroll-area
            >
              <Show
                when={props.state.messages.length > 0}
                fallback={
                  <div class="flex items-center justify-center h-full text-muted-foreground">
                    <div class="text-center">
                      <div class="text-4xl mb-2">💬</div>
                      <p class="text-lg font-medium mb-1">Welcome to Global Chat!</p>
                      <p class="text-sm">No messages yet. Be the first to say hello! 👋</p>
                    </div>
                  </div>
                }
              >
                <div class="py-2">
                  <For each={props.state.messages}>
                    {(message) => {
                      const isLatestMessage = props.latestMessageId() === message.id;
                      return (
                        <div class={`flex gap-3 p-3 ${isLatestMessage
                          ? 'animate-in fade-in slide-in-from-bottom-2 duration-300'
                          : ''}`}>
                          <Avatar class="h-8 w-8 flex-shrink-0">
                            <Show when={message.userImage}>
                              <AvatarImage src={message.userImage} alt={getMessageAuthor(message)} />
                            </Show>
                            <AvatarFallback class="text-xs">
                              {message.type === 'system' ? '🤖' : getUserInitials(getMessageAuthor(message))}
                            </AvatarFallback>
                          </Avatar>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                              <span class={`font-medium text-sm ${message.type === 'system' ? 'text-blue-600' : ''}`}>
                                {message.type === 'system' ? '🤖 System' : getMessageAuthor(message)}
                              </span>
                              <span class="text-xs text-muted-foreground">
                                {formatMessageTime(message.timestamp)}
                              </span>
                              <Show when={message.type === 'system'}>
                                <Badge variant="secondary" class="text-xs">
                                  System
                                </Badge>
                              </Show>
                            </div>
                            <p class={`text-sm break-words ${message.type === 'system' ? 'text-blue-700 bg-blue-50 p-2 rounded-md' : ''}`}>
                              {message.content}
                            </p>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}