import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Candle, WebSocketMessage } from '../candlestick/types/index.js';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { logCandleActivity } from '../handlers/debugLogger.js';
import { aggregate1MinTo5Min } from '../candlestick/aggregator.js';
import { comprehensiveScanner } from '../candlestick/comprehensiveScanner.js';

const clients = new Set<WebSocket>();
const signals: ComprehensiveSignal[] = []; // In-memory storage for comprehensive signals

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
export function handleCandle(candle: Candle, _deprecatedDetectPatterns?: any) {
  // Log candle activity for debugging
  logCandleActivity(candle);
  
  // For 1-minute candles, aggregate to 5-minute before processing
  if (candle.timeframe === '1m') {
    aggregate1MinTo5Min(candle, (aggregated5MinCandle) => {
      // Log the 5-minute candle
      logCandleActivity(aggregated5MinCandle);
      
      // Use comprehensive scanner to detect patterns
      console.log(`[COMPREHENSIVE] Scanning ${aggregated5MinCandle.symbol} 5m candle: O=${aggregated5MinCandle.open} C=${aggregated5MinCandle.close}`);
      
      const detectedSignals = comprehensiveScanner.scan(aggregated5MinCandle);
      
      if (detectedSignals.length > 0) {
        detectedSignals.forEach(signal => {
          signals.push(signal);
          
          // Broadcast the comprehensive signal
          broadcast({ type: 'signal', payload: signal });
          
          console.log(`🚨 ${signal.pattern.name} detected for ${signal.symbol} (score: ${signal.score}) - ${signal.plan.direction.toUpperCase()}`);
          console.log(`   Entry: $${signal.plan.entry}, Stop: $${signal.plan.stop}, Targets: $${signal.plan.targets.join(', $')}`);
        });
        
        // Keep only last 1000 signals in memory
        if (signals.length > 1000) {
          signals.splice(0, signals.length - 1000);
        }
      } else {
        console.log(`[COMPREHENSIVE] No actionable patterns found for ${aggregated5MinCandle.symbol}`);
      }
    });
  } else {
    // For non-1m candles, process directly with comprehensive scanner
    const detectedSignals = comprehensiveScanner.scan(candle);
    
    if (detectedSignals.length > 0) {
      detectedSignals.forEach(signal => {
        signals.push(signal);
        broadcast({ type: 'signal', payload: signal });
        console.log(`🚨 ${signal.pattern.name} detected for ${signal.symbol} (score: ${signal.score})`);
      });
      
      // Keep only last 1000 signals in memory
      if (signals.length > 1000) {
        signals.splice(0, signals.length - 1000);
      }
    }
  }
}

// Get recent signals
export function getSignals(symbol?: string, limit: number = 50): ComprehensiveSignal[] {
  let filtered = signals;
  if (symbol) {
    filtered = signals.filter(s => s.symbol === symbol);
  }
  return filtered.slice(-limit);
}