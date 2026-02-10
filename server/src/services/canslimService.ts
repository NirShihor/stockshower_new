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

const DEFAULT_CONFIG: CanslimConfig = {
  minRsRating: 80,
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
  const sectorPass = sectorData !== null && sectorData !== undefined && 
    sectorData.rank <= 5 && sectorData.momentum !== 'losing';
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

  // Calculate stop and target based on pivot/entry price (O'Neil uses 7-8% stop from pivot)
  const stopLoss = entryPrice * (1 - config.stopLossPercent / 100);
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
      weeks: basePattern.baseLengthWeeks
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
    stopPercent: config.stopLossPercent,
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
  if (!ignoreMarketRegime && (!marketContext || marketContext.regime !== 'risk-on')) {
    console.log(`[CANSLIM] ${market} market regime is ${marketContext?.regime || 'unknown'}, skipping scan`);
    return [];
  }

  if (ignoreMarketRegime && marketContext?.regime !== 'risk-on') {
    console.log(`[CANSLIM] ${market} market regime is ${marketContext?.regime || 'unknown'}, but ignoring (force mode)`);
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
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  console.log(`[CANSLIM] Found ${candidates.length} ${market} candidates (${extendedCount} stocks extended beyond buy zone)`);

  // Print rejection summary
  console.log(`[CANSLIM] Rejection Summary:`);
  console.log(`  - Passed all criteria: ${rejectionReasons.passed}`);
  console.log(`  - Extended beyond buy zone: ${rejectionReasons.extended}`);
  console.log(`  - Failed criteria (score < 4/6): ${rejectionReasons.lowScore}`);
  console.log(`    - Failed RS rating (<${config.minRsRating}): ${rejectionReasons.failedRS}`);
  console.log(`    - Failed near 52wk high (>${config.maxPercentFromHigh}% away): ${rejectionReasons.failedHigh}`);
  console.log(`    - Failed base pattern: ${rejectionReasons.failedBase}`);
  console.log(`    - Failed sector strength: ${rejectionReasons.failedSector}`);
  console.log(`  - No data/error: ${rejectionReasons.noData}`);

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
