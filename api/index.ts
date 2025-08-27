import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getAuth } from '../auth'
import type { Env, HonoVariables } from './types'
import { ChatRoomDurableObject } from './chat'

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>()

app.use('/api/*', cors({
  origin: (origin) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://convex-workers-solid-tanstack-spa-betterauth-d1-kv.jhonra121.workers.dev', // Production domain
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      return origin || '*';
    }
    return null;
  },
  allowMethods: ['POST', 'GET', 'OPTIONS', 'PUT', 'DELETE', 'HEAD', 'PATCH'],
}));

// Middleware to get user session, must be defined before routes that need it.
app.use('/api/*', async (c, next) => {
  // We don't want to run this on the auth routes themselves.
  if (c.req.path.startsWith('/api/auth')) {
    return await next();
  }

  const auth = getAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
  } else {
    c.set('user', session.user);
    c.set('session', session.session);
  }
  await next();
});

app.get('/api/', (c) => {
  return c.json({
    name: 'Hono + Cloudflare Workers',
  });
});

app.all('/api/auth/*', (c) => {
  return getAuth(c.env).handler(c.req.raw);
});

// WebSocket chat route
app.get('/api/chat', async (c) => {
  // Check if user is authenticated
  const user = c.get('user');
  const session = c.get('session');

  // Log attempt with referer and auth state
  try {
    console.log('[WS_API] connection attempt', {
      path: c.req.path,
      referer: c.req.header('Referer') || null,
      userId: user ? (user as any).id : null,
      hasSession: !!session,
    });
  } catch {}

  if (!user || !session) {
    console.warn('[WS_API] unauthorized connection attempt', {
      path: c.req.path,
      referer: c.req.header('Referer') || null,
    });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Validate WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    console.warn('[WS_API] invalid upgrade header', { upgradeHeader });
    return c.json({ error: 'Expected websocket' }, 426);
  }

  // Get the chat room Durable Object (using a fixed ID for global chat room)
  const chatRoomId = c.env.CHAT_ROOM.idFromName('global');
  const chatRoom = c.env.CHAT_ROOM.get(chatRoomId);

  // Create a new request with user info in headers
  const newRequest = new Request(c.req.raw.url, {
    method: c.req.method,
    headers: new Headers(c.req.raw.headers),
  });

  // Add user info to headers
  newRequest.headers.set('X-User-Id', user.id);
  newRequest.headers.set('X-User-Name', user.name || 'Anonymous');
  newRequest.headers.set('X-User-Image', user.image || '');

  // Forward the request to the Durable Object
  try {
    console.log('[WS_API] forwarding to Durable Object', {
      room: 'global',
      userId: user.id,
    });
  } catch {}
  return chatRoom.fetch(newRequest);
});

// HTTP chat messages route - for fetching message history
app.get('/api/chat/messages', async (c) => {
  // Check if user is authenticated
  const user = c.get('user');
  const session = c.get('session');

  if (!user || !session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get the chat room Durable Object (using the same ID as WebSocket chat)
  const chatRoomId = c.env.CHAT_ROOM.idFromName('global');
  const chatRoom = c.env.CHAT_ROOM.get(chatRoomId);

  // Create a new request for message history
  const newRequest = new Request('http://internal/messages', {
    method: 'GET',
    headers: new Headers({
      'X-User-Id': user.id,
      'X-User-Name': user.name || 'Anonymous',
      'X-User-Image': user.image || '',
    }),
  });

  // Forward the request to the Durable Object
  return chatRoom.fetch(newRequest);
});

export default app;

// Export Durable Object for Cloudflare Workers runtime
export { ChatRoomDurableObject };