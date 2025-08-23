import { Show, createMemo } from 'solid-js';
import { Card, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { ConnectionQualityBars } from './ConnectionQualityBars';
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
        return { text: `Reconnecting... (attempt ${props.state.reconnectAttempts})`, color: 'text-orange-600', icon: '🟠' };
      case 'error':
        return { text: 'Connection error', color: 'text-red-600', icon: '❌' };
      default:
        return { text: 'Unknown', color: 'text-muted-foreground', icon: '❓' };
    }
  });

  const connectionQualityDetails = createMemo(() => {
    switch (props.state.connectionQuality) {
      case 'excellent':
        return { text: 'Excellent', color: 'text-green-600', bars: 4 };
      case 'good':
        return { text: 'Good', color: 'text-yellow-600', bars: 3 };
      case 'poor':
        return { text: 'Poor', color: 'text-orange-600', bars: 2 };
      case 'offline':
        return { text: 'Offline', color: 'text-red-600', bars: 0 };
      default:
        return { text: 'Unknown', color: 'text-muted-foreground', bars: 0 };
    }
  });

  return (
    <Card class="border-0 shadow-none">
      <CardHeader class="!pb-3 !p-0">
        <div class="space-y-3">
          {/* Main Title and Status */}
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <CardTitle class="text-lg">Global Chat</CardTitle>
              <div class="flex items-center gap-2">
                <span class={`text-lg animate-pulse ${connectionStatusDetails().color}`}>
                  {connectionStatusDetails().icon}
                </span>
                <span class={`text-sm font-medium ${connectionStatusDetails().color}`}>
                  {connectionStatusDetails().text}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <Show when={props.state.userCount > 0}>
                <Badge variant="secondary" class="text-xs">
                  👥 {props.state.userCount} online
                </Badge>
              </Show>
              <Button
                variant="outline"
                size="sm"
                onClick={props.state.isConnected ? props.disconnect : props.connect}
                disabled={props.state.isConnecting || props.state.isReconnecting}
                class={props.state.isReconnecting ? 'animate-pulse' : ''}
              >
                {props.state.isReconnecting ? '🔄 Reconnecting...' :
                  props.state.isConnecting ? '⏳ Connecting...' :
                    props.state.isConnected ? '🔌 Disconnect' : '🔗 Connect'}
              </Button>
            </div>
          </div>

          {/* Connection Details */}
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <div class="flex items-center gap-4">
              <Show when={props.state.lastConnectedAt}>
                <span>🕐 Connected {props.state.lastConnectedAt ? new Date(props.state.lastConnectedAt).toLocaleTimeString() : ''}</span>
              </Show>
              <Show when={props.state.lastDisconnectedAt && !props.state.isConnected}>
                <span>⏰ Disconnected {props.state.lastDisconnectedAt ? new Date(props.state.lastDisconnectedAt).toLocaleTimeString() : ''}</span>
              </Show>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs">Signal:</span>
              <ConnectionQualityBars
                bars={connectionQualityDetails().bars}
                color={connectionQualityDetails().color}
              />
              <span class={`text-xs ${connectionQualityDetails().color}`}>
                {connectionQualityDetails().text}
              </span>
            </div>
          </div>

          {/* Error Message */}
          <Show when={props.state.error}>
            <div class="bg-destructive/10 border border-destructive/20 rounded-md p-2 animate-in fade-in duration-300">
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
              <Show when={props.state.reconnectAttempts > 0}>
                <div class="text-xs text-muted-foreground mt-1">
                  Auto-reconnect enabled • Attempt {props.state.reconnectAttempts}
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </CardHeader>
    </Card>
  );
}