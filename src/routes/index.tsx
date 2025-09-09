import { createFileRoute, useLoaderData } from '@tanstack/solid-router';
import type { Component } from 'solid-js';
import { Show } from 'solid-js';
import { Button } from '~/components/ui/button';
import { useRouter } from '@tanstack/solid-router';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '~/components/ui/card';
import { Icon } from '~/components/ui/icon';
import Footer from '~/components/Footer';
import { publicLoader } from '~/lib/auth-guard';

const HomePage: Component = () => {
  const router = useRouter();
  const loaderData = useLoaderData({ from: '/' });

  return (
    <div class="p-4 min-h-svh flex flex-col bg-gradient-to-br from-stone-50 via-stone-100 to-stone-400/60 text-gray-900">
      <div class="max-w-5xl mx-auto w-full flex flex-col flex-grow">
        <section class="text-center pb-8">
          <h1 class="text-4xl md:text-6xl font-extrabold tracking-tight">
            Real-time Chat
          </h1>
          <p class="mt-4 text-lg text-muted-foreground">
            Experience blazing-fast real-time messaging powered by Cloudflare Durable Objects and WebSockets.
          </p>
          <div class="mt-8 flex flex-row flex-wrap gap-3 justify-center">
            <Show
              when={loaderData()?.session}
              fallback={(
                <>
                  <Button
                    onClick={() => router.navigate({ to: "/auth", search: { redirect: undefined, deleted: undefined } })}
                    variant="sf-compute"
                    class="items-center justify-center gap-2 w-auto px-6 py-3"
                  >
                    <span>Join the Chat</span>
                    <span class="ml-2 opacity-70">💬</span>
                  </Button>
                  <Button
                    variant="outline"
                    class="w-auto px-6 py-3"
                    onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Learn more
                  </Button>
                </>
              )}
            >
              <>
                <Button
                  onClick={() => router.navigate({ to: "/dashboard/chat" })}
                  variant="sf-compute"
                  class="items-center justify-center gap-2 w-auto px-6 py-3"
                >
                  <span>Open Chat</span>
                  <span class="ml-2 opacity-70">💬</span>
                </Button>
                <Button
                  onClick={() => router.navigate({ to: "/dashboard" })}
                  variant="secondary"
                  class="items-center justify-center gap-2 w-auto px-6 py-3"
                >
                  <span>Dashboard</span>
                  <span class="ml-2 opacity-70">⚡</span>
                </Button>
              </>
            </Show>
          </div>
        </section>

        <section id="features" class="grid gap-6 sm:grid-cols-2">
          <Card>
            <CardHeader class="flex flex-row items-center gap-3">
              <Icon name="zap" class="size-6 text-primary" />
              <CardTitle>Real-time Messaging</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Instant message delivery powered by WebSockets and Cloudflare Durable Objects for global scale.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="flex flex-row items-center gap-3">
              <Icon name="users" class="size-6 text-primary" />
              <CardTitle>Multi-user Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Connect with multiple users simultaneously in a shared chat room with live user presence.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="flex flex-row items-center gap-3">
              <Icon name="scroll-text" class="size-6 text-primary" />
              <CardTitle>Message History</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Virtualized message list with smooth scrolling and automatic message persistence.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader class="flex flex-row items-center gap-3">
              <Icon name="shield-check" class="size-6 text-primary" />
              <CardTitle>Secure Authentication</CardTitle>
            </CardHeader>
            <CardContent>
              <p>OAuth sign-in with Google, GitHub, and Twitter using better-auth and Cloudflare D1.</p>
            </CardContent>
          </Card>
        </section>

        <div class="mt-6" />

        <Card>
          <CardHeader>
            <CardTitle>
              Technical Architecture
            </CardTitle>
          </CardHeader>
          <CardContent>
            This real-time chat application demonstrates:
            <ul class="list-disc list-inside space-y-1">
              <li><strong>Cloudflare Durable Objects</strong> - WebSocket handling and message persistence</li>
              <li><strong>SolidJS + TanStack Router/Query</strong> - Reactive UI with smart caching</li>
              <li><strong>Better Auth</strong> - OAuth with D1 database and KV session storage</li>
              <li><strong>Virtualized Messaging</strong> - Smooth scrolling for thousands of messages</li>
              <li><strong>Hybrid Data Loading</strong> - HTTP + WebSocket for optimal performance</li>
              <li><strong>Solid-UI Components</strong> - Modern design system for SolidJS</li>
            </ul>
          </CardContent>
          <CardFooter>
            <p class="text-sm text-muted-foreground">
              Built with the Cloudflare Vite Plugin for seamless full-stack development
            </p>
          </CardFooter>
        </Card>

        <Footer />
      </div>
    </div>
  );
};

export const Route = createFileRoute('/')({
  component: HomePage,
  loader: publicLoader,
});
