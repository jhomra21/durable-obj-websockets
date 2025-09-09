import { Show, batch, createSignal, createEffect, onCleanup } from 'solid-js';
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
  // Local ticking clock to update cooldown countdown while active
  const [now, setNow] = createSignal(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  const cooldownUntil = () => props.state.sendCooldownUntil ?? null;
  const remainingMs = () => {
    const until = cooldownUntil();
    if (!until) return 0;
    return Math.max(0, until - now());
  };
  const cooldownActive = () => remainingMs() > 0;
  const remainingSeconds = () => Math.ceil(remainingMs() / 1000);

  createEffect(() => {
    const until = cooldownUntil();
    const active = until && until > Date.now();
    if (active && !timer) {
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 1000);
    } else if (!active && timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

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

  const getPlaceholder = () => {
    if (cooldownActive()) return `Wait ${remainingSeconds()}s...`;
    if (!props.state.isConnected) return "Connect to start chatting...";
    if (props.state.isReconnecting) return "Reconnecting...";
    return "Type a message...";
  };

  const isDisabled = () => !props.state.isConnected || props.state.isConnecting || props.state.isReconnecting || cooldownActive();

  return (
    <div class="px-4 pb-4 bg-background">
      <div class="bg-card border rounded-lg shadow-sm p-3">
        <form onSubmit={handleSendMessage} class="flex gap-3">
          <div class="flex-1 relative">
            <Input
              value={props.newMessage()}
              onChange={props.setNewMessage}
              placeholder={getPlaceholder()}
              disabled={isDisabled()}
              class="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pr-12"
            />
            <Show when={cooldownActive()}>
              <div class="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <span class="text-xs text-muted-foreground">⏳ {remainingSeconds()}s</span>
              </div>
            </Show>
          </div>
          <Button
            type="submit"
            disabled={isDisabled() || !props.newMessage().trim()}
            size="sm"
            class="min-w-[70px]"
          >
            <Show when={props.state.isReconnecting} fallback={
              <Show when={cooldownActive()} fallback="Send">
                {remainingSeconds()}s
              </Show>
            }>
              <span class="animate-spin">🔄</span>
            </Show>
          </Button>
        </form>
        
        {/* Minimal status indicator */}
        <Show when={props.state.connectionQuality === 'poor' && props.state.isConnected}>
          <div class="flex items-center gap-2 mt-2 text-xs text-orange-600">
            <span class="animate-pulse">📶</span>
            <span>Weak connection</span>
          </div>
        </Show>
      </div>
    </div>
  );
}