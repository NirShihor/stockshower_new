import { Candle, Signal } from '../types/index.js';
import { generateOrderSuggestion } from '../../handlers/orderSuggestions.js';

interface CandleHistory {
  symbol: string;
  candles: Candle[];
}

const historyBySymbol = new Map<string, CandleHistory>();

export function detectEngulfingPatterns(candle: Candle): Signal | null {
  const { symbol, open, close } = candle;
  
  // Initialize history if needed
  if (!historyBySymbol.has(symbol)) {
    historyBySymbol.set(symbol, { symbol, candles: [] });
  }
  
  const history = historyBySymbol.get(symbol)!;
  history.candles.push(candle);
  
  // Keep only last 50 candles for efficiency
  if (history.candles.length > 50) {
    history.candles.shift();
  }
  
  const n = history.candles.length;
  if (n < 2) return null;
  
  const current = history.candles[n - 1];
  const previous = history.candles[n - 2];
  
  // Check candle directions
  const isBearishPrevious = previous.close < previous.open;
  const isBullishPrevious = previous.close > previous.open;
  const isBearishCurrent = current.close < current.open;
  const isBullishCurrent = current.close > current.open;
  
  // Check if current candle engulfs the previous
  const engulfsBody = 
    Math.min(current.open, current.close) <= Math.min(previous.open, previous.close) &&
    Math.max(current.open, current.close) >= Math.max(previous.open, previous.close);
  
  // Analyze trend context
  const lookbackPeriod = 5;
  const slice = history.candles.slice(Math.max(0, n - 1 - lookbackPeriod), n - 1);
  
  // Calculate net move (sum of body movements)
  const netMove = slice.reduce((acc, c) => acc + (c.close - c.open), 0);
  
  // Count closes in each direction
  const lowerCloseCount = slice.filter((c, i, arr) => {
    if (i === 0) return false;
    return c.close < arr[i - 1].close;
  }).length;
  
  const higherCloseCount = slice.filter((c, i, arr) => {
    if (i === 0) return false;
    return c.close > arr[i - 1].close;
  }).length;
  
  // Determine trend contexts
  const bearishContext = netMove < 0 && lowerCloseCount >= Math.floor(lookbackPeriod / 2);
  const bullishContext = netMove > 0 && higherCloseCount >= Math.floor(lookbackPeriod / 2);
  
  // Check for bullish engulfing (appears after downtrend)
  if (isBearishPrevious && isBullishCurrent && engulfsBody && bearishContext) {
    const signal: Signal = {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'bullish_engulfing',
      symbol,
      timeframe: candle.timeframe,
      at: candle.end,
      meta: {
        prevOpen: previous.open,
        prevClose: previous.close,
        open: current.open,
        close: current.close,
        netMove: netMove.toFixed(2),
        currentMove: (current.close - current.open).toFixed(2),
        lowerCloseCount
      }
    };
    
    // Add order suggestion
    try {
      signal.orderSuggestion = generateOrderSuggestion(signal);
    } catch (error) {
      console.error('Failed to generate order suggestion:', error);
    }
    
    return signal;
  }
  
  // Check for bearish engulfing (appears after uptrend)
  if (isBullishPrevious && isBearishCurrent && engulfsBody && bullishContext) {
    const signal: Signal = {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'bearish_engulfing',
      symbol,
      timeframe: candle.timeframe,
      at: candle.end,
      meta: {
        prevOpen: previous.open,
        prevClose: previous.close,
        open: current.open,
        close: current.close,
        netMove: netMove.toFixed(2),
        currentMove: (current.close - current.open).toFixed(2),
        higherCloseCount
      }
    };
    
    // Add order suggestion
    try {
      signal.orderSuggestion = generateOrderSuggestion(signal);
    } catch (error) {
      console.error('Failed to generate order suggestion:', error);
    }
    
    return signal;
  }
  
  return null;
}

// Helper function to clear history (useful for cleanup)
export function clearHistory(symbol?: string) {
  if (symbol) {
    historyBySymbol.delete(symbol);
  } else {
    historyBySymbol.clear();
  }
}