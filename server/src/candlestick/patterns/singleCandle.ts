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
  const patterns: PatternDetails[] = [];
  const metrics = calculateCandleMetrics(candle);
  const inDowntrend = trend === 'down';
  const inUptrend = trend === 'up';

  // V12 HIGH OCTANE: Enabling Single Candle Patterns
  
  // Shooting Star (Bearish Reversal at Top)
  const invertedHammerOrStar = detectInvertedHammer(candle, metrics, params, inDowntrend);
  if (invertedHammerOrStar && invertedHammerOrStar.name === 'Shooting Star') {
    patterns.push(invertedHammerOrStar);
  }

  // Hammer / Hanging Man
  const hammerOrHanging = detectHammer(candle, metrics, params, inDowntrend);
  if (hammerOrHanging) {
    // Only Hanging Man is bearish (Short), but usually weaker.
    // We'll allow it for now and let AI filter decide, or just push it.
    patterns.push(hammerOrHanging);
  }

  // Doji (Neutral/Reversal)
  const doji = detectDoji(candle, metrics, params);
  if (doji) patterns.push(doji);

  return patterns;
}