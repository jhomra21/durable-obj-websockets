import { createSignal } from 'solid-js';
import { createWebSocketChat } from '~/lib/websocket-chat';
import { useChatScroll } from '~/lib/chat-scroll';
import { useChatPerformance } from '~/lib/chat-performance';
import { ChatHeader, MessageList, MessageInput } from './chat-components';

export function Chat() {
  // Chat state and actions
  const {
    state,
    connect,
    disconnect,
    sendMessage,
    clearError
  } = createWebSocketChat();

  // Message input state
  const [newMessage, setNewMessage] = createSignal('');

  // Simple derived state - no memos needed for basic calculations
  const messageCount = () => state.messages.length;
  const latestMessageId = () => {
    const messages = state.messages;
    return messages.length > 0 ? messages[messages.length - 1]?.id : null;
  };

  // Scroll management hook
  const { initializeScrollArea } = useChatScroll(messageCount, latestMessageId);

  // Performance monitoring in development
  if (import.meta.env.DEV) {
    useChatPerformance();
  }

  return (
    <div class="flex flex-col h-full chat-container">
      <ChatHeader
        state={state}
        connect={connect}
        disconnect={disconnect}
        clearError={clearError}
      />

      <MessageList
        state={state}
        connect={connect}
        clearError={clearError}
        scrollAreaRef={initializeScrollArea}
        latestMessageId={latestMessageId}
      />

      <MessageInput
        state={state}
        newMessage={newMessage}
        setNewMessage={setNewMessage}
        sendMessage={sendMessage}
      />
    </div>
  );
}
