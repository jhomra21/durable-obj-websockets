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

export class ChatRoomDurableObject implements DurableObject {
  private state: DurableObjectState;
  private connections: Map<string, WebSocketInfo> = new Map();
  private messages: ChatMessage[] = [];
  private maxMessages = 100; // Keep last 100 messages

  // Load messages from storage on startup
  private async loadMessagesFromStorage() {
    // List last maxMessages from storage (keys are ISO timestamps)
    const list = await this.state.storage.list<ChatMessage>({ reverse: true, limit: this.maxMessages });
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

    // Restore connections after hibernation
    this.restoreConnections();

    // Load messages from storage (async, fire and forget)
    this.loadMessagesFromStorage();
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

        if (data.type === 'message' && data.content) {
          const chatMessage: ChatMessage = {
            id: crypto.randomUUID(),
            userId: wsInfo.userId,
            userName: wsInfo.userName,
            userImage: wsInfo.userImage,
            content: data.content,
            timestamp: Date.now(),
            type: 'text'
          };

          // Store message in memory
          this.messages.push(chatMessage);
          // Keep only last maxMessages
          if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(-this.maxMessages);
          }
          // Persist message to storage (key: ISO timestamp)
          await this.state.storage.put(chatMessage.timestamp.toString().padStart(20, '0'), chatMessage);
          // Optionally, prune old messages from storage
          const list = await this.state.storage.list({ reverse: true, limit: this.maxMessages });
          const keysToKeep = new Set(Array.from(list.keys()));
          const allKeys = await this.state.storage.list();
          const keysToDelete = Array.from(allKeys.keys()).filter(k => !keysToKeep.has(k));
          if (keysToDelete.length > 0) {
            await this.state.storage.delete(keysToDelete);
          }
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

      if (wsInfo) {
        // Broadcast user left message
        this.broadcastMessage({
          id: crypto.randomUUID(),
          userId: 'system',
          userName: 'System',
          content: `${wsInfo.userName} left the chat`,
          timestamp: Date.now(),
          type: 'system'
        });
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
      }
    } catch (e) {
      console.error('Error cleaning up WebSocket connection:', e);
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
