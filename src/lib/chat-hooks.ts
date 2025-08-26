import { createSignal, createEffect, onCleanup } from 'solid-js';
import { useQueryClient } from '@tanstack/solid-query';
import { ChatService, type WebSocketConnectionState } from './chat-service';
import { useChatMessages, useChatMutations } from './chat-queries';
import type { ChatMessage } from '../../api/chat';

/**
 * SolidJS Hook for Chat Service Integration
 * 
 * Provides reactive integration between the global ChatService singleton
 * and SolidJS components. Handles automatic initialization, state synchronization,
 * and cleanup.
 */

/**
 * Main hook for chat functionality
 * Combines cached message data with real-time WebSocket connection
 */
export function useChat() {
  const queryClient = useQueryClient();
  const chatService = ChatService.getInstance();
  
  // Get cached messages via TanStack Query
  const messagesQuery = useChatMessages();
  const chatMutations = useChatMutations();

  // Only force refetch on initial mount if no messages loaded
  createEffect(() => {
    if (messagesQuery.isSuccess && messagesQuery.data && messagesQuery.data.length === 0) {
      // Only refetch if we have absolutely no messages (not even system messages)
      messagesQuery.refetch();
    }
  });
  
  // Reactive WebSocket connection state
  const [connectionState, setConnectionState] = createSignal<WebSocketConnectionState>(
    chatService.getState()
  );

  // Initialize chat service and subscribe to state changes
  createEffect(() => {
    // Initialize the service with QueryClient
    chatService.initialize(queryClient);
    
    // Subscribe to connection state changes
    const unsubscribe = chatService.subscribe((state) => {
      setConnectionState(state);
    });

    // Cleanup subscription on component unmount
    onCleanup(unsubscribe);
  });

  // Send message function
  const sendMessage = (content: string): boolean => {
    return chatService.sendMessage(content);
  };

  // Connect/disconnect functions (mainly for manual control)
  const connect = () => {
    chatService.connect();
  };

  const disconnect = () => {
    chatService.disconnect();
  };

  // Clear error function
  const clearError = () => {
    chatService.clearError();
  };

  return {
    // Message data from TanStack Query (cached + background updates)
    messages: (): ChatMessage[] => messagesQuery.data || [],
    isLoadingMessages: messagesQuery.isLoading,
    messagesError: messagesQuery.error,
    
    // WebSocket connection state (reactive)
    connectionState: connectionState(),
    
    // Derived state for convenience
    isConnected: () => connectionState().isConnected,
    isConnecting: () => connectionState().isConnecting,
    connectionError: () => connectionState().error,
    userCount: () => connectionState().userCount,
    sendCooldownUntil: () => connectionState().sendCooldownUntil ?? null,
    
    // Actions
    sendMessage,
    connect,
    disconnect,
    clearError,
    
    // Query actions
    refetchMessages: messagesQuery.refetch,
    invalidateMessages: chatMutations.invalidateMessages,
    
    // For debugging
    queryClient,
    chatService,
  };
}

/**
 * Hook specifically for connection state (lightweight)
 * Useful for components that only need connection status
 */
export function useChatConnection() {
  const chatService = ChatService.getInstance();
  const [connectionState, setConnectionState] = createSignal<WebSocketConnectionState>(
    chatService.getState()
  );

  createEffect(() => {
    const unsubscribe = chatService.subscribe(setConnectionState);
    onCleanup(unsubscribe);
  });

  return {
    state: connectionState(),
    isConnected: () => connectionState().isConnected,
    isConnecting: () => connectionState().isConnecting,
    error: () => connectionState().error,
    userCount: () => connectionState().userCount,
    connect: () => chatService.connect(),
    disconnect: () => chatService.disconnect(),
  };
}

/**
 * Hook for sending messages with optimistic updates
 * Provides a more advanced interface for message sending
 */
export function useChatSender() {
  const chatService = ChatService.getInstance();
  const chatMutations = useChatMutations();
  const [connectionState, setConnectionState] = createSignal<WebSocketConnectionState>(
    chatService.getState()
  );

  createEffect(() => {
    const unsubscribe = chatService.subscribe(setConnectionState);
    onCleanup(unsubscribe);
  });

  /**
   * Send message with optimistic update
   * Returns a promise that resolves when message is confirmed sent
   */
  const sendMessageOptimistic = async (content: string): Promise<boolean> => {
    if (!connectionState().isConnected) {
      throw new Error('Not connected to chat');
    }

    // Create optimistic message
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      userId: 'current-user', // Will be replaced by server
      userName: 'You',
      content,
      timestamp: Date.now(),
      type: 'text' as const,
    };

    try {
      // Add optimistic message to cache
      await chatMutations.addMessage.mutateAsync(optimisticMessage);
      
      // Send via WebSocket
      const sent = chatService.sendMessage(content);
      
      if (!sent) {
        // Remove optimistic message if send failed
        await chatMutations.removeMessage.mutateAsync(optimisticMessage.id);
        throw new Error('Failed to send message');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send message optimistically:', error);
      throw error;
    }
  };

  return {
    sendMessage: (content: string) => chatService.sendMessage(content),
    sendMessageOptimistic,
    isConnected: () => connectionState().isConnected,
    canSend: () => connectionState().isConnected && !connectionState().isConnecting,
  };
}

/**
 * Initialize chat service globally
 * Call this from your root component or main.tsx
 */
export function initializeChatService(queryClient: ReturnType<typeof useQueryClient>) {
  const chatService = ChatService.getInstance();
  chatService.initialize(queryClient);
  return chatService;
}

/**
 * Cleanup chat service
 * Call this when your app is shutting down
 */
export function cleanupChatService() {
  const chatService = ChatService.getInstance();
  chatService.destroy();
}
