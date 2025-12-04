import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Candle, WebSocketMessage } from '../candlestick/types/index.js';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { logCandleActivity } from '../handlers/debugLogger.js';
import { aggregate1MinTo5Min } from '../candlestick/aggregator.js';
import { comprehensiveScanner } from '../candlestick/comprehensiveScanner.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

const clients = new Set<WebSocket>();
const signals: ComprehensiveSignal[] = []; // In-memory storage for comprehensive signals

// Auto-execution configuration
const AUTO_EXECUTION_CONFIG = {
  enabled: true, // RE-ENABLED for automatic trading
  highScoreThreshold: 70, // Increased from 60 to filter low-quality signals
  enableTrapFades: true
};

// Auto-execution helper functions
function shouldAutoExecute(signal: ComprehensiveSignal): boolean {
  if (!AUTO_EXECUTION_CONFIG.enabled) return false;
  
  // High score signals (65+)
  if (signal.score >= AUTO_EXECUTION_CONFIG.highScoreThreshold) {
    console.log(`[AUTO-EXEC] High score signal (${signal.score}) qualifies for auto-execution: ${signal.pattern.name} for ${signal.symbol}`);
    return true;
  }
  
  // Trap fade trades
  if (AUTO_EXECUTION_CONFIG.enableTrapFades && isTrapFadeCandidate(signal)) {
    console.log(`[AUTO-EXEC] Trap fade candidate qualifies for auto-execution: ${signal.pattern.name} for ${signal.symbol}`);
    return true;
  }
  
  return false;
}

function isTrapFadeCandidate(signal: ComprehensiveSignal): boolean {
  // Look for high trap risk patterns that we want to fade
  if (signal.trapRisk === 'high') {
    const patternName = signal.pattern.name.toLowerCase();
    
    // Specific trap patterns we want to fade
    const trapPatterns = [
      'fade',           // Already identified fade patterns
      'tweezer',        // Tweezer tops/bottoms often fail
      'shooting star',  // Often reverse quickly
      'hammer'          // Can be fake reversals
    ];
    
    const isTrappyPattern = trapPatterns.some(trap => patternName.includes(trap));
    
    // Additional criteria for high-confidence fades
    const hasHighVolume = signal.context.volumeFactor > 2.0; // Volume spike suggests manipulation
    const atRoundNumber = isNearRoundNumber(signal.currentPrice || 0);
    const hasLongWicks = checkForLongWicks(signal);
    
    if (isTrappyPattern && (hasHighVolume || atRoundNumber || hasLongWicks)) {
      console.log(`[TRAP-FADE] High confidence fade setup: ${patternName} with volume ${signal.context.volumeFactor.toFixed(1)}x, round number: ${atRoundNumber}, long wicks: ${hasLongWicks}`);
      return true;
    }
  }
  
  return false;
}

function isNearRoundNumber(price: number): boolean {
  // Check if price is near round numbers (within 0.5%)
  const roundNumbers = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  const tolerance = 0.005; // 0.5%
  
  return roundNumbers.some(round => {
    const diff = Math.abs(price - round) / round;
    return diff <= tolerance;
  });
}

function checkForLongWicks(signal: ComprehensiveSignal): boolean {
  // Check if the pattern notes mention long wicks (indicating potential stop hunt)
  return signal.notes.some(note => 
    note.toLowerCase().includes('wick') || 
    note.toLowerCase().includes('stop hunt') ||
    note.toLowerCase().includes('round number')
  );
}

async function executeSignalAutomatically(signal: ComprehensiveSignal): Promise<void> {
  try {
    let signalToExecute = signal;
    let executionType = 'normal';
    
    // Check if this is a trap fade candidate
    if (isTrapFadeCandidate(signal)) {
      signalToExecute = createFadeSignal(signal);
      executionType = 'trap-fade';
      console.log(`[AUTO-EXEC] Creating trap fade trade (opposite direction) for ${signal.pattern.name} on ${signal.symbol}`);
    } else {
      console.log(`[AUTO-EXEC] Attempting automatic execution for ${signal.pattern.name} on ${signal.symbol} (score: ${signal.score})`);
    }
    
    const result = await metaApiHandler.placeOrder(signalToExecute);
    
    if (result.success) {
      console.log(`✅ [AUTO-EXEC] Successfully auto-executed ${executionType}: ${signalToExecute.pattern.name} for ${signal.symbol} - Order ID: ${result.data?.orderId}`);
      
      // Broadcast auto-execution notification
      broadcast({
        type: 'auto-execution',
        payload: {
          originalSignal: signal,
          executedSignal: signalToExecute,
          executionType,
          result,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      console.error(`❌ [AUTO-EXEC] Failed to auto-execute ${executionType}: ${signalToExecute.pattern.name} for ${signal.symbol} - Error: ${result.error}`);
    }
  } catch (error) {
    console.error(`❌ [AUTO-EXEC] Exception during auto-execution for ${signal.symbol}:`, error);
  }
}

function createFadeSignal(originalSignal: ComprehensiveSignal): ComprehensiveSignal {
  // Create opposite trade to fade the trap
  const oppositeDirection = originalSignal.plan.direction === 'long' ? 'short' : 'long';
  const oppositePatternDirection = originalSignal.pattern.direction === 'bullish' ? 'bearish' : 'bullish';
  
  // Calculate fade entry and stops
  const currentPrice = originalSignal.currentPrice || 0;
  const atr = originalSignal.context.atr;
  
  let fadeEntry: number;
  let fadeStop: number;
  let fadeTargets: number[];
  
  if (oppositeDirection === 'short') {
    // Fade a bullish trap - short at resistance
    fadeEntry = currentPrice - (atr * 0.1); // Enter slightly below current
    fadeStop = currentPrice + (atr * 0.75);  // Stop above trap level
    fadeTargets = [
      fadeEntry - (atr * 1.5),  // Target 1
      fadeEntry - (atr * 2.5)   // Target 2
    ];
  } else {
    // Fade a bearish trap - long at support
    fadeEntry = currentPrice + (atr * 0.1); // Enter slightly above current
    fadeStop = currentPrice - (atr * 0.75);  // Stop below trap level
    fadeTargets = [
      fadeEntry + (atr * 1.5),  // Target 1
      fadeEntry + (atr * 2.5)   // Target 2
    ];
  }
  
  // Create fade signal
  const fadeSignal: ComprehensiveSignal = {
    ...originalSignal,
    id: `${originalSignal.symbol}-${Date.now()}-FADE-${Math.random().toString(36).substr(2, 9)}`,
    pattern: {
      ...originalSignal.pattern,
      name: `Fade ${originalSignal.pattern.name}`,
      direction: oppositePatternDirection
    },
    plan: {
      direction: oppositeDirection,
      entry: Number(fadeEntry.toFixed(2)),
      stop: Number(fadeStop.toFixed(2)),
      risk: Number(Math.abs(fadeEntry - fadeStop).toFixed(2)),
      targets: fadeTargets.map(t => Number(t.toFixed(2))),
      positionQty: originalSignal.plan.positionQty,
      riskRewardRatio: '1:2.0'
    },
    score: 75, // High score for fade trades
    notes: [
      ...originalSignal.notes,
      '🎯 FADE TRADE: Betting against trap pattern',
      `Original pattern: ${originalSignal.pattern.name} (${originalSignal.pattern.direction})`,
      `Trap risk: ${originalSignal.trapRisk}`
    ]
  };
  
  console.log(`[FADE-SIGNAL] Created fade signal: ${fadeSignal.pattern.name} ${oppositeDirection} at $${fadeEntry} (stop: $${fadeStop})`);
  
  return fadeSignal;
}

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
        detectedSignals.forEach(async (signal) => {
          signals.push(signal);
          
          // Check for auto-execution
          if (shouldAutoExecute(signal)) {
            await executeSignalAutomatically(signal);
          }
          
          // Broadcast the comprehensive signal
          console.log(`[WEBSOCKET] Broadcasting signal for ${signal.symbol} with ID: ${signal.id}`);
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
      detectedSignals.forEach(async (signal) => {
        signals.push(signal);
        
        // Check for auto-execution
        if (shouldAutoExecute(signal)) {
          await executeSignalAutomatically(signal);
        }
        
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

// Handle direct signal (for mock signals)
export async function handleSignal(signal: ComprehensiveSignal) {
  signals.push(signal);
  
  // Check for auto-execution (same logic as real signals)
  if (shouldAutoExecute(signal)) {
    await executeSignalAutomatically(signal);
  }
  
  // Broadcast the signal
  console.log(`[WEBSOCKET] Broadcasting mock signal for ${signal.symbol} with ID: ${signal.id}`);
  broadcast({ type: 'signal', payload: signal });
  
  console.log(`🎭 ${signal.pattern.name} mock signal for ${signal.symbol} (score: ${signal.score}) - ${signal.plan.direction.toUpperCase()}`);
  console.log(`   Entry: $${signal.plan.entry}, Stop: $${signal.plan.stop}, Targets: $${signal.plan.targets.join(', $')}`);
  
  // Keep only last 1000 signals in memory
  if (signals.length > 1000) {
    signals.splice(0, signals.length - 1000);
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