import { createSignal, createMemo, onMount } from 'solid-js';
import { useChat } from '~/lib/chat-hooks';
import { useChatScroll } from '~/lib/chat-scroll';
import { useChatPerformance } from '~/lib/chat-performance';
import { ChatHeader, MessageList, MessageInput } from './chat-components';

export function Chat() {
  // New optimized chat hook - combines cached data + real-time WebSocket
  const chat = useChat();

  // Ensure connection only while on the chat route
  onMount(() => {
    chat.connect();
  });

  // Message input state
  const [newMessage, setNewMessage] = createSignal('');

  // Memoized derived state from cached messages
  const messages = createMemo(() => {
    const messageData = chat.messages();
    return Array.isArray(messageData) ? messageData : [];
  });
  const messageCount = createMemo(() => messages().length);
  const latestMessageId = createMemo(() => {
    const msgs = messages();
    return msgs.length > 0 ? msgs[msgs.length - 1]?.id : null;
  });

  // Scroll management hook with virtualizer support
  const { initializeScrollArea, setVirtualizer, forceScrollToBottom } = useChatScroll(messageCount);

  // Performance monitoring in development
  if (import.meta.env.DEV) {
    useChatPerformance();
  }

  // Create a compatible state object for existing components
  const compatibleState = createMemo(() => ({
    messages: messages(),
    connectionStatus: chat.status(),
    isConnected: chat.isConnected(),
    isConnecting: chat.isConnecting(),
    error: chat.connectionError() || (chat.messagesError() ? String(chat.messagesError()) : null),
    userCount: chat.userCount(),
    sendCooldownUntil: chat.sendCooldownUntil(),
    // Loading states
    isLoadingMessages: chat.isLoadingMessages(),
    // Connection quality derived from connection state
    connectionQuality: chat.connectionQuality(),
    isReconnecting: chat.isReconnecting(),
    lastConnectedAt: chat.lastConnectedAt(),
    lastDisconnectedAt: chat.lastDisconnectedAt(),
    reconnectAttempts: chat.reconnectAttempts(),
  }));

  return (
    <div class="flex flex-col h-full min-h-0 overflow-hidden chat-container">
      <ChatHeader
        state={compatibleState()}
        connect={chat.connect}
        disconnect={chat.disconnect}
        clearError={chat.clearError}
      />
      <MessageList
        state={compatibleState()}
        connect={chat.connect}
        clearError={chat.clearError}
        scrollAreaRef={initializeScrollArea}
        latestMessageId={latestMessageId}
        virtualizer={setVirtualizer}
      />

      {/* Fade overlay above input */}
      <div class="relative">
        <div class="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background pointer-events-none z-10 -translate-y-full"></div>
      </div>

      <MessageInput
        state={compatibleState()}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        sendMessage={(content) => {
          const ok = chat.sendMessage(content);
          if (ok) {
            // Proactively scroll right after send; do not wait for server echo
            // to avoid landing slightly above bottom due to late measurements.
            requestAnimationFrame(() => forceScrollToBottom());
          }
          return ok;
        }}
      />
    </div>
  );
}
