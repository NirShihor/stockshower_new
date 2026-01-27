import { Candle } from '../types/index.js';
import { PatternDetails, TradingParameters } from '../types/comprehensive.js';
import { calculateCandleMetrics } from '../helpers/preprocessing.js';

export function detectMorningStar(
  candle1: Candle, // First candle (bearish)
  candle2: Candle, // Middle candle (small/doji)
  candle3: Candle, // Third candle (bullish)
  params: TradingParameters,
  atr: number
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  const midpointCandle1 = (candle1.open + candle1.close) / 2;
  const hasGap = candle2.open < candle1.close - (params.starGapMinPctATR * atr);
  const pseudoGap = candle2.open < candle1.close && metrics2.bodyPctOfRange <= params.dojiBodyPctMax;
  
  if (
    // First candle is long bearish
    metrics1.isBearish &&
    metrics1.bodyPctOfRange >= params.minBodyPct &&
    
    // Second candle is small body (star)
    metrics2.bodyPctOfRange <= params.dojiBodyPctMax &&
    
    // Third candle is long bullish
    metrics3.isBullish &&
    candle3.close >= midpointCandle1 &&
    
    // Gap or pseudo-gap
    (hasGap || pseudoGap)
  ) {
    return {
      name: 'Morning Star',
      class: 'triple',
      direction: 'bullish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectEveningStar(
  candle1: Candle, // First candle (bullish)
  candle2: Candle, // Middle candle (small/doji)
  candle3: Candle, // Third candle (bearish)
  params: TradingParameters,
  atr: number
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  const midpointCandle1 = (candle1.open + candle1.close) / 2;
  const hasGap = candle2.open > candle1.close + (params.starGapMinPctATR * atr);
  const pseudoGap = candle2.open > candle1.close && metrics2.bodyPctOfRange <= params.dojiBodyPctMax;
  
  if (
    // First candle is long bullish
    metrics1.isBullish &&
    metrics1.bodyPctOfRange >= params.minBodyPct &&
    
    // Second candle is small body (star)
    metrics2.bodyPctOfRange <= params.dojiBodyPctMax &&
    
    // Third candle is long bearish
    metrics3.isBearish &&
    candle3.close <= midpointCandle1 &&
    
    // Gap or pseudo-gap
    (hasGap || pseudoGap)
  ) {
    return {
      name: 'Evening Star',
      class: 'triple',
      direction: 'bearish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectThreeWhiteSoldiers(
  candle1: Candle,
  candle2: Candle,
  candle3: Candle,
  params: TradingParameters
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  if (
    // All three candles are bullish
    metrics1.isBullish && metrics2.isBullish && metrics3.isBullish &&
    
    // Each close is near the high (strong closes)
    metrics1.closePos >= 0.55 && metrics2.closePos >= 0.55 && metrics3.closePos >= 0.55 &&
    
    // Progressive higher closes
    candle2.close > candle1.close && candle3.close > candle2.close &&
    
    // Each candle opens within the previous body
    candle2.open >= candle1.open && candle2.open <= candle1.close &&
    candle3.open >= candle2.open && candle3.open <= candle2.close
  ) {
    return {
      name: 'Three White Soldiers',
      class: 'triple',
      direction: 'bullish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectThreeBlackCrows(
  candle1: Candle,
  candle2: Candle,
  candle3: Candle,
  params: TradingParameters
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  if (
    // All three candles are bearish
    metrics1.isBearish && metrics2.isBearish && metrics3.isBearish &&
    
    // Each close is near the low (strong closes)
    metrics1.closePos <= 0.45 && metrics2.closePos <= 0.45 && metrics3.closePos <= 0.45 &&
    
    // Progressive lower closes
    candle2.close < candle1.close && candle3.close < candle2.close &&
    
    // Each candle opens within the previous body
    candle2.open <= candle1.open && candle2.open >= candle1.close &&
    candle3.open <= candle2.open && candle3.open >= candle2.close
  ) {
    return {
      name: 'Three Black Crows',
      class: 'triple',
      direction: 'bearish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectThreeInsideUp(
  candle1: Candle,
  candle2: Candle,
  candle3: Candle,
  params: TradingParameters
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  // First check if candles 1 and 2 form a bullish engulfing or inside pattern
  const isInside = metrics1.isBearish && metrics2.isBullish &&
                   candle2.high <= candle1.high && candle2.low >= candle1.low;
  
  if (
    isInside &&
    metrics3.isBullish &&
    candle3.close > candle2.close
  ) {
    return {
      name: 'Three Inside Up',
      class: 'triple',
      direction: 'bullish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectThreeInsideDown(
  candle1: Candle,
  candle2: Candle,
  candle3: Candle,
  params: TradingParameters
): PatternDetails | null {
  const metrics1 = calculateCandleMetrics(candle1);
  const metrics2 = calculateCandleMetrics(candle2);
  const metrics3 = calculateCandleMetrics(candle3);
  
  // First check if candles 1 and 2 form a bearish engulfing or inside pattern
  const isInside = metrics1.isBullish && metrics2.isBearish &&
                   candle2.high <= candle1.high && candle2.low >= candle1.low;
  
  if (
    isInside &&
    metrics3.isBearish &&
    candle3.close < candle2.close
  ) {
    return {
      name: 'Three Inside Down',
      class: 'triple',
      direction: 'bearish',
      barsInvolved: 3,
      patternHigh: Math.max(candle1.high, candle2.high, candle3.high),
      patternLow: Math.min(candle1.low, candle2.low, candle3.low)
    };
  }
  
  return null;
}

export function detectTripleCandlePatterns(
  candle1: Candle,
  candle2: Candle,
  candle3: Candle,
  params: TradingParameters,
  atr: number
): PatternDetails[] {
  const patterns: PatternDetails[] = [];
  
  // Check for Star patterns
  const morningStar = detectMorningStar(candle1, candle2, candle3, params, atr);
  if (morningStar) patterns.push(morningStar);
  
  // V4 BETA REFINEMENT: TOXIC PATTERN PURGE
  // Disabling Evening Star due to significant losses in V4 Alpha.
  
  // const eveningStar = detectEveningStar(candle1, candle2, candle3, params, atr);
  // if (eveningStar) patterns.push(eveningStar);
  
  // Check for Soldiers/Crows
  // const whiteSoldiers = detectThreeWhiteSoldiers(candle1, candle2, candle3, params);
  // if (whiteSoldiers) patterns.push(whiteSoldiers);
  
  // const blackCrows = detectThreeBlackCrows(candle1, candle2, candle3, params);
  // if (blackCrows) patterns.push(blackCrows);
  
  // Check for Inside patterns
  // const insideUp = detectThreeInsideUp(candle1, candle2, candle3, params);
  // if (insideUp) patterns.push(insideUp);
  
  // const insideDown = detectThreeInsideDown(candle1, candle2, candle3, params);
  // if (insideDown) patterns.push(insideDown);
  
  return patterns;
}