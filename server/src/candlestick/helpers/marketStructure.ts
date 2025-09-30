import { Candle } from '../types/index.js';
import { MarketContext, SupportResistanceLevel, TradingParameters } from '../types/comprehensive.js';
import { calculateATR, calculateVolumeMA, isHighVolumeBar, isWideRangeBar } from './preprocessing.js';

export function detectTrend(candles: Candle[], fastMA: number, slowMA: number): 'up' | 'down' | 'sideways' {
  if (candles.length < Math.max(fastMA, slowMA)) return 'sideways';
  
  const fastMAValue = calculateMA(candles.map(c => c.close), fastMA);
  const slowMAValue = calculateMA(candles.map(c => c.close), slowMA);
  
  const currentPrice = candles[candles.length - 1].close;
  const priceAboveBoth = currentPrice > fastMAValue && currentPrice > slowMAValue;
  const priceBelowBoth = currentPrice < fastMAValue && currentPrice < slowMAValue;
  const fastAboveSlow = fastMAValue > slowMAValue;
  
  if (priceAboveBoth && fastAboveSlow) return 'up';
  if (priceBelowBoth && !fastAboveSlow) return 'down';
  
  return 'sideways';
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
  if (candles.length < params.srLookback) return [];
  
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
  params: TradingParameters
): MarketContext {
  const current = candles[candles.length - 1];
  const atr = calculateATR(candles, params.atrLen);
  const volumeMA = calculateVolumeMA(candles, 20);
  const volumeFactor = current.volume ? current.volume / volumeMA : 0;
  
  const trend = detectTrend(candles, params.maFast, params.maSlow);
  const srLevels = detectSupportResistance(candles, params);
  
  const supportLevels = srLevels.filter(l => l.type === 'support' && l.price < current.close);
  const resistanceLevels = srLevels.filter(l => l.type === 'resistance' && l.price > current.close);
  
  const nearSupport = isNearLevel(current.low, supportLevels, atr, params.srToleranceATR);
  const nearResistance = isNearLevel(current.high, resistanceLevels, atr, params.srToleranceATR);
  
  return {
    trend,
    atSupport: nearSupport.near,
    atResistance: nearResistance.near,
    nearestSupport: supportLevels[0]?.price,
    nearestResistance: resistanceLevels[0]?.price,
    atr,
    volumeFactor,
    isHighVolume: isHighVolumeBar(current, volumeMA, params.volSpikeFactor),
    isWideRange: isWideRangeBar(current, atr)
  };
}

function calculateMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}