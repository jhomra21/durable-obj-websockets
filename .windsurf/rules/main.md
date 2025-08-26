---
trigger: always_on
---

# You
- Think carefully and only action the specific task I have given you with the most concise and elegant solution that changes as little code as possible.
- You are the best developer in the world. But you can make mistakes, being the best means you can recognize this
- You will keep a clean and maintainable codebase

## Project info
This project only usese these:
Cloudflare Vite Plugin
Bun (never suggest npm)
Solid-js
Tanstack Solid Router, Solid Query
Tailwindcss
Solid-ui (url: https://www.solid-ui.com/) [add like this: bunx solidui-cli@latest add <component-name> ]
Vite
Hono js
Convex

## Icons
Grab icons from here https://lucide.dev/icons/ and place them in our src/components/ui/icon.tsx file

## Authentication
Better-auth with D1 and KV cloudflare [../auth.ts]

## Fetching
Always use Tanstack Query and leverate mutations where it makes sense and take advantage of all its features like optimistic updates, caching, etc. 

## Deployment
Cloudflare pages and workers

## Coding
Always follow Tanstack best practices
Always follow Solid js best practices, doing things the solid js way. Refer to their documentation when you are unsure.

## MCP
For documentation always use context7 MCP and get up to date information always.

Always look at [package.json](mdc:package.json) before recommending installing a new package.

## Design:
- clean, minimal, industrial, with consistent use of whitespace and subtle visual accent
- consistent spacing, subtle use of color, and better visual hierarchy.

- Ispiration: Apple, Linear, shadcn/ui


# Development Notes

## SolidJS Reactivity Guidelines ⚠️

**AVOID CIRCULAR DEPENDENCIES** - These cause "too much recursion" errors:

### ❌ Dangerous Patterns:
```javascript
// DON'T: Effect that reads query data and updates state affecting same query
createEffect(() => {
  const data = someQuery.data(); 
  setSomeState(data.map(...)); // Can trigger infinite re-renders
});

// DON'T: Memos for simple calculations
const size = createMemo(() => props.size || { width: 320, height: 384 });

// DON'T: Creating memos inside render loops
<For each={items}>
  {(item) => {
    const computed = createMemo(() => item.data); // Created on every render!
    return <div>{computed()}</div>;
  }}
</For>

// DON'T: Using function as its own default context
const context = contextObject || myFunction; // Self-reference
```

### ✅ Safe Patterns:
```javascript
// DO: Guard effects with change detection
createEffect(() => {
  const data = someQuery.data();
  if (!data || !hasActuallyChanged(data)) return;
  
  batch(() => { // Group state updates
    setSomeState(newValue);
    setOtherState(otherValue);
  });
});

// DO: Simple functions for basic calculations  
const size = () => props.size || { width: 320, height: 384 };

// DO: Create memos outside render loops
const computed = createMemo(() => items().map(item => transform(item)));

// DO: Use stable default contexts
const defaultContext = {};
const context = contextObject || defaultContext;
```

### Key Rules:
1. **Effects should not update state that affects their own dependencies**
2. **Use `batch()` to group related state updates**  
3. **Add guards to prevent unnecessary effect runs**
4. **Create memos at component level, not inside loops**
5. **Avoid self-referential contexts/defaults**

### Client-Side Authentication & State Management

User authentication state on the client is managed by TanStack Query, providing a robust, cacheable, and reactive "source of truth" for the user's session.

-   **Session Caching**: A global query with the key `['session']` is responsible for fetching and caching the user's session data. This is defined in `src/lib/auth-guard.ts` within `sessionQueryOptions`.
-   **API Client**: The `better-auth/client` library, initialized in `src/lib/auth-client.ts`, handles the low-level communication with the backend authentication API (e.g., fetching the session, signing out).
-   **Route Protection**: TanStack Router's `loader` functions are used to protect routes. The `protectedLoader` in `src/lib/auth-guard.ts` ensures that a valid session exists before rendering a protected route, redirecting to `/auth` if not.
-   **Sign-Out**: The `useSignOut` hook in `src/lib/auth-actions.ts` orchestrates the sign-out process by calling the auth client, manually clearing the `['session']` from the query cache for immediate UI updates, and redirecting the user.

This setup decouples the UI components from the authentication logic, allowing components to simply use the data from the `['session']` query to render user-specific content.

### OAuth Callback Handling in Development

When using a Single-Page Application (SPA) framework like SolidJS with Cloudflare Pages and the Vite plugin, a specific challenge arises with OAuth callbacks (e.g., from Google Sign-In) in the local development environment.

**The Problem:**

Cloudflare's SPA configuration (`"not_found_handling": "single-page-application"`) is designed to serve your `index.html` for any "navigation" request that doesn't match a static file. An OAuth redirect from a provider like Google is a navigation request.

In development, this means the Vite server, mimicking production behavior, intercepts the callback to `/api/auth/callback/google` and serves the main SolidJS application instead of passing the request to your backend Hono worker. This prevents the authentication code from being processed, so no session is created.

**The Solution:**

The solution is to embrace this SPA behavior by creating a dedicated client-side route to handle the callback.

1.  **Create a specific route** in your client-side router (e.g., TanStack Router) that matches the callback path, such as `/api/auth/callback/google`.
2.  **The component for this route** has a single responsibility: to immediately make a `fetch` request to the *exact same URL* it's currently on (`window.location.href`).
3.  **This `fetch` request is the key.** Unlike the initial redirect, a `fetch` is an API request, not a navigation request. The Vite server and the Cloudflare plugin correctly route this `fetch` request to your backend Hono worker.
4.  The backend worker then processes the OAuth code, creates a session, and responds to the `fetch` call.
5.  Upon receiving a successful response, the component uses the client-side router's `navigate` function to redirect the user to their intended destination (e.g., `/dashboard`).

This approach creates a seamless "shim" within your client application that correctly bridges the OAuth redirect and your backend API, working in harmony with the SPA development server.

## Database Migrations (D1)

To apply schema changes to the remote Cloudflare D1 database, we use migrations.

### Workflow for DB Changes

1.  **Create a New Migration File**:
    -   In the `migrations` directory, create a new SQL file.
    -   The filename must start with a number that is higher than the previous one (e.g., `migrations/0001_add_new_field.sql`).

2.  **Add SQL Commands**:
    -   In the new file, write the `ALTER TABLE`, `CREATE TABLE`, or other SQL commands needed for the change.
    -   Example: `ALTER TABLE "user" ADD COLUMN bio TEXT;`

3.  **Apply the Migration**:
    -   Run the following command in your terminal. Wrangler is smart enough to only apply new, unapplied migrations.
    -   `wrangler d1 migrations apply <YOUR_DB_NAME> --remote`