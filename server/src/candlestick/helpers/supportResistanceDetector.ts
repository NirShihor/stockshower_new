// @ts-nocheck
import { Candle } from '../types/index.js';
import { MarketContext } from '../types/comprehensive.js';
import { SupportResistanceBounceStrategy } from '../../backtesting/strategies/supportResistanceBounceStrategy.js';
import { ComprehensiveSignal } from '../types/comprehensive.js';

export function detectSupportResistanceBounce(
  candles: Candle[],
  context: MarketContext,
  symbol: string
): ComprehensiveSignal | null {
  if (candles.length < 50) return null;
  
  const strategy = new SupportResistanceBounceStrategy({
    lookbackPeriods: 50,
    touchTolerance: 0.002,
    minBounces: 3,
    volumeConfirmation: true,
    minRejectionWick: 0.6
  });
  
  const currentCandle = candles[candles.length - 1];
  const recentCandles = candles.slice(-20);
  
  // Identify S/R levels
  const levels = strategy.identifyLevels(candles);
  if (levels.length === 0) return null;
  
  // Create a basic signal structure for analysis
  const signal: ComprehensiveSignal = {
    id: `${symbol}-sr-${Date.now()}`,
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
  
  // Check for bounce
  const bounceInfo = strategy.isBounce(signal, levels, recentCandles);
  
  if (bounceInfo.isBounce && bounceInfo.level && bounceInfo.strength >= 60) {
    // Validate quality
    const validation = strategy.validateBounceQuality(signal, bounceInfo.level);
    
    if (validation.isValid) {
      // Create proper bounce signal
      return strategy.createBounceSignal(signal, {
        level: bounceInfo.level,
        direction: bounceInfo.direction!,
        strength: bounceInfo.strength
      });
    }
  }
  
  return null;
}