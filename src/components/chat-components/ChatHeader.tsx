import { Show, createMemo } from 'solid-js';
import { Button } from '~/components/ui/button';
import { OnlineUsersDropdown } from './OnlineUsersDropdown';
import type { WebSocketState } from '~/lib/websocket-chat';

interface ChatHeaderProps {
  state: WebSocketState;
  connect: () => void;
  disconnect: () => void;
  clearError: () => void;
}

export function ChatHeader(props: ChatHeaderProps) {
  const connectionStatusDetails = createMemo(() => {
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
        return { text: `Reconnecting...`, color: 'text-orange-600', icon: '🟠' };
      case 'error':
        return { text: 'Connection error', color: 'text-red-600', icon: '❌' };
      default:
        return { text: 'Unknown', color: 'text-muted-foreground', icon: '❓' };
    }
  });

  return (
    <div class="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold">Global Chat</h1>
        <div class="flex items-center gap-2">
          <span class={`text-sm ${connectionStatusDetails().icon === '🟡' || connectionStatusDetails().icon === '🟠' ? 'animate-pulse' : ''} ${connectionStatusDetails().color}`}>
            {connectionStatusDetails().icon}
          </span>
          <span class={`text-sm ${connectionStatusDetails().color}`}>
            {connectionStatusDetails().text}
          </span>
        </div>
      </div>
      
      <div class="flex items-center gap-3">
        <OnlineUsersDropdown 
          userCount={props.state.userCount}
          connectedUsers={props.state.connectedUsers || []}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={props.state.isConnected ? props.disconnect : props.connect}
          disabled={props.state.isConnecting || props.state.isReconnecting}
          class={props.state.isReconnecting ? 'animate-pulse' : ''}
        >
          {props.state.isReconnecting ? 'Reconnecting...' :
            props.state.isConnecting ? 'Connecting...' :
              props.state.isConnected ? 'Disconnect' : 'Connect'}
        </Button>
      </div>

      {/* Error Toast - positioned absolutely */}
      <Show when={props.state.error}>
        <div class="absolute top-16 left-4 right-4 bg-destructive/10 border border-destructive/20 rounded-md p-3 animate-in fade-in slide-in-from-top-2 duration-300 z-10">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm text-destructive">
              <span>⚠️</span>
              <span>{props.state.error}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={props.clearError}
              class="h-6 px-2 text-xs hover:bg-destructive/20"
            >
              ✕
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
}