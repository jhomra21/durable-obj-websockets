import type { DurableObject, DurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "./types";

// Chat message interface
export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userImage?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
}

// WebSocket connection info
interface WebSocketInfo {
  userId: string;
  userName: string;
  userImage?: string;
  ws: WebSocket;
}

// Environment interface for the Durable Object
export interface ChatEnv extends Env {
  CHAT_ROOM: DurableObjectNamespace;
}

// Storage key prefixes
const MESSAGE_PREFIX = 'm:';   // user messages
const SYSTEM_PREFIX = 'sys:';  // system messages (join/leave)

export class ChatRoomDurableObject implements DurableObject {
  private state: DurableObjectState;
  private connections: Map<string, WebSocketInfo> = new Map();
  private messages: ChatMessage[] = [];
  private maxMessages = 100; // Keep last 100 messages
  private rateLimiter = new Map<string, { count: number; windowStart: number }>();
  private cooldownUntil = new Map<string, number>();
  private readonly RATE_WINDOW_MS = 10_000; // 10s window
  private readonly RATE_MAX_MSGS = 10;      // max messages per window (reduced from 20)
  private readonly RESCHEDULE_IDLE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

  // Load messages from storage on startup
  private async loadMessagesFromStorage() {
    // List last maxMessages from storage under message prefix (keys are zero-padded timestamps)
    const list = await this.state.storage.list<ChatMessage>({ prefix: MESSAGE_PREFIX, reverse: true, limit: this.maxMessages });
    // Reverse to chronological order
    this.messages = Array.from(list.values()).reverse();
  }

  // NEW: Handle HTTP requests for message history
  private async handleMessagesRequest(request: Request): Promise<Response> {
    try {
      // Get user info from headers for authentication
      const userId = request.headers.get("X-User-Id");
      const userName = request.headers.get("X-User-Name");

      if (!userId || !userName) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Load messages from storage if not already loaded
      if (this.messages.length === 0) {
        await this.loadMessagesFromStorage();
      }

      // Return last 50 messages
      const recentMessages = this.messages.slice(-50);

      return new Response(JSON.stringify(recentMessages), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=0, must-revalidate'
        }
      });

    } catch (error) {
      console.error('Error handling messages request:', error);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  constructor(state: DurableObjectState, env: ChatEnv) {
    this.state = state;

    // Gate initialization to avoid races on cold start
    this.state.blockConcurrencyWhile(async () => {
      // Restore connections after hibernation
      this.restoreConnections();

      // Load messages from storage
      await this.loadMessagesFromStorage();

      // Configure ping/pong auto-response (hibernation-friendly)
      this.state.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair(
          JSON.stringify({ type: 'ping' }),
          JSON.stringify({ type: 'pong' })
        )
      );
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // NEW: HTTP endpoint for message history only
    if (url.pathname === '/messages') {
      return this.handleMessagesRequest(request);
    }

    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    // Get user info from headers (set by the Worker)
    const userId = request.headers.get("X-User-Id");
    const userName = request.headers.get("X-User-Name");
    const userImage = request.headers.get("X-User-Image");

    if (!userId || !userName) {
      return new Response("Missing user info", { status: 401 });
    }

    console.log('[DO] WebSocket upgrade accepted for:', userName);

    // Create WebSocket pair
    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1];

    // Accept the WebSocket connection
    this.state.acceptWebSocket(server);

    // Store connection info with serialized attachment for hibernation
    const connectionId = crypto.randomUUID();
    const wsInfo: WebSocketInfo = {
      userId,
      userName,
      userImage: userImage || undefined,
      ws: server
    };

    this.connections.set(connectionId, wsInfo);
    console.log('[DO] User connected:', userName, `(${this.connections.size} total)`);

    // Track and broadcast connection count
    this.broadcastUserCount();

    // Serialize connection info for hibernation
    server.serializeAttachment({
      connectionId,
      userId,
      userName,
      userImage
    });

    // NOTE: History is now fetched via HTTP endpoint for better caching
    // No longer send history on WebSocket connection to reduce redundant requests

    // Broadcast user joined message
    this.broadcastMessage({
      id: crypto.randomUUID(),
      userId: 'system',
      userName: 'System',
      content: `${userName} joined the chat`,
      timestamp: Date.now(),
      type: 'system'
    });

    // Persist system join message under separate prefix (kept out of default history)
    try {
      const sysMsg: ChatMessage = {
        id: crypto.randomUUID(),
        userId: 'system',
        userName: 'System',
        content: `${userName} joined the chat`,
        timestamp: Date.now(),
        type: 'system'
      };
      const key = SYSTEM_PREFIX + sysMsg.timestamp.toString().padStart(20, '0');
      await this.state.storage.put(key, sysMsg);
      await this.schedulePrune();
    } catch (e) {
      console.error('Error persisting system join message:', e);
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Restore connections after hibernation
  private restoreConnections() {
    const webSockets = this.state.getWebSockets();
    for (const ws of webSockets) {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        const { connectionId, userId, userName, userImage } = attachment;
        const wsInfo: WebSocketInfo = {
          userId,
          userName,
          userImage: userImage || undefined,
          ws
        };
        this.connections.set(connectionId, wsInfo);
      }
    }
  }

  async webSocketMessage(ws: WebSocket, msg: ArrayBuffer | string) {
    try {
      // Deserialize attachment to get connection info
      const attachment = ws.deserializeAttachment();
      if (!attachment) return;

      const { connectionId } = attachment;
      const wsInfo = this.connections.get(connectionId);
      if (!wsInfo) return;

      if (typeof msg === 'string') {
        const data = JSON.parse(msg);

        if (data.type === 'message') {
          const now = Date.now();
          const until = this.cooldownUntil.get(connectionId) ?? 0;
          if (until && now < until) {
            // In cooldown window: ignore user messages
            return;
          }
          // Per-connection rate limit
          let rl = this.rateLimiter.get(connectionId) ?? { count: 0, windowStart: now };
          if (now - rl.windowStart > this.RATE_WINDOW_MS) {
            rl = { count: 0, windowStart: now };
          }
          rl.count++;
          this.rateLimiter.set(connectionId, rl);
          if (rl.count > this.RATE_MAX_MSGS) {
            const retryAfterMs = Math.max(0, this.RATE_WINDOW_MS - (now - rl.windowStart));
            this.cooldownUntil.set(connectionId, now + retryAfterMs);
            try {
              ws.send(JSON.stringify({ type: 'rateLimit', retryAfterMs, limit: this.RATE_MAX_MSGS, windowMs: this.RATE_WINDOW_MS }));
            } catch { }
            return;
          }
          // Basic server-side validation
          if (typeof data.content !== 'string') return;
          const content = data.content.trim();
          if (!content) return;
          const MAX = 2000;
          if (content.length > MAX) {
            try { ws.close(1009, 'message too large'); } catch { }
            return;
          }
          const chatMessage: ChatMessage = {
            id: crypto.randomUUID(),
            userId: wsInfo.userId,
            userName: wsInfo.userName,
            userImage: wsInfo.userImage,
            content,
            timestamp: Date.now(),
            type: 'text'
          };

          // Store message in memory
          this.messages.push(chatMessage);
          // Keep only last maxMessages
          if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(-this.maxMessages);
          }
          // Persist message to storage with prefix (key: zero-padded timestamp)
          const key = MESSAGE_PREFIX + chatMessage.timestamp.toString().padStart(20, '0');
          await this.state.storage.put(key, chatMessage);
          // Schedule background pruning via alarm (hibernation-friendly)
          await this.schedulePrune();
          // Broadcast to all connections
          this.broadcastMessage(chatMessage);
        } else if (data.type === 'ping') {
          // Respond to ping to keep connection alive
          try {
            ws.send(JSON.stringify({ type: 'pong' }));
          } catch (error) {
            console.error('Error sending pong:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    try {
      // Deserialize attachment to get connection info
      const attachment = ws.deserializeAttachment();
      if (!attachment) return;

      const { connectionId } = attachment;
      const wsInfo = this.connections.get(connectionId);

      // Remove connection
      this.connections.delete(connectionId);
      this.rateLimiter.delete(connectionId);
      this.cooldownUntil.delete(connectionId);

      // Broadcast updated user count
      this.broadcastUserCount();

      if (wsInfo) {
        const disconnectReason = code === 1000 ? 'normal' : `code ${code}`;
        console.log('[DO] User disconnected:', wsInfo.userName, `(${disconnectReason}, ${this.connections.size} remaining)`);

        // Broadcast user left message
        this.broadcastMessage({
          id: crypto.randomUUID(),
          userId: 'system',
          userName: 'System',
          content: `${wsInfo.userName} left the chat`,
          timestamp: Date.now(),
          type: 'system'
        });

        // Persist system leave message under separate prefix
        try {
          const sysMsg: ChatMessage = {
            id: crypto.randomUUID(),
            userId: 'system',
            userName: 'System',
            content: `${wsInfo.userName} left the chat`,
            timestamp: Date.now(),
            type: 'system'
          };
          const key = SYSTEM_PREFIX + sysMsg.timestamp.toString().padStart(20, '0');
          await this.state.storage.put(key, sysMsg);
          await this.schedulePrune();
        } catch (e) {
          console.error('Error persisting system leave message:', e);
        }
      }
    } catch (error) {
      console.error('Error handling WebSocket close:', error);
    }
  }

  async webSocketError(ws: WebSocket, error: Error) {
    console.error('WebSocket error:', error);

    // Clean up the connection
    try {
      const attachment = ws.deserializeAttachment();
      if (attachment) {
        const { connectionId } = attachment;
        this.connections.delete(connectionId);
        this.rateLimiter.delete(connectionId);
        this.cooldownUntil.delete(connectionId);
      }
    } catch (e) {
      console.error('Error cleaning up WebSocket connection:', e);
    }
  }

  // Alarm scheduling and pruning
  private async schedulePrune() {
    // Schedule prune in ~5 minutes. Repeated calls are cheap; latest schedule wins.
    await this.state.storage.setAlarm(Date.now() + 5 * 60 * 1000);
  }

  // Called by the platform when alarm fires
  async alarm() {
    try {
      await this.pruneByPrefix(MESSAGE_PREFIX, this.maxMessages);
      await this.pruneByPrefix(SYSTEM_PREFIX, this.maxMessages);
    } catch (e) {
      console.error('Error during alarm prune:', e);
    }

    // Reschedule only if there was recent activity within the idle window
    try {
      const now = Date.now();
      const latestUser = await this.state.storage.list<ChatMessage>({ prefix: MESSAGE_PREFIX, reverse: true, limit: 1 });
      const latestSys = await this.state.storage.list<ChatMessage>({ prefix: SYSTEM_PREFIX, reverse: true, limit: 1 });
      const lastMsg = latestUser.values().next().value as ChatMessage | undefined;
      const lastSys = latestSys.values().next().value as ChatMessage | undefined;
      const lastTs = Math.max(lastMsg?.timestamp ?? 0, lastSys?.timestamp ?? 0);
      if (lastTs && now - lastTs < this.RESCHEDULE_IDLE_WINDOW_MS) {
        await this.schedulePrune();
      }
    } catch { }
  }

  private async pruneByPrefix(prefix: string, limit: number) {
    // Keep only the newest `limit` items under the given prefix
    const latest = await this.state.storage.list({ prefix, reverse: true, limit });
    const keep = new Set<string>(Array.from(latest.keys()));
    const all = await this.state.storage.list({ prefix });
    const toDelete: string[] = [];
    for (const k of all.keys()) {
      if (!keep.has(k)) toDelete.push(k);
    }
    if (toDelete.length) {
      await this.state.storage.delete(toDelete);
    }
  }

  private broadcastUserCount() {
    // Get list of connected users (excluding duplicates by userId)
    const connectedUsers = new Map<string, { userId: string; userName: string; userImage?: string }>();
    
    for (const [, info] of this.connections) {
      if (info.ws.readyState === WebSocket.OPEN) {
        connectedUsers.set(info.userId, {
          userId: info.userId,
          userName: info.userName,
          userImage: info.userImage
        });
      }
    }

    const payload = JSON.stringify({ 
      type: 'userCount', 
      count: this.connections.size,
      connectedUsers: Array.from(connectedUsers.values())
    });
    
    for (const [id, info] of this.connections) {
      try {
        if (info.ws.readyState === WebSocket.OPEN) info.ws.send(payload);
      } catch {
        // Drop broken connection silently
        this.connections.delete(id);
      }
    }
  }

  private broadcastMessage(message: ChatMessage) {
    const messageStr = JSON.stringify({
      type: 'message',
      message
    });

    // Send to all connected WebSockets
    for (const [connectionId, wsInfo] of this.connections) {
      try {
        if (wsInfo.ws.readyState === WebSocket.OPEN) {
          wsInfo.ws.send(messageStr);
        }
      } catch (error) {
        console.error(`Error sending to connection ${connectionId}:`, error);
        // Remove broken connection
        this.connections.delete(connectionId);
      }
    }
  }
}
