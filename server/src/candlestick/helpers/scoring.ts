import { Candle } from '../types/index.js';
import { PatternDetails, MarketContext, TradingParameters } from '../types/comprehensive.js';
import { calculateATR, calculateSMA } from './preprocessing.js';
import { detectTraps, calculateTrapPenalty } from './trapDetection.js';

export function scorePattern(
  pattern: PatternDetails,
  context: MarketContext,
  candles: Candle[],
  params: TradingParameters
): { score: number, notes: string[] } {
  let score = 0;
  const notes: string[] = [];
  
  console.log(`[SCORING] Scoring pattern: ${pattern.name} (${pattern.class}, ${pattern.direction})`);
  
  // Base score by pattern type (V12 BOOSTED)
  if (pattern.class === 'triple') {
    score += 85; // Was 45
    notes.push('Triple candle pattern (strongest)');
    console.log(`[SCORING] Base score +85 (triple pattern), total: ${score}`);
  } else if (pattern.class === 'double') {
    score += 75; // Was 35
    notes.push('Double candle pattern');
    console.log(`[SCORING] Base score +75 (double pattern), total: ${score}`);
  } else {
    score += 65; // Was 25
    notes.push('Single candle pattern');
    console.log(`[SCORING] Base score +65 (single pattern), total: ${score}`);
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
  
  // Trend Alignment Logic
  if (isTrendAligned(pattern, context)) {
    score += 20;
    notes.push('Trend-aligned setup (higher probability)');
    if (isStrongMomentum(context)) {
      score += 10;
      notes.push('Strong momentum confirmation');
    }
  }
  
  /* V12: DISABLING MA SLOPE PENALTIES
     Reversals often happen against the slope.
  // MA Slope Scoring Logic - Sniper Precision
  if (pattern.direction === 'bullish') {
    if (context.maSlope > 5) {
      score += 15;
      notes.push('Strong positive trend slope');
    } else if (context.maSlope < 1) {
      score -= 20;
      notes.push('⚠️ Bullish signal in weak/declining slope');
    }
  } else if (pattern.direction === 'bearish') {
    if (context.maSlope < -5) {
      score += 15;
      notes.push('Strong negative trend slope');
    } else if (context.maSlope > -1) {
      score -= 20;
      notes.push('⚠️ Bearish signal in weak/rising slope');
    }
  }
  */
  
  /* V12 HIGH OCTANE: DISABLING SCORING PENALTIES
     We want raw pattern detection. Context filtering happens later in AI Filter (if enabled).
     
  // Counter-trend Penalty
  if (isCounterTrend(pattern, context)) {
    const penalty = 20;
    score -= penalty;
    notes.push('⚠️ Counter-trend setup - increased fail risk');
    console.log(`[SCORING] Counter-trend penalty -${penalty}`);
  }
  
  // Penalize patterns in sideways markets (choppy conditions) - NO EXEMPTIONS
  if (context.trend === 'sideways') {
    const penalty = 20;
    score -= penalty;
    notes.push('⚠️ Sideways market - increased false signal risk');
    console.log(`[SCORING] Sideways market penalty -${penalty}`);
  }
  */
  
  // REMOVED: Counter-trend penalty was wrong for reversal patterns
  // Reversal patterns are SUPPOSED to go against trend - that's their purpose
  
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
  // TRAP DETECTION - Check for potential market traps
  const trapWarnings = detectTraps(pattern, context, candles, params);
  const { totalPenalty, warningMessage } = calculateTrapPenalty(trapWarnings);
  
  if (totalPenalty > 0) {
    score -= totalPenalty;
    notes.push(`Trap penalty: -${totalPenalty}`);
    if (warningMessage) {
      notes.push(warningMessage);
    }
    console.log(`[SCORING] Trap detection applied -${totalPenalty} penalty: ${warningMessage}`);
  }
  
  // Log individual trap warnings
  trapWarnings.forEach(warning => {
    console.log(`[TRAP] ${warning.severity.toUpperCase()}: ${warning.description} (-${warning.penaltyPoints})`);
  });
  
  score = Math.min(100, Math.max(0, score));
  
  console.log(`[SCORING] Final score for ${pattern.name}: ${score}${totalPenalty > 0 ? ` (after -${totalPenalty} trap penalty)` : ''}`);
  console.log(`[SCORING] Notes: ${notes.join(', ')}`);
  
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
  // ALL patterns should go WITH the trend for higher probability
  // This aligns scoring with the execution filter which only allows trend-aligned trades
  if (pattern.direction === 'bullish') {
    return context.trend === 'up';
  } else if (pattern.direction === 'bearish') {
    return context.trend === 'down';
  }
  
  // neutral patterns
  return false;
}

function isCounterTrend(pattern: PatternDetails, context: MarketContext): boolean {
  // Don't penalize in sideways markets
  if (context.trend === 'sideways') {
    return false;
  }
  
  // Penalize bullish patterns in strong down trends
  if (pattern.direction === 'bullish' && context.trend === 'down') {
    return true;
  }
  
  // Penalize bearish patterns in strong up trends  
  if (pattern.direction === 'bearish' && context.trend === 'up') {
    return true;
  }
  
  return false;
}

function isStrongMomentum(context: MarketContext): boolean {
  if (context.trend === 'sideways') return false;
  if (!context.isHighVolume) return false;
  if (context.volumeFactor < 1.5) return false;
  return true;
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
  return 92;  // BASELINE threshold restored.
}

export function getWatchThreshold(): number {
  return 65;  // High quality signals that are candidates for closer inspection
}

export function classifySignalStrength(score: number): 'actionable' | 'watch' | 'ignore' {
  if (score >= getActionableThreshold()) return 'actionable';
  if (score >= getWatchThreshold()) return 'watch';
  return 'ignore';
}