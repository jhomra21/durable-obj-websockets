import { createSignal, createMemo } from 'solid-js';
import { useChat } from '~/lib/chat-hooks';
import { useChatScroll } from '~/lib/chat-scroll';
import { useChatPerformance } from '~/lib/chat-performance';
import { ChatHeader, MessageList, MessageInput } from './chat-components';

export function Chat() {
  // New optimized chat hook - combines cached data + real-time WebSocket
  const chat = useChat();

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
  const { initializeScrollArea, setVirtualizer } = useChatScroll(messageCount);

  // Performance monitoring in development
  if (import.meta.env.DEV) {
    useChatPerformance();
  }

  // Test function to send a test message
  const sendTestMessage = () => {
    if (chat.isConnected()) {
      chat.sendMessage('Test message from optimized client');
    } else {
      console.log('Not connected, attempting to connect...');
      chat.connect();
    }
  };

  // Create a compatible state object for existing components
  const compatibleState = createMemo(() => ({
    messages: messages(),
    connectionStatus: chat.connectionState.status,
    isConnected: chat.isConnected(),
    isConnecting: chat.isConnecting(),
    error: chat.connectionError() || (chat.messagesError ? String(chat.messagesError) : null),
    userCount: chat.userCount(),
    // Loading states
    isLoadingMessages: chat.isLoadingMessages,
    // Connection quality derived from connection state
    connectionQuality: chat.connectionState.connectionQuality,
    isReconnecting: chat.connectionState.status === 'reconnecting',
    lastConnectedAt: chat.connectionState.lastConnectedAt,
    lastDisconnectedAt: chat.connectionState.lastDisconnectedAt,
    reconnectAttempts: chat.connectionState.reconnectAttempts,
  }));

  return (
    <div class="flex flex-col h-full chat-container">
      <ChatHeader
        state={compatibleState()}
        connect={chat.connect}
        disconnect={chat.disconnect}
        clearError={chat.clearError}
      />

      {/* Debug panel for development - now shows optimization info */}
      {import.meta.env.DEV && (
        <div class="bg-green-50 border border-green-200 p-2 text-xs">
          <div class="flex gap-2 items-center flex-wrap">
            <span class="font-semibold text-green-700">Optimized Chat:</span>
            <button 
              onClick={sendTestMessage}
              class="px-2 py-1 bg-blue-500 text-white rounded text-xs"
            >
              Test Connection
            </button>
            <span>Status: {chat.connectionState.status}</span>
            <span>Messages: {messageCount()}</span>
            <span class="text-blue-600">
              Cache: {chat.messages() ? '✓ Hit' : '⟳ Loading'}
            </span>
            <span class="text-purple-600">
              WS: {chat.isConnected() ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
            {compatibleState().error && 
              <span class="text-red-600">Error: {compatibleState().error}</span>
            }
          </div>
        </div>
      )}

      <MessageList
        state={compatibleState()}
        connect={chat.connect}
        clearError={chat.clearError}
        scrollAreaRef={initializeScrollArea}
        latestMessageId={latestMessageId}
        virtualizer={setVirtualizer}
      />

      <MessageInput
        state={compatibleState()}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        sendMessage={chat.sendMessage}
      />
    </div>
  );
}
