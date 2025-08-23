import { Show, batch } from 'solid-js';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import type { WebSocketState } from '~/lib/websocket-chat';

interface MessageInputProps {
  state: WebSocketState;
  newMessage: () => string;
  setNewMessage: (value: string) => void;
  sendMessage: (content: string) => boolean;
}

export function MessageInput(props: MessageInputProps) {
  const handleSendMessage = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    const content = props.newMessage().trim();
    if (content && props.sendMessage(content)) {
      // Use batch to prevent multiple reactive updates
      batch(() => {
        props.setNewMessage('');
      });

      // Refocus input after brief delay
      setTimeout(() => {
        const input = (e.currentTarget as HTMLFormElement)?.querySelector('input') as HTMLInputElement;
        if (input && document.activeElement !== input) {
          input.focus();
        }
      }, 50);
    }
  };

  return (
    <Card class="border-t-0 shadow-none flex-shrink-0">
      <CardContent class="p-4">
        <form onSubmit={handleSendMessage} class="space-y-3">
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <Input
                value={props.newMessage()}
                onChange={props.setNewMessage}
                placeholder={
                  !props.state.isConnected ? "🔌 Connect to start chatting..." :
                    props.state.isReconnecting ? "🔄 Reconnecting..." :
                      props.state.connectionQuality === 'poor' ? "📶 Signal weak - Type a message..." :
                        "💬 Type a message..."
                }
                disabled={!props.state.isConnected || props.state.isConnecting || props.state.isReconnecting}
                class={`flex-1 transition-all duration-200 chat-input ${
                  props.state.connectionQuality === 'poor' ? 'border-orange-300 focus:border-orange-400' :
                    props.state.connectionQuality === 'excellent' ? 'border-green-300 focus:border-green-400' :
                      ''
                }`}
              />
              <Show when={props.state.connectionQuality === 'poor' && props.state.isConnected}>
                <div class="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <span class="text-xs text-orange-500 animate-pulse">📶</span>
                </div>
              </Show>
            </div>
            <Button
              type="submit"
              disabled={!props.state.isConnected || !props.newMessage().trim() || props.state.isConnecting || props.state.isReconnecting}
              size="sm"
              class={`transition-all duration-200 min-w-[70px] ${
                props.state.isReconnecting ? 'animate-pulse bg-orange-500 hover:bg-orange-600' :
                  !props.state.isConnected ? 'opacity-50' :
                    props.state.connectionQuality === 'excellent' ? 'bg-green-600 hover:bg-green-700' :
                      ''
              }`}
            >
              <Show when={props.state.isReconnecting} fallback="📤 Send">
                <span class="animate-spin">🔄</span>
              </Show>
            </Button>
          </div>

          {/* Input Status */}
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <div class="flex items-center gap-4">
              <Show when={props.newMessage().length > 0}>
                <span>{props.newMessage().length} characters</span>
              </Show>
              <Show when={props.state.isConnected && props.state.connectionQuality === 'excellent'}>
                <span class="text-green-600">✨ Strong connection</span>
              </Show>
              <Show when={props.state.isConnected && props.state.connectionQuality === 'poor'}>
                <span class="text-orange-600">⚠️ Weak connection</span>
              </Show>
            </div>
            <Show when={!props.state.isConnected && !props.state.isConnecting && !props.state.isReconnecting}>
              <span>Click "Connect" to start chatting</span>
            </Show>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}