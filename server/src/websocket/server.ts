import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Candle, WebSocketMessage } from '../candlestick/types/index.js';
import { ComprehensiveSignal } from '../candlestick/types/comprehensive.js';
import { logCandleActivity } from '../handlers/debugLogger.js';
import { aggregate1MinTo5Min } from '../candlestick/aggregator.js';
import { comprehensiveScanner } from '../candlestick/comprehensiveScanner.js';
import { metaApiHandler } from '../handlers/metaApiRestHandler.js';
import { evaluateSignalWithAI, isAIFilterEnabled } from '../services/aiSignalFilter.js';

const clients = new Set<WebSocket>();
const signals: ComprehensiveSignal[] = []; // In-memory storage for comprehensive signals

// Auto-execution configuration
const AUTO_EXECUTION_CONFIG = {
  enabled: true, // RE-ENABLED for automatic trading
  highScoreThreshold: 70, // Increased from 60 to filter low-quality signals
  enableTrapFades: true,
  requireTrendAlignment: false // DISABLED - trend detection unreliable with limited candle history
};

// Block trend-aligned trades (historical data shows 6.7% win rate vs 36.6% counter-trend)
function isTrendAlignedTrade(signal: ComprehensiveSignal): boolean {
  const trend = signal.context.trend;
  const direction = signal.plan.direction;
  
  // Trend-aligned = going WITH the trend (historically loses)
  // Long in uptrend OR Short in downtrend = trend-aligned = BLOCK
  const isAligned = (trend === 'up' && direction === 'long') || 
                    (trend === 'down' && direction === 'short');
  
  return isAligned;
}

// Auto-execution helper functions
function shouldAutoExecute(signal: ComprehensiveSignal): boolean {
  console.log(`[AUTO-CHECK] ${signal.symbol} ${signal.pattern.name} score=${signal.score} checking auto-execution...`);
  
  const now = new Date();
  const ukHour = parseInt(now.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }));
  const ukMinute = parseInt(now.toLocaleString('en-GB', { timeZone: 'Europe/London', minute: '2-digit' }));
  const cutoffHour = 20;
  const cutoffMinute = 45;
  
  if (ukHour > cutoffHour || (ukHour === cutoffHour && ukMinute >= cutoffMinute)) {
    console.log(`[TIME-FILTER] BLOCKED: No new orders after ${cutoffHour}:${cutoffMinute.toString().padStart(2, '0')} UK time (current: ${ukHour}:${ukMinute.toString().padStart(2, '0')})`);
    return false;
  }
  
  // BLOCK afternoon/close trades - historical data shows 11.6% win rate at close, 21.7% afternoon vs 28.9% midday
  // US market close period starts around 3PM UK time (10AM ET onwards = afternoon, after 3PM UK = close period)
  if (ukHour >= 20) {
    console.log(`[TIME-FILTER] ❌ BLOCKED: Close period trade (${ukHour}:${ukMinute.toString().padStart(2, '0')} UK). Historical: 11.6% win rate vs 28.9% midday.`);
    return false;
  }
  
  if (!AUTO_EXECUTION_CONFIG.enabled) {
    console.log(`[AUTO-CHECK] BLOCKED: Auto-execution disabled`);
    return false;
  }
  
  // Check minimum volatility - only trade stocks that move enough
  const atr = signal.context?.atr || 0;
  const price = signal.currentPrice || signal.plan?.entry || 0;
  const atrPercent = price > 0 ? (atr / price) * 100 : 0;
  const minVolatilityPercent = 0.15; // Minimum 0.15% ATR
  
  if (atrPercent < minVolatilityPercent) {
    console.log(`[VOLATILITY-FILTER] BLOCKED: ${signal.symbol} ATR ${atrPercent.toFixed(3)}% < ${minVolatilityPercent}% minimum`);
    return false;
  }
  
  // BLOCK trend-aligned trades - historical data shows 6.7% win rate vs 36.6% counter-trend
  if (isTrendAlignedTrade(signal)) {
    console.log(`[TREND-FILTER] ❌ BLOCKED: Trend-aligned trade (${signal.plan.direction} in ${signal.context.trend} trend). Historical: 6.7% win rate vs 36.6% counter-trend.`);
    return false;
  }
  
  // Counter-trend trades use lower threshold (55) since they get penalized by scoring but perform better historically
  const counterTrendThreshold = 55;
  
  // High score signals (70+ for trend-aligned which are blocked above, 55+ for counter-trend)
  if (signal.score >= counterTrendThreshold) {
    console.log(`[AUTO-EXEC] ✅ Counter-trend signal (${signal.score} >= ${counterTrendThreshold}) qualifies for auto-execution: ${signal.pattern.name} for ${signal.symbol}`);
    console.log(`[AUTO-EXEC] AI_SIGNAL_FILTER enabled: ${isAIFilterEnabled()}`);
    return true;
  } else {
    console.log(`[AUTO-CHECK] Score ${signal.score} < threshold ${counterTrendThreshold} - skipping`);
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
    
    // AI Filter - if enabled, ask Claude to evaluate the signal
    if (isAIFilterEnabled()) {
      console.log(`[AI-FILTER] AI filtering enabled - evaluating ${signal.symbol} ${signal.pattern.name}...`);
      
      const aiDecision = await evaluateSignalWithAI(signal);
      
      // Broadcast AI decision for visibility
      broadcast({
        type: 'ai-decision',
        payload: {
          signal,
          decision: aiDecision,
          timestamp: new Date().toISOString()
        }
      });
      
      if (!aiDecision.execute) {
        console.log(`🤖 [AI-FILTER] SKIPPED: ${signal.symbol} ${signal.pattern.name} - ${aiDecision.reasoning}`);
        return;
      }
      
      // Handle INVERT action - trade opposite direction
      if (aiDecision.action === 'invert') {
        console.log(`🔄 [AI-FILTER] INVERTING: ${signal.symbol} ${signal.pattern.name} - ${aiDecision.reasoning}`);
        
        const oppositeDirection = signal.plan.direction === 'long' ? 'short' : 'long';
        const oppositePatternDirection = signal.pattern.direction === 'bullish' ? 'bearish' : 'bullish';
        
        signalToExecute = {
          ...signal,
          id: `${signal.symbol}-${Date.now()}-INVERT-${Math.random().toString(36).substr(2, 9)}`,
          pattern: {
            ...signal.pattern,
            name: `Inverted ${signal.pattern.name}`,
            direction: oppositePatternDirection
          },
          plan: {
            ...signal.plan,
            direction: oppositeDirection,
            entry: aiDecision.adjustedEntry || signal.plan.entry,
            stop: aiDecision.adjustedStop || signal.plan.stop,
            targets: aiDecision.adjustedTarget 
              ? [aiDecision.adjustedTarget, ...signal.plan.targets.slice(1)]
              : signal.plan.targets
          },
          notes: [
            ...signal.notes,
            `🔄 AI INVERTED: Original ${signal.pattern.name} (${signal.pattern.direction}) → ${oppositeDirection}`,
            `Reason: ${aiDecision.reasoning}`
          ]
        };
        
        executionType = 'ai-inverted';
        console.log(`[AI-FILTER] Inverted to ${oppositeDirection}: Entry=$${signalToExecute.plan.entry}, Stop=$${signalToExecute.plan.stop}, Target=$${signalToExecute.plan.targets[0]}`);
      } else {
        console.log(`🤖 [AI-FILTER] APPROVED: ${signal.symbol} ${signal.pattern.name} (${aiDecision.confidence} confidence) - ${aiDecision.reasoning}`);
        
        // Apply AI adjustments if provided
        if (aiDecision.adjustedEntry) {
          signalToExecute = {
            ...signalToExecute,
            plan: { ...signalToExecute.plan, entry: aiDecision.adjustedEntry }
          };
          console.log(`[AI-FILTER] Adjusted entry: $${aiDecision.adjustedEntry}`);
        }
        if (aiDecision.adjustedStop) {
          signalToExecute = {
            ...signalToExecute,
            plan: { ...signalToExecute.plan, stop: aiDecision.adjustedStop }
          };
          console.log(`[AI-FILTER] Adjusted stop: $${aiDecision.adjustedStop}`);
        }
        if (aiDecision.adjustedTarget) {
          signalToExecute = {
            ...signalToExecute,
            plan: { ...signalToExecute.plan, targets: [aiDecision.adjustedTarget, ...signalToExecute.plan.targets.slice(1)] }
          };
          console.log(`[AI-FILTER] Adjusted target: $${aiDecision.adjustedTarget}`);
        }
        
        executionType = 'ai-approved';
      }
    }
    
    // Check if this is a trap fade candidate (only if not using AI filter)
    if (!isAIFilterEnabled() && isTrapFadeCandidate(signal)) {
      signalToExecute = createFadeSignal(signal);
      executionType = 'trap-fade';
      console.log(`[AUTO-EXEC] Creating trap fade trade (opposite direction) for ${signal.pattern.name} on ${signal.symbol}`);
    } else if (!isAIFilterEnabled()) {
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
        console.log(`[DEBUG] Found ${detectedSignals.length} signals to process`);
        detectedSignals.forEach(async (signal) => {
          try {
            console.log(`[DEBUG] Processing signal: ${signal.symbol} ${signal.pattern.name} score=${signal.score}`);
            signals.push(signal);
            
            // Check for auto-execution
            console.log(`[DEBUG] About to call shouldAutoExecute for ${signal.symbol}`);
            const shouldExec = shouldAutoExecute(signal);
            console.log(`[DEBUG] shouldAutoExecute returned: ${shouldExec}`);
            if (shouldExec) {
              await executeSignalAutomatically(signal);
            }
            
            // Broadcast the comprehensive signal
            console.log(`[WEBSOCKET] Broadcasting signal for ${signal.symbol} with ID: ${signal.id}`);
            broadcast({ type: 'signal', payload: signal });
            
            console.log(`🚨 ${signal.pattern.name} detected for ${signal.symbol} (score: ${signal.score}) - ${signal.plan.direction.toUpperCase()}`);
            console.log(`   Entry: $${signal.plan.entry}, Stop: $${signal.plan.stop}, Targets: $${signal.plan.targets.join(', $')}`);
          } catch (err) {
            console.error(`[ERROR] Failed to process signal ${signal.symbol}:`, err);
          }
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