import type { QueryClient } from '@tanstack/solid-query';
import type { ChatMessage } from '../../api/chat';
import { isValidWebSocketMessage, sanitizeMessageContent } from './chat-validation';

/**
 * WebSocket Connection State
 */
export interface WebSocketConnectionState {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  isConnected: boolean;
  isConnecting: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  error: string | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  userCount: number;
  // Optional: when present and in the future, sending is disabled until this timestamp (ms)
  sendCooldownUntil?: number | null;
}

/**
 * Global Chat Service Singleton
 * 
 * Manages persistent WebSocket connection that survives component unmounts and navigation.
 * Integrates with TanStack Query cache to provide seamless real-time + cached data experience.
 * 
 * Key benefits:
 * - Single WebSocket connection per session
 * - Automatic cache updates via TanStack Query
 * - Connection persistence across navigation
 * - Optimistic updates with rollback
 * - Smart reconnection with exponential backoff
 */
export class ChatService {
  private static instance: ChatService | null = null;
  private queryClient: QueryClient | null = null;
  private connection: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private sendCooldownUntil: number | null = null;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;
  
  // Connection state (reactive via subscribers)
  private state: WebSocketConnectionState = {
    status: 'idle',
    isConnected: false,
    isConnecting: false,
    connectionQuality: 'offline',
    error: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    reconnectAttempts: 0,
    userCount: 0,
  };

  // State change subscribers
  private stateSubscribers = new Set<(state: WebSocketConnectionState) => void>();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get or create the global ChatService instance
   */
  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  /**
   * Initialize the service with QueryClient
   * Must be called before using the service
   */
  initialize(queryClient: QueryClient): void {
    this.queryClient = queryClient;
    
    // Auto-connect if not already connected
    if (this.state.status === 'idle') {
      this.connect();
    }
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: (state: WebSocketConnectionState) => void): () => void {
    this.stateSubscribers.add(callback);
    
    // Immediately call with current state
    callback(this.state);
    
    // Return unsubscribe function
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketConnectionState {
    return { ...this.state };
  }

  /**
   * Connect to WebSocket (idempotent)
   */
  async connect(): Promise<void> {
    if (this.connection?.readyState === WebSocket.OPEN || this.state.isConnecting) {
      return;
    }

    if (!this.queryClient) {
      console.error('ChatService: QueryClient not initialized. Call initialize() first.');
      return;
    }

    const isReconnecting = this.state.status === 'disconnected';

    this.updateState({
      isConnecting: true,
      status: isReconnecting ? 'reconnecting' : 'connecting',
      error: null,
      reconnectAttempts: this.state.reconnectAttempts + (isReconnecting ? 1 : 0),
    });

    try {
      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/chat`;


      this.connection = new WebSocket(wsUrl);

      this.connection.onopen = this.handleOpen.bind(this);
      this.connection.onmessage = this.handleMessage.bind(this);
      this.connection.onclose = this.handleClose.bind(this);
      this.connection.onerror = this.handleError.bind(this);

    } catch (error) {
      console.error('ChatService: Failed to create WebSocket connection:', error);
      this.updateState({
        status: 'error',
        isConnecting: false,
        error: 'Failed to create connection',
        connectionQuality: 'offline',
      });
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connection) {
      this.connection.close(1000, 'Client disconnect');
      this.connection = null;
    }

    this.updateState({
      isConnected: false,
      isConnecting: false,
      status: 'disconnected',
      connectionQuality: 'offline',
      lastDisconnectedAt: Date.now(),
    });
  }

  /**
   * Send a message via WebSocket
   */
  sendMessage(content: string): boolean {
    // Respect server-provided cooldown window
    const now = Date.now();
    if (this.sendCooldownUntil && now < this.sendCooldownUntil) {
      const seconds = Math.ceil((this.sendCooldownUntil - now) / 1000);
      this.updateState({ error: `You're sending too fast. Try again in ${seconds}s.` });
      return false;
    }
    if (this.sendCooldownUntil && now >= this.sendCooldownUntil) {
      this.sendCooldownUntil = null;
      this.updateState({ sendCooldownUntil: null, error: null });
    }

    if (!this.connection || this.connection.readyState !== WebSocket.OPEN) {
      this.updateState({
        error: 'Not connected to chat. Attempting to reconnect...'
      });

      // Try to reconnect
      if (!this.state.isConnecting && !this.state.isConnected) {
        this.connect();
      }
      return false;
    }

    // Sanitize and validate content
    const sanitizedContent = sanitizeMessageContent(content);
    if (!sanitizedContent) {
      this.updateState({ error: 'Message cannot be empty' });
      return false;
    }

    try {
      this.connection.send(JSON.stringify({
        type: 'message',
        content: sanitizedContent
      }));
      
      this.clearError();
      return true;
    } catch (error) {
      console.error('ChatService: Error sending message:', error);
      this.updateState({ error: 'Failed to send message' });
      return false;
    }
  }

  /**
   * Clear current error
   */
  clearError(): void {
    this.updateState({ error: null });
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(): void {

    
    this.updateState({
      isConnected: true,
      isConnecting: false,
      status: 'connected',
      connectionQuality: 'excellent',
      error: null,
      lastConnectedAt: Date.now(),
      reconnectAttempts: 0,
    });

    // Clear any client-side cooldown on a fresh (re)connect
    this.clearCooldownTimer();
    this.sendCooldownUntil = null;
    this.updateState({ sendCooldownUntil: null, error: null });

    // Ensure recent history is refreshed after (re)connect
    if (this.queryClient) {
      try {
        this.queryClient.invalidateQueries({ queryKey: ['chat', 'messages'] });
      } catch (err) {
        console.warn('ChatService: failed to invalidate messages on open', err);
      }
    }

    this.startHeartbeat();
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);


      // Validate message structure
      if (!isValidWebSocketMessage(data)) {
        console.warn('ChatService: Received invalid WebSocket message:', data);
        return;
      }

      if (!this.queryClient) {
        console.error('ChatService: QueryClient not available for cache updates');
        return;
      }

      // Handle different message types
      if (data.type === 'message' && data.message) {
        this.handleNewMessage(data.message);
      } else if (data.type === 'userCount' && typeof data.count === 'number') {
        this.updateState({ userCount: Math.max(0, data.count) });
      } else if (data.type === 'rateLimit' && typeof data.retryAfterMs === 'number') {
        const retry = Math.max(0, data.retryAfterMs);
        this.sendCooldownUntil = Date.now() + retry;
        const seconds = Math.ceil(retry / 1000);
        this.updateState({ error: `You're sending too fast. Try again in ${seconds}s.`, sendCooldownUntil: this.sendCooldownUntil });
        this.startCooldownTimer();
      } else if (data.type === 'pong') {
        // Heartbeat response - connection is healthy
        this.updateState({ connectionQuality: 'excellent' });
      }

    } catch (error) {
      console.error('ChatService: Error parsing WebSocket message:', error);
      this.updateState({ error: 'Failed to parse server message' });
    }
  }

  /**
   * Handle new message from WebSocket and update TanStack Query cache
   */
  private handleNewMessage(message: ChatMessage): void {
    if (!this.queryClient) return;



    // Update TanStack Query cache directly
    this.queryClient.setQueryData<ChatMessage[]>(['chat', 'messages'], (oldMessages) => {
      if (!oldMessages) return [message];

      // Check if message already exists (prevent duplicates)
      const exists = oldMessages.some(msg => msg.id === message.id);
      if (exists) return oldMessages;

      // Add new message and maintain cache size limit
      const updated = [...oldMessages, message];
      const MAX_CACHED_MESSAGES = 200;
      
      return updated.length > MAX_CACHED_MESSAGES 
        ? updated.slice(-MAX_CACHED_MESSAGES)
        : updated;
    });
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log('🔌 ChatService: WebSocket closed:', event.code, event.reason);
    
    this.stopHeartbeat();
    this.clearCooldownTimer();

    this.updateState({
      isConnected: false,
      isConnecting: false,
      connectionQuality: 'offline',
      lastDisconnectedAt: Date.now(),
    });

    // Auto-reconnect for unexpected closures
    if (event.code !== 1000) { // 1000 = normal closure
      let friendly = `Connection lost: ${event.reason || `Code ${event.code}`}`;
      if (event.code === 1008) {
        friendly = 'You are sending messages too fast (rate limited). Please wait and try again.';
      } else if (event.code === 1009) {
        friendly = 'Message too large. Maximum allowed is 2000 characters.';
      }

      this.updateState({
        status: 'disconnected',
        error: friendly
      });

      // Reconnect with exponential backoff
      const delay = Math.min(2000 * Math.pow(1.5, this.state.reconnectAttempts), 30000);
      console.log(`ChatService: Reconnecting in ${delay}ms...`);

      this.reconnectTimeout = setTimeout(() => {
        if (!this.state.isConnected && !this.state.isConnecting) {
          this.connect();
        }
      }, delay);
    } else {
      this.updateState({ status: 'disconnected', error: null });
    }
  }

  /**
   * Start a 1s ticker to update the error countdown and clear on expiry
   */
  private startCooldownTimer(): void {
    // Clear any existing timer
    this.clearCooldownTimer();
    if (!this.sendCooldownUntil) return;

    this.cooldownTimer = setInterval(() => {
      if (!this.sendCooldownUntil) {
        this.clearCooldownTimer();
        return;
      }
      const remaining = this.sendCooldownUntil - Date.now();
      if (remaining <= 0) {
        this.sendCooldownUntil = null;
        this.updateState({ error: null, sendCooldownUntil: null });
        this.clearCooldownTimer();
        return;
      }
      const seconds = Math.ceil(remaining / 1000);
      this.updateState({ error: `You're sending too fast. Try again in ${seconds}s.`, sendCooldownUntil: this.sendCooldownUntil });
    }, 1000);
  }

  /**
   * Clear cooldown timer if present
   */
  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(error: Event): void {
    console.error('❌ ChatService: WebSocket error:', error);
    
    this.updateState({
      isConnecting: false,
      status: 'error',
      connectionQuality: 'poor',
      error: 'WebSocket connection error',
    });
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.connection && this.connection.readyState === WebSocket.OPEN) {
        try {
          this.connection.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('ChatService: Heartbeat failed:', error);
          this.stopHeartbeat();
          // Trigger reconnection
          this.connect();
        }
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Update state and notify subscribers
   */
  private updateState(updates: Partial<WebSocketConnectionState>): void {
    this.state = { ...this.state, ...updates };
    
    // Notify all subscribers
    this.stateSubscribers.forEach(callback => {
      try {
        callback(this.state);
      } catch (error) {
        console.error('ChatService: Error in state subscriber:', error);
      }
    });
  }

  /**
   * Cleanup method for when service is no longer needed
   */
  destroy(): void {
    this.disconnect();
    this.stateSubscribers.clear();
    ChatService.instance = null;
  }
}
