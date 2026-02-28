import { getMarketContext, MarketContext } from './marketContextService.js';
import { getSectorAnalysis, SectorAnalysis, getStockSector } from './sectorAnalysisService.js';
import { calculateRelativeStrength, RelativeStrengthResult, RS_UNIVERSE, UK_UNIVERSE, getRSRankings } from './relativeStrengthService.js';
import { getFiftyTwoWeekHighData, FiftyTwoWeekHighResult } from './fiftyTwoWeekHighService.js';
import { detectBasePattern, BasePattern } from './basePatternService.js';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { fetchUKHistoricalBars } from '../handlers/ukDataAPI.js';

// Market-aware cache: key is "date:market" (e.g., "2024-01-15:US" or "2024-01-15:UK")
const dateCache = new Map<string, {
  marketContext: MarketContext | null;
  sectorAnalysis: SectorAnalysis | null;
  rsRankings: Map<string, { return12M: number; rsRating: number }>;
}>();

function getCacheKey(date: string, market: 'US' | 'UK'): string {
  return `${date}:${market}`;
}

export function clearCanslimCache(): void {
  dateCache.clear();
}

async function getCachedMarketContext(date: string, market: 'US' | 'UK' = 'US'): Promise<MarketContext | null> {
  const key = getCacheKey(date, market);
  if (!dateCache.has(key)) {
    dateCache.set(key, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(key)!;
  if (cache.marketContext === null) {
    cache.marketContext = await getMarketContext(date, market);
  }
  return cache.marketContext;
}

async function getCachedSectorAnalysis(date: string, market: 'US' | 'UK' = 'US'): Promise<SectorAnalysis | null> {
  const key = getCacheKey(date, market);
  if (!dateCache.has(key)) {
    dateCache.set(key, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(key)!;
  if (cache.sectorAnalysis === null) {
    cache.sectorAnalysis = await getSectorAnalysis(date, 0, market);
  }
  return cache.sectorAnalysis;
}

async function getCachedRSRating(symbol: string, date: string, market: 'US' | 'UK' = 'US'): Promise<{ return12M: number; rsRating: number } | null> {
  const key = getCacheKey(date, market);
  if (!dateCache.has(key)) {
    dateCache.set(key, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(key)!;

  if (cache.rsRankings.size === 0) {
    console.log(`[CANSLIM] Building ${market} RS rankings for ${date}...`);
    const rankings = await getRSRankings(date, market === 'UK' ? UK_UNIVERSE : RS_UNIVERSE, market);
    for (const r of rankings) {
      cache.rsRankings.set(r.symbol, { return12M: r.return12M, rsRating: r.rsRating });
    }
  }

  return cache.rsRankings.get(symbol) || null;
}

export interface CanslimSignal {
  symbol: string;
  date: string;
  score: number;
  maxScore: number;
  pass: boolean;
  
  marketDirection: {
    pass: boolean;
    regime: string;
    reason: string;
  };
  
  relativeStrength: {
    pass: boolean;
    rsRating: number;
    return12M: number;
  } | null;
  
  newHigh: {
    pass: boolean;
    percentFromHigh: number;
    isNearHigh: boolean;
  } | null;
  
  basePattern: {
    pass: boolean;
    type: string;
    pivotPrice: number;
    depth: number;
    weeks: number;
    invalidReason: string | null;
  } | null;
  
  sectorStrength: {
    pass: boolean;
    sector: string;
    rank: number;
    momentum: string;
  } | null;
  
  volumeBreakout: {
    pass: boolean;
    volumeRatio: number;
    priceAbovePivot: boolean;
  } | null;

  // O'Neil-style pivot entry
  pivotPrice: number;          // The breakout pivot point
  currentPrice: number;        // Current market price
  percentFromPivot: number;    // How far current price is from pivot
  inBuyZone: boolean;          // True if within proper buy zone (at or below pivot+5%)
  extended: boolean;           // True if too extended (>5% above pivot)

  entryPrice: number;
  stopLoss: number;
  stopPercent: number;
  target: number;
  riskRewardRatio: number;
}

export interface CanslimConfig {
  minRsRating: number;
  maxPercentFromHigh: number;
  minVolumeRatio: number;
  stopLossPercent: number;
  targetMultiple: number;
}

export interface ScanRejectionSummary {
  market: 'US' | 'UK';
  timestamp: string;
  totalScanned: number;
  passed: number;
  extended: number;
  failedCriteria: number;
  failedRS: number;
  failedHigh: number;
  failedBase: number;
  failedSector: number;
  noData: number;
  regime: string;
}

// Store latest scan summaries for API access
const latestScanSummaries: { US: ScanRejectionSummary | null; UK: ScanRejectionSummary | null } = {
  US: null,
  UK: null
};

export function getLatestScanSummary(market: 'US' | 'UK'): ScanRejectionSummary | null {
  return latestScanSummaries[market];
}

export function getLatestScanSummaries(): { US: ScanRejectionSummary | null; UK: ScanRejectionSummary | null } {
  return latestScanSummaries;
}

const DEFAULT_CONFIG: CanslimConfig = {
  minRsRating: 70,  // Lowered from 80 to 70 - still requires relative strength but less restrictive
  maxPercentFromHigh: 15,
  minVolumeRatio: 1.4,
  stopLossPercent: 7,
  targetMultiple: 2
};

async function checkVolumeBreakout(
  symbol: string,
  date: string,
  pivotPrice: number,
  market: 'US' | 'UK' = 'US'
): Promise<{ pass: boolean; volumeRatio: number; priceAbovePivot: boolean; currentPrice: number } | null> {
  const end = new Date(date);
  const start = new Date(date);
  start.setDate(start.getDate() - 60);

  try {
    let candles;

    if (market === 'UK') {
      candles = await fetchUKHistoricalBars(
        symbol,
        start.toISOString().split('T')[0],
        end.toISOString().split('T')[0],
        'day',
        60
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
        60
      );
    }

    if (candles.length < 51) return null;

    const latestCandle = candles[candles.length - 1];
    const avgVolume = candles.slice(-51, -1).reduce((sum, c) => sum + (c.volume || 0), 0) / 50;
    const volumeRatio = (latestCandle.volume || 0) / avgVolume;
    const priceAbovePivot = latestCandle.close > pivotPrice;

    return {
      pass: volumeRatio >= 1.4 && priceAbovePivot,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      priceAbovePivot,
      currentPrice: latestCandle.close
    };
  } catch (error) {
    console.error(`[CANSLIM] Volume breakout check failed for ${symbol}:`, error);
    return null;
  }
}

export async function analyseCanslimSignal(
  symbol: string,
  date: string,
  config: CanslimConfig = DEFAULT_CONFIG,
  market: 'US' | 'UK' = 'US'
): Promise<CanslimSignal | null> {
  console.log(`[CANSLIM] Analysing ${symbol} (${market}) for ${date}`);

  const [marketContext, sectorAnalysis, rsRating, highData, basePattern] = await Promise.all([
    getCachedMarketContext(date, market),
    getCachedSectorAnalysis(date, market),
    getCachedRSRating(symbol, date, market),
    getFiftyTwoWeekHighData(symbol, date, market),
    detectBasePattern(symbol, date, market)
  ]);
  
  if (!marketContext) {
    console.error('[CANSLIM] Failed to get market context');
    return null;
  }
  
  let score = 0;
  const maxScore = 6;
  
  const marketPass = marketContext.regime === 'risk-on';
  if (marketPass) score++;
  
  const rsPass = rsRating !== null && rsRating.rsRating >= config.minRsRating;
  if (rsPass) score++;
  
  const highPass = highData !== null && highData.percentFromHigh >= -config.maxPercentFromHigh;
  if (highPass) score++;
  
  const basePass = basePattern !== null && basePattern.isValid;
  if (basePass) score++;
  
  const stockSector = getStockSector(symbol, market);
  const sectorData = sectorAnalysis?.sectors.find(s => s.sector === stockSector);
  // Relaxed sector criteria: top 7 sectors pass (was top 5)
  // Momentum is now a soft factor (logged but not required)
  // This allows leaders to emerge from "average" sectors
  const sectorPass = sectorData !== null && sectorData !== undefined &&
    sectorData.rank <= 7;
  if (sectorPass) score++;
  
  const pivotPrice = basePattern?.pivotPrice || highData?.fiftyTwoWeekHigh || 0;
  const volumeData = pivotPrice > 0 ? await checkVolumeBreakout(symbol, date, pivotPrice, market) : null;
  const volumePass = volumeData !== null && volumeData.pass;
  if (volumePass) score++;

  const currentPrice = volumeData?.currentPrice || highData?.currentPrice || 0;

  // O'Neil-style pivot entry calculation
  // Buy zone: at or below pivot, or up to 5% above pivot
  // Extended: more than 5% above pivot (don't chase)
  const buyZoneMax = pivotPrice * 1.05;  // 5% above pivot is max buy zone
  const percentFromPivot = pivotPrice > 0 ? ((currentPrice - pivotPrice) / pivotPrice) * 100 : 0;
  const inBuyZone = currentPrice <= buyZoneMax && currentPrice > 0;
  const extended = currentPrice > buyZoneMax;

  // Entry price is the pivot point (breakout level), not current price
  // This creates a BUY_STOP order that triggers when price breaks above pivot
  const entryPrice = pivotPrice > 0 ? pivotPrice : currentPrice;

  // Calculate stop using structure-based approach (improved O'Neil)
  // Use the TIGHTER of: base support level OR max cap (8%)
  // Support level is the HIGHER (tighter) of base low vs recent 5-day low
  const supportLevel = basePattern && basePattern.baseLow > 0
    ? Math.max(basePattern.baseLow, basePattern.recentLow)
    : entryPrice;
  const structureStop = supportLevel * 0.998;  // 0.2% buffer below support
  const maxCapStop = entryPrice * (1 - config.stopLossPercent / 100);
  const stopLoss = Math.max(structureStop, maxCapStop);  // Use tighter (higher) stop
  const actualStopPercent = ((entryPrice - stopLoss) / entryPrice) * 100;

  const risk = entryPrice - stopLoss;
  const target = entryPrice + (risk * config.targetMultiple);

  // Pass criteria (strict O'Neil): market direction + RS + near high + valid base pattern + NOT extended
  // Both highPass AND basePass required - a proper CAN SLIM setup needs a valid base breaking to new highs
  const pass = marketPass && rsPass && highPass && basePass && !extended;
  
  return {
    symbol,
    date,
    score,
    maxScore,
    pass,
    
    marketDirection: {
      pass: marketPass,
      regime: marketContext.regime,
      reason: marketContext.regimeReason
    },
    
    relativeStrength: rsRating ? {
      pass: rsPass,
      rsRating: rsRating.rsRating,
      return12M: rsRating.return12M
    } : null,
    
    newHigh: highData ? {
      pass: highPass,
      percentFromHigh: highData.percentFromHigh,
      isNearHigh: highData.isNearHigh
    } : null,
    
    basePattern: basePattern ? {
      pass: basePass,
      type: basePattern.type,
      pivotPrice: basePattern.pivotPrice,
      depth: basePattern.baseDepthPercent,
      weeks: basePattern.baseLengthWeeks,
      invalidReason: basePattern.invalidReason
    } : null,
    
    sectorStrength: sectorData ? {
      pass: sectorPass,
      sector: stockSector || 'Unknown',
      rank: sectorData.rank,
      momentum: sectorData.momentum
    } : null,
    
    volumeBreakout: volumeData ? {
      pass: volumePass,
      volumeRatio: volumeData.volumeRatio,
      priceAbovePivot: volumeData.priceAbovePivot
    } : null,

    // O'Neil-style pivot entry info
    pivotPrice: Math.round(pivotPrice * 100) / 100,
    currentPrice: Math.round(currentPrice * 100) / 100,
    percentFromPivot: Math.round(percentFromPivot * 100) / 100,
    inBuyZone,
    extended,

    entryPrice: Math.round(entryPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    stopPercent: Math.round(actualStopPercent * 10) / 10,
    target: Math.round(target * 100) / 100,
    riskRewardRatio: config.targetMultiple
  };
}

export async function scanForCanslimCandidates(
  date: string,
  symbols: string[] = RS_UNIVERSE,
  config: CanslimConfig = DEFAULT_CONFIG,
  ignoreMarketRegime: boolean = false,
  market: 'US' | 'UK' = 'US'
): Promise<CanslimSignal[]> {
  const effectiveSymbols = symbols.length > 0 ? symbols : (market === 'UK' ? UK_UNIVERSE : RS_UNIVERSE);
  console.log(`[CANSLIM] Scanning ${effectiveSymbols.length} ${market} symbols for ${date}`);

  const marketContext = await getCachedMarketContext(date, market);

  // O'Neil Distribution Day status takes precedence over simple regime check
  const distStatus = marketContext?.distributionDayStatus || 'CONFIRMED_UPTREND';
  const distCount = marketContext?.distributionDayCount || 0;
  const positionSizing = marketContext?.positionSizingMultiplier ?? 1.0;

  // Check distribution day status first (O'Neil's methodology)
  if (!ignoreMarketRegime) {
    if (distStatus === 'MARKET_IN_CORRECTION') {
      console.log(`[CANSLIM] Market in CORRECTION (${distCount} distribution days) - not scanning`);

      // Store summary for correction state
      latestScanSummaries[market] = {
        market,
        timestamp: new Date().toISOString(),
        totalScanned: 0,
        passed: 0,
        extended: 0,
        failedCriteria: 0,
        failedRS: 0,
        failedHigh: 0,
        failedBase: 0,
        failedSector: 0,
        noData: 0,
        regime: `CORRECTION (${distCount} dist days)`
      };

      return [];
    }

    if (distStatus === 'RALLY_ATTEMPT') {
      const rallyDay = marketContext?.rallyAttemptDay || 0;
      console.log(`[CANSLIM] Rally attempt day ${rallyDay} - waiting for follow-through (day 4-7)`);

      latestScanSummaries[market] = {
        market,
        timestamp: new Date().toISOString(),
        totalScanned: 0,
        passed: 0,
        extended: 0,
        failedCriteria: 0,
        failedRS: 0,
        failedHigh: 0,
        failedBase: 0,
        failedSector: 0,
        noData: 0,
        regime: `RALLY ATTEMPT (day ${rallyDay})`
      };

      return [];
    }

    // If distribution day service is providing real data (distCount > 0 or non-default status),
    // use O'Neil methodology - CONFIRMED_UPTREND and UPTREND_UNDER_PRESSURE allow trading
    // Only fall back to simple regime check if distribution day data is not available
    const distServiceActive = distCount > 0 || distStatus !== 'CONFIRMED_UPTREND';

    if (!distServiceActive) {
      // Fallback to simple regime check if distribution day service not available
      if (!marketContext || marketContext.regime !== 'risk-on') {
        console.log(`[CANSLIM] ${market} market regime is ${marketContext?.regime || 'unknown'}, skipping scan`);
        return [];
      }
    }
    // If distribution day service IS active and status is CONFIRMED_UPTREND or UPTREND_UNDER_PRESSURE,
    // we allow scanning (position sizing will be adjusted based on status)
  }

  if (ignoreMarketRegime) {
    if (distStatus !== 'CONFIRMED_UPTREND') {
      console.log(`[CANSLIM] Market status: ${distStatus} (${distCount} dist days), but ignoring (force mode)`);
    } else if (marketContext?.regime !== 'risk-on') {
      console.log(`[CANSLIM] ${market} market regime is ${marketContext?.regime || 'unknown'}, but ignoring (force mode)`);
    }
  }

  // Log position sizing if reduced
  if (positionSizing < 1.0) {
    console.log(`[CANSLIM] Position sizing reduced to ${(positionSizing * 100).toFixed(0)}% due to ${distStatus}`);
  }
  
  const candidates: CanslimSignal[] = [];
  let extendedCount = 0;

  // Track rejection reasons for summary
  const rejectionReasons = {
    noData: 0,
    lowScore: 0,
    failedRS: 0,
    failedHigh: 0,
    failedBase: 0,
    failedSector: 0,
    extended: 0,
    passed: 0
  };

  for (const symbol of effectiveSymbols) {
    const signal = await analyseCanslimSignal(symbol, date, config, market);
    if (!signal) {
      rejectionReasons.noData++;
      continue;
    }

    if (signal.extended) {
      extendedCount++;
      rejectionReasons.extended++;
      console.log(`[CANSLIM] ${symbol}: SKIPPED - Extended ${signal.percentFromPivot.toFixed(1)}% above pivot (max 5%)`);
    } else if (signal.pass) {
      candidates.push(signal);
      rejectionReasons.passed++;
      console.log(`[CANSLIM] ${symbol}: PASS - Score ${signal.score}/${signal.maxScore}, Entry at pivot $${signal.entryPrice} (current $${signal.currentPrice})`);
    } else {
      // Track why it failed (score < minScore)
      rejectionReasons.lowScore++;
      if (!signal.relativeStrength?.pass) rejectionReasons.failedRS++;
      if (!signal.newHigh?.pass) rejectionReasons.failedHigh++;
      if (!signal.basePattern?.pass) rejectionReasons.failedBase++;
      if (!signal.sectorStrength?.pass) rejectionReasons.failedSector++;

      // NEAR-MISS LOGGING: Show stocks that almost passed (score >= 4 or only failed 1-2 hard criteria)
      const hardCriteriaFailed = [];
      if (!signal.relativeStrength?.pass) hardCriteriaFailed.push(`RS:${signal.relativeStrength?.rsRating || 'N/A'}`);
      if (!signal.newHigh?.pass) hardCriteriaFailed.push(`52wk:${signal.newHigh?.percentFromHigh?.toFixed(1) || 'N/A'}%`);
      if (!signal.basePattern?.pass) hardCriteriaFailed.push(`Base:${signal.basePattern?.type || 'none'}`);

      // Log near-misses: high score OR only 1-2 hard criteria failed
      if (signal.score >= 4 || hardCriteriaFailed.length <= 2) {
        const passedCriteria = [];
        if (signal.relativeStrength?.pass) passedCriteria.push(`RS:${signal.relativeStrength.rsRating}✓`);
        if (signal.newHigh?.pass) passedCriteria.push(`High:${signal.newHigh.percentFromHigh.toFixed(1)}%✓`);
        if (signal.basePattern?.pass) passedCriteria.push(`Base:${signal.basePattern.type}✓`);
        if (signal.sectorStrength?.pass) passedCriteria.push(`Sector:#${signal.sectorStrength.rank}✓`);
        if (signal.volumeBreakout?.pass) passedCriteria.push(`Vol:${signal.volumeBreakout.volumeRatio}x✓`);

        console.log(`[CANSLIM] NEAR-MISS: ${symbol} (${signal.score}/${signal.maxScore})`);
        console.log(`          Passed: ${passedCriteria.join(', ') || 'none'}`);
        console.log(`          Failed: ${hardCriteriaFailed.join(', ') || 'none'}`);
        if (signal.basePattern && !signal.basePattern.pass) {
          console.log(`          Base issue: ${signal.basePattern.invalidReason || 'unknown'}`);
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  console.log(`[CANSLIM] Found ${candidates.length} ${market} candidates (${extendedCount} stocks extended beyond buy zone)`);

  // Print rejection summary
  console.log(`[CANSLIM] Rejection Summary:`);
  console.log(`  - Passed all criteria: ${rejectionReasons.passed}`);
  console.log(`  - Extended beyond buy zone: ${rejectionReasons.extended}`);
  console.log(`  - Failed criteria (score < 4/6): ${rejectionReasons.lowScore}`);
  console.log(`    - Failed RS rating (<${config.minRsRating}): ${rejectionReasons.failedRS} (floor: 70, ideal: 80+)`);
  console.log(`    - Failed near 52wk high (>${config.maxPercentFromHigh}% away): ${rejectionReasons.failedHigh}`);
  console.log(`    - Failed base pattern: ${rejectionReasons.failedBase}`);
  console.log(`    - Failed sector strength: ${rejectionReasons.failedSector}`);
  console.log(`  - No data/error: ${rejectionReasons.noData}`);

  // Store summary for API access - include distribution day status
  const regimeInfo = distStatus !== 'CONFIRMED_UPTREND'
    ? `${distStatus} (${distCount} dist days)`
    : marketContext?.regime?.toUpperCase() || 'UNKNOWN';

  latestScanSummaries[market] = {
    market,
    timestamp: new Date().toISOString(),
    totalScanned: effectiveSymbols.length,
    passed: rejectionReasons.passed,
    extended: rejectionReasons.extended,
    failedCriteria: rejectionReasons.lowScore,
    failedRS: rejectionReasons.failedRS,
    failedHigh: rejectionReasons.failedHigh,
    failedBase: rejectionReasons.failedBase,
    failedSector: rejectionReasons.failedSector,
    noData: rejectionReasons.noData,
    regime: regimeInfo
  };

  return candidates;
}

export function formatCanslimSignalForDisplay(signal: CanslimSignal): string {
  let output = `\n${'='.repeat(60)}\n`;
  output += `CAN SLIM Analysis: ${signal.symbol} (${signal.date})\n`;
  output += `${'='.repeat(60)}\n\n`;
  
  output += `OVERALL: ${signal.pass ? 'PASS' : 'FAIL'} (Score: ${signal.score}/${signal.maxScore})\n\n`;
  
  output += `M - Market Direction: ${signal.marketDirection.pass ? 'PASS' : 'FAIL'}\n`;
  output += `    Regime: ${signal.marketDirection.regime}\n`;
  output += `    Reason: ${signal.marketDirection.reason}\n\n`;
  
  if (signal.relativeStrength) {
    output += `L - Relative Strength: ${signal.relativeStrength.pass ? 'PASS' : 'FAIL'}\n`;
    output += `    RS Rating: ${signal.relativeStrength.rsRating} (need 70+)\n`;
    output += `    12M Return: ${signal.relativeStrength.return12M}%\n\n`;
  }
  
  if (signal.newHigh) {
    output += `N - Near 52-Week High: ${signal.newHigh.pass ? 'PASS' : 'FAIL'}\n`;
    output += `    % From High: ${signal.newHigh.percentFromHigh}%\n\n`;
  }
  
  if (signal.basePattern) {
    output += `Base Pattern: ${signal.basePattern.pass ? 'PASS' : 'FAIL'}\n`;
    output += `    Type: ${signal.basePattern.type}\n`;
    output += `    Pivot: $${signal.basePattern.pivotPrice}\n`;
    output += `    Depth: ${signal.basePattern.depth}%\n`;
    output += `    Length: ${signal.basePattern.weeks} weeks\n\n`;
  }
  
  if (signal.sectorStrength) {
    output += `Sector: ${signal.sectorStrength.pass ? 'PASS' : 'FAIL'}\n`;
    output += `    ${signal.sectorStrength.sector} - Rank #${signal.sectorStrength.rank}\n`;
    output += `    Momentum: ${signal.sectorStrength.momentum}\n\n`;
  }
  
  if (signal.volumeBreakout) {
    output += `S - Volume Breakout: ${signal.volumeBreakout.pass ? 'PASS' : 'FAIL'}\n`;
    output += `    Volume Ratio: ${signal.volumeBreakout.volumeRatio}x (need 1.4x+)\n`;
    output += `    Above Pivot: ${signal.volumeBreakout.priceAbovePivot}\n\n`;
  }
  
  output += `TRADE PLAN (O'Neil Pivot Method):\n`;
  output += `    Pivot Point: $${signal.pivotPrice} (breakout level)\n`;
  output += `    Current Price: $${signal.currentPrice} (${signal.percentFromPivot >= 0 ? '+' : ''}${signal.percentFromPivot}% from pivot)\n`;
  output += `    Buy Zone: ${signal.inBuyZone ? 'YES - within buy zone' : 'NO'} ${signal.extended ? '(EXTENDED - do not chase!)' : ''}\n`;
  output += `    Entry: $${signal.entryPrice} (BUY_STOP at pivot)\n`;
  output += `    Stop: $${signal.stopLoss} (-${signal.stopPercent}%)\n`;
  output += `    Target: $${signal.target} (${signal.riskRewardRatio}:1 R:R)\n`;

  return output;
}

export { DEFAULT_CONFIG as CANSLIM_DEFAULT_CONFIG };
