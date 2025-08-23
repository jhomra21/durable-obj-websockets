import { useQuery, useQueryClient, useMutation } from '@tanstack/solid-query';
import type { ChatMessage } from '../../api/chat';

/**
 * Chat Query Options and Hooks
 * Following TanStack Query best practices for caching and real-time data
 */

// Query factory for type-safe and consistent query keys
export const chatQueries = {
  // Base key for all chat-related queries
  all: () => ['chat'] as const,
  
  // Messages query - cached message history  
  messages: () => ({
    queryKey: ['chat', 'messages'] as const,
    enabled: true, // Explicitly enable the query
         queryFn: async (): Promise<ChatMessage[]> => {
       const response = await fetch('/api/chat/messages', {
         method: 'GET',
         credentials: 'include', // Include auth cookies
         headers: {
           'Content-Type': 'application/json',
         }
       });

       if (!response.ok) {
         if (response.status === 401) {
           throw new Error('Authentication required');
         }
         throw new Error(`Failed to fetch messages: ${response.status}`);
       }

       const messages: ChatMessage[] = await response.json();
       return messages;
     },
         staleTime: 0,                 // Always consider data stale - fetch fresh on mount
     gcTime: 30 * 60 * 1000,       // 30 minutes - keep in cache for navigation
    retry: (failureCount: number, error: Error) => {
      // Don't retry auth errors
      if (error instanceof Error && error.message.includes('Authentication')) {
        return false;
      }
      // Retry network errors up to 3 times
      return failureCount < 3;
    },
         refetchOnWindowFocus: false,   // Refetch when user returns to tab
     refetchInterval: false as const,       // Don't poll - we use WebSocket for real-time
  })
};

/**
 * Hook to get chat messages with caching
 * Returns cached data immediately if available, fetches in background if stale
 */
export function useChatMessages() {
  return useQuery(() => chatQueries.messages());
}

/**
 * Hook to add optimistic message updates
 * Used by the ChatService to update cache when WebSocket receives new messages
 */
export function useChatMutations() {
  const queryClient = useQueryClient();

  // Mutation for adding a new message optimistically
  const addMessage = useMutation(() => ({
    mutationFn: async (message: ChatMessage) => {
      // This is for optimistic updates - actual sending happens via WebSocket
      return message;
    },
    onMutate: async (newMessage) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['chat', 'messages'] });

      // Snapshot the previous messages
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chat', 'messages']);

      // Optimistically update the cache
      queryClient.setQueryData<ChatMessage[]>(['chat', 'messages'], (old) => {
        if (!old) return [newMessage];
        
        // Check for duplicates (message might already exist from WebSocket)
        const exists = old.some(msg => msg.id === newMessage.id);
        if (exists) return old;
        
        // Add new message and maintain message limit
        const updated = [...old, newMessage];
        const MAX_CACHED_MESSAGES = 200;
        return updated.length > MAX_CACHED_MESSAGES 
          ? updated.slice(-MAX_CACHED_MESSAGES)
          : updated;
      });

      // Return context with previous messages for potential rollback
      return { previousMessages };
    },
         onError: (err, _newMessage, context) => {
      // Roll back on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat', 'messages'], context.previousMessages);
      }
      console.error('Failed to add message optimistically:', err);
    },
    onSettled: () => {
      // Always invalidate after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
    },
  }));

  // Mutation for removing a message (e.g., if send fails)
  const removeMessage = useMutation(() => ({
    mutationFn: async (messageId: string) => {
      return messageId;
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['chat', 'messages'] });
      
      const previousMessages = queryClient.getQueryData<ChatMessage[]>(['chat', 'messages']);
      
      // Remove the message from cache
      queryClient.setQueryData<ChatMessage[]>(['chat', 'messages'], (old) => {
        return old ? old.filter(msg => msg.id !== messageId) : [];
      });

      return { previousMessages };
    },
         onError: (err, _messageId, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat', 'messages'], context.previousMessages);
      }
      console.error('Failed to remove message:', err);
    },
  }));

  return {
    addMessage,
    removeMessage,
    // Helper to directly update cache without mutation (for WebSocket updates)
    updateMessagesCache: (updater: (old: ChatMessage[] | undefined) => ChatMessage[]) => {
      queryClient.setQueryData(['chat', 'messages'], updater);
    },
    // Helper to invalidate messages (force refetch)
    invalidateMessages: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
    }
  };
}

/**
 * Hook to get the current query client for advanced operations
 */
export function useChatQueryClient() {
  return useQueryClient();
}

/**
 * Utility function to prefetch chat messages
 * Useful for warming the cache before navigation
 */
export function prefetchChatMessages(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.prefetchQuery(chatQueries.messages());
}
