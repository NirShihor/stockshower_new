import { Candle, Signal } from '../types/index.js';

const historyBySymbol = new Map<string, Candle[]>();

// Simpler engulfing pattern without strict trend context
export function detectSimpleEngulfingPatterns(candle: Candle): Signal | null {
  const { symbol } = candle;
  
  if (!historyBySymbol.has(symbol)) {
    historyBySymbol.set(symbol, []);
  }
  
  const history = historyBySymbol.get(symbol)!;
  history.push(candle);
  
  if (history.length > 10) {
    history.shift();
  }
  
  if (history.length < 2) return null;
  
  const current = history[history.length - 1];
  const previous = history[history.length - 2];
  
  const isBearishPrevious = previous.close < previous.open;
  const isBullishPrevious = previous.close > previous.open;
  const isBearishCurrent = current.close < current.open;
  const isBullishCurrent = current.close > current.open;
  
  // Simpler engulfing check - just needs to be bigger
  const currentBodySize = Math.abs(current.close - current.open);
  const previousBodySize = Math.abs(previous.close - previous.open);
  const isLarger = currentBodySize > previousBodySize * 1.2; // 20% larger
  
  // Bullish engulfing (no trend requirement)
  if (isBearishPrevious && isBullishCurrent && isLarger) {
    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'simple_bullish_engulfing',
      symbol,
      timeframe: candle.timeframe,
      at: candle.end,
      meta: {
        prevOpen: previous.open,
        prevClose: previous.close,
        open: current.open,
        close: current.close,
        currentMove: (current.close - current.open).toFixed(2)
      }
    };
  }
  
  // Bearish engulfing (no trend requirement)
  if (isBullishPrevious && isBearishCurrent && isLarger) {
    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'simple_bearish_engulfing',
      symbol,
      timeframe: candle.timeframe,
      at: candle.end,
      meta: {
        prevOpen: previous.open,
        prevClose: previous.close,
        open: current.open,
        close: current.close,
        currentMove: (current.close - current.open).toFixed(2)
      }
    };
  }
  
  return null;
}