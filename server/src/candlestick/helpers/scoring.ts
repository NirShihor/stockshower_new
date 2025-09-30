import { Candle } from '../types/index.js';
import { PatternDetails, MarketContext, TradingParameters } from '../types/comprehensive.js';
import { calculateATR, calculateSMA } from './preprocessing.js';

export function scorePattern(
  pattern: PatternDetails,
  context: MarketContext,
  candles: Candle[],
  params: TradingParameters
): { score: number, notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  
  // Base score by pattern type
  if (pattern.class === 'triple') {
    score += 30;
    notes.push('Triple candle pattern (strongest)');
  } else if (pattern.class === 'double') {
    score += 22;
    notes.push('Double candle pattern');
  } else {
    score += 15;
    notes.push('Single candle pattern');
  }
  
  // Support/Resistance alignment
  if (isPatternAtSupportResistance(pattern, context)) {
    score += 20;
    notes.push(`Pattern at key ${pattern.direction === 'bullish' ? 'support' : 'resistance'} level`);
  }
  
  // Volume confirmation
  if (context.isHighVolume) {
    score += 15;
    notes.push(`Volume spike ${context.volumeFactor.toFixed(1)}x average`);
  }
  
  // Trend alignment (for reversal patterns)
  if (isTrendAligned(pattern, context)) {
    score += 15;
    notes.push('Trend context supports pattern');
  }
  
  // Wide range / significant candle
  if (context.isWideRange) {
    score += 10;
    notes.push('Wide range candle shows conviction');
  }
  
  // Body size significance
  const current = candles[candles.length - 1];
  const avgBody = calculateAvgBodySize(candles, 20);
  const currentBody = Math.abs(current.close - current.open);
  
  if (currentBody >= avgBody) {
    score += 10;
    notes.push('Above average body size');
  }
  
  // Clean risk/invalidation level
  if (hasCleanInvalidation(pattern, context)) {
    score += 10;
    notes.push('Clear invalidation level');
  }
  
  // Penalties
  
  // Pattern too close to opposing level
  if (isNearOpposingLevel(pattern, context)) {
    score -= 10;
    notes.push('Too close to opposing S/R level');
  }
  
  // Overextended from MA
  if (isOverextended(candles, context, params)) {
    score -= 10;
    notes.push('Price overextended from moving average');
  }
  
  // News spike without higher TF confirmation
  if (context.volumeFactor > 3 && context.isWideRange) {
    score -= 5;
    notes.push('Possible news spike - use caution');
  }
  
  // Cap at 100
  score = Math.min(100, Math.max(0, score));
  
  return { score, notes };
}

function isPatternAtSupportResistance(pattern: PatternDetails, context: MarketContext): boolean {
  if (pattern.direction === 'bullish') {
    return context.atSupport;
  } else if (pattern.direction === 'bearish') {
    return context.atResistance;
  }
  return false;
}

function isTrendAligned(pattern: PatternDetails, context: MarketContext): boolean {
  // Reversal patterns should appear against the trend
  if (pattern.direction === 'bullish') {
    return context.trend === 'down' || context.trend === 'sideways';
  } else if (pattern.direction === 'bearish') {
    return context.trend === 'up' || context.trend === 'sideways';
  }
  
  // For continuation patterns (Marubozu)
  if (pattern.name.includes('Marubozu')) {
    if (pattern.direction === 'bullish') {
      return context.trend === 'up';
    } else {
      return context.trend === 'down';
    }
  }
  
  return false;
}

function hasCleanInvalidation(pattern: PatternDetails, context: MarketContext): boolean {
  // Check if there's a clear level to place stops
  const range = pattern.patternHigh - pattern.patternLow;
  return range > context.atr * 0.5; // Pattern should be at least half ATR in size
}

function isNearOpposingLevel(pattern: PatternDetails, context: MarketContext): boolean {
  const tolerance = context.atr * 0.25;
  
  if (pattern.direction === 'bullish' && context.nearestResistance) {
    return Math.abs(pattern.patternHigh - context.nearestResistance) <= tolerance;
  }
  
  if (pattern.direction === 'bearish' && context.nearestSupport) {
    return Math.abs(pattern.patternLow - context.nearestSupport) <= tolerance;
  }
  
  return false;
}

function isOverextended(candles: Candle[], context: MarketContext, params: TradingParameters): boolean {
  if (candles.length < params.maFast) return false;
  
  const current = candles[candles.length - 1];
  const closes = candles.map(c => c.close);
  const ma = calculateSMA(closes, params.maFast);
  
  return Math.abs(current.close - ma) > 2 * context.atr;
}

function calculateAvgBodySize(candles: Candle[], period: number): number {
  const bodies = candles.slice(-period).map(c => Math.abs(c.close - c.open));
  return bodies.reduce((sum, body) => sum + body, 0) / bodies.length;
}

export function getActionableThreshold(): number {
  return 70;
}

export function getWatchThreshold(): number {
  return 50;
}

export function classifySignalStrength(score: number): 'actionable' | 'watch' | 'ignore' {
  if (score >= getActionableThreshold()) return 'actionable';
  if (score >= getWatchThreshold()) return 'watch';
  return 'ignore';
}