import { Candle } from '../types/index.js';
import { CandleMetrics } from '../types/comprehensive.js';

export function calculateCandleMetrics(candle: Candle, prevClose?: number): CandleMetrics {
  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const range = candle.high - candle.low;
  
  const trueRange = prevClose 
    ? Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose)
      )
    : candle.high - candle.low;

  return {
    body,
    upperWick,
    lowerWick,
    trueRange,
    bodyPctOfRange: range > 0 ? body / range : 0,
    upperWickPctOfRange: range > 0 ? upperWick / range : 0,
    lowerWickPctOfRange: range > 0 ? lowerWick / range : 0,
    closePos: range > 0 ? (candle.close - candle.low) / range : 0.5,
    openPos: range > 0 ? (candle.open - candle.low) / range : 0.5,
    isBullish: candle.close > candle.open,
    isBearish: candle.close < candle.open
  };
}

export function calculateSMA(values: number[], period: number): number {
  if (values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  
  for (let i = 1; i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

export function calculateATR(candles: Candle[], period: number): number {
  if (candles.length < 2) return 0;
  
  const trueRanges: number[] = [];
  
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    
    trueRanges.push(tr);
  }
  
  return calculateEMA(trueRanges, period);
}

export function calculateVolumeMA(candles: Candle[], period: number): number {
  const volumes = candles.map(c => c.volume || 0);
  return calculateSMA(volumes, period);
}

export function calculateAvgBody(candles: Candle[], period: number): number {
  const bodies = candles.map(c => Math.abs(c.close - c.open));
  return calculateSMA(bodies, period);
}

export function isHighVolumeBar(candle: Candle, avgVolume: number, factor: number): boolean {
  return (candle.volume || 0) > avgVolume * factor;
}

export function isWideRangeBar(candle: Candle, atr: number): boolean {
  return (candle.high - candle.low) > atr;
}