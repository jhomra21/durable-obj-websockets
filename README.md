# Durable Objects Chat (SolidJS + TanStack)

Real-time chat powered by Cloudflare Workers Durable Objects (WebSockets) and a SolidJS frontend. Uses TanStack Router/Query, Tailwind, and Solid-UI components. OAuth via better-auth with D1 + KV.

## 🌟 Core Features

-   **Real-time chat** with Durable Objects + WebSockets
-   **Virtualized message list** using `@tanstack/solid-virtual`
-   **OAuth sign-in** (Google, GitHub, Twitter) via `better-auth`

---

## Overview

This repo implements a real-time chat using Cloudflare Workers Durable Objects (WebSockets) with a SolidJS frontend powered by TanStack Router and Query.

- Chat storage and fanout: Cloudflare Durable Objects (`api/chat.ts`)
- API framework: Hono (`api/index.ts`)
- Frontend: SolidJS + TanStack Router/Query
- Virtualized message list: `@tanstack/solid-virtual`
- Auth: better-auth with D1 + KV (`auth.ts`)

See Chat Virtualization & Auto-Scroll details: [readme_assets/docs/chat-virtualization.md](readme_assets/docs/chat-virtualization.md).

## 🛠️ Tech Stack

-   **Frontend**:
    -   [SolidJS](https://www.solidjs.com/) for reactive UI.
    -   [TanStack Router](https://tanstack.com/router/v1/docs/adapters/solid-router) for type-safe, file-based routing.
    -   [TanStack Query](https://tanstack.com/query/latest/docs/solid/overview) for server-state management.
    -   [Tailwind CSS](https://tailwindcss.com/) & [Solid-UI](https://www.solid-ui.com/) for styling.
-   **Backend**:
    -   [Cloudflare Workers](https://workers.cloudflare.com/) for serverless functions at the edge.
    -   [Hono](https://hono.dev/) for the API framework.
-   **Data & State**:
    -   [Convex](https://www.convex.dev/) for the real-time database, managing canvas and agent state.
    -   [Cloudflare D1](https://developers.cloudflare.com/d1/) for user and authentication data.
    -   [Cloudflare R2](https://developers.cloudflare.com/r2/) for image and asset storage.
    -   [Cloudflare KV](https://developers.cloudflare.com/kv/) for session management and caching.
-   **Authentication**:
    -   [better-auth](https://www.better-auth.com/) for handling OAuth and session logic.


---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/jhomra21/convex-cloudflare-workers-solid-tanstack-spa-betterauth-D1-KV.git
cd convex-cloudflare-workers-solid-tanstack-spa-betterauth-D1-KV
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Configure Cloudflare & Convex
-   **Cloudflare**: Set up a D1 database, R2 bucket, and KV namespace. Update `wrangler.jsonc` with your bindings.
-   **Convex**: Create a new Convex project and get your deployment URL.

### 4. Environment Variables
Copy `example.dev.vars` to `.dev.vars` and fill in the required values:
-   `CONVEX_URL`: Your Convex project URL.
-   `BETTER_AUTH_SECRET`: A randomly generated secret for session encryption.
-   `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: For Google OAuth.
-   `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`: For GitHub OAuth.
-   `TWITTER_CLIENT_ID` & `TWITTER_CLIENT_SECRET`: For Twitter OAuth.
-   `FAL_KEY`: Your API key from Fal AI.

For production, set these as secrets in your Cloudflare Worker dashboard. You also need to set a build-time variable `VITE_CONVEX_URL` in your Cloudflare Pages build settings.

### 5. Database Migrations
Apply the initial D1 database schema.
```bash
# For local development
bunx wrangler d1 migrations apply <YOUR_DB_NAME> --local

# For production
bunx wrangler d1 migrations apply <YOUR_DB_NAME> --remote
```

### 6. Run Development (Vite + Cloudflare plugin)
One command. The Cloudflare Vite plugin runs the Worker alongside Vite and proxies `/api/*` to it using `wrangler.jsonc` (main: `api/index.ts`).

```bash
bun run dev
```

- App + API: http://localhost:3000 (API under `/api/*`)
- OAuth callbacks: handled via the client-side shim routes in `src/routes/api/auth/callback/*` due to SPA fallback.

Optional standalone Worker (if you want to debug it separately):
```bash
bun run api:dev
```

---

## 📁 Project Structure

-   `api/`: Hono worker
    -   `api/index.ts`: Routes, CORS, auth session injection, chat endpoints
    -   `api/chat.ts`: Durable Object (WebSockets + message storage)
-   `auth.ts`: better-auth configured for D1 + KV
-   `src/`: SolidJS frontend
    -   `src/routes/`: File-based routing via TanStack Router
    -   `src/components/chat-components/`: Chat UI (virtualized `MessageList.tsx`)
    -   `src/lib/chat-scroll.ts`: Chat scroll management hook
    -   `src/routes/api/auth/callback/*`: OAuth dev shim routes
-   `readme_assets/docs/chat-virtualization.md`: Virtualization + auto-scroll documentation
-   `convex/`: Convex functions (if used)
-   `wrangler.jsonc`: Worker bindings (D1, KV, Durable Object)
-   `schema.sql`: D1 schema

---

## 🌐 API Endpoints (Chat)

Hono + Durable Object worker.

-   `/api/auth/*`: Authentication via `better-auth`
-   `/api/chat`: WebSocket upgrade to the chat Durable Object (requires auth)
-   `/api/chat/messages`: HTTP endpoint for recent message history (requires auth)
---

## 💬 Chat System Architecture

The real-time chat is built on a robust, scalable architecture using Cloudflare Durable Objects for the backend and a reactive SolidJS frontend that intelligently combines cached data with live WebSocket updates.

### Backend: Cloudflare Durable Object

The core of the chat backend is the `ChatRoomDurableObject`, defined in `api/chat.ts`. Each chat "room" is a separate instance of this Durable Object, providing excellent isolation and scalability.

-   **WebSocket Handling**: The DO's `fetch` handler upgrades HTTP requests to WebSocket connections. It uses `state.acceptWebSocket(server)` to manage the connection lifecycle, even through serverless hibernations.
-   **Connection Management**: Active WebSocket connections are stored in a `Map` within the object. To support hibernation, connection details are serialized using `server.serializeAttachment()`, allowing the DO to restore connections seamlessly after being evicted from memory.
-   **Message Broadcasting**: When a message is received via `webSocketMessage`, it's persisted to Durable Object storage and then broadcasted to all other connected clients in the same DO instance.

    ```typescript
    // Simplified from api/chat.ts
    export class ChatRoomDurableObject implements DurableObject {
      private connections: Map<string, WebSocketInfo> = new Map();
      private state: DurableObjectState;

      async fetch(request: Request) {
        // ...
        const { client, server } = new WebSocketPair();
        this.state.acceptWebSocket(server); // DO manages the WebSocket
        return new Response(null, { status: 101, webSocket: client });
      }

      async webSocketMessage(ws: WebSocket, msg: string) {
        const chatMessage: ChatMessage = { /* ... create message ... */ };
        
        // Persist and broadcast
        await this.state.storage.put(key, chatMessage);
        this.broadcastMessage(chatMessage);
      }

      private broadcastMessage(message: ChatMessage) {
        for (const wsInfo of this.connections.values()) {
          wsInfo.ws.send(JSON.stringify({ type: 'message', message }));
        }
      }
    }
    ```

-   **Persistence**: Messages are stored in the DO's transactional storage API (`this.state.storage`), ensuring durability. An alarm (`state.storage.setAlarm()`) is used to periodically prune old messages.
-   **Configuration**: The Durable Object is bound in `wrangler.jsonc`, making it available to the worker.

    ```json
    // From wrangler.jsonc
    "durable_objects": {
      "bindings": [
        {
          "name": "CHAT_ROOM",
          "class_name": "ChatRoomDurableObject"
        }
      ]
    }
    ```

### Frontend: SolidJS + TanStack Query + WebSockets

The frontend provides a seamless user experience by loading historical messages quickly from a cache while connecting to a WebSocket for real-time updates.

-   **Hybrid Data Loading**:
    1.  **Initial Load**: The `useChatMessages` query (in `src/lib/chat-queries.ts`) makes an HTTP request to `/api/chat/messages` to fetch the most recent message history. This data is managed by TanStack Query, providing caching and background refetching.
    2.  **Real-time Updates**: Simultaneously, the `ChatService` (managed via `src/lib/chat-hooks.ts`) establishes a WebSocket connection to the Durable Object.

-   **Centralized Logic: `useChat` Hook**: The `useChat` hook (from `src/lib/chat-hooks.ts`) is the primary entry point for components. It elegantly combines the cached data from TanStack Query with the live state from the WebSocket service.

    ```typescript
    // From src/lib/chat-hooks.ts
    export function useChat() {
      // 1. Get cached messages via TanStack Query
      const messagesQuery = useChatMessages();
      
      // 2. Get live connection state from the WebSocket service
      const [connectionState, setConnectionState] = createSignal(chatService.getState());

      // ... subscribe to service updates ...

      return {
        // Returns a unified view:
        messages: () => messagesQuery.data || [], // Cached + updated data
        isConnected: () => connectionState().isConnected, // Live status
        sendMessage, // Action to send messages
        // ... and other reactive state
      };
    }
    ```

-   **Component Integration**: The main `<Chat />` component (in `src/components/Chat.tsx`) uses the `useChat` hook to get all the data and actions it needs, keeping the component clean and focused on rendering the UI.

    ```tsx
    // Simplified from src/components/Chat.tsx
    import { useChat } from '~/lib/chat-hooks';

    export function Chat() {
      // The hook provides everything the component needs
      const chat = useChat();

      onMount(() => {
        chat.connect(); // Establish WebSocket connection on mount
      });

      return (
        <div class="chat-container">
          <ChatHeader state={chat} />
          <MessageList messages={chat.messages()} />
          <MessageInput sendMessage={chat.sendMessage} />
        </div>
      );
    }
    ```