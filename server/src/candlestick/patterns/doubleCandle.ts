import { Candle } from '../types/index.js';
import { PatternDetails, TradingParameters } from '../types/comprehensive.js';
import { calculateCandleMetrics } from '../helpers/preprocessing.js';

export function detectBullishEngulfing(
  prevCandle: Candle,
  currCandle: Candle,
  params: TradingParameters
): PatternDetails | null {
  const prevMetrics = calculateCandleMetrics(prevCandle);
  const currMetrics = calculateCandleMetrics(currCandle);
  
  const tolerance = Math.abs(prevCandle.close - prevCandle.open) * 0.01; // 1% tolerance
  
  if (
    prevMetrics.isBearish &&
    currMetrics.isBullish &&
    currCandle.open <= prevCandle.close + tolerance &&
    currCandle.close >= prevCandle.open - tolerance &&
    currMetrics.body > prevMetrics.body * 0.95 // Allow slightly smaller body
  ) {
    return {
      name: 'Bullish Engulfing',
      class: 'double',
      direction: 'bullish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectBearishEngulfing(
  prevCandle: Candle,
  currCandle: Candle,
  params: TradingParameters
): PatternDetails | null {
  const prevMetrics = calculateCandleMetrics(prevCandle);
  const currMetrics = calculateCandleMetrics(currCandle);
  
  const tolerance = Math.abs(prevCandle.close - prevCandle.open) * 0.01; // 1% tolerance
  
  if (
    prevMetrics.isBullish &&
    currMetrics.isBearish &&
    currCandle.open >= prevCandle.close - tolerance &&
    currCandle.close <= prevCandle.open + tolerance &&
    currMetrics.body > prevMetrics.body * 0.95 // Allow slightly smaller body
  ) {
    return {
      name: 'Bearish Engulfing',
      class: 'double',
      direction: 'bearish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectTweezerTop(
  prevCandle: Candle,
  currCandle: Candle,
  atr: number,
  params: TradingParameters
): PatternDetails | null {
  const tolerance = 0.2 * atr;
  
  if (Math.abs(currCandle.high - prevCandle.high) <= tolerance) {
    return {
      name: 'Tweezer Top',
      class: 'double',
      direction: 'bearish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectTweezerBottom(
  prevCandle: Candle,
  currCandle: Candle,
  atr: number,
  params: TradingParameters
): PatternDetails | null {
  const tolerance = 0.2 * atr;
  
  if (Math.abs(currCandle.low - prevCandle.low) <= tolerance) {
    return {
      name: 'Tweezer Bottom',
      class: 'double',
      direction: 'bullish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectPiercing(
  prevCandle: Candle,
  currCandle: Candle,
  params: TradingParameters
): PatternDetails | null {
  const prevMetrics = calculateCandleMetrics(prevCandle);
  const currMetrics = calculateCandleMetrics(currCandle);
  
  const prevMidpoint = (prevCandle.open + prevCandle.close) / 2;
  
  if (
    prevMetrics.isBearish &&
    currMetrics.isBullish &&
    currCandle.open <= prevCandle.low &&
    currCandle.close > prevMidpoint &&
    currCandle.close < prevCandle.open
  ) {
    return {
      name: 'Piercing Line',
      class: 'double',
      direction: 'bullish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectDarkCloudCover(
  prevCandle: Candle,
  currCandle: Candle,
  params: TradingParameters
): PatternDetails | null {
  const prevMetrics = calculateCandleMetrics(prevCandle);
  const currMetrics = calculateCandleMetrics(currCandle);
  
  const prevMidpoint = (prevCandle.open + prevCandle.close) / 2;
  
  if (
    prevMetrics.isBullish &&
    currMetrics.isBearish &&
    currCandle.open >= prevCandle.high &&
    currCandle.close < prevMidpoint &&
    currCandle.close > prevCandle.open
  ) {
    return {
      name: 'Dark Cloud Cover',
      class: 'double',
      direction: 'bearish',
      barsInvolved: 2,
      patternHigh: Math.max(prevCandle.high, currCandle.high),
      patternLow: Math.min(prevCandle.low, currCandle.low)
    };
  }
  
  return null;
}

export function detectDoubleCandlePatterns(
  prevCandle: Candle,
  currCandle: Candle,
  params: TradingParameters,
  atr: number
): PatternDetails[] {
  const patterns: PatternDetails[] = [];
  
  // Check for Engulfing patterns
  const bullishEngulfing = detectBullishEngulfing(prevCandle, currCandle, params);
  if (bullishEngulfing) patterns.push(bullishEngulfing);
  
  const bearishEngulfing = detectBearishEngulfing(prevCandle, currCandle, params);
  if (bearishEngulfing) patterns.push(bearishEngulfing);
  
  // Check for Tweezer patterns
  const tweezerTop = detectTweezerTop(prevCandle, currCandle, atr, params);
  if (tweezerTop) patterns.push(tweezerTop);
  
  const tweezerBottom = detectTweezerBottom(prevCandle, currCandle, atr, params);
  if (tweezerBottom) patterns.push(tweezerBottom);
  
  // Check for Piercing/Dark Cloud
  const piercing = detectPiercing(prevCandle, currCandle, params);
  if (piercing) patterns.push(piercing);
  
  const darkCloud = detectDarkCloudCover(prevCandle, currCandle, params);
  if (darkCloud) patterns.push(darkCloud);
  
  return patterns;
}