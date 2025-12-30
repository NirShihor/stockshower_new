import { Candle } from '../types/index.js';
import { MarketContext, SupportResistanceLevel, TradingParameters } from '../types/comprehensive.js';
import { calculateATR, calculateVolumeMA, isHighVolumeBar, isWideRangeBar } from './preprocessing.js';

export function detectTrend(candles: Candle[], fastMA: number, slowMA: number): 'up' | 'down' | 'sideways' {
  // Use what we have, minimum 3 candles
  if (candles.length < 5) return 'sideways';
  
  const fastMAValue = calculateMA(candles.map(c => c.close), fastMA);
  const slowMAValue = calculateMA(candles.map(c => c.close), slowMA);
  
  const currentPrice = candles[candles.length - 1].close;
  const priceAboveBoth = currentPrice > fastMAValue && currentPrice > slowMAValue;
  const priceBelowBoth = currentPrice < fastMAValue && currentPrice < slowMAValue;
  const fastAboveSlow = fastMAValue > slowMAValue;
  
  // Calculate slope for momentum confirmation
  const slope = calculateMASlope(candles.map(c => c.close), fastMA);
  
  if (priceAboveBoth && fastAboveSlow && slope > 2) return 'up'; // Require at least 2 bps slope for 'up'
  if (priceBelowBoth && !fastAboveSlow && slope < -2) return 'down'; // Require at least -2 bps slope for 'down'
  
  return 'sideways';
}

function calculateMASlope(values: number[], period: number): number {
  if (values.length < period + 5) return 0;
  
  const currentMA = calculateMA(values, period);
  const prevMA = calculateMA(values.slice(0, -1), period);
  
  if (currentMA === 0) return 0;
  
  // Return slope in basis points (1 bp = 0.01%)
  return ((currentMA - prevMA) / currentMA) * 10000;
}

export function findSwingPoints(candles: Candle[], lookback: number = 5): { highs: number[], lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  
  if (candles.length < lookback * 2 + 1) return { highs, lows };
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;
    
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isSwingHigh = false;
      if (candles[j].low <= candles[i].low) isSwingLow = false;
    }
    
    if (isSwingHigh) highs.push(candles[i].high);
    if (isSwingLow) lows.push(candles[i].low);
  }
  
  return { highs, lows };
}

export function detectSupportResistance(
  candles: Candle[], 
  params: TradingParameters
): SupportResistanceLevel[] {
  // Use minimum 10 candles instead of full lookback
  if (candles.length < 10) return [];
  
  const recentCandles = candles.slice(-params.srLookback);
  const { highs, lows } = findSwingPoints(recentCandles);
  const atr = calculateATR(candles, params.atrLen);
  const tolerance = atr * params.srToleranceATR;
  
  const levels: SupportResistanceLevel[] = [];
  
  // Process swing highs as resistance
  const mergedHighs = mergeLevels(highs, tolerance);
  mergedHighs.forEach(level => {
    levels.push({
      price: level.price,
      strength: level.count,
      type: 'resistance',
      touches: level.count
    });
  });
  
  // Process swing lows as support
  const mergedLows = mergeLevels(lows, tolerance);
  mergedLows.forEach(level => {
    levels.push({
      price: level.price,
      strength: level.count,
      type: 'support',
      touches: level.count
    });
  });
  
  return levels.sort((a, b) => b.price - a.price);
}

function mergeLevels(prices: number[], tolerance: number): { price: number, count: number }[] {
  if (prices.length === 0) return [];
  
  const sorted = [...prices].sort((a, b) => a - b);
  const merged: { price: number, count: number }[] = [];
  
  let currentGroup = [sorted[0]];
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - currentGroup[currentGroup.length - 1] <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      const avgPrice = currentGroup.reduce((sum, p) => sum + p, 0) / currentGroup.length;
      merged.push({ price: avgPrice, count: currentGroup.length });
      currentGroup = [sorted[i]];
    }
  }
  
  if (currentGroup.length > 0) {
    const avgPrice = currentGroup.reduce((sum, p) => sum + p, 0) / currentGroup.length;
    merged.push({ price: avgPrice, count: currentGroup.length });
  }
  
  return merged;
}

export function isNearLevel(
  price: number, 
  levels: SupportResistanceLevel[], 
  atr: number, 
  toleranceMultiplier: number
): { near: boolean, level?: SupportResistanceLevel } {
  const tolerance = atr * toleranceMultiplier;
  
  for (const level of levels) {
    if (Math.abs(price - level.price) <= tolerance) {
      return { near: true, level };
    }
  }
  
  return { near: false };
}

export function buildMarketContext(
  candles: Candle[],
  params: TradingParameters,
  h1Trend?: 'up' | 'down' | 'sideways'
): MarketContext {
  const current = candles[candles.length - 1];
  const atr = calculateATR(candles, params.atrLen);
  const volumeMA = calculateVolumeMA(candles, Math.min(20, candles.length));
  const volumeFactor = current.volume ? current.volume / volumeMA : 0;
  
  const trend = detectTrend(candles, params.maFast, params.maSlow);
  const maSlope = calculateMASlope(candles.map(c => c.close), params.maFast);
  const srLevels = detectSupportResistance(candles, params);
  
  // V5 Delta: Dynamic Polarity (Role Reversal)
  // Any verified level BELOW current price acts as Support (Old Resistance becomes Support).
  // Any verified level ABOVE current price acts as Resistance (Old Support becomes Resistance).
  const supportLevels = srLevels.filter(l => l.price < current.close);
  const resistanceLevels = srLevels.filter(l => l.price > current.close);
  
  // V5 Gamma: Widened to 1.0 ATR (Standard Zone) to maximize volume.
  const nearSupport = isNearLevel(current.low, supportLevels, atr, 1.0); 
  const nearResistance = isNearLevel(current.high, resistanceLevels, atr, 1.0); 
  
  return {
    trend,
    atSupport: nearSupport.near,
    atResistance: nearResistance.near,
    nearestSupport: nearSupport.level?.price || supportLevels[0]?.price, // Prefer touched level
    nearestResistance: nearResistance.level?.price || resistanceLevels[0]?.price, // Prefer touched level
    atr,
    volumeFactor,
    isHighVolume: isHighVolumeBar(current, volumeMA, params.volSpikeFactor),
    isWideRange: isWideRangeBar(current, atr),
    maSlope,
    h1Trend
  };
}

function calculateMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  // Use available data if less than full period
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((sum, val) => sum + val, 0) / slice.length;
}