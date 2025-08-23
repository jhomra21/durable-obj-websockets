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
  let hasScrolledOnMount = false;

  /**
   * Scrolls the chat area to the bottom with retry logic
   * Uses virtualizer if available, otherwise falls back to DOM scrolling
   */
  const scrollToBottom = (retryCount = 0) => {
    if (!scrollAreaRef) return;

    const count = messageCount();
    if (count === 0) return;

    // Use virtualizer scrolling if available and ready
    if (virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0) {
      try {
        // Check if the virtualizer has rendered items
        const range = virtualizer.getVirtualItems();
        if (range && range.length > 0) {
          virtualizer.scrollToIndex(count - 1, { align: 'end' });
          return;
        }
      } catch (error) {
        // Silently fall through to DOM scrolling or retry
      }
    }

    // Fallback to DOM scrolling
    if (scrollAreaRef.scrollHeight > 0) {
      scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
      return;
    }

    // If neither method worked and we haven't retried too much, retry
    if (retryCount < 5) {
      setTimeout(() => scrollToBottom(retryCount + 1), 50);
    }
  };

  /**
   * Sets the virtualizer instance for scroll management
   * Called by the MessageList component when virtualizer is ready
   */
  const setVirtualizer = (v: any) => {
    virtualizer = v;
    
    // If we have messages and haven't scrolled yet, scroll now that virtualizer is ready
    if (messageCount() > 0 && !hasScrolledOnMount) {
      hasScrolledOnMount = true;
      // Give virtualizer a moment to render items
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  /**
   * Initializes the scroll area reference and handles initial scroll
   * Called by the ref callback on the scrollable container
   */
  const initializeScrollArea = (el: HTMLDivElement) => {
    scrollAreaRef = el;

    // For navigation scenario with cached messages, wait for virtualizer to be ready
    // The setVirtualizer function will handle the initial scroll when virtualizer is ready
    // Only handle immediate scroll if we don't expect a virtualizer (non-virtualized lists)
    if (messageCount() > 0 && !hasScrolledOnMount && !virtualizer) {
      // Small delay to ensure this only runs if no virtualizer is coming
      setTimeout(() => {
        if (!virtualizer && messageCount() > 0 && !hasScrolledOnMount) {
          hasScrolledOnMount = true;
          scrollToBottom();
        }
      }, 50);
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

    // Handle refresh scenario: messages load after component mounts
    if (!hasScrolledOnMount) {
      hasScrolledOnMount = true;
      // For virtualized lists, wait a bit longer for virtualizer to be ready
      const delay = virtualizer ? 150 : 100;
      setTimeout(() => {
        if (scrollAreaRef) {
          scrollToBottom();
        }
      }, delay);
    } else {
      // Handle new messages being added - shorter delay for real-time updates
      setTimeout(() => {
        if (scrollAreaRef) {
          scrollToBottom();
        }
      }, 30);
    }
  });

  // Cleanup when component is unmounted
  onCleanup(() => {
    scrollAreaRef = undefined;
    virtualizer = undefined;
    hasScrolledOnMount = false;
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