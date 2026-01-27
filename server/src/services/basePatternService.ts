import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';

export interface BasePattern {
  symbol: string;
  date: string;
  type: 'flat_base' | 'consolidation' | 'cup_with_handle' | 'ascending_base' | 'none';
  pivotPrice: number;
  baseDepthPercent: number;
  baseLengthDays: number;
  baseLengthWeeks: number;
  volumeContraction: boolean;
  volumeContractionRatio: number;
  priorUptrend: boolean;
  priorUptrendPercent: number;
  isValid: boolean;
  invalidReason: string | null;
}

function calculateAverageVolume(candles: Candle[], period: number): number {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  return recent.reduce((sum, c) => sum + (c.volume || 0), 0) / period;
}

function findBaseStart(candles: Candle[], pivotIndex: number): number {
  let baseStart = pivotIndex;
  const pivotHigh = candles[pivotIndex].high;
  
  for (let i = pivotIndex - 1; i >= 0; i--) {
    if (candles[i].high >= pivotHigh * 0.98) {
      baseStart = i;
    } else if (candles[i].high < pivotHigh * 0.85) {
      break;
    }
  }
  
  return baseStart;
}

function detectPriorUptrend(candles: Candle[], baseStartIndex: number): { exists: boolean; percent: number } {
  if (baseStartIndex < 30) {
    return { exists: false, percent: 0 };
  }
  
  const priorCandles = candles.slice(Math.max(0, baseStartIndex - 65), baseStartIndex);
  if (priorCandles.length < 20) {
    return { exists: false, percent: 0 };
  }
  
  const startPrice = priorCandles[0].close;
  const endPrice = priorCandles[priorCandles.length - 1].close;
  const percent = ((endPrice - startPrice) / startPrice) * 100;
  
  return {
    exists: percent >= 30,
    percent: Math.round(percent * 100) / 100
  };
}

function detectFlatBase(
  candles: Candle[],
  baseStartIndex: number,
  baseEndIndex: number
): { isFlat: boolean; depth: number } {
  const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);
  if (baseCandles.length < 5) {
    return { isFlat: false, depth: 0 };
  }
  
  let high = 0;
  let low = Infinity;
  
  for (const c of baseCandles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }
  
  const depth = ((high - low) / high) * 100;
  
  return {
    isFlat: depth <= 15,
    depth: Math.round(depth * 100) / 100
  };
}

function detectCupShape(
  candles: Candle[],
  baseStartIndex: number,
  baseEndIndex: number
): { isCup: boolean; depth: number } {
  const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);
  if (baseCandles.length < 15) {
    return { isCup: false, depth: 0 };
  }
  
  const leftHigh = Math.max(...baseCandles.slice(0, 5).map(c => c.high));
  const rightHigh = Math.max(...baseCandles.slice(-5).map(c => c.high));
  const middleLow = Math.min(...baseCandles.slice(5, -5).map(c => c.low));
  
  const avgHigh = (leftHigh + rightHigh) / 2;
  const depth = ((avgHigh - middleLow) / avgHigh) * 100;
  
  const leftRightDiff = Math.abs(leftHigh - rightHigh) / avgHigh * 100;
  
  return {
    isCup: depth >= 12 && depth <= 35 && leftRightDiff <= 10,
    depth: Math.round(depth * 100) / 100
  };
}

function detectVolumeContraction(
  candles: Candle[],
  baseStartIndex: number,
  baseEndIndex: number
): { contracted: boolean; ratio: number } {
  const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);
  const priorCandles = candles.slice(Math.max(0, baseStartIndex - 50), baseStartIndex);
  
  if (baseCandles.length < 5 || priorCandles.length < 10) {
    return { contracted: false, ratio: 1 };
  }
  
  const baseAvgVol = baseCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / baseCandles.length;
  const priorAvgVol = priorCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / priorCandles.length;
  
  const ratio = baseAvgVol / priorAvgVol;
  
  return {
    contracted: ratio < 0.8,
    ratio: Math.round(ratio * 100) / 100
  };
}

export async function detectBasePattern(
  symbol: string,
  date: string
): Promise<BasePattern | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[BASE] No Polygon API key');
    return null;
  }
  
  const end = new Date(date);
  const start = new Date(date);
  start.setMonth(start.getMonth() - 6);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      'day',
      1,
      150
    );
    
    if (candles.length < 60) {
      return {
        symbol,
        date,
        type: 'none',
        pivotPrice: 0,
        baseDepthPercent: 0,
        baseLengthDays: 0,
        baseLengthWeeks: 0,
        volumeContraction: false,
        volumeContractionRatio: 1,
        priorUptrend: false,
        priorUptrendPercent: 0,
        isValid: false,
        invalidReason: 'Insufficient data'
      };
    }
    
    let recentHighIndex = candles.length - 1;
    let recentHigh = 0;
    
    for (let i = Math.max(0, candles.length - 65); i < candles.length; i++) {
      if (candles[i].high > recentHigh) {
        recentHigh = candles[i].high;
        recentHighIndex = i;
      }
    }
    
    const baseStartIndex = findBaseStart(candles, recentHighIndex);
    const baseEndIndex = candles.length - 1;
    const baseLengthDays = baseEndIndex - baseStartIndex;
    
    if (baseLengthDays < 5) {
      return {
        symbol,
        date,
        type: 'none',
        pivotPrice: recentHigh,
        baseDepthPercent: 0,
        baseLengthDays: 0,
        baseLengthWeeks: 0,
        volumeContraction: false,
        volumeContractionRatio: 1,
        priorUptrend: false,
        priorUptrendPercent: 0,
        isValid: false,
        invalidReason: 'No consolidation detected'
      };
    }
    
    const priorUptrend = detectPriorUptrend(candles, baseStartIndex);
    const flatBase = detectFlatBase(candles, baseStartIndex, baseEndIndex);
    const cupShape = detectCupShape(candles, baseStartIndex, baseEndIndex);
    const volumeContraction = detectVolumeContraction(candles, baseStartIndex, baseEndIndex);
    
    let patternType: BasePattern['type'] = 'none';
    let baseDepth = 0;
    let invalidReason: string | null = null;
    
    if (flatBase.isFlat && flatBase.depth <= 15) {
      patternType = 'flat_base';
      baseDepth = flatBase.depth;
    } else if (cupShape.isCup) {
      patternType = 'cup_with_handle';
      baseDepth = cupShape.depth;
    } else if (flatBase.depth <= 35) {
      patternType = 'consolidation';
      baseDepth = flatBase.depth;
    }
    
    if (patternType === 'none') {
      invalidReason = 'No recognisable pattern';
    } else if (!priorUptrend.exists) {
      invalidReason = 'No prior uptrend (need 30%+ advance)';
    } else if (baseDepth > 35) {
      invalidReason = 'Base too deep (>35%)';
    } else if (baseLengthDays < 5 * 5) {
      invalidReason = 'Base too short (<5 weeks)';
    }
    
    const isValid = patternType !== 'none' && priorUptrend.exists && baseDepth <= 35 && baseLengthDays >= 25;
    
    const pivotPrice = recentHigh * 1.001;
    
    return {
      symbol,
      date,
      type: patternType,
      pivotPrice: Math.round(pivotPrice * 100) / 100,
      baseDepthPercent: baseDepth,
      baseLengthDays,
      baseLengthWeeks: Math.round(baseLengthDays / 5),
      volumeContraction: volumeContraction.contracted,
      volumeContractionRatio: volumeContraction.ratio,
      priorUptrend: priorUptrend.exists,
      priorUptrendPercent: priorUptrend.percent,
      isValid,
      invalidReason
    };
  } catch (error) {
    console.error(`[BASE] Error analysing ${symbol}:`, error);
    return null;
  }
}

export async function findValidBases(
  symbols: string[],
  date: string
): Promise<BasePattern[]> {
  const results: BasePattern[] = [];
  
  for (const symbol of symbols) {
    const pattern = await detectBasePattern(symbol, date);
    if (pattern && pattern.isValid) {
      results.push(pattern);
    }
  }
  
  results.sort((a, b) => a.baseDepthPercent - b.baseDepthPercent);
  
  return results;
}
