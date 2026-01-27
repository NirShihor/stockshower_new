// @ts-nocheck
import { Candle } from '../types/index.js';
import { MarketContext } from '../types/comprehensive.js';
import { VolumeBreakoutStrategy } from '../../backtesting/strategies/volumeBreakoutStrategy.js';
import { ComprehensiveSignal } from '../types/comprehensive.js';

export function detectVolumeBreakout(
  candles: Candle[],
  context: MarketContext,
  symbol: string
): ComprehensiveSignal | null {
  if (candles.length < 20) return null;
  
  const strategy = new VolumeBreakoutStrategy({
    volumeMultiplier: 2.0,
    priceBreakoutPercent: 0.5,
    lookbackPeriods: 20,
    minATRMove: 0.5,
    requireTrendConfirmation: false
  });
  
  const currentCandle = candles[candles.length - 1];
  const recentCandles = candles.slice(-20);
  
  // Create a basic signal structure for analysis
  const signal: ComprehensiveSignal = {
    id: `${symbol}-vol-${Date.now()}`,
    symbol,
    timestamp: new Date(currentCandle.timestamp),
    candle: currentCandle,
    pattern: {
      name: 'Pending',
      direction: 'bullish',
      reliability: 0,
      candleCount: 1
    },
    context,
    score: 0,
    plan: {
      direction: 'long',
      entry: 0,
      stop: 0,
      risk: 0,
      targets: [],
      positionQty: 0,
      riskRewardRatio: '1:2'
    },
    confidence: {
      pattern: 0,
      context: 0,
      overall: 0
    }
  };
  
  // Check for breakout
  const breakoutInfo = strategy.isVolumeBreakout(signal, recentCandles);
  
  if (breakoutInfo.isBreakout && breakoutInfo.strength >= 60) {
    // Validate quality
    const validation = strategy.validateBreakoutQuality(signal, recentCandles);
    
    if (validation.isValid) {
      // Create proper breakout signal
      return strategy.createBreakoutSignal(signal, breakoutInfo);
    }
  }
  
  return null;
}