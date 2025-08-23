import { createFileRoute } from '@tanstack/solid-router';
import { Chat } from '~/components/Chat';

export function ChatPage() {
  return (
    <div class="h-full flex flex-col">
      <div class="flex-1 container mx-auto min-h-0">
        <Chat />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/dashboard/chat')({
  component: ChatPage,
});