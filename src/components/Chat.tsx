import { createSignal, createEffect, For, Show, createMemo, onCleanup, onMount } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { createWebSocketChat, formatMessageTime, getMessageAuthor } from '~/lib/websocket-chat';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';

export function Chat() {
  // Configuration
  const disableVirtualization = false; // Enable virtualization with route transition fixes

  // Chat state and actions
  const {
    state,
    connect,
    disconnect,
    sendMessage,
    clearError
  } = createWebSocketChat();

  // Signals and refs
  const [newMessage, setNewMessage] = createSignal('');
  const [scrollAreaReady, setScrollAreaReady] = createSignal(false);
  const [isVisible, setIsVisible] = createSignal(false);
  const [hasInitialScrolled, setHasInitialScrolled] = createSignal(false);
  let scrollAreaRef: HTMLDivElement | undefined;

  // Create virtualizer with proper dependency tracking (only if virtualization is enabled)
  const virtualizer = createMemo(() => {
    if (disableVirtualization) return null;
    
    const messages = state.messages;
    const isReady = scrollAreaReady();
    const visible = isVisible();

    // Only create virtualizer when we have both the ref, messages, and component is visible
    if (!isReady || !scrollAreaRef || messages.length === 0 || !visible) return null;

    // Check if scroll element has proper dimensions
    const rect = scrollAreaRef.getBoundingClientRect();
    if (rect.height === 0 || rect.width === 0) return null;

    return createVirtualizer({
      count: messages.length,
      getScrollElement: () => scrollAreaRef ?? null,
      estimateSize: () => 80,
      overscan: 5,
      getItemKey: (index: number) => state.messages[index]?.id || `message-${index}`,
      // Add scroll margin for better positioning
      scrollMargin: 0,
      // Enable smooth scrolling behavior
      scrollPaddingStart: 0,
      scrollPaddingEnd: 0,
    });
  });

  // Auto-scroll to bottom when new messages arrive (but not on initial load)
  createEffect(() => {
    const messages = state.messages;
    const v = !disableVirtualization ? virtualizer() : null;
    const hasScrolled = hasInitialScrolled();

    // Only auto-scroll for new messages after initial scroll is done
    if (messages.length > 0 && scrollAreaRef && hasScrolled) {
      requestAnimationFrame(() => {
        if (v && !disableVirtualization && messages.length > 0) {
          // Ensure the virtualizer is properly initialized and measured
          const targetIndex = messages.length - 1;
          if (targetIndex >= 0 && targetIndex < v.options.count) {
            try {
              v.scrollToIndex(targetIndex, { 
                align: 'end',
                behavior: 'auto'
              });
            } catch (error) {
              console.warn('Virtualizer scroll failed, falling back to DOM scroll:', error);
              scrollAreaRef!.scrollTop = scrollAreaRef!.scrollHeight;
            }
          }
        } else {
          // Use regular scroll when virtualization is disabled
          scrollAreaRef!.scrollTop = scrollAreaRef!.scrollHeight;
        }
      });
    }
  });

  // Handle initial scroll to bottom - this runs once when component is ready
  const scrollToBottom = () => {
    if (!scrollAreaRef || hasInitialScrolled()) return;

    const messages = state.messages;
    if (messages.length === 0) return;

    const v = !disableVirtualization ? virtualizer() : null;
    
    if (v && !disableVirtualization) {
      try {
        const targetIndex = messages.length - 1;
        if (targetIndex >= 0 && targetIndex < v.options.count) {
          v.scrollToIndex(targetIndex, { 
            align: 'end',
            behavior: 'auto'
          });
          setHasInitialScrolled(true);
        }
      } catch (error) {
        scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
        setHasInitialScrolled(true);
      }
    } else {
      scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
      setHasInitialScrolled(true);
    }
  };

  // Trigger scroll when virtualizer becomes available
  createEffect(() => {
    const v = virtualizer();
    const messages = state.messages;
    
    if (v && messages.length > 0 && scrollAreaRef && !hasInitialScrolled()) {
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  });

  // Force virtualizer measurement when messages change (only if virtualization is enabled)
  createEffect(() => {
    if (!disableVirtualization) {
      const messages = state.messages; // track messages for reactivity
      const v = virtualizer();
      
      if (scrollAreaRef && v && messages.length > 0) {
        // Use a single requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          v.measure();
        });
      }
    }
  });

  // Handle component visibility and remeasurement after route transitions
  onMount(() => {
    // Set visible immediately on mount
    setIsVisible(true);
    
    let resizeObserver: ResizeObserver | undefined;
    
    if (scrollAreaRef) {
      // Add resize observer to handle container size changes during route transitions
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && entry.contentRect.height > 0 && entry.contentRect.width > 0) {
          // Container has been resized and has dimensions - trigger initial scroll
          if (!hasInitialScrolled()) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scrollToBottom();
              });
            });
          }
        }
      });
      resizeObserver.observe(scrollAreaRef);
    }

    // Cleanup observers
    onCleanup(() => {
      resizeObserver?.disconnect();
    });
  });

  // Cleanup when component is unmounted to prevent stale references
  onCleanup(() => {
    scrollAreaRef = undefined;
    setScrollAreaReady(false);
  });



  // Handle sending message

  const handleSendMessage = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();

    const content = newMessage().trim();
    if (content && sendMessage(content)) {
      setNewMessage('');
      // Prevent form reset flash - refocus input after brief delay
      setTimeout(() => {
        const input = (e.currentTarget as HTMLFormElement)?.querySelector('input') as HTMLInputElement;
        if (input && document.activeElement !== input) {
          input.focus();
        }
      }, 50);
    }
  };

  const connectionStatusDetails = createMemo(() => {
    switch (state.connectionStatus) {
      case 'idle':
        return { text: 'Ready to connect', color: 'text-muted-foreground', icon: '⚪' };
      case 'connecting':
        return { text: 'Connecting...', color: 'text-yellow-600', icon: '🟡' };
      case 'connected':
        return { text: 'Connected', color: 'text-green-600', icon: '🟢' };
      case 'disconnected':
        return { text: 'Disconnected', color: 'text-red-600', icon: '🔴' };
      case 'reconnecting':
        return { text: `Reconnecting... (attempt ${state.reconnectAttempts})`, color: 'text-orange-600', icon: '🟠' };
      case 'error':
        return { text: 'Connection error', color: 'text-red-600', icon: '❌' };
      default:
        return { text: 'Unknown', color: 'text-muted-foreground', icon: '❓' };
    }
  });

  // Memoized connection quality details
  const connectionQualityDetails = createMemo(() => {
    switch (state.connectionQuality) {
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


  // Track if a new message was just added for animation purposes
  const latestMessageId = createMemo(() => {
    const messages = state.messages;
    return messages.length > 0 ? messages[messages.length - 1].id : null;
  });

  // Connection quality bars component
  const ConnectionQualityBars = (props: { bars: number; color: string }) => {
    return (
      <div class="flex gap-0.5">
        <For each={Array(4)}>
          {(_, i) => (
            <div
              class={`w-1 h-3 rounded-sm transition-colors duration-200 ${i() < props.bars ? props.color : 'bg-muted'
                }`}
            ></div>
          )}
        </For>
      </div>
    );
  };

  // Main render
  return (
    <div class="flex flex-col h-full chat-container">
      {/* Chat Header */}
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
                <Show when={state.userCount > 0}>
                  <Badge variant="secondary" class="text-xs">
                    👥 {state.userCount} online
                  </Badge>
                </Show>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={state.isConnected ? disconnect : connect}
                  disabled={state.isConnecting || state.isReconnecting}
                  class={state.isReconnecting ? 'animate-pulse' : ''}
                >
                  {state.isReconnecting ? '🔄 Reconnecting...' :
                    state.isConnecting ? '⏳ Connecting...' :
                      state.isConnected ? '🔌 Disconnect' : '🔗 Connect'}
                </Button>
              </div>
            </div>

            {/* Connection Details */}
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <div class="flex items-center gap-4">
                <Show when={state.lastConnectedAt}>
                  <span>🕐 Connected {state.lastConnectedAt ? new Date(state.lastConnectedAt).toLocaleTimeString() : ''}</span>
                </Show>
                <Show when={state.lastDisconnectedAt && !state.isConnected}>
                  <span>⏰ Disconnected {state.lastDisconnectedAt ? new Date(state.lastDisconnectedAt).toLocaleTimeString() : ''}</span>
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
            <Show when={state.error}>
              <div class="bg-destructive/10 border border-destructive/20 rounded-md p-2 animate-in fade-in duration-300">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 text-sm text-destructive">
                    <span>⚠️</span>
                    <span>{state.error}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearError}
                    class="h-6 px-2 text-xs hover:bg-destructive/20"
                  >
                    ✕
                  </Button>
                </div>
                <Show when={state.reconnectAttempts > 0}>
                  <div class="text-xs text-muted-foreground mt-1">
                    Auto-reconnect enabled • Attempt {state.reconnectAttempts}
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </CardHeader>
      </Card>

      {/* Messages Area */}
      {/*
        Messages area: flex-1, scrollable only here. Prevents input from being pushed out of view.
        Use min-h-0 to allow flexbox to shrink this area as needed.
      */}
      <div class="flex-1 min-h-0 overflow-hidden">
        <Card class="h-full border-0 shadow-none">
          <CardContent class="p-0 h-full">
            <Show
              when={!state.error || state.connectionStatus === 'connected'}
              fallback={
                <div class="flex items-center justify-center h-full text-muted-foreground animate-in fade-in duration-300">
                  <div class="text-center space-y-3">
                    <div class="text-4xl animate-pulse">{connectionStatusDetails().icon}</div>
                    <div>
                      <p class="text-lg font-medium mb-1">{connectionStatusDetails().text}</p>
                      <p class="text-sm mb-3">
                        {state.connectionStatus === 'error' ? 'There was a problem connecting to the chat.' :
                          state.connectionStatus === 'disconnected' ? 'You have been disconnected from the chat.' :
                            'Unable to connect to the chat server.'}
                      </p>
                      <div class="flex gap-2 justify-center">
                        <Button variant="outline" size="sm" onClick={connect} disabled={state.isConnecting}>
                          {state.isConnecting ? '⏳ Connecting...' : '🔄 Try Again'}
                        </Button>
                        <Show when={state.error}>
                          <Button variant="ghost" size="sm" onClick={clearError}>
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
                ref={(el) => {
                  scrollAreaRef = el;
                  // Signal that the scroll area is ready
                  if (el) {
                    setScrollAreaReady(true);
                    setIsVisible(true);
                    
                    // Trigger initial scroll after a short delay to ensure everything is ready
                    setTimeout(() => {
                      if (!hasInitialScrolled()) {
                        scrollToBottom();
                      }
                    }, 50);
                  }
                }}
                class="px-4 overflow-y-auto h-full"
                data-chat-scroll-area
              >
                <Show
                  when={state.messages.length > 0}
                  fallback={
                    <div class="flex items-center justify-center h-full text-muted-foreground">
                      <div class="text-center">
                        <div class="text-4xl mb-2">💬</div>
                        <p class="text-lg font-medium mb-1">Welcome to Global Chat!</p>
                        <p class="text-sm">No messages yet. Be the first to say hello! 👋</p>
                        <p class="text-xs text-red-600">Debug: messages count {state.messages.length}</p>
                      </div>
                    </div>
                  }
                >
                  {(() => {
                    const v = disableVirtualization ? null : virtualizer();
                    if (v && !disableVirtualization) {
                      // Use virtualized rendering
                      const items = v.getVirtualItems();
                      // Helper for avatar fallback
                      function getUserInitials(name: string) {
                        return name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);
                      }
                      return (
                        <div 
                          style={{ 
                            height: `${v.getTotalSize()}px`, 
                            width: '100%',
                            position: 'relative' 
                          }}
                        >
                          <For each={items}>
                            {(virtualRow) => {
                              const message = state.messages[virtualRow.index];
                              if (!message) return null; // Guard against undefined messages
                              
                              const isLatestMessage = latestMessageId() === message.id;
                              return (
                                <div
                                  data-index={virtualRow.index}
                                  style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: `${virtualRow.size}px`,
                                    transform: `translateY(${virtualRow.start}px)`
                                  }}
                                  class={`flex gap-3 p-2 will-change-transform ${isLatestMessage
                                    ? 'animate-in fade-in slide-in-from-bottom-2 duration-300'
                                    : ''
                                    }`}
                                >
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
                      );
                    } else {
                      // Use simple rendering as fallback
                      // Helper for avatar fallback
                      function getUserInitials(name: string) {
                        return name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);
                      }
                      return (
                        <div class="space-y-3 py-2">
                          <For each={state.messages}>
                            {(message) => {
                              const isLatestMessage = latestMessageId() === message.id;
                              return (
                                <div class={`flex gap-3 ${isLatestMessage
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
                      );
                    }
                  })()}

                </Show>
              </div>
            </Show>
          </CardContent>
        </Card>
      </div>

      {/* Message Input */}
      <Card class="border-t-0 shadow-none flex-shrink-0">
        <CardContent class="p-4">
          <form onSubmit={handleSendMessage} class="space-y-3">
            <div class="flex gap-2">
              <div class="flex-1 relative">
                <Input
                  value={newMessage()}
                  onChange={setNewMessage}
                  placeholder={
                    !state.isConnected ? "🔌 Connect to start chatting..." :
                      state.isReconnecting ? "🔄 Reconnecting..." :
                        state.connectionQuality === 'poor' ? "📶 Signal weak - Type a message..." :
                          "💬 Type a message..."
                  }
                  disabled={!state.isConnected || state.isConnecting || state.isReconnecting}
                  class={`flex-1 transition-all duration-200 chat-input ${state.connectionQuality === 'poor' ? 'border-orange-300 focus:border-orange-400' :
                    state.connectionQuality === 'excellent' ? 'border-green-300 focus:border-green-400' :
                      ''
                    }`}
                />
                <Show when={state.connectionQuality === 'poor' && state.isConnected}>
                  <div class="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <span class="text-xs text-orange-500 animate-pulse">📶</span>
                  </div>
                </Show>
              </div>
              <Button
                type="submit"
                disabled={!state.isConnected || !newMessage().trim() || state.isConnecting || state.isReconnecting}
                size="sm"
                class={`transition-all duration-200 min-w-[70px] ${state.isReconnecting ? 'animate-pulse bg-orange-500 hover:bg-orange-600' :
                  !state.isConnected ? 'opacity-50' :
                    state.connectionQuality === 'excellent' ? 'bg-green-600 hover:bg-green-700' :
                      ''
                  }`}
              >
                <Show when={state.isReconnecting} fallback="📤 Send">
                  <span class="animate-spin">🔄</span>
                </Show>
              </Button>
            </div>

            {/* Input Status */}
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <div class="flex items-center gap-4">
                <Show when={newMessage().length > 0}>
                  <span>{newMessage().length} characters</span>
                </Show>
                <Show when={state.isConnected && state.connectionQuality === 'excellent'}>
                  <span class="text-green-600">✨ Strong connection</span>
                </Show>
                <Show when={state.isConnected && state.connectionQuality === 'poor'}>
                  <span class="text-orange-600">⚠️ Weak connection</span>
                </Show>
              </div>
              <Show when={!state.isConnected && !state.isConnecting && !state.isReconnecting}>
                <span>Click "Connect" to start chatting</span>
              </Show>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
