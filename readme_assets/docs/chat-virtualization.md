# Chat Virtualization & Auto-Scroll (TanStack Virtual + SolidJS)

This document explains the root cause of the chat auto-scroll issue with virtualization, the fix we implemented, and how to wire it up correctly in SolidJS using TanStack Virtual.

- Files: `src/components/chat-components/MessageList.tsx`, `src/lib/chat-scroll.ts`, `src/components/Chat.tsx`
- Library: `@tanstack/solid-virtual@3.13.12`

## Summary (TL;DR)

- The virtualizer was created with a static `count`, so it didn’t react to message length changes after refresh/hydration.
- No immediate scroll was triggered when the scroll container mounted while messages already existed (refresh case).
- Fix:
  - Make `count` reactive: `count: () => props.state.messages.length`
  - Trigger an initial scroll once the scroll area element is mounted and when the virtualizer becomes ready
  - Use `virtualizer.scrollToIndex(count - 1, { align: 'end' })` to anchor the last item to the bottom
  - Add retry logic for late DOM/virtualizer readiness

## Implementation Details

### 1) Reactive virtualizer count

In `src/components/chat-components/MessageList.tsx`, create the virtualizer with a reactive accessor for `count` and pass the `scrollElement`.

```tsx
// MessageList.tsx
const virtualizer = createVirtualizer({
  count: () => props.state.messages.length,
  getScrollElement: () => scrollElementRef || null,
  estimateSize: () => 80,
  overscan: 5,
} as any);
```

Why: TanStack Virtual expects the virtualizer to know the current total count. With Solid, passing an accessor keeps the virtualizer synced with message changes without manual re-instantiation.

References:
- createVirtualizer (Solid): https://github.com/tanstack/virtual/blob/main/docs/framework/solid/solid-virtual.md
- Virtualizer options: https://github.com/tanstack/virtual/blob/main/docs/api/virtualizer.md

### 2) Auto-scroll management hook

In `src/lib/chat-scroll.ts`, we centralize scrolling behavior. Key points:

- Scroll on initial mount (refresh) if messages already exist
- Scroll on new messages (count increase)
- Prefer virtualizer-based scrolling if available, otherwise fall back to DOM scroll
- Use bottom anchoring

```ts
// chat-scroll.ts (snippets)
const scrollToBottom = (retryCount = 0) => {
  if (!scrollAreaRef) return;
  const count = messageCount();
  if (count === 0) return;

  if (virtualizer && virtualizer.getTotalSize && virtualizer.getTotalSize() > 0) {
    const range = virtualizer.getVirtualItems();
    if (range && range.length > 0) {
      virtualizer.scrollToIndex(count - 1, { align: 'end' });
      return;
    }
  }

  if (scrollAreaRef.scrollHeight > 0) {
    scrollAreaRef.scrollTop = scrollAreaRef.scrollHeight;
    return;
  }

  if (retryCount < 7) setTimeout(() => scrollToBottom(retryCount + 1), 100);
};

const initializeScrollArea = (el: HTMLDivElement) => {
  scrollAreaRef = el;
  if (messageCount() > 0) setTimeout(() => scrollToBottom(), 50);
};

const setVirtualizer = (v: any) => {
  virtualizer = v;
  if (messageCount() > 0) setTimeout(() => scrollToBottom(), 100);
};
```

References:
- scrollToIndex API: https://github.com/tanstack/virtual/blob/main/docs/api/virtualizer.md#scrolltoindex

### 3) Wiring in the Chat component

- Provide `messageCount` to the hook
- Pass `initializeScrollArea` to `MessageList` via `scrollAreaRef`
- Pass `setVirtualizer` to receive the virtualizer instance

```tsx
// src/components/Chat.tsx (snippets)
const messageCount = createMemo(() => messages().length);
const { initializeScrollArea, setVirtualizer } = useChatScroll(messageCount);

<MessageList
  state={compatibleState()}
  scrollAreaRef={initializeScrollArea}
  latestMessageId={latestMessageId}
  virtualizer={setVirtualizer}
  connect={chat.connect}
  clearError={chat.clearError}
/>
```

### 4) SolidJS reactivity and safety

- Use accessors (functions) instead of memos when a simple derivation is enough (e.g. `() => messages().length`)
- Guard effects to avoid circular updates. Do not update state read by the same effect without change detection.
- Group updates with `batch()` when necessary.

## Testing Checklist

- Fresh page load with existing messages: auto-scrolls to bottom
- Browser refresh on the chat page: auto-scrolls to bottom
- Sending a new message: scrolls to reveal the latest message
- Large history: virtualization is active (check `getTotalSize()`/`getVirtualItems()`), no blank gaps

## Notes on TypeScript and versions

- With `@tanstack/solid-virtual@3.13.12`, we cast options as `any` to allow passing Solid accessors for `count`. If future versions improve adapter typings, the cast may be removable.

## Related Links

- TanStack Virtual (Solid): https://github.com/tanstack/virtual/blob/main/docs/framework/solid/solid-virtual.md
- Virtualizer API: https://github.com/tanstack/virtual/blob/main/docs/api/virtualizer.md
- OAuth callback SPA shim routes (dev): `src/routes/api/auth/callback/*`
