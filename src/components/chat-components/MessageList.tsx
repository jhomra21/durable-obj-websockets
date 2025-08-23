import { For, Show, createMemo, createEffect } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { MessageItem } from './MessageItem';
import type { WebSocketState } from '~/lib/websocket-chat';

interface MessageListProps {
  state: WebSocketState;
  connect: () => void;
  clearError: () => void;
  scrollAreaRef: (el: HTMLDivElement) => void;
  latestMessageId: () => string | null;
  virtualizer?: (v: any) => void; // Callback to pass virtualizer to parent
}

export function MessageList(props: MessageListProps) {
  let scrollElementRef: HTMLDivElement | undefined;

  // Create virtualizer for message list
  const virtualizer = createVirtualizer({
    count: props.state.messages.length,
    getScrollElement: () => scrollElementRef || null,
    estimateSize: () => 80, // Estimated height per message
    overscan: 5, // Render 5 extra items outside viewport
  });

  // Initialize scroll area and pass virtualizer to parent
  const initializeScrollArea = (el: HTMLDivElement) => {
    scrollElementRef = el;
    props.scrollAreaRef(el);
    // Pass virtualizer to parent for scroll management
    if (props.virtualizer) {
      props.virtualizer(virtualizer);
    }
    // Force initial measurement after scroll element is set
    requestAnimationFrame(() => {
      if (scrollElementRef && scrollElementRef.clientHeight > 0) {
        virtualizer.measure();
      }
    });
  };

  // Force virtualizer to measure when messages change
  createEffect(() => {
    const messageCount = props.state.messages.length;
    if (messageCount > 0 && scrollElementRef && scrollElementRef.clientHeight > 0) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        virtualizer.measure();
      });
    }
  });

  // Check if scroll container has dimensions
  const hasScrollDimensions = () => {
    return scrollElementRef && scrollElementRef.clientHeight > 0 && scrollElementRef.clientWidth > 0;
  };

  // Memoized virtual items for performance
  const virtualItems = createMemo(() => {
    // Only get virtual items if scroll container has dimensions
    if (!hasScrollDimensions()) {
      return [];
    }
    
    const items = virtualizer.getVirtualItems();
    if (import.meta.env.DEV) {
      console.log('🔍 Virtual items:', {
        totalSize: virtualizer.getTotalSize(),
        itemCount: items.length,
        messageCount: props.state.messages.length,
        scrollElement: !!scrollElementRef,
        scrollHeight: scrollElementRef?.clientHeight || 0,
        scrollWidth: scrollElementRef?.clientWidth || 0
      });
    }
    return items;
  });

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
            when={props.state.connectionStatus === 'connected' || props.state.messages.length > 0}
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
                    <Show when={props.state.error}>
                      <div class="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                        Error: {props.state.error}
                      </div>
                    </Show>
                  </div>
                </div>
              </div>
            }
          >
            <div
              ref={initializeScrollArea}
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
                <Show
                  when={hasScrollDimensions() && virtualItems().length > 0}
                  fallback={
                    // Fallback: render messages without virtualization when container isn't ready
                    <div class="space-y-1">
                      <For each={props.state.messages}>
                        {(message) => {
                          const isLatestMessage = props.latestMessageId() === message?.id;
                          return (
                            <MessageItem 
                              message={message} 
                              isLatest={isLatestMessage}
                            />
                          );
                        }}
                      </For>
                    </div>
                  }
                >
                  {/* Virtualized rendering when container has dimensions */}
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    } as any}
                  >
                    <For each={virtualItems()}>
                      {(virtualItem) => {
                        const message = props.state.messages[virtualItem.index];
                        const isLatestMessage = props.latestMessageId() === message?.id;
                        
                        return (
                          <div
                            style={{
                              position: 'absolute',
                              top: '0px',
                              left: '0px',
                              width: '100%',
                              height: `${virtualItem.size}px`,
                              transform: `translateY(${virtualItem.start}px)`,
                            } as any}
                          >
                            <MessageItem 
                              message={message} 
                              isLatest={isLatestMessage}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </Show>
        </CardContent>
      </Card>
    </div>
  );
}