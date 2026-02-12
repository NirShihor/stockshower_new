import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';
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
  recentBreakdown: boolean;
  breakdownPercent: number;
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

function detectPriorUptrend(candles: Candle[], baseStartIndex: number, market: 'US' | 'UK' = 'US'): { exists: boolean; percent: number; recentBreakdown: boolean; breakdownPercent: number; requiredPercent: number } {
  // Market-specific prior uptrend threshold:
  // US: 30% - O'Neil's original methodology for high-growth US stocks
  // UK: 20% - Lower threshold for less volatile UK market (FTSE stocks)
  const requiredPercent = market === 'UK' ? 20 : 30;

  if (baseStartIndex < 30) {
    return { exists: false, percent: 0, recentBreakdown: false, breakdownPercent: 0, requiredPercent };
  }

  const priorCandles = candles.slice(Math.max(0, baseStartIndex - 65), baseStartIndex);
  if (priorCandles.length < 20) {
    return { exists: false, percent: 0, recentBreakdown: false, breakdownPercent: 0, requiredPercent };
  }

  const startPrice = priorCandles[0].close;
  const endPrice = priorCandles[priorCandles.length - 1].close;
  const percent = ((endPrice - startPrice) / startPrice) * 100;

  // NEW: Check for recent breakdown before the base
  // Look at the 20 days immediately before the base start
  const recentCandles = priorCandles.slice(-20);
  let recentHigh = 0;
  let recentHighIndex = 0;

  for (let i = 0; i < recentCandles.length; i++) {
    if (recentCandles[i].high > recentHigh) {
      recentHigh = recentCandles[i].high;
      recentHighIndex = i;
    }
  }

  // Check if price dropped significantly from the recent high
  const priceAtBaseStart = recentCandles[recentCandles.length - 1].close;
  const dropFromRecentHigh = ((recentHigh - priceAtBaseStart) / recentHigh) * 100;

  // If dropped >22% from recent high AND the high was in the first half of the period,
  // this is a breakdown, not a healthy pullback into a base
  // Relaxed from 15% to 22% to allow for normal volatility in modern markets
  // Many leaders shake out 15-22% during corrections before forming new bases
  const recentBreakdown = dropFromRecentHigh > 22 && recentHighIndex < recentCandles.length / 2;

  return {
    exists: percent >= requiredPercent,
    percent: Math.round(percent * 100) / 100,
    recentBreakdown,
    breakdownPercent: Math.round(dropFromRecentHigh * 100) / 100,
    requiredPercent
  };
}

function detectFlatBase(
  candles: Candle[],
  baseStartIndex: number,
  baseEndIndex: number
): { isFlat: boolean; depth: number; priceInUpperHalf: boolean } {
  const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);
  if (baseCandles.length < 5) {
    return { isFlat: false, depth: 0, priceInUpperHalf: false };
  }

  let high = 0;
  let low = Infinity;

  for (const c of baseCandles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }

  const depth = ((high - low) / high) * 100;

  // O'Neil: In a proper flat base, the stock should be trading in the upper half
  // of the range, showing strength and support at higher levels
  const currentPrice = baseCandles[baseCandles.length - 1].close;
  const midpoint = (high + low) / 2;
  const priceInUpperHalf = currentPrice >= midpoint;

  return {
    isFlat: depth <= 15,
    depth: Math.round(depth * 100) / 100,
    priceInUpperHalf
  };
}

function detectCupShape(
  candles: Candle[],
  baseStartIndex: number,
  baseEndIndex: number
): { isCup: boolean; depth: number; rightSideIncomplete: boolean; isVShaped: boolean; handleTooDeep: boolean } {
  const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);
  if (baseCandles.length < 15) {
    return { isCup: false, depth: 0, rightSideIncomplete: false, isVShaped: false, handleTooDeep: false };
  }

  // Left side: first 20% of base (minimum 5 days)
  const leftDays = Math.max(5, Math.floor(baseCandles.length * 0.2));
  const leftHigh = Math.max(...baseCandles.slice(0, leftDays).map(c => c.high));

  // Right side: find the highest high in the last 30% of base (minimum 5 days)
  // This captures the right side rally
  const rightDays = Math.max(5, Math.floor(baseCandles.length * 0.3));
  const rightSideCandles = baseCandles.slice(-rightDays);
  const rightHigh = Math.max(...rightSideCandles.map(c => c.high));

  // Find when the right side high occurred relative to the end
  const rightHighIndex = rightSideCandles.findIndex(c => c.high === rightHigh);
  const daysFromRightHighToEnd = rightSideCandles.length - 1 - rightHighIndex;

  // Middle section: everything between left side and right side
  // This is where the cup's low should be
  const middleCandles = baseCandles.slice(leftDays, -rightDays);
  const middleLow = middleCandles.length > 0
    ? Math.min(...middleCandles.map(c => c.low))
    : Math.min(...baseCandles.slice(leftDays).map(c => c.low));

  const avgHigh = (leftHigh + rightHigh) / 2;
  const depth = ((avgHigh - middleLow) / avgHigh) * 100;

  const leftRightDiff = Math.abs(leftHigh - rightHigh) / avgHigh * 100;

  // O'Neil: Right side should rally back close to the left side high
  // In proper cups, the right side comes within 5-10% of the left side
  // before forming a handle. If gap is >10%, the right side hasn't completed.
  const rightSideGap = ((leftHigh - rightHigh) / leftHigh) * 100;
  const rightSideIncomplete = rightSideGap > 10;

  // O'Neil: Cup should have U-shape (rounded bottom), not V-shape
  // V-shape = rapid decline and rapid recovery with few days at bottom
  // Count days where price is within 5% of the low
  const lowThreshold = middleLow * 1.05;
  const daysNearLow = middleCandles.filter(c => c.low <= lowThreshold).length;
  const middleDays = middleCandles.length;

  // If less than 20% of middle days are near the low, it's V-shaped (too quick)
  // A proper U-shape should spend meaningful time building a base at the bottom
  const isVShaped = middleDays > 5 && (daysNearLow / middleDays) < 0.2;

  // Check handle depth: if there's been a pullback from the right side high,
  // it should be a proper handle (8-12% max, not a breakdown)
  const currentPrice = baseCandles[baseCandles.length - 1].close;
  const handleDepth = ((rightHigh - currentPrice) / rightHigh) * 100;
  // Handle is too deep if >15% pullback from right side high
  const handleTooDeep = daysFromRightHighToEnd > 3 && handleDepth > 15;

  const meetsBasicCriteria = depth >= 12 && depth <= 35 && leftRightDiff <= 15;

  return {
    isCup: meetsBasicCriteria && !rightSideIncomplete && !isVShaped && !handleTooDeep,
    depth: Math.round(depth * 100) / 100,
    rightSideIncomplete,
    isVShaped,
    handleTooDeep
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
  date: string,
  market: 'US' | 'UK' = 'US'
): Promise<BasePattern | null> {
  const end = new Date(date);
  const start = new Date(date);
  start.setMonth(start.getMonth() - 6);

  try {
    let candles;

    if (market === 'UK') {
      candles = await fetchUKHistoricalBars(
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        150
      );
    } else {
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        console.error('[BASE] No Polygon API key');
        return null;
      }

      candles = await fetchHistoricalBars(
        apiKey,
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        1,
        150
      );
    }
    
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
        recentBreakdown: false,
        breakdownPercent: 0,
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
        recentBreakdown: false,
        breakdownPercent: 0,
        isValid: false,
        invalidReason: 'No consolidation detected'
      };
    }
    
    const priorUptrend = detectPriorUptrend(candles, baseStartIndex, market);
    const flatBase = detectFlatBase(candles, baseStartIndex, baseEndIndex);
    const cupShape = detectCupShape(candles, baseStartIndex, baseEndIndex);
    const volumeContraction = detectVolumeContraction(candles, baseStartIndex, baseEndIndex);

    // Check current price proximity to pivot
    // O'Neil: Stock should be within buying range to be actionable
    // Ideal buy point is within 5% of pivot. Relaxed to 15% to allow for normal pullbacks.
    // This is more forgiving during volatile markets where stocks pull back 12-15% before breaking out.
    const currentPrice = candles[candles.length - 1].close;
    const pivotPrice = recentHigh * 1.001;
    const distanceFromPivot = ((pivotPrice - currentPrice) / pivotPrice) * 100;
    const tooFarFromPivot = distanceFromPivot > 15;

    let patternType: BasePattern['type'] = 'none';
    let baseDepth = 0;
    let invalidReason: string | null = null;

    // Pattern detection with quality checks
    if (flatBase.isFlat && flatBase.depth <= 15) {
      patternType = 'flat_base';
      baseDepth = flatBase.depth;
    } else if (cupShape.depth >= 12 && cupShape.depth <= 35) {
      // Check cup quality before accepting
      if (cupShape.rightSideIncomplete) {
        // Don't classify as cup - right side hasn't rallied back
        patternType = 'consolidation';
        baseDepth = cupShape.depth;
      } else if (cupShape.isVShaped) {
        // V-shaped bottom - not a proper cup
        patternType = 'consolidation';
        baseDepth = cupShape.depth;
      } else if (cupShape.handleTooDeep) {
        // Handle is too deep - breakdown, not a proper handle
        patternType = 'consolidation';
        baseDepth = cupShape.depth;
      } else if (cupShape.isCup) {
        patternType = 'cup_with_handle';
        baseDepth = cupShape.depth;
      } else {
        patternType = 'consolidation';
        baseDepth = cupShape.depth;
      }
    } else if (flatBase.depth <= 35) {
      patternType = 'consolidation';
      baseDepth = flatBase.depth;
    }

    // Validation checks
    if (patternType === 'none') {
      invalidReason = 'No recognisable pattern';
    } else if (!priorUptrend.exists) {
      invalidReason = `No prior uptrend (need ${priorUptrend.requiredPercent}%+ advance)`;
    } else if (priorUptrend.recentBreakdown) {
      invalidReason = `Recent breakdown detected (${priorUptrend.breakdownPercent}% drop before base)`;
    } else if (baseDepth > 35) {
      invalidReason = 'Base too deep (>35%)';
    } else if (baseLengthDays < 5 * 5) {
      invalidReason = 'Base too short (<5 weeks)';
    } else if (tooFarFromPivot) {
      invalidReason = `Price too far from pivot (${distanceFromPivot.toFixed(1)}% below, max 15%)`;
    } else if (patternType === 'flat_base' && !flatBase.priceInUpperHalf) {
      invalidReason = 'Flat base: price drifting to lower half of range';
    } else if (patternType === 'consolidation' && cupShape.rightSideIncomplete) {
      invalidReason = 'Cup incomplete: right side has not rallied back to left side';
    } else if (patternType === 'consolidation' && cupShape.isVShaped) {
      invalidReason = 'V-shaped bottom: not a proper rounded cup';
    } else if (patternType === 'consolidation' && cupShape.handleTooDeep) {
      invalidReason = 'Handle too deep: pullback from right side exceeds 15%';
    }

    // Also reject consolidations that are incomplete cups, V-shaped, or have too-deep handles
    const hasPatternQualityIssue =
      (patternType === 'flat_base' && !flatBase.priceInUpperHalf) ||
      (patternType === 'consolidation' && (cupShape.rightSideIncomplete || cupShape.isVShaped || cupShape.handleTooDeep));

    const isValid = patternType !== 'none' &&
      priorUptrend.exists &&
      !priorUptrend.recentBreakdown &&
      baseDepth <= 35 &&
      baseLengthDays >= 25 &&
      !tooFarFromPivot &&
      !hasPatternQualityIssue;
    
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
      recentBreakdown: priorUptrend.recentBreakdown,
      breakdownPercent: priorUptrend.breakdownPercent,
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
  date: string,
  market: 'US' | 'UK' = 'US'
): Promise<BasePattern[]> {
  const results: BasePattern[] = [];

  for (const symbol of symbols) {
    const pattern = await detectBasePattern(symbol, date, market);
    if (pattern && pattern.isValid) {
      results.push(pattern);
    }
  }

  results.sort((a, b) => a.baseDepthPercent - b.baseDepthPercent);

  return results;
}

/**
 * Debug function to expose internal detection details
 */
export async function debugBasePatternDetails(
  symbol: string,
  date: string,
  market: 'US' | 'UK' = 'US'
): Promise<{
  cupDetails: {
    leftHigh: number;
    rightHigh: number;
    middleLow: number;
    rightSideGap: number;
    daysNearLow: number;
    middleDays: number;
    isVShaped: boolean;
    handleDepth: number;
    handleTooDeep: boolean;
  };
  currentPrice: number;
  distanceFromPivot: number;
  priceInUpperHalf: boolean;
} | null> {
  const end = new Date(date);
  const start = new Date(date);
  start.setMonth(start.getMonth() - 6);

  try {
    let candles;

    if (market === 'UK') {
      candles = await fetchUKHistoricalBars(
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        150
      );
    } else {
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) return null;

      candles = await fetchHistoricalBars(
        apiKey,
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        1,
        150
      );
    }

    if (candles.length < 60) return null;

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
    const baseCandles = candles.slice(baseStartIndex, baseEndIndex + 1);

    if (baseCandles.length < 15) return null;

    // Cup detection details - using improved method
    const leftDays = Math.max(5, Math.floor(baseCandles.length * 0.2));
    const leftHigh = Math.max(...baseCandles.slice(0, leftDays).map(c => c.high));

    // Right side: find the highest high in the last 30% of base
    const rightDays = Math.max(5, Math.floor(baseCandles.length * 0.3));
    const rightSideCandles = baseCandles.slice(-rightDays);
    const rightHigh = Math.max(...rightSideCandles.map(c => c.high));

    // Find when the right side high occurred
    const rightHighIndex = rightSideCandles.findIndex(c => c.high === rightHigh);
    const daysFromRightHighToEnd = rightSideCandles.length - 1 - rightHighIndex;

    // Middle section for finding the low
    const middleCandles = baseCandles.slice(leftDays, -rightDays);
    const middleLow = middleCandles.length > 0
      ? Math.min(...middleCandles.map(c => c.low))
      : Math.min(...baseCandles.slice(leftDays).map(c => c.low));

    const rightSideGap = ((leftHigh - rightHigh) / leftHigh) * 100;

    const lowThreshold = middleLow * 1.05;
    const daysNearLow = middleCandles.filter(c => c.low <= lowThreshold).length;
    const middleDays = middleCandles.length;
    const isVShaped = middleDays > 5 && (daysNearLow / middleDays) < 0.2;

    // Current price and handle depth
    const currentPrice = candles[candles.length - 1].close;
    const handleDepth = ((rightHigh - currentPrice) / rightHigh) * 100;
    const handleTooDeep = daysFromRightHighToEnd > 3 && handleDepth > 15;

    const pivotPrice = recentHigh * 1.001;
    const distanceFromPivot = ((pivotPrice - currentPrice) / pivotPrice) * 100;

    // Flat base details
    let high = 0;
    let low = Infinity;
    for (const c of baseCandles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    const midpoint = (high + low) / 2;
    const priceInUpperHalf = currentPrice >= midpoint;

    return {
      cupDetails: {
        leftHigh,
        rightHigh,
        middleLow,
        rightSideGap,
        daysNearLow,
        middleDays,
        isVShaped,
        handleDepth,
        handleTooDeep
      },
      currentPrice,
      distanceFromPivot,
      priceInUpperHalf
    };
  } catch (error) {
    console.error(`[BASE DEBUG] Error:`, error);
    return null;
  }
}
