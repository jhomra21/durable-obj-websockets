import { createEffect, onCleanup, batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import { isValidWebSocketMessage, sanitizeMessageContent } from './chat-validation';
import type { ChatMessage } from '../../api/chat';

// Connected user info
export interface ConnectedUser {
  userId: string;
  userName: string;
  userImage?: string;
}

// WebSocket connection state
export interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
  error: string | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  reconnectAttempts: number;
  messages: ChatMessage[];
  userCount: number;
  connectedUsers: ConnectedUser[];
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  // When set and in the future, sending is disabled until this epoch ms
  sendCooldownUntil?: number | null;
}

// WebSocket chat hook
export function createWebSocketChat() {
  const [state, setState] = createStore<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    connectionQuality: 'offline',
    error: null,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    reconnectAttempts: 0,
    messages: [],
    userCount: 0,
    connectedUsers: [],
    connectionStatus: 'idle'
  });

  let ws: WebSocket | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (ws?.readyState === WebSocket.OPEN || state.isConnecting) {
      return;
    }

    const isReconnecting = state.connectionStatus === 'disconnected';

    // Use batch for multiple related state updates
    batch(() => {
      setState('isConnecting', true);
      setState('isReconnecting', isReconnecting);
      setState('connectionStatus', isReconnecting ? 'reconnecting' : 'connecting');
      setState('error', null);
      setState('reconnectAttempts', state.reconnectAttempts + (isReconnecting ? 1 : 0));
    });

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Use batch for multiple related state updates
      batch(() => {
        setState('isConnected', true);
        setState('isConnecting', false);
        setState('isReconnecting', false);
        setState('connectionStatus', 'connected');
        setState('connectionQuality', 'excellent');
        setState('error', null);
        setState('lastConnectedAt', Date.now());
        setState('reconnectAttempts', 0);
      });
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Validate message structure
        if (!isValidWebSocketMessage(data)) {
          console.warn('Received invalid WebSocket message:', data);
          return;
        }

        // Use batch for multiple state updates
        batch(() => {
          if (data.type === 'message' && data.message) {
            // Add new message with deduplication and limit management
            setState('messages', messages => {
              // Check if message already exists to prevent duplicates
              const exists = messages.some(msg => msg.id === data.message.id);
              if (exists) return messages;

              const newMessages = [...messages, data.message];

              // Keep only last 200 messages to prevent memory issues
              const MAX_MESSAGES = 200;
              return newMessages.length > MAX_MESSAGES
                ? newMessages.slice(-MAX_MESSAGES)
                : newMessages;
            });
          } else if (data.type === 'history' && data.messages) {
            // Load message history with validation
            const validMessages = data.messages.filter((msg: any) => {
              if (!msg || typeof msg !== 'object') return false;
              return true; // Already validated by isValidWebSocketMessage
            });

            // Set messages and ensure they're sorted by timestamp (newest last)
            const sortedMessages = validMessages.sort((a: { timestamp: number; }, b: { timestamp: number; }) => a.timestamp - b.timestamp);
            setState('messages', sortedMessages);
          } else if (data.type === 'userCount' && typeof data.count === 'number') {
            // Update user count and connected users
            setState('userCount', Math.max(0, data.count));
            if (data.connectedUsers && Array.isArray(data.connectedUsers)) {
              setState('connectedUsers', data.connectedUsers);
            }
          }
        });
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
        setState('error', 'Failed to parse server message');
      }
    };

    ws.onclose = (event) => {
      stopHeartbeat();

      // Use batch for multiple related state updates
      batch(() => {
        setState('isConnected', false);
        setState('isConnecting', false);
        setState('connectionQuality', 'offline');
        setState('lastDisconnectedAt', Date.now());

        if (event.code !== 1000) { // 1000 = normal closure
          setState('connectionStatus', 'disconnected');
          setState('error', `Connection lost: ${event.reason || `Code ${event.code}`}`);
        } else {
          setState('connectionStatus', 'disconnected');
        }
      });

      // Auto-reconnect for hibernation (code 1006) or other connection issues
      if (event.code === 1006 || event.code === 1001) {
        console.log('Connection lost, attempting to reconnect...');
        setState('connectionStatus', 'reconnecting');

        // Clear any existing reconnect timeout
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
          if (!state.isConnected && !state.isConnecting) {
            connect();
          }
          reconnectTimeout = null;
        }, 2000); // Wait 2 seconds before reconnecting
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Use batch for multiple related state updates
      batch(() => {
        setState('isConnecting', false);
        setState('connectionStatus', 'error');
        setState('connectionQuality', 'poor');
        setState('error', 'WebSocket connection error');
      });
    };
  };

  const disconnect = () => {
    stopHeartbeat();
    if (ws) {
      ws.close(1000, 'Client disconnect');
      ws = null;
    }

    // Use batch for multiple related state updates
    batch(() => {
      setState('isConnected', false);
      setState('isConnecting', false);
      setState('isReconnecting', false);
      setState('connectionStatus', 'disconnected');
      setState('connectionQuality', 'offline');
      setState('lastDisconnectedAt', Date.now());
    });
  };

  const startHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Send a ping to keep the connection alive
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('Heartbeat failed:', error);
          stopHeartbeat();
          // Try to reconnect
          connect();
        }
      }
    }, 30000); // Send heartbeat every 30 seconds
  };

  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  const sendMessage = (content: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Try to reconnect if connection is lost
      if (!state.isConnecting && !state.isConnected) {
        connect();
        setState('error', 'Reconnecting... Please try again in a moment.');
      } else {
        setState('error', 'Not connected to chat');
      }
      return false;
    }

    // Sanitize and validate content
    const sanitizedContent = sanitizeMessageContent(content);
    if (!sanitizedContent) {
      setState('error', 'Message cannot be empty');
      return false;
    }

    try {
      ws.send(JSON.stringify({
        type: 'message',
        content: sanitizedContent
      }));
      clearError();
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      setState('error', 'Failed to send message');
      return false;
    }
  };

  const clearError = () => {
    setState('error', null);
  };

  const clearMessages = () => {
    setState('messages', []);
  };

  // Auto-connect effect - only connect when idle
  createEffect(() => {
    if (state.connectionStatus === 'idle') {
      connect();
    }
  });

  // Cleanup effect
  onCleanup(() => {
    stopHeartbeat();

    // Clear reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }
  });

  return {
    state,
    connect,
    disconnect,
    sendMessage,
    clearError,
    clearMessages
  };
}

// Utility function to format message timestamp
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  // If message is from today, show time only
  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // If message is from this week, show day and time
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Otherwise show full date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Utility function to get message author display name
export function getMessageAuthor(message: ChatMessage): string {
  if (message.type === 'system') {
    return 'System';
  }
  return message.userName || 'Anonymous';
}
