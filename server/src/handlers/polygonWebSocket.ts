import WebSocket from 'ws';
import { Candle, PolygonAggregateMessage } from '../candlestick/types/index.js';

// AGGRESSIVE STATE CLEANUP - clear any lingering state from previous server sessions
let wsClient: WebSocket | null = null;
let isConnected = false;
const desiredSubscriptions = new Set<string>();
let onCandleCallback: ((candle: Candle) => void) | null = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout: NodeJS.Timeout | null = null;
let isShuttingDown = true; // START AS SHUTDOWN to prevent any automatic connections
let lastConnectionAttempt = 0;
const CONNECTION_COOLDOWN = 5000; // 5 second cooldown between attempts
let isConnecting = false; // GLOBAL LOCK: Prevent simultaneous connection attempts

// FORCE CLEANUP ON MODULE LOAD
if (reconnectTimeout) {
  clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
}
if (wsClient !== null) {
  try {
    (wsClient as any).close();
  } catch {}
  wsClient = null;
}
isConnected = false;
desiredSubscriptions.clear();
onCandleCallback = null;
reconnectAttempts = 0;
console.log('🧹 Polygon WebSocket module initialized - all state cleared');

const STOCKS_WS_URL = 'wss://socket.polygon.io/stocks';

export function connectPolygon(apiKey: string, onCandle: (candle: Candle) => void) {
  // LOG EXACTLY WHO IS CALLING THIS FUNCTION
  const stack = new Error().stack;
  console.error('🚨🚨🚨 POLYGON CONNECTION ATTEMPT DETECTED 🚨🚨🚨');
  console.error('🚨 connectPolygon() called from:');
  console.error(stack);
  console.error('🚨🚨🚨 END STACK TRACE 🚨🚨🚨');
  
  if (!apiKey) {
    throw new Error('Polygon API key is required');
  }
  
  // GLOBAL LOCK: Prevent simultaneous connection attempts
  if (isConnecting) {
    console.log('🚫 BLOCKED: Connection already in progress, refusing additional connection attempt');
    return;
  }
  
  // STRICT: Only allow ONE connection attempt at a time
  if (wsClient !== null) {
    console.log('🚫 BLOCKED: WebSocket client already exists, refusing to create new connection');
    console.log(`🚫 Current state: ${wsClient.readyState} (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)`);
    return;
  }
  
  // Rate limiting - prevent rapid connection attempts  
  const now = Date.now();
  if (now - lastConnectionAttempt < CONNECTION_COOLDOWN) {
    const waitTime = CONNECTION_COOLDOWN - (now - lastConnectionAttempt);
    console.log(`🔌 Connection rate limited. Wait ${Math.ceil(waitTime/1000)}s before next attempt`);
    return;
  }
  lastConnectionAttempt = now;
  
  // Reset shutdown flag when explicitly connecting
  if (isShuttingDown) {
    console.log('🔌 Re-enabling Polygon connections after explicit connect request...');
    isShuttingDown = false;
  }
  
  onCandleCallback = onCandle;
  isConnecting = true; // Set connection lock
  
  console.log('🔐 Setting connection lock - creating WebSocket...');
  wsClient = new WebSocket(STOCKS_WS_URL);
  
  wsClient.on('open', () => {
    console.log('Connected to Polygon WebSocket');
    isConnected = true;
    isConnecting = false; // Clear connection lock on successful open
    reconnectAttempts = 0; // Reset on successful connection
    
    // Authenticate
    wsClient!.send(JSON.stringify({
      action: 'auth',
      params: apiKey
    }));
    
    // Re-subscribe to any existing subscriptions
    if (desiredSubscriptions.size > 0) {
      const topics = Array.from(desiredSubscriptions);
      console.log(`Subscribing to ${topics.length} topics:`, topics);
      wsClient!.send(JSON.stringify({
        action: 'subscribe',
        params: topics.join(',')
      }));
    }
  });
  
  wsClient.on('message', (data: WebSocket.Data) => {
    try {
      const messages = JSON.parse(data.toString());
      
      // Log all messages to see what Polygon is sending
      console.log('Polygon message:', JSON.stringify(messages, null, 2));
      
      // Handle array of messages
      const msgArray = Array.isArray(messages) ? messages : [messages];
      
      for (const msg of msgArray) {
        // Handle authentication response
        if (msg.ev === 'status') {
          console.log('Polygon status:', msg.status, msg.message);
          if (msg.status === 'auth_success') {
            console.log('✅ Polygon authentication successful');
          } else if (msg.status === 'auth_failed') {
            console.error('❌ Polygon authentication failed');
          } else if (msg.status === 'max_connections') {
            console.error('🚫 MAX CONNECTIONS EXCEEDED - DISABLING RECONNECTION');
            isShuttingDown = true; // Prevent any further reconnection attempts
            if (wsClient) {
              wsClient.close();
            }
          }
          continue;
        }
        
        // Handle aggregate minute bars (AM) and aggregate second bars (A)
        if ((msg.ev === 'AM' || msg.ev === 'A') && msg.sym && onCandleCallback) {
          const candle: Candle = {
            symbol: msg.sym,
            timeframe: msg.ev === 'AM' ? '1m' : '1s',
            open: msg.o,
            high: msg.h,
            low: msg.l,
            close: msg.c,
            volume: msg.v,
            start: new Date(msg.s).toISOString(),
            end: new Date(msg.e || msg.s).toISOString()
          };
          
          console.log(`📈 Received candle: ${msg.sym} ${msg.c}`);
          onCandleCallback(candle);
        }
      }
    } catch (error) {
      console.error('Error parsing Polygon message:', error);
    }
  });
  
  wsClient.on('close', (code, reason) => {
    console.log(`Polygon WebSocket disconnected - Code: ${code}, Reason: ${reason}`);
    isConnected = false;
    isConnecting = false; // Clear connection lock on close
    wsClient = null; // CRITICAL: Clear the client reference to allow new connections
    
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Don't reconnect if we got a "policy violation" close code (1008 = max connections exceeded)
    if (code === 1008) {
      console.error('🚫 Connection closed due to policy violation (max connections) - STOPPING ALL RECONNECTION ATTEMPTS');
      isShuttingDown = true;
      return;
    }
    
    // Only reconnect if we haven't exceeded max attempts and not shutting down
    if (reconnectAttempts < maxReconnectAttempts && onCandleCallback && !isShuttingDown) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000); // Exponential backoff, max 30 seconds
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
      
      reconnectTimeout = setTimeout(() => {
        if (onCandleCallback && !isShuttingDown) {
          connectPolygon(apiKey, onCandleCallback);
        }
      }, delay);
    } else {
      if (isShuttingDown) {
        console.log('Stopping reconnection - server is shutting down');
      } else {
        console.log('Max reconnection attempts reached or no callback available. Stopping reconnection.');
      }
    }
  });
  
  wsClient.on('error', (error) => {
    console.error('Polygon WebSocket error:', error);
    isConnecting = false; // Clear connection lock on error
    try {
      wsClient?.close();
    } catch {}
    // Don't set wsClient = null here, let the 'close' event handle cleanup
  });
}

export function subscribeSymbols(symbols: string[], granularity: 'AM' | 'A' = 'AM') {
  // LOG WHO IS CALLING SUBSCRIBE
  const stack = new Error().stack;
  console.error('🚨🚨🚨 POLYGON SUBSCRIPTION ATTEMPT DETECTED 🚨🚨🚨');
  console.error('🚨 subscribeSymbols() called from:');
  console.error('🚨 Symbols:', symbols);
  console.error('🚨 Granularity:', granularity);
  console.error(stack);
  console.error('🚨🚨🚨 END SUBSCRIPTION STACK TRACE 🚨🚨🚨');
  
  const topics = symbols.map(s => `${granularity}.${s.toUpperCase()}`);
  
  // Allow up to 50 symbols - Polygon Basic plan supports this
  const limitedTopics = topics.slice(0, 50);
  console.log(`Subscribing to ${limitedTopics.length} symbols (from ${topics.length} requested)`);
  
  limitedTopics.forEach(t => desiredSubscriptions.add(t));
  
  if (isConnected && wsClient) {
    wsClient.send(JSON.stringify({
      action: 'subscribe',
      params: limitedTopics.join(',')
    }));
  }
}

export function unsubscribeSymbols(symbols: string[], granularity: 'AM' | 'A' = 'AM') {
  const topics = symbols.map(s => `${granularity}.${s.toUpperCase()}`);
  
  topics.forEach(t => desiredSubscriptions.delete(t));
  
  if (isConnected && wsClient) {
    wsClient.send(JSON.stringify({
      action: 'unsubscribe',
      params: topics.join(',')
    }));
  }
}

export function disconnectPolygon() {
  console.log('🔌 Disconnecting from Polygon WebSocket...');
  
  // Prevent reconnection attempts
  isShuttingDown = true;
  isConnecting = false; // Clear connection lock
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
    console.log('🔌 Cleared reconnection timeout');
  }
  
  if (wsClient) {
    console.log('🔌 Closing WebSocket connection...');
    wsClient.close(1000, 'Manual disconnect'); // Normal closure
    // Note: wsClient will be set to null in the 'close' event handler
  }
  
  isConnected = false;
  reconnectAttempts = 0;
  desiredSubscriptions.clear();
  onCandleCallback = null; // Clear callback to fully disconnect
  
  console.log('✅ Polygon WebSocket disconnected successfully');
}

export function shutdownPolygon() {
  console.log('Shutting down Polygon WebSocket...');
  isShuttingDown = true;
  disconnectPolygon();
}

export function resetPolygonConnection(apiKey: string, onCandle: (candle: Candle) => void) {
  console.log('Resetting Polygon connection...');
  disconnectPolygon();
  reconnectAttempts = 0;
  connectPolygon(apiKey, onCandle);
}

export function isPolygonConnected(): boolean {
  return isConnected && wsClient !== null && wsClient.readyState === WebSocket.OPEN;
}

export function isPolygonConnecting(): boolean {
  return wsClient !== null && wsClient.readyState === WebSocket.CONNECTING;
}

export function hasActivePolygonConnection(): boolean {
  return wsClient !== null && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING);
}

// Emergency function to reset all connection state
export function forceResetConnectionState() {
  console.log('🚨 FORCE RESETTING ALL POLYGON CONNECTION STATE');
  isConnected = false;
  isConnecting = false;
  isShuttingDown = true;
  wsClient = null;
  reconnectAttempts = 0;
  onCandleCallback = null;
  desiredSubscriptions.clear();
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  console.log('✅ All connection state forcibly reset');
}