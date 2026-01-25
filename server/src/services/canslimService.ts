import { getMarketContext, MarketContext } from './marketContextService.js';
import { getSectorAnalysis, SectorAnalysis, getStockSector } from './sectorAnalysisService.js';
import { calculateRelativeStrength, RelativeStrengthResult, RS_UNIVERSE, getRSRankings } from './relativeStrengthService.js';
import { getFiftyTwoWeekHighData, FiftyTwoWeekHighResult } from './fiftyTwoWeekHighService.js';
import { detectBasePattern, BasePattern } from './basePatternService.js';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

const dateCache = new Map<string, {
  marketContext: MarketContext | null;
  sectorAnalysis: SectorAnalysis | null;
  rsRankings: Map<string, { return12M: number; rsRating: number }>;
}>();

export function clearCanslimCache(): void {
  dateCache.clear();
}

async function getCachedMarketContext(date: string): Promise<MarketContext | null> {
  if (!dateCache.has(date)) {
    dateCache.set(date, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(date)!;
  if (cache.marketContext === null) {
    cache.marketContext = await getMarketContext(date);
  }
  return cache.marketContext;
}

async function getCachedSectorAnalysis(date: string): Promise<SectorAnalysis | null> {
  if (!dateCache.has(date)) {
    dateCache.set(date, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(date)!;
  if (cache.sectorAnalysis === null) {
    cache.sectorAnalysis = await getSectorAnalysis(date);
  }
  return cache.sectorAnalysis;
}

async function getCachedRSRating(symbol: string, date: string): Promise<{ return12M: number; rsRating: number } | null> {
  if (!dateCache.has(date)) {
    dateCache.set(date, { marketContext: null, sectorAnalysis: null, rsRankings: new Map() });
  }
  const cache = dateCache.get(date)!;
  
  if (cache.rsRankings.size === 0) {
    console.log(`[CANSLIM] Building RS rankings for ${date}...`);
    const rankings = await getRSRankings(date);
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
  pivotPrice: number
): Promise<{ pass: boolean; volumeRatio: number; priceAbovePivot: boolean; currentPrice: number } | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  
  const end = new Date(date);
  const start = new Date(date);
  start.setDate(start.getDate() - 60);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      'day',
      1,
      60
    );
    
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
    return null;
  }
}

export async function analyseCanslimSignal(
  symbol: string,
  date: string,
  config: CanslimConfig = DEFAULT_CONFIG
): Promise<CanslimSignal | null> {
  console.log(`[CANSLIM] Analysing ${symbol} for ${date}`);
  
  const [marketContext, sectorAnalysis, rsRating, highData, basePattern] = await Promise.all([
    getCachedMarketContext(date),
    getCachedSectorAnalysis(date),
    getCachedRSRating(symbol, date),
    getFiftyTwoWeekHighData(symbol, date),
    detectBasePattern(symbol, date)
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
  
  const stockSector = getStockSector(symbol);
  const sectorData = sectorAnalysis?.sectors.find(s => s.symbol === stockSector);
  const sectorPass = sectorData !== null && sectorData !== undefined && 
    sectorData.rank <= 5 && sectorData.momentum !== 'losing';
  if (sectorPass) score++;
  
  const pivotPrice = basePattern?.pivotPrice || highData?.fiftyTwoWeekHigh || 0;
  const volumeData = pivotPrice > 0 ? await checkVolumeBreakout(symbol, date, pivotPrice) : null;
  const volumePass = volumeData !== null && volumeData.pass;
  if (volumePass) score++;
  
  const currentPrice = volumeData?.currentPrice || highData?.currentPrice || 0;
  const stopLoss = currentPrice * (1 - config.stopLossPercent / 100);
  const risk = currentPrice - stopLoss;
  const target = currentPrice + (risk * config.targetMultiple);
  
  const pass = marketPass && rsPass && (highPass || basePass);
  
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
    
    entryPrice: Math.round(currentPrice * 100) / 100,
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
  ignoreMarketRegime: boolean = false
): Promise<CanslimSignal[]> {
  console.log(`[CANSLIM] Scanning ${symbols.length} symbols for ${date}`);
  
  const marketContext = await getCachedMarketContext(date);
  if (!ignoreMarketRegime && (!marketContext || marketContext.regime !== 'risk-on')) {
    console.log(`[CANSLIM] Market regime is ${marketContext?.regime || 'unknown'}, skipping scan`);
    return [];
  }
  
  if (ignoreMarketRegime && marketContext?.regime !== 'risk-on') {
    console.log(`[CANSLIM] Market regime is ${marketContext?.regime || 'unknown'}, but ignoring (force mode)`);
  }
  
  const candidates: CanslimSignal[] = [];
  
  for (const symbol of symbols) {
    const signal = await analyseCanslimSignal(symbol, date, config);
    if (signal && signal.pass) {
      candidates.push(signal);
    }
  }
  
  candidates.sort((a, b) => b.score - a.score);
  
  console.log(`[CANSLIM] Found ${candidates.length} candidates`);
  
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
  
  output += `TRADE PLAN:\n`;
  output += `    Entry: $${signal.entryPrice}\n`;
  output += `    Stop: $${signal.stopLoss} (-${signal.stopPercent}%)\n`;
  output += `    Target: $${signal.target} (${signal.riskRewardRatio}:1 R:R)\n`;
  
  return output;
}

export { DEFAULT_CONFIG as CANSLIM_DEFAULT_CONFIG };
