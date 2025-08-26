# Durable Object WebSocket Chat Playbook (Hono + Cloudflare)

This document is the minimal, actionable guide to understand, evaluate, and evolve the chat system built on Cloudflare Durable Objects, Hono, and Solid/TanStack.


## Key Files

- `api/index.ts`
  - Hono app, CORS, Better Auth session injection.
  - Routes: `GET /api/chat` (WebSocket upgrade), `GET /api/chat/messages` (history via DO).
- `api/chat.ts`
  - `ChatRoomDurableObject` handles WebSocket lifecycle, message persistence, broadcast.
- Client data layer
  - `src/lib/chat-queries.ts`: Messages query (`['chat','messages']`).
  - `src/lib/chat-service.ts`: Singleton WebSocket connection + cache updates.
  - `src/lib/chat-hooks.ts`: Solid hooks combining cached + live data.
  - UI rendering in `src/components/chat-components/*`.


## End-to-End Flow

1. User authenticated via Better Auth; session injected in `api/index.ts` middleware.
2. WebSocket connect: client hits `GET /api/chat` (Upgrade: websocket).
3. `api/index.ts` forwards to DO with `X-User-*` headers.
4. DO (`api/chat.ts`) accepts via `this.state.acceptWebSocket(server)`, attaches metadata via `serializeAttachment`, and broadcasts a system "joined" message.
5. History: client fetches `GET /api/chat/messages` (HTTP) — DO returns recent messages from storage/memory.
6. Messages: client sends `{ type: 'message', content }`; DO persists and broadcasts `{ type: 'message', message }` to all sockets.
7. Ping/keepalive: client sends `{ type: 'ping' }`; DO replies with `{ type: 'pong' }`.
8. Close: DO removes connection, broadcasts system "left" message.


## Alignment with Hono Durable Objects Example

Reference: https://hono.dev/examples/cloudflare-durable-objects

- The example emphasizes `blockConcurrencyWhile()` to gate initialization before requests are handled.
- Our DO currently calls initialization methods directly in the constructor.
- Action: wrap initialization inside `this.state.blockConcurrencyWhile(async () => { ... })`.

Example from Hono docs (concept):
```ts
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env)
  ctx.blockConcurrencyWhile(async () => {
    // load storage, restore state, setup auto-responses, etc.
  })
}
```


## Cloudflare DO WebSocket Best Practices Check

- Accept using `this.state.acceptWebSocket(server)` to support hibernation. ✅
- Persist per-connection metadata with `ws.serializeAttachment(...)`. ✅
- Restore connections on start via `this.state.getWebSockets()` + `deserializeAttachment()`. ✅
- History via HTTP; real-time via WS. ✅
- Add `setWebSocketAutoResponse` for ping/pong to avoid wakeups. ⛳ Recommended
- Broadcast `userCount` on join/leave to support the client state. ⛳ Recommended
- Use `blockConcurrencyWhile()` on constructor init to avoid races. ⛳ Recommended
- Prune storage efficiently (batch/less frequent or via `setAlarm`). ⛳ Recommended
- Apply server-side validation on incoming messages (length, empties). ⛳ Recommended

## Hibernation specifics and caveats (from Cloudflare docs)

- Native DO WebSocket API vs Web Standard: Prefer the Native API for hibernation support. We already use `state.acceptWebSocket()` and handler methods (e.g., `webSocketMessage`).
- Eviction and constructor: On inactivity, the DO is evicted; a new event re-initializes it and runs the constructor. Keep constructor work minimal and restore state there.
- Attachments: `serializeAttachment()` data survives hibernation but is limited to ~2 KB. Store larger data in Storage and reference it via keys in the attachment.
- Outgoing WebSockets: Client connections initiated by the DO cannot hibernate (only server-side WS accepts hibernate).
- Activity prevents hibernation: Alarms, incoming requests, and `setTimeout/setInterval` can keep the DO active and incur duration charges. Use them judiciously.
- Worker-level validation: Validate Upgrade at the Worker before proxying to the DO; for invalid/missing Upgrade, consider returning HTTP 426 (Upgrade Required) to avoid DO billing.
- Local dev caveat: Older wrangler/miniflare versions (pre wrangler@3.13.2 / Miniflare v3.20231016.0) do not hibernate locally; events are delivered but the DO never evicts.
- Deploys disconnect WS: Any deploy restarts DOs and disconnects WebSockets; ensure the client reconnects automatically (our `ChatService` already does).


## Targeted Improvements (Minimal Changes)

1) Constructor initialization gate
- File: `api/chat.ts`
- Wrap startup in `blockConcurrencyWhile`:
```ts
ctx.blockConcurrencyWhile(async () => {
  this.restoreConnections()
  await this.loadMessagesFromStorage()
  // Configure ping/pong auto-response here too (see next item)
})
```

2) DO-level ping/pong auto-response (no wake)
- File: `api/chat.ts`
- In constructor init block:
```ts
this.state.setWebSocketAutoResponse({
  request: JSON.stringify({ type: 'ping' }),
  response: JSON.stringify({ type: 'pong' }),
})
```
Note: The request must match the client payload exactly.

3) User count events
- File: `api/chat.ts`
- After accepting a socket and after closing one:
```ts
private broadcastUserCount() {
  const payload = JSON.stringify({ type: 'userCount', count: this.connections.size })
  for (const [id, info] of this.connections) if (info.ws.readyState === WebSocket.OPEN) info.ws.send(payload)
}
```
- Call `broadcastUserCount()` after `connections.set(...)` and after `connections.delete(...)`.

4) Server-side content validation
- File: `api/chat.ts`
- In `webSocketMessage`, before persisting:
```ts
if (typeof data.content !== 'string') return
const content = data.content.trim()
if (!content) return
const MAX = 2000 // or your limit
if (content.length > MAX) return
```

5) Storage pruning cadence (optional but better)
- File: `api/chat.ts`
- Instead of pruning on every message, prune every N inserts or via alarm:
```ts
await this.state.storage.put('prune:next', Date.now() + 60_000)
this.state.setAlarm(Date.now() + 60_000)
```
- In `alarm()` delete older keys beyond `maxMessages`.

5b) Storage key namespacing (prevent accidental deletes)
- File: `api/chat.ts`
- Use a prefix for message keys (for example, `m:` + padded timestamp) and prune only that prefix so you do not delete other metadata keys like `prune:next`.
```ts
const key = `m:${chatMessage.timestamp.toString().padStart(20, '0')}`
await this.state.storage.put(key, chatMessage)
// Later, when pruning:
const recent = await this.state.storage.list({ prefix: 'm:', reverse: true, limit: this.maxMessages })
const keep = new Set([...recent.keys()])
const older = await this.state.storage.list({ prefix: 'm:' })
const toDelete = [...older.keys()].filter(k => !keep.has(k))
if (toDelete.length) await this.state.storage.delete(toDelete)
```

6) Persist system messages (optional)
- If you want join/leave to appear in history, persist them with `type: 'system'` using the same padded timestamp key.


## Client Expectations (Already Implemented)

- `src/lib/chat-service.ts`
  - Heartbeats every 30s: `{ type: 'ping' }` (will be auto-responded by DO after change).
  - Handles `type: 'pong'` and `type: 'userCount'` (events will start flowing after DO changes).
  - On message, updates TanStack Query cache `['chat','messages']`.

- `src/lib/chat-queries.ts`
  - History fetched via `/api/chat/messages`.
  - No polling; cached for navigation; retries avoid auth loops.


## Test Plan (Local)

- Connect and see `Optimized Chat` debug panel in `src/components/Chat.tsx`.
- Verify:
  - On connect: `WS: Connected` and `Cache: ✓ Hit` after initial fetch completes.
  - Send message: appears in list; other tabs receive it in real-time.
  - Auto-response: watch network/console — `pong` handled without server logs (hibernation-friendly).
  - Open 2 tabs: verify `userCount` increments/decrements in the panel if you render it.
  - Refresh: history is present; system messages included if persisted.


## Production Checklist

- `wrangler.jsonc`
  - Ensure DO binding and class name:
    - `durable_objects.bindings[]` -> `{ name: "CHAT_ROOM", class_name: "ChatRoomDurableObject" }`
  - Migrations include SQLite class tag for the DO.
- CORS origins cover your Pages/Workers domains.
- Auth secrets configured (Better Auth; D1/KV bound).
 - Worker-level invalid Upgrade responses: Prefer HTTP 426 for non-WebSocket requests to `/api/chat` (we currently return 400), keeping validation at the Worker to avoid DO billing.
 - Operational notes:
   - Code updates disconnect all WebSockets; verify client auto-reconnect behavior.
   - Local dev hibernation requires recent wrangler/miniflare; otherwise, DOs won’t evict.


## Developer notes from this session (quick recall)

- __Trust boundary for auth headers__: Only the Worker (`api/index.ts`) sets `X-User-*` headers. The DO must not trust any client-provided `X-User-*` if called directly.
- __Client expects `userCount` events__: `src/lib/chat-service.ts` already handles `{ type: 'userCount', count }`. Ensure DO broadcasts on join/leave.
- __One WS client implementation__: Prefer `src/lib/chat-service.ts` + TanStack Query. Treat `src/lib/websocket-chat.ts` as legacy to avoid drift.
- __API style__: Code uses `DurableObjectState` (`this.state.*`). If migrating to `extends DurableObject` with `this.ctx.*`, do it consistently across the file.
 - __Message keying__: Storage keys are zero-padded timestamps (`ts.toString().padStart(20, '0')`) to preserve lexicographic order when listing.
 - __Invalid payload handling__: If JSON parse/type checks fail, optionally close WS with code `1007` (policy violation) after cleanup.
 - __OAuth callback in SPA dev__: Create a client route for `/api/auth/callback/:provider` that immediately `fetch(window.location.href)` to pass the callback to the Worker (prevents Vite/Pages SPA interception).

 - __Message key uniqueness & order__: To avoid same-ms collisions while keeping order, use `m:${ts.toString().padStart(20,'0')}:${uuid}`.
 - __Auto-response matching__: `setWebSocketAutoResponse` must match the exact JSON string sent by the client (property order/whitespace). Keep payload minimal/stable.
 - __Close codes__: Use `1009` (message too big), `1008` (policy violation), `1007` (bad data) when rejecting frames.
 - __Reconnect backoff with jitter__: Add small random jitter to avoid thundering herd after deploys.
 - __Abuse guard__: Simple per-connection rate limiting (messages per window) to drop spammy clients early.


## Helpful snippets

- __Worker invalid Upgrade (return 426)__ — `api/index.ts`
```ts
app.get('/api/chat', async (c) => {
  const upgrade = c.req.header('Upgrade')
  if (!upgrade || upgrade !== 'websocket') {
    return c.body(null, 426, {
      'Content-Type': 'text/plain',
    })
  }
  // ... resolve DO and forward
})
```

- __Message keying with prefix and pruning__ — `api/chat.ts`
```ts
const key = `m:${ts.toString().padStart(20, '0')}`
await this.state.storage.put(key, msg)
// prune by prefix only
const recent = await this.state.storage.list({ prefix: 'm:', reverse: true, limit: this.maxMessages })
const keep = new Set([...recent.keys()])
for await (const [k] of this.state.storage.list({ prefix: 'm:' })) {
  if (!keep.has(k)) await this.state.storage.delete(k)
}
```

- __Message keying with timestamp + UUID__ — `api/chat.ts`
```ts
const ts = Date.now()
const id = crypto.randomUUID()
const key = `m:${ts.toString().padStart(20,'0')}:${id}`
await this.state.storage.put(key, chatMessage)
```

- __Auto-response exact match__ — `api/chat.ts` and client
```ts
// DO init
this.state.setWebSocketAutoResponse({
  request: JSON.stringify({ type: 'ping' }),
  response: JSON.stringify({ type: 'pong' }),
})

// Client must send exactly this string
socket.send(JSON.stringify({ type: 'ping' }))
```

- __Close with specific codes__ — `api/chat.ts`
```ts
if (content.length > MAX) {
  try { ws.close(1009, 'message too large') } catch {}
  return
}
if (!allowedTypes.has(data.type)) {
  try { ws.close(1008, 'policy violation') } catch {}
  return
}
```

- __Reconnect backoff with jitter__ — `src/lib/chat-service.ts`
```ts
const base = 500 // ms
const factor = 2
const jitter = 0.3
const delay = Math.min(30_000, base * Math.pow(factor, attempt))
const withJitter = delay * (1 + (Math.random() * 2 - 1) * jitter)
setTimeout(connect, withJitter)
```

- __Simple per-connection rate limit__ — `api/chat.ts`
```ts
const now = Date.now()
const windowMs = 5_000
const limit = 20
wsInfo.bucket = wsInfo.bucket?.filter(t => now - t < windowMs) ?? []
wsInfo.bucket.push(now)
if (wsInfo.bucket.length > limit) {
  try { ws.close(1008, 'rate limit') } catch {}
  this.connections.delete(connectionId)
  return
}
```


## References

- Hono Durable Objects example
  - https://hono.dev/examples/cloudflare-durable-objects
  - Key concept: `blockConcurrencyWhile` in constructor.
- Cloudflare DO WebSocket APIs
  - `acceptWebSocket`, `getWebSockets`, `serializeAttachment`, `setWebSocketAutoResponse`.
  - https://developers.cloudflare.com/durable-objects/best-practices/websockets/
  - https://developers.cloudflare.com/durable-objects/api/state/#websockets


## Status

- Current implementation aligns well with hibernation-friendly WS patterns.
- Applying the 4 minimal changes above provides cost savings, better UX (user count), and safer server-side validation without broad refactors.
