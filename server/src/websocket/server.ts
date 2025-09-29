import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Candle, Signal, WebSocketMessage } from '../candlestick/types/index.js';
import { logCandleActivity } from '../handlers/debugLogger.js';
import { aggregate1MinTo5Min } from '../candlestick/aggregator.js';

const clients = new Set<WebSocket>();
const signals: Signal[] = []; // In-memory storage for signals

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('New WebSocket client connected');
    clients.add(ws);
    
    // Send initial hello message
    ws.send(JSON.stringify({ type: 'hello', message: 'Connected to candlestick analysis server' }));
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      clients.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });
  
  return wss;
}

// Broadcast to all connected clients
export function broadcast(message: WebSocketMessage) {
  const data = JSON.stringify(message);
  
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// Handle incoming candle and check for patterns
export function handleCandle(candle: Candle, detectPatterns: (candle: Candle) => Signal | null) {
  // Log candle activity for debugging
  logCandleActivity(candle);
  
  // For 1-minute candles, aggregate to 5-minute before processing
  if (candle.timeframe === '1m') {
    aggregate1MinTo5Min(candle, (aggregated5MinCandle) => {
      // Log the 5-minute candle
      logCandleActivity(aggregated5MinCandle);
      
      // Check for patterns on the 5-minute candle
      console.log(`[PATTERN] Checking patterns for ${aggregated5MinCandle.symbol} 5m candle: O=${aggregated5MinCandle.open} C=${aggregated5MinCandle.close}`);
      const signal = detectPatterns(aggregated5MinCandle);
      if (signal) {
        signals.push(signal);
        // Keep only last 1000 signals in memory
        if (signals.length > 1000) {
          signals.shift();
        }
        
        // Broadcast the signal
        broadcast({ type: 'signal', payload: signal });
        console.log(`🚨 Pattern detected: ${signal.type} for ${signal.symbol} (5m)`);
      } else {
        console.log(`[PATTERN] No pattern found for ${aggregated5MinCandle.symbol}`);
      }
    });
  } else {
    // For non-1m candles, process as usual
    const signal = detectPatterns(candle);
    if (signal) {
      signals.push(signal);
      // Keep only last 1000 signals in memory
      if (signals.length > 1000) {
        signals.shift();
      }
      
      // Broadcast the signal
      broadcast({ type: 'signal', payload: signal });
      console.log(`Pattern detected: ${signal.type} for ${signal.symbol}`);
    }
  }
}

// Get recent signals
export function getSignals(symbol?: string, limit: number = 50): Signal[] {
  let filtered = signals;
  if (symbol) {
    filtered = signals.filter(s => s.symbol === symbol);
  }
  return filtered.slice(-limit);
}