import { createEffect, onCleanup } from 'solid-js';

/**
 * Chat Auto-Scroll Hook with Virtualization Support
 * 
 * Manages automatic scrolling to the bottom of a chat message list.
 * Supports both regular DOM scrolling and virtualized scrolling.
 * Handles both initial page load and navigation scenarios reliably.
 * 
 * Key Features:
 * - Automatically scrolls to bottom when messages are loaded or added
 * - Supports @tanstack/solid-virtual for performance with large message lists
 * - Handles timing issues where messages exist in state but DOM isn't rendered yet
 * - Works consistently across page refresh and router navigation
 * - Includes retry mechanism for DOM rendering delays
 * 
 * Usage:
 * ```tsx
 * const { initializeScrollArea, setVirtualizer } = useChatScroll(messageCount, latestMessageId);
 * 
 * return (
 *   <div ref={initializeScrollArea} class="overflow-y-auto">
 *     // Virtualized content
 *   </div>
 * );
 * ```
 */
export function useChatScroll(messageCount: () => number) {
  let scrollAreaRef: HTMLDivElement | undefined;
  let virtualizer: any = undefined;
  let lastMessageCount = 0;

  /**
   * Scrolls the chat area to the bottom with retry logic
   * Uses virtualizer if available, otherwise falls back to DOM scrolling
   */
  const scrollToBottom = (retryCount = 0) => {
    if (!scrollAreaRef) return;

    const count = messageCount();
    if (count === 0) return;

    console.log('🔄 scrollToBottom attempt', retryCount + 1, '/', 8, {
      hasScrollArea: !!scrollAreaRef,
      messageCount: count,
      hasVirtualizer: !!virtualizer,
      virtualizerReady: virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0,
      scrollHeight: scrollAreaRef.scrollHeight
    });

    // Use virtualizer scrolling if available and ready
    if (virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0) {
      try {
        // Check if the virtualizer has rendered items
        const range = virtualizer.getVirtualItems();
        if (range && range.length > 0) {
          console.log('📜 Using virtualizer scroll to index', count - 1);
          // Anchor last item to the bottom of the viewport for chat UX
          virtualizer.scrollToIndex(count - 1, { align: 'end' });
          return;
        } else {
          console.log('📜 Virtualizer not ready, items:', range?.length || 0);
        }
      } catch (error) {
        console.log('📜 Virtualizer scroll failed:', error);
      }
    }

    // Fallback to DOM scrolling
    if (scrollAreaRef.scrollHeight > 0) {
      console.log('📜 Using DOM scroll to bottom');
      scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
      return;
    }

    // If neither method worked and we haven't retried too much, retry
    if (retryCount < 7) {
      console.log('📜 Retrying scroll in 100ms...');
      setTimeout(() => scrollToBottom(retryCount + 1), 100);
    } else {
      console.log('📜 Failed to scroll after', retryCount + 1, 'attempts');
    }
  };

  /**
   * Sets the virtualizer instance for scroll management
   * Called by the MessageList component when virtualizer is ready
   */
  const setVirtualizer = (v: any) => {
    virtualizer = v;
    
    // Always try to scroll when virtualizer becomes available with messages
    // Don't rely on hasScrolledOnMount flag here - let the effect handle initial scroll
    if (messageCount() > 0) {
      // Give virtualizer a moment to render items
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  /**
   * Initializes the scroll area reference
   * Called by the ref callback on the scrollable container
   */
  const initializeScrollArea = (el: HTMLDivElement) => {
    scrollAreaRef = el;
    // If messages already exist on initial mount (e.g., refresh), ensure we scroll
    if (messageCount() > 0) {
      setTimeout(() => scrollToBottom(), 50);
    }
  };

  /**
   * Reactive effect that scrolls when message count changes
   * Handles both initial message loading and new message arrivals
   */
  createEffect(() => {
    const count = messageCount();

    // Only proceed if we have a scroll area and messages
    if (!scrollAreaRef || count === 0) return;

    // Check if this is the initial load (count increased from 0)
    const isInitialLoad = lastMessageCount === 0 && count > 0;
    // Check if new messages were added
    const isNewMessage = count > lastMessageCount;

    // Update last message count
    lastMessageCount = count;

    if (isInitialLoad) {
      // Initial message loading - trigger scroll
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      
    } else if (isNewMessage) {
      // New message added - always scroll regardless of hasScrolledOnMount
      // This ensures fresh page loads scroll when new messages arrive
      setTimeout(() => {
        scrollToBottom();
      }, 30);
    }
  });

  // Cleanup when component is unmounted
  onCleanup(() => {
    scrollAreaRef = undefined;
    virtualizer = undefined;
    lastMessageCount = 0;
  });

  /**
   * Manual scroll trigger for external use
   * Useful for forcing a scroll after specific actions
   */
  const forceScrollToBottom = () => {
    if (scrollAreaRef) {
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
  };

  return {
    initializeScrollArea,
    scrollToBottom,
    forceScrollToBottom,
    setVirtualizer
  };
}