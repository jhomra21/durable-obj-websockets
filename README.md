

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