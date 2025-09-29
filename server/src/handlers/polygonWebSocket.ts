import WebSocket from 'ws';
import { Candle, PolygonAggregateMessage } from '../candlestick/types/index.js';

let wsClient: WebSocket | null = null;
let isConnected = false;
const desiredSubscriptions = new Set<string>();
let onCandleCallback: ((candle: Candle) => void) | null = null;

const STOCKS_WS_URL = 'wss://socket.polygon.io/stocks';

export function connectPolygon(apiKey: string, onCandle: (candle: Candle) => void) {
  if (!apiKey) {
    throw new Error('Polygon API key is required');
  }
  
  onCandleCallback = onCandle;
  
  if (wsClient && (wsClient.readyState === WebSocket.OPEN || 
      wsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }
  
  wsClient = new WebSocket(STOCKS_WS_URL);
  
  wsClient.on('open', () => {
    console.log('Connected to Polygon WebSocket');
    isConnected = true;
    
    // Authenticate
    wsClient!.send(JSON.stringify({
      action: 'auth',
      params: apiKey
    }));
    
    // Re-subscribe to any existing subscriptions
    if (desiredSubscriptions.size > 0) {
      const topics = Array.from(desiredSubscriptions);
      wsClient!.send(JSON.stringify({
        action: 'subscribe',
        params: topics.join(',')
      }));
    }
  });
  
  wsClient.on('message', (data: WebSocket.Data) => {
    try {
      const messages = JSON.parse(data.toString()) as PolygonAggregateMessage[];
      
      for (const msg of messages) {
        // Handle aggregate minute bars (AM) and aggregate second bars (A)
        if ((msg.ev === 'AM' || msg.ev === 'A') && onCandleCallback) {
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
          
          onCandleCallback(candle);
        }
      }
    } catch (error) {
      console.error('Error parsing Polygon message:', error);
    }
  });
  
  wsClient.on('close', () => {
    console.log('Polygon WebSocket disconnected');
    isConnected = false;
    // Reconnect after 1 second
    setTimeout(() => connectPolygon(apiKey, onCandleCallback!), 1000);
  });
  
  wsClient.on('error', (error) => {
    console.error('Polygon WebSocket error:', error);
    try {
      wsClient?.close();
    } catch {}
  });
}

export function subscribeSymbols(symbols: string[], granularity: 'AM' | 'A' = 'AM') {
  const topics = symbols.map(s => `${granularity}.${s.toUpperCase()}`);
  
  topics.forEach(t => desiredSubscriptions.add(t));
  
  if (isConnected && wsClient) {
    wsClient.send(JSON.stringify({
      action: 'subscribe',
      params: topics.join(',')
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
  if (wsClient) {
    wsClient.close();
    wsClient = null;
  }
  isConnected = false;
  desiredSubscriptions.clear();
}