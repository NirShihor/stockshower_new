// @ts-nocheck
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';
import { getMarketContext, MarketContext } from './marketContextService.js';
import { getSectorAnalysis, SectorAnalysis, getStockSector } from './sectorAnalysisService.js';

interface AlgoSwingCandidate {
  symbol: string;
  sector: string;
  sectorRank: number;
  currentPrice: number;
  dailyChange: number;
  weeklyChange: number;
  trend: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down';
  volumeRatio: number;
  atr: number;
  atrPercent: number;
  priceVsEma20: number;
  priceVsEma50: number;
  nearSupport: boolean;
  nearResistance: boolean;
  setup: string;
  score: number;
}

interface AlgoSwingTrade {
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  score: number;
  reasons: string[];
}

interface AlgoBacktestResult {
  entryDate: string;
  exitDate: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stopLoss: number;
  target: number;
  exitPrice: number;
  exitReason: 'target_hit' | 'stop_hit' | 'time_exit';
  daysHeld: number;
  pnlPercent: number;
}

interface AlgoBacktestSummary {
  startDate: string;
  endDate: string;
  totalDays: number;
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalPnlPercent: number;
  avgPnlPerTrade: number;
  avgDaysHeld: number;
  targetHits: number;
  stopHits: number;
  timeExits: number;
  allTrades: AlgoBacktestResult[];
}

const SWING_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'CRM',
  'NFLX', 'ADBE', 'PYPL', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP',
  'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV', 'LLY', 'TMO', 'ABT', 'AMGN',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY',
  'BA', 'CAT', 'HON', 'GE', 'UNP', 'RTX', 'DE', 'LMT',
  'KO', 'PEP', 'WMT', 'PG', 'COST', 'HD', 'NKE', 'MCD', 'SBUX',
  'DIS', 'CMCSA', 'T', 'VZ', 'TMUS'
];

function calculateEma(candles: Candle[], period: number): number {
  if (candles.length < period) return candles[candles.length - 1]?.close || 0;
  const multiplier = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + c.close, 0) / period;
  for (let i = period; i < candles.length; i++) {
    ema = (candles[i].close - ema) * multiplier + ema;
  }
  return ema;
}

function calculateAtr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function findSupportResistance(candles: Candle[]): { support: number; resistance: number } {
  const recent = candles.slice(-20);
  const lows = recent.map(c => c.low);
  const highs = recent.map(c => c.high);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs)
  };
}

function detectTrend(candles: Candle[]): 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down' {
  if (candles.length < 20) return 'neutral';
  
  const ema20 = calculateEma(candles, 20);
  const ema50 = calculateEma(candles, 50);
  const current = candles[candles.length - 1].close;
  
  const aboveEma20 = current > ema20;
  const aboveEma50 = current > ema50;
  const ema20AboveEma50 = ema20 > ema50;
  
  const recent5 = candles.slice(-5);
  const higherHighs = recent5.filter((c, i) => i > 0 && c.high > recent5[i - 1].high).length;
  const lowerLows = recent5.filter((c, i) => i > 0 && c.low < recent5[i - 1].low).length;
  
  if (aboveEma20 && aboveEma50 && ema20AboveEma50 && higherHighs >= 3) return 'strong_up';
  if (aboveEma20 && aboveEma50) return 'up';
  if (!aboveEma20 && !aboveEma50 && !ema20AboveEma50 && lowerLows >= 3) return 'strong_down';
  if (!aboveEma20 && !aboveEma50) return 'down';
  return 'neutral';
}

function detectSetup(candles: Candle[], trend: string): string {
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const ema20 = calculateEma(candles, 20);
  const priceNearEma = Math.abs(current.close - ema20) / ema20 < 0.02;
  
  if (trend === 'up' || trend === 'strong_up') {
    if (priceNearEma && current.close > current.open) {
      return 'pullback_to_ema20_bounce';
    }
    if (current.close > prev.high && current.volume > prev.volume * 1.5) {
      return 'breakout_with_volume';
    }
  }
  
  if (trend === 'down' || trend === 'strong_down') {
    if (priceNearEma && current.close < current.open) {
      return 'rally_to_ema20_rejection';
    }
    if (current.close < prev.low && current.volume > prev.volume * 1.5) {
      return 'breakdown_with_volume';
    }
  }
  
  return 'no_clear_setup';
}

function scoreCandidate(
  candidate: AlgoSwingCandidate,
  marketContext: MarketContext | null,
  direction: 'long' | 'short'
): number {
  let score = 0;
  
  if (direction === 'long') {
    if (candidate.trend === 'strong_up') score += 30;
    else if (candidate.trend === 'up') score += 20;
    else if (candidate.trend === 'neutral') score += 5;
    else return 0;
    
    if (candidate.sectorRank <= 3) score += 20;
    else if (candidate.sectorRank <= 5) score += 15;
    else if (candidate.sectorRank <= 7) score += 5;
    else score -= 5;
    
    if (candidate.priceVsEma20 > -2 && candidate.priceVsEma20 < 3) score += 15;
    else if (candidate.priceVsEma20 >= 3 && candidate.priceVsEma20 < 5) score += 5;
    else if (candidate.priceVsEma20 > 8) score -= 10;
    
    if (candidate.priceVsEma50 > 0) score += 10;
    else if (candidate.priceVsEma50 > -3) score += 5;
    
    if (candidate.nearSupport) score += 10;
    if (candidate.nearResistance) score -= 5;
    
    if (marketContext?.regime === 'risk_on') score += 15;
    else if (marketContext?.regime === 'neutral') score += 5;
    else if (marketContext?.regime === 'risk_off') score -= 10;
    
  } else {
    if (candidate.trend === 'strong_down') score += 30;
    else if (candidate.trend === 'down') score += 20;
    else if (candidate.trend === 'neutral') score += 5;
    else return 0;
    
    if (candidate.sectorRank >= 9) score += 20;
    else if (candidate.sectorRank >= 7) score += 15;
    else if (candidate.sectorRank >= 5) score += 5;
    else score -= 5;
    
    if (candidate.priceVsEma20 < 2 && candidate.priceVsEma20 > -3) score += 15;
    else if (candidate.priceVsEma20 <= -3 && candidate.priceVsEma20 > -5) score += 5;
    else if (candidate.priceVsEma20 < -8) score -= 10;
    
    if (candidate.priceVsEma50 < 0) score += 10;
    else if (candidate.priceVsEma50 < 3) score += 5;
    
    if (candidate.nearResistance) score += 10;
    if (candidate.nearSupport) score -= 5;
    
    if (marketContext?.regime === 'risk_off') score += 15;
    else if (marketContext?.regime === 'neutral') score += 5;
    else if (marketContext?.regime === 'risk_on') score -= 10;
  }
  
  if (candidate.volumeRatio >= 1.5) score += 15;
  else if (candidate.volumeRatio >= 1.2) score += 10;
  else if (candidate.volumeRatio >= 1.0) score += 5;
  else if (candidate.volumeRatio < 0.7) score -= 10;
  
  if (candidate.setup !== 'no_clear_setup') score += 15;
  
  if (candidate.weeklyChange > 3 && direction === 'long') score += 10;
  if (candidate.weeklyChange < -3 && direction === 'short') score += 10;
  
  return score;
}

async function buildAlgoCandidates(
  date: string,
  sectorAnalysis: SectorAnalysis | null
): Promise<AlgoSwingCandidate[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return [];
  
  const candidates: AlgoSwingCandidate[] = [];
  
  const endDate = date;
  const startDateObj = new Date(date);
  startDateObj.setDate(startDateObj.getDate() - 60);
  const startDate = startDateObj.toISOString().split('T')[0];
  
  const sectorRankMap = new Map<string, number>();
  if (sectorAnalysis) {
    for (const sector of sectorAnalysis.sectors) {
      sectorRankMap.set(sector.symbol, sector.rank);
    }
  }
  
  for (const symbol of SWING_SYMBOLS) {
    try {
      const candles = await fetchHistoricalBars(apiKey, symbol, startDate, endDate, 'day', 1, 60);
      
      if (candles.length < 30) continue;
      
      const current = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const fiveDaysAgo = candles[candles.length - 6] || candles[0];
      
      const dailyChange = ((current.close - prev.close) / prev.close) * 100;
      const weeklyChange = ((current.close - fiveDaysAgo.close) / fiveDaysAgo.close) * 100;
      
      const ema20 = calculateEma(candles, 20);
      const ema50 = calculateEma(candles, 50);
      const atr = calculateAtr(candles, 14);
      
      const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
      const volumeRatio = current.volume / avgVolume;
      
      const { support, resistance } = findSupportResistance(candles);
      const nearSupport = (current.close - support) / current.close < 0.03;
      const nearResistance = (resistance - current.close) / current.close < 0.03;
      
      const trend = detectTrend(candles);
      const setup = detectSetup(candles, trend);
      
      const sector = getStockSector(symbol);
      const sectorEtf = getSectorEtf(sector);
      const sectorRank = sectorRankMap.get(sectorEtf) || 6;
      
      candidates.push({
        symbol,
        sector,
        sectorRank,
        currentPrice: current.close,
        dailyChange: Math.round(dailyChange * 100) / 100,
        weeklyChange: Math.round(weeklyChange * 100) / 100,
        trend,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        atr: Math.round(atr * 100) / 100,
        atrPercent: Math.round((atr / current.close) * 10000) / 100,
        priceVsEma20: Math.round(((current.close - ema20) / ema20) * 10000) / 100,
        priceVsEma50: Math.round(((current.close - ema50) / ema50) * 10000) / 100,
        nearSupport,
        nearResistance,
        setup,
        score: 0
      });
      
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      // Skip symbol on error
    }
  }
  
  return candidates;
}

function getSectorEtf(sector: string): string {
  const sectorToEtf: Record<string, string> = {
    'Technology': 'XLK',
    'Financials': 'XLF',
    'Healthcare': 'XLV',
    'Energy': 'XLE',
    'Consumer Discretionary': 'XLY',
    'Consumer Staples': 'XLP',
    'Industrials': 'XLI',
    'Communications': 'XLC',
    'Utilities': 'XLU',
    'Real Estate': 'XLRE',
    'Materials': 'XLB'
  };
  return sectorToEtf[sector] || 'SPY';
}

function selectAlgoTrades(
  candidates: AlgoSwingCandidate[],
  marketContext: MarketContext | null,
  maxTrades: number = 3
): AlgoSwingTrade[] {
  const trades: AlgoSwingTrade[] = [];
  
  const scoredLongs: { candidate: AlgoSwingCandidate; score: number }[] = [];
  const scoredShorts: { candidate: AlgoSwingCandidate; score: number }[] = [];
  
  for (const candidate of candidates) {
    const longScore = scoreCandidate(candidate, marketContext, 'long');
    const shortScore = scoreCandidate(candidate, marketContext, 'short');
    
    if (longScore >= 40) {
      scoredLongs.push({ candidate, score: longScore });
    }
    if (shortScore >= 40) {
      scoredShorts.push({ candidate, score: shortScore });
    }
  }
  
  scoredLongs.sort((a, b) => b.score - a.score);
  scoredShorts.sort((a, b) => b.score - a.score);
  
  const marketBias = marketContext?.regime === 'risk_on' ? 'long' : 
                     marketContext?.regime === 'risk_off' ? 'short' : 'neutral';
  
  let longCount = 0;
  let shortCount = 0;
  
  if (marketBias === 'long') {
    longCount = Math.min(2, scoredLongs.length);
    shortCount = Math.min(1, scoredShorts.length);
  } else if (marketBias === 'short') {
    longCount = Math.min(1, scoredLongs.length);
    shortCount = Math.min(2, scoredShorts.length);
  } else {
    longCount = Math.min(2, scoredLongs.length);
    shortCount = Math.min(1, scoredShorts.length);
  }
  
  for (let i = 0; i < longCount; i++) {
    const { candidate, score } = scoredLongs[i];
    const atrMultiplier = 1.5;
    const targetMultiplier = 2.5;
    
    trades.push({
      symbol: candidate.symbol,
      direction: 'long',
      entry: candidate.currentPrice,
      stopLoss: candidate.currentPrice - (candidate.atr * atrMultiplier),
      target: candidate.currentPrice + (candidate.atr * targetMultiplier),
      score,
      reasons: buildReasons(candidate, 'long', marketContext)
    });
  }
  
  for (let i = 0; i < shortCount; i++) {
    const { candidate, score } = scoredShorts[i];
    const atrMultiplier = 1.5;
    const targetMultiplier = 2.5;
    
    trades.push({
      symbol: candidate.symbol,
      direction: 'short',
      entry: candidate.currentPrice,
      stopLoss: candidate.currentPrice + (candidate.atr * atrMultiplier),
      target: candidate.currentPrice - (candidate.atr * targetMultiplier),
      score,
      reasons: buildReasons(candidate, 'short', marketContext)
    });
  }
  
  return trades.slice(0, maxTrades);
}

function buildReasons(
  candidate: AlgoSwingCandidate,
  direction: 'long' | 'short',
  marketContext: MarketContext | null
): string[] {
  const reasons: string[] = [];
  
  reasons.push(`Trend: ${candidate.trend}`);
  reasons.push(`Sector rank: #${candidate.sectorRank}`);
  reasons.push(`Volume: ${candidate.volumeRatio}x avg`);
  
  if (candidate.setup !== 'no_clear_setup') {
    reasons.push(`Setup: ${candidate.setup}`);
  }
  
  if (marketContext) {
    reasons.push(`Market: ${marketContext.regime}`);
  }
  
  return reasons;
}

async function simulateAlgoTrade(
  trade: AlgoSwingTrade,
  entryDate: string,
  maxDays: number = 5
): Promise<AlgoBacktestResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  
  try {
    const startDate = entryDate;
    const endDateObj = new Date(entryDate);
    endDateObj.setDate(endDateObj.getDate() + maxDays + 5);
    const endDate = endDateObj.toISOString().split('T')[0];
    
    const candles = await fetchHistoricalBars(apiKey, trade.symbol, startDate, endDate, 'day', 1, 15);
    
    if (candles.length < 2) return null;
    
    const entryCandle = candles[0];
    const actualEntry = entryCandle.open;
    
    const riskAmount = Math.abs(trade.entry - trade.stopLoss);
    const targetDistance = Math.abs(trade.target - trade.entry);
    
    let actualStop: number;
    let actualTarget: number;
    
    if (trade.direction === 'long') {
      actualStop = actualEntry - riskAmount;
      actualTarget = actualEntry + targetDistance;
    } else {
      actualStop = actualEntry + riskAmount;
      actualTarget = actualEntry - targetDistance;
    }
    
    let exitPrice = actualEntry;
    let exitReason: 'target_hit' | 'stop_hit' | 'time_exit' = 'time_exit';
    let exitDate = entryDate;
    let daysHeld = 0;
    
    for (let i = 1; i < Math.min(candles.length, maxDays + 1); i++) {
      const candle = candles[i];
      daysHeld = i;
      exitDate = candle.start.split('T')[0];
      
      if (trade.direction === 'long') {
        if (candle.low <= actualStop) {
          exitPrice = actualStop;
          exitReason = 'stop_hit';
          break;
        }
        if (candle.high >= actualTarget) {
          exitPrice = actualTarget;
          exitReason = 'target_hit';
          break;
        }
      } else {
        if (candle.high >= actualStop) {
          exitPrice = actualStop;
          exitReason = 'stop_hit';
          break;
        }
        if (candle.low <= actualTarget) {
          exitPrice = actualTarget;
          exitReason = 'target_hit';
          break;
        }
      }
      
      exitPrice = candle.close;
    }
    
    const pnlPercent = trade.direction === 'long'
      ? ((exitPrice - actualEntry) / actualEntry) * 100
      : ((actualEntry - exitPrice) / actualEntry) * 100;
    
    return {
      entryDate,
      exitDate,
      symbol: trade.symbol,
      direction: trade.direction,
      entry: actualEntry,
      stopLoss: actualStop,
      target: actualTarget,
      exitPrice,
      exitReason,
      daysHeld,
      pnlPercent: Math.round(pnlPercent * 100) / 100
    };
  } catch (error) {
    return null;
  }
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const holidays = [
    '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29',
    '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02',
    '2024-11-28', '2024-12-25',
    '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18',
    '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01',
    '2025-11-27', '2025-12-25'
  ];
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().split('T')[0];
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateStr)) {
      days.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export async function runAlgoSwingBacktest(
  startDate: string,
  endDate: string
): Promise<AlgoBacktestSummary> {
  console.log(`[ALGO SWING BACKTEST] Running from ${startDate} to ${endDate}`);
  
  const tradingDays = getTradingDays(startDate, endDate);
  console.log(`[ALGO SWING BACKTEST] ${tradingDays.length} trading days to analyze`);
  
  const allTrades: AlgoBacktestResult[] = [];
  
  for (let i = 0; i < tradingDays.length; i++) {
    const date = tradingDays[i];
    console.log(`[ALGO SWING BACKTEST] Analyzing ${date} (${i + 1}/${tradingDays.length})`);
    
    try {
      const marketContext = await getMarketContext(date);
      const sectorAnalysis = await getSectorAnalysis(date, marketContext?.spy.changePercent || 0);
      
      const candidates = await buildAlgoCandidates(date, sectorAnalysis);
      console.log(`[ALGO SWING BACKTEST] Built ${candidates.length} candidates`);
      
      const trades = selectAlgoTrades(candidates, marketContext, 3);
      console.log(`[ALGO SWING BACKTEST] Selected ${trades.length} trades`);
      
      for (const trade of trades) {
        const result = await simulateAlgoTrade(trade, date);
        
        if (result) {
          allTrades.push(result);
          console.log(`[ALGO SWING BACKTEST] ${result.symbol} ${result.direction}: ${result.pnlPercent >= 0 ? '+' : ''}${result.pnlPercent}% (${result.exitReason}, ${result.daysHeld} days)`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[ALGO SWING BACKTEST] Error on ${date}:`, error);
    }
  }
  
  const winners = allTrades.filter(t => t.pnlPercent > 0);
  const losers = allTrades.filter(t => t.pnlPercent <= 0);
  const totalPnl = allTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgDaysHeld = allTrades.length > 0 
    ? allTrades.reduce((sum, t) => sum + t.daysHeld, 0) / allTrades.length 
    : 0;
  
  const targetHits = allTrades.filter(t => t.exitReason === 'target_hit').length;
  const stopHits = allTrades.filter(t => t.exitReason === 'stop_hit').length;
  const timeExits = allTrades.filter(t => t.exitReason === 'time_exit').length;
  
  console.log(`[ALGO SWING BACKTEST] Complete: ${allTrades.length} trades, ${winners.length}W/${losers.length}L, P&L: ${totalPnl.toFixed(2)}%`);
  
  return {
    startDate,
    endDate,
    totalDays: tradingDays.length,
    totalTrades: allTrades.length,
    winners: winners.length,
    losers: losers.length,
    winRate: allTrades.length > 0 ? Math.round((winners.length / allTrades.length) * 100) : 0,
    totalPnlPercent: Math.round(totalPnl * 100) / 100,
    avgPnlPerTrade: allTrades.length > 0 ? Math.round((totalPnl / allTrades.length) * 100) / 100 : 0,
    avgDaysHeld: Math.round(avgDaysHeld * 10) / 10,
    targetHits,
    stopHits,
    timeExits,
    allTrades
  };
}
