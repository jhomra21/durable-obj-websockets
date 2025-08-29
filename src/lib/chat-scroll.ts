import { createEffect, onCleanup } from 'solid-js';

// Debug flag to control scroll logging (off by default)
const DEBUG_SCROLL = import.meta.env.DEV && false;
const slog = (...args: any[]) => { if (DEBUG_SCROLL) console.debug(...args); };

/**
 * Chat Auto-Scroll Hook with Virtualization Support
 *
 * Robustly scrolls to the bottom on initial load and navigation by waiting
 * until either the virtualizer has computed a visible range or the DOM has
 * a usable scrollHeight, retrying via rAF.
 */
export function useChatScroll(messageCount: () => number) {
  let scrollAreaRef: HTMLDivElement | undefined;
  let virtualizer: any = undefined;
  let lastMessageCount = 0;
  let pendingEnsure = 0; // rAF id for ensure loop

  const cancelPendingEnsure = () => {
    if (pendingEnsure) {
      cancelAnimationFrame(pendingEnsure);
      pendingEnsure = 0;
    }
  };

  const ensureBottomWhenReady = (attempt = 0, maxAttempts = 12) => {
    if (!scrollAreaRef || messageCount() === 0) return;

    const count = messageCount();
    const v = virtualizer;
    const vReady = !!(v && v.getTotalSize && v.getTotalSize() > 0 && v.getVirtualItems && v.getVirtualItems().length > 0);

    slog('🧲 ensureBottomWhenReady', { attempt, vReady, totalSize: v?.getTotalSize?.(), domScrollH: scrollAreaRef.scrollHeight });

    if (vReady) {
      try {
        // First, ask virtualizer to align the last item to the end
        v.scrollToIndex(count - 1, { align: 'end' });
        // Then, on the next frame, clamp the DOM scroll to the absolute bottom
        // so any bottom padding on the scroll area is respected.
        if (scrollAreaRef) {
          requestAnimationFrame(() => {
            if (scrollAreaRef) {
              scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
            }
          });
        }
        return;
      } catch (e) {
        slog('ensureBottom: virtualizer scroll failed', e);
      }
    }

    if (scrollAreaRef.scrollHeight > 0) {
      scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
      return;
    }

    if (attempt < maxAttempts) {
      pendingEnsure = requestAnimationFrame(() => ensureBottomWhenReady(attempt + 1, maxAttempts));
    }
  };

  // Keep aligning to bottom for a short stabilization window
  const lockToBottomFor = (durationMs = 320, thresholdPx = 6) => {
    if (!scrollAreaRef) return;
    cancelPendingEnsure();
    let startTs = 0;
    const loop = (ts: number) => {
      if (!scrollAreaRef) return;
      if (!startTs) startTs = ts;
      // If we're not near bottom, try to align again
      const remaining = scrollAreaRef.scrollHeight - scrollAreaRef.scrollTop - scrollAreaRef.clientHeight;
      if (remaining > thresholdPx) {
        ensureBottomWhenReady();
      }
      if (ts - startTs < durationMs) {
        pendingEnsure = requestAnimationFrame(loop);
      }
    };
    pendingEnsure = requestAnimationFrame(loop);
  };

  /**
   * Scrolls the chat area to the bottom with retry logic
   * Uses virtualizer if available and has a computed size
   */
  const scrollToBottom = (retryCount = 0) => {
    if (!scrollAreaRef) return;

    const count = messageCount();
    if (count === 0) return;

    slog('🔄 scrollToBottom attempt', retryCount + 1, '/', 8, {
      hasScrollArea: !!scrollAreaRef,
      messageCount: count,
      hasVirtualizer: !!virtualizer,
      virtualizerReady: virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0,
      scrollHeight: scrollAreaRef.scrollHeight
    });

    // Use virtualizer scrolling if available and has a computed size
    if (virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0) {
      try {
        // Force scroll via virtualizer even if no items are currently visible.
        // This prevents a "scrolled past total size" state from keeping the range empty.
        slog('📜 Using virtualizer scroll to index (force)', count - 1);
        virtualizer.scrollToIndex(count - 1, { align: 'end' });
        return;
      } catch (error) {
        slog('📜 Virtualizer scroll failed:', error);
      }
    }

    // Fallback to DOM scrolling
    if (scrollAreaRef.scrollHeight > 0) {
      slog('📜 Using DOM scroll to bottom');
      scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
      return;
    }

    // If neither method worked and we haven't retried too much, retry
    if (retryCount < 7) {
      slog('📜 Retrying scroll in 100ms...');
      setTimeout(() => scrollToBottom(retryCount + 1), 100);
    } else {
      slog('📜 Failed to scroll after', retryCount + 1, 'attempts');
    }
  };

  /**
   * Sets the virtualizer instance for scroll management
   * Called by the MessageList component when virtualizer is ready
   */
  const setVirtualizer = (v: any) => {
    virtualizer = v;
    // Always try to scroll when virtualizer becomes available with messages
    if (messageCount() > 0) {
      cancelPendingEnsure();
      // Let layout/transition settle, then ensure bottom via virtualizer readiness
      setTimeout(() => ensureBottomWhenReady(), 120);
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
      cancelPendingEnsure();
      // Small delay for ResizeObserver/virtualizer.measure to run on first frame
      requestAnimationFrame(() => ensureBottomWhenReady());
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
      cancelPendingEnsure();
      setTimeout(() => ensureBottomWhenReady(), 120);
      
    } else if (isNewMessage) {
      // New message added — lock to bottom briefly until measurements settle
      lockToBottomFor();
    }
  });

  // Cleanup when component is unmounted
  onCleanup(() => {
    scrollAreaRef = undefined;
    virtualizer = undefined;
    lastMessageCount = 0;
    cancelPendingEnsure();
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