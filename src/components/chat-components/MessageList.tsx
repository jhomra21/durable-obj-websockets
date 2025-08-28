import { For, Show, createMemo, createEffect, onCleanup, createSignal } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { MessageItem } from './MessageItem';
import type { WebSocketState } from '~/lib/websocket-chat';

// Toggle verbose virtualizer logs in development
const DEBUG_VIRTUALIZER = false;

interface MessageListProps {
  state: WebSocketState;
  connect: () => void;
  clearError: () => void;
  scrollAreaRef: (el: HTMLDivElement) => void;
  latestMessageId: () => string | null;
  virtualizer?: (v: any) => void; // Callback to pass virtualizer to parent
}

export function MessageList(props: MessageListProps) {
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | null>(null);
  const [containerReady, setContainerReady] = createSignal(false);
  const [vTick, setVTick] = createSignal(0); // triggers UI updates on virtualizer changes
  let resizeObserver: ResizeObserver | undefined;
  let scrolledToEndOnce = false; // ensure single initial scroll clamp

  // Create virtualizer using the Solid adapter's reactive options accessor
  const virtualizer = createVirtualizer((() => ({
    // Pass a number for count (core expects a number)
    count: props.state.messages.length,
    // Always return the latest scroll element
    getScrollElement: () => scrollEl() || null,
    estimateSize: () => 40,
    overscan: 15,
    // Seed an initial rect so range can compute before observers fire
    initialRect: {
      top: 0,
      left: 0,
      width: scrollEl()?.clientWidth || 0,
      height: scrollEl()?.clientHeight || 400,
    },
    // Help range compute immediately and smooth out RO thrash
    initialOffset: () => scrollEl()?.scrollTop || 0,
    useAnimationFrameWithResizeObserver: true,
    // Provide instance-based observers to guarantee rect/offset updates
    observeElementRect: (instance: any, cb: (rect: { width: number; height: number; top?: number; left?: number }) => void) => {
      const el = instance?.scrollElement as Element | null | undefined;
      if (!el || !(el instanceof Element)) return;
      const ro = new ResizeObserver(() => {
        const htmlEl = el as HTMLElement;
        const width = htmlEl.clientWidth || el.getBoundingClientRect().width || 0;
        const height = htmlEl.clientHeight || el.getBoundingClientRect().height || 0;
        const { top = 0, left = 0 } = el.getBoundingClientRect?.() || ({} as any);
        cb({ width, height, top, left });
      });
      ro.observe(el);
      // Initial call
      const htmlEl = el as HTMLElement;
      const width0 = htmlEl.clientWidth || el.getBoundingClientRect().width || 0;
      const height0 = htmlEl.clientHeight || el.getBoundingClientRect().height || 0;
      const { top: top0 = 0, left: left0 = 0 } = el.getBoundingClientRect?.() || ({} as any);
      cb({ width: width0, height: height0, top: top0, left: left0 });
      return () => ro.disconnect();
    },
    observeElementOffset: (instance: any, cb: (offset: number) => void) => {
      const el = instance?.scrollElement as HTMLElement | null | undefined;
      if (!el) return;
      const onScroll = () => cb(el.scrollTop || 0);
      el.addEventListener('scroll', onScroll, { passive: true });
      // Initial call
      cb(el.scrollTop || 0);
      return () => el.removeEventListener('scroll', onScroll);
    },
    onChange: (instance: any, sync: boolean) => {
      if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
        const items = instance.getVirtualItems();
        const rect = (instance as any).scrollRect;
        const rawCount = (instance as any).options?.count;
        const optionsCount = typeof rawCount === 'function' ? rawCount() : rawCount;
        console.log('🧭 Virtualizer.onChange', {
          sync,
          totalSize: instance.getTotalSize(),
          itemCount: items.length,
          optionsCount,
          hasScrollElement: !!(instance as any).scrollElement,
          scrollRect: rect ? { top: rect.top, height: rect.height } : null,
          visibleRange: items.length
            ? { startIndex: items[0].index, endIndex: items[items.length - 1].index }
            : null,
        });
      }
      // Nudge Solid to re-read virtual items
      setVTick((c) => c + 1);
    },
  })) as any);
  if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
    console.log('🧰 Virtualizer created', {
      estimateSize: 40,
      overscan: 15,
    });
  }

  // No manual setOptions calls — the reactive accessor keeps options in sync

  // Initialize scroll area and pass virtualizer to parent
  const initializeScrollArea = (el: HTMLDivElement) => {
    setScrollEl(el);
    props.scrollAreaRef(el);
    // Pass virtualizer to parent for scroll management
    if (props.virtualizer) {
      props.virtualizer(virtualizer);
    }
    if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
      console.log('🧭 Scroll area initialized', {
        hasElement: !!el,
        clientHeight: el?.clientHeight || 0,
        clientWidth: el?.clientWidth || 0,
      });
    }
    // Observe size changes so we measure as soon as the container has non-zero dimensions
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => {
      if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
        console.log('📐 ResizeObserver - container size', {
          clientHeight: scrollEl()?.clientHeight || 0,
          clientWidth: scrollEl()?.clientWidth || 0,
        });
      }
      const sEl = scrollEl();
      if (sEl) {
        const ready = sEl.clientHeight > 0 && sEl.clientWidth > 0;
        if (ready !== containerReady()) setContainerReady(ready);
      }
      virtualizer.measure();
    });
    if (el) {
      resizeObserver.observe(el);
    }
    // Force initial measurement after scroll element is set
    requestAnimationFrame(() => {
      const sEl = scrollEl();
      if (sEl && sEl.clientHeight > 0) {
        if (!containerReady()) setContainerReady(true);
        if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
          console.log('📏 Virtualizer.measure() - initial');
        }
        virtualizer.measure();
      }
    });
  };

  // Force virtualizer to measure when messages change
  createEffect(() => {
    const messageCount = props.state.messages.length;
    const sEl = scrollEl();
    if (messageCount > 0 && sEl && sEl.clientHeight > 0) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
          console.log('📏 Virtualizer.measure() - messages changed', { messageCount });
        }
        virtualizer.measure();
      });
    }
  });

  // Removed manual setOptions: Solid adapter reacts to signals in the accessor above

  // Once container has non-zero size, force a scroll clamp to render a range
  createEffect(() => {
    if (!containerReady()) return;
    const el = scrollEl();
    const count = props.state.messages.length;
    if (!el || count === 0 || scrolledToEndOnce) return;
    scrolledToEndOnce = true;
    requestAnimationFrame(() => {
      try {
        virtualizer.scrollToIndex(count - 1, { align: 'end' } as any);
      } catch {}
    });
  });

  // (removed) hasScrollDimensions — replaced by containerReady signal

  // Memoized virtual items for performance
  const virtualItems = createMemo(() => {
    // Depend on vTick so Solid recalculates when the virtualizer updates
    vTick();
    const items = virtualizer.getVirtualItems();
    if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
      console.log('🔍 Virtual items', {
        totalSize: virtualizer.getTotalSize(),
        itemCount: items.length,
        messageCount: props.state.messages.length,
        visibleRange: items.length
          ? { startIndex: items[0].index, endIndex: items[items.length - 1].index }
          : null,
        scrollElement: !!scrollEl(),
        scrollHeight: scrollEl()?.clientHeight || 0,
        scrollWidth: scrollEl()?.clientWidth || 0,
        scrollTop: scrollEl()?.scrollTop || 0,
      });
    }
    return items;
  });

  // Dev logs to clearly indicate when virtualization is active vs fallback
  createEffect(() => {
    if (!(import.meta.env.DEV && DEBUG_VIRTUALIZER)) return;
    const dimsReady = containerReady();
    const items = virtualItems();
    if (dimsReady && items.length > 0) {
      console.log('✅ Using VIRTUALIZED rendering', {
        totalSize: virtualizer.getTotalSize(),
        virtualItemCount: items.length,
        firstIndex: items[0]?.index,
        lastIndex: items[items.length - 1]?.index,
      });
    } else if (!dimsReady) {
      console.log('ℹ️ Fallback: container not ready (non-virtualized render path)');
    } else {
      console.log('ℹ️ No virtual items yet (probably no messages)');
    }
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

  onCleanup(() => {
    resizeObserver?.disconnect();
  });

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
              class="overflow-y-auto h-full"
              onScroll={(e) => {
                if (import.meta.env.DEV && DEBUG_VIRTUALIZER) {
                  const items = virtualizer.getVirtualItems();
                  console.log('🌀 Scroll', {
                    scrollTop: (e.currentTarget as HTMLDivElement).scrollTop,
                    visibleRange: items.length
                      ? { startIndex: items[0].index, endIndex: items[items.length - 1].index }
                      : null,
                    itemCount: items.length,
                  });
                }
              }}
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
                  when={props.state.messages.length > 0}
                  fallback={
                    // Fallback: render messages without virtualization when container isn't ready
                    <div>
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
                            ref={(el) => {
                              // In Solid, ref can run before attributes are set; ensure the index is present first
                              el.setAttribute('data-index', String(virtualItem.index));
                              queueMicrotask(() => {
                                try {
                                  virtualizer.measureElement(el);
                                } catch {}
                              });
                            }}
                            data-index={virtualItem.index}
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