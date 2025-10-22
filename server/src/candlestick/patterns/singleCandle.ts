import { Candle } from '../types/index.js';
import { CandleMetrics, PatternDetails, TradingParameters } from '../types/comprehensive.js';
import { calculateCandleMetrics } from '../helpers/preprocessing.js';

export function detectDoji(
  candle: Candle, 
  metrics: CandleMetrics,
  params: TradingParameters
): PatternDetails | null {
  if (metrics.bodyPctOfRange <= params.dojiBodyPctMax && (candle.high - candle.low) > 0) {
    return {
      name: 'Doji',
      class: 'single',
      direction: 'neutral',
      barsInvolved: 1,
      patternHigh: candle.high,
      patternLow: candle.low
    };
  }
  return null;
}

export function detectHammer(
  candle: Candle,
  metrics: CandleMetrics,
  params: TradingParameters,
  inDowntrend: boolean = false
): PatternDetails | null {
  if (
    metrics.lowerWickPctOfRange >= params.longWickPctMin &&
    metrics.upperWickPctOfRange <= (1 - params.longWickPctMin) &&
    metrics.closePos >= 0.45 &&
    metrics.bodyPctOfRange >= 0.08
  ) {
    return {
      name: inDowntrend ? 'Hammer' : 'Hanging Man',
      class: 'single', 
      direction: inDowntrend ? 'bullish' : 'bearish',
      barsInvolved: 1,
      patternHigh: candle.high,
      patternLow: candle.low
    };
  }
  return null;
}

export function detectInvertedHammer(
  candle: Candle,
  metrics: CandleMetrics,
  params: TradingParameters,
  inDowntrend: boolean = false
): PatternDetails | null {
  if (
    metrics.upperWickPctOfRange >= params.longWickPctMin &&
    metrics.lowerWickPctOfRange <= (1 - params.longWickPctMin) &&
    metrics.closePos >= 0.45
  ) {
    return {
      name: inDowntrend ? 'Inverted Hammer' : 'Shooting Star',
      class: 'single',
      direction: inDowntrend ? 'bullish' : 'bearish',
      barsInvolved: 1,
      patternHigh: candle.high,
      patternLow: candle.low
    };
  }
  return null;
}

export function detectShootingStar(
  candle: Candle,
  metrics: CandleMetrics,
  params: TradingParameters,
  inUptrend: boolean = false
): PatternDetails | null {
  if (
    metrics.upperWickPctOfRange >= params.longWickPctMin &&
    metrics.lowerWickPctOfRange <= (1 - params.longWickPctMin) &&
    metrics.closePos <= 0.55 &&
    inUptrend
  ) {
    return {
      name: 'Shooting Star',
      class: 'single',
      direction: 'bearish',
      barsInvolved: 1,
      patternHigh: candle.high,
      patternLow: candle.low
    };
  }
  return null;
}

export function detectMarubozu(
  candle: Candle,
  metrics: CandleMetrics,
  params: TradingParameters
): PatternDetails | null {
  if (
    metrics.upperWickPctOfRange <= params.marubozuWickPctMax &&
    metrics.lowerWickPctOfRange <= params.marubozuWickPctMax &&
    metrics.bodyPctOfRange >= 0.85
  ) {
    return {
      name: metrics.isBullish ? 'Bullish Marubozu' : 'Bearish Marubozu',
      class: 'single',
      direction: metrics.isBullish ? 'bullish' : 'bearish',
      barsInvolved: 1,
      patternHigh: candle.high,
      patternLow: candle.low
    };
  }
  return null;
}

export function detectSingleCandlePatterns(
  candle: Candle,
  prevCandle: Candle | null,
  params: TradingParameters,
  trend: 'up' | 'down' | 'sideways'
): PatternDetails[] {
  const metrics = calculateCandleMetrics(candle, prevCandle?.close);
  const patterns: PatternDetails[] = [];
  
  // Check for Doji
  const doji = detectDoji(candle, metrics, params);
  if (doji) patterns.push(doji);
  
  // Check for Hammer/Hanging Man
  const hammer = detectHammer(candle, metrics, params, trend === 'down');
  if (hammer && !doji) patterns.push(hammer); // Don't double-count if it's also a doji
  
  // Check for Inverted Hammer/Shooting Star
  const inverted = detectInvertedHammer(candle, metrics, params, trend === 'down');
  if (inverted) patterns.push(inverted);
  
  // Check for specific Shooting Star
  const shooting = detectShootingStar(candle, metrics, params, trend === 'up');
  if (shooting && !inverted) patterns.push(shooting);
  
  // Check for Marubozu
  const marubozu = detectMarubozu(candle, metrics, params);
  if (marubozu) patterns.push(marubozu);
  
  return patterns;
}