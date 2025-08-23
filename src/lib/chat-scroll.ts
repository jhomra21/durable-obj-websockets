import { createSignal, createEffect, onCleanup, batch } from 'solid-js';

export function useChatScroll(messageCount: () => number, latestMessageId: () => string | null) {
  const [hasInitialScrolled, setHasInitialScrolled] = createSignal(false);
  let scrollAreaRef: HTMLDivElement | undefined;

  const scrollToBottom = () => {
    if (!scrollAreaRef) return;
    scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
  };

  const initializeScrollArea = (el: HTMLDivElement) => {
    scrollAreaRef = el;
  };

  // Handle initial scroll - runs once when messages are first available
  createEffect(() => {
    const count = messageCount();
    const hasScrolled = hasInitialScrolled();

    // Guard: only run if we have messages, scroll area, and haven't scrolled yet
    if (count > 0 && scrollAreaRef && !hasScrolled) {
      batch(() => {
        setHasInitialScrolled(true);
      });

      // Scroll after DOM is ready
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    }
  });

  // Handle auto-scroll for new messages (after initial scroll)
  createEffect(() => {
    const latestId = latestMessageId();
    const hasScrolled = hasInitialScrolled();

    // Guard: only scroll if we have messages, scroll area, and have done initial scroll
    if (latestId && scrollAreaRef && hasScrolled) {
      // Use requestAnimationFrame for smoother scrolling
      const rafId = requestAnimationFrame(() => {
        scrollToBottom();
      });

      onCleanup(() => cancelAnimationFrame(rafId));
    }
  });

  // Cleanup when component is unmounted
  onCleanup(() => {
    scrollAreaRef = undefined;
    setHasInitialScrolled(false);
  });

  return {
    initializeScrollArea,
    scrollToBottom,
    hasInitialScrolled
  };
}