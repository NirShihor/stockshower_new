import { Signal, Candle } from '../candlestick/types/index.js';

export interface OrderSuggestion {
  type: 'BUY_STOP' | 'SELL_STOP' | 'BUY_LIMIT' | 'SELL_LIMIT';
  price: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: string;
  comment: string;
}

function calculateMinimumDistance(price: number): number {
  // MT5-compatible minimum distances
  // These are conservative estimates - adjust based on your broker's specs
  if (price < 10) return 0.20;      // 20 cents minimum for low-priced stocks
  if (price < 50) return 0.50;      // 50 cents for mid-range
  if (price < 100) return 1.00;     // $1.00 for higher priced
  if (price < 500) return 2.00;     // $2.00 for expensive stocks  
  return Math.max(5.00, price * 0.01); // $5 or 1% for very expensive stocks
}

export function generateOrderSuggestion(signal: Signal): OrderSuggestion {
  const { type, meta } = signal;
  
  if (!meta) {
    throw new Error('Signal meta data required for order suggestion');
  }
  
  const { open, close, prevOpen, prevClose } = meta;
  const currentPrice = close!;
  const minDistance = calculateMinimumDistance(currentPrice);
  
  if (type === 'bullish_engulfing') {
    const patternHigh = Math.max(open!, close!, prevOpen!, prevClose!);
    const patternLow = Math.min(open!, close!, prevOpen!, prevClose!);
    const patternRange = patternHigh - patternLow;
    
    // For BUY_LIMIT: price must be BELOW current Ask (to fill immediately)
    // Add buffer to ensure execution
    const entryPrice = currentPrice - (minDistance * 0.5); // Slightly below current price
    
    // Stop loss below pattern low with proper MT5 distance
    const stopLossDistance = Math.max(minDistance * 2, patternRange * 0.2);
    const stopLoss = patternLow - stopLossDistance;
    
    // Take profit with proper MT5 distance from entry
    const risk = entryPrice - stopLoss;
    const takeProfit = entryPrice + (risk * 2);
    
    // Ensure take profit respects minimum distance
    const tpDistance = takeProfit - entryPrice;
    const adjustedTakeProfit = tpDistance < minDistance ? 
      entryPrice + minDistance * 3 : takeProfit;
    
    return {
      type: 'BUY_LIMIT',
      price: Number(entryPrice.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      takeProfit: Number(adjustedTakeProfit.toFixed(2)),
      riskRewardRatio: '1:2',
      comment: 'Bullish engulfing - BUY_LIMIT below market for immediate fill'
    };
  }
  
  if (type === 'bearish_engulfing') {
    const patternHigh = Math.max(open!, close!, prevOpen!, prevClose!);
    const patternLow = Math.min(open!, close!, prevOpen!, prevClose!);
    const patternRange = patternHigh - patternLow;
    
    // For SELL_LIMIT: price must be ABOVE current Bid (to fill immediately)
    // Add proper MT5 buffer above Ask
    const entryPrice = currentPrice + minDistance; // Above current price + minimum distance
    
    // Stop loss above pattern high with proper MT5 distance
    const stopLossDistance = Math.max(minDistance * 2, patternRange * 0.2);
    const stopLoss = patternHigh + stopLossDistance;
    
    // Take profit with proper MT5 distance from entry
    const risk = stopLoss - entryPrice;
    const takeProfit = entryPrice - (risk * 2);
    
    // Ensure take profit respects minimum distance
    const tpDistance = entryPrice - takeProfit;
    const adjustedTakeProfit = tpDistance < minDistance ? 
      entryPrice - minDistance * 3 : takeProfit;
    
    return {
      type: 'SELL_LIMIT',
      price: Number(entryPrice.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      takeProfit: Number(adjustedTakeProfit.toFixed(2)),
      riskRewardRatio: '1:2',
      comment: 'Bearish engulfing - SELL_LIMIT above market for immediate fill'
    };
  }
  
  // Fallback for other patterns
  throw new Error(`No order suggestion available for pattern type: ${type}`);
}