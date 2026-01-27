import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface MeanReversionCandidate {
  symbol: string;
  date: string;
  openPrice: number;
  currentPrice: number;
  dropPercent: number;
  vwap: number;
  distanceFromVwap: number;
  volume: number;
  avgVolume: number;
  relativeVolume: number;
  score: number;
  reasons: string[];
}

export interface MeanReversionTrade {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  target: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'target' | 'stop_loss' | 'end_of_day';
  pnl?: number;
  pnlPercent?: number;
  positionSize: number;
  status: 'pending' | 'filled' | 'closed';
}

interface PolygonBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw: number;
  t: number;
  n: number;
}

async function makePolygonRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${POLYGON_BASE_URL}${endpoint}`);
  url.searchParams.append('apiKey', POLYGON_API_KEY);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  
  const response = await axios.get(url.toString());
  return response.data;
}

async function getIntradayBars(symbol: string, date: string, multiplier: number = 1, timespan: string = 'minute'): Promise<PolygonBar[]> {
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${date}/${date}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    return data.results || [];
  } catch (error) {
    return [];
  }
}

async function getDailyBars(symbol: string, fromDate: string, toDate: string): Promise<PolygonBar[]> {
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}`,
      { adjusted: 'true', sort: 'asc', limit: '50' }
    );
    return data.results || [];
  } catch (error) {
    return [];
  }
}

function isMarketHours(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
}

function isTradingWindow(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  const windowStart = 15 * 60; // 10:30 AM EST = 15:00 UTC (30 min after open, let volatility settle)
  const windowEnd = 20 * 60;   // 3:00 PM EST = 20:00 UTC (1 hour before close)
  
  return totalMinutes >= windowStart && totalMinutes < windowEnd;
}

function getMinutesSinceOpen(timestamp: number): number {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 14 * 60 + 30;
  
  return totalMinutes - marketOpenMinutes;
}

function calculateVWAP(bars: PolygonBar[]): number {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const bar of bars) {
    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
    cumulativeTPV += typicalPrice * bar.v;
    cumulativeVolume += bar.v;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

export const LARGE_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
  'JPM', 'V', 'PG', 'XOM', 'HD', 'CVX', 'MA', 'ABBV', 'MRK', 'LLY',
  'PEP', 'KO', 'PFE', 'COST', 'TMO', 'AVGO', 'MCD', 'WMT', 'CSCO', 'ACN',
  'ABT', 'DHR', 'BAC', 'CRM', 'ADBE', 'CMCSA', 'NKE', 'DIS', 'VZ', 'INTC',
  'NFLX', 'PM', 'TXN', 'WFC', 'AMD', 'NEE', 'RTX', 'UPS', 'HON', 'QCOM',
  'IBM', 'LOW', 'SPGI', 'CAT', 'GE', 'INTU', 'BA', 'AMAT', 'DE', 'SBUX',
  'GS', 'MS', 'BLK', 'AXP', 'ISRG', 'MDLZ', 'PLD', 'GILD', 'ADI', 'BKNG',
  'SYK', 'MMC', 'VRTX', 'TJX', 'ADP', 'REGN', 'ZTS', 'LRCX', 'CVS', 'CI',
  'CB', 'SO', 'MO', 'DUK', 'CL', 'BSX', 'CME', 'BDX', 'NOC', 'ITW',
  'EQIX', 'SHW', 'MU', 'SNPS', 'CDNS', 'ICE', 'FDX', 'MCO', 'PNC', 'USB'
];

async function getGroupedDaily(date: string): Promise<Map<string, { o: number; h: number; l: number; c: number }>> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    
    const map = new Map<string, { o: number; h: number; l: number; c: number }>();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { o: bar.o, h: bar.h, l: bar.l, c: bar.c });
      }
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

async function checkMarketCondition(date: string, maxSpyDropPercent: number = 1.5, requireGreenSpy: boolean = false): Promise<{ safe: boolean; spyChange: number }> {
  try {
    const dailyData = await getGroupedDaily(date);
    const spy = dailyData.get('SPY');
    
    if (!spy) {
      return { safe: true, spyChange: 0 };
    }
    
    const spyChange = ((spy.c - spy.o) / spy.o) * 100;
    
    let safe: boolean;
    if (requireGreenSpy) {
      safe = spyChange > 0;
    } else {
      safe = spyChange > -maxSpyDropPercent;
    }
    
    return { safe, spyChange };
  } catch (error) {
    return { safe: true, spyChange: 0 };
  }
}

export async function findMeanReversionCandidates(
  date: string,
  config: {
    minDropPercent: number;
    maxDropPercent: number;
    minPrice: number;
    maxPrice: number;
    checkSpyFilter?: boolean;
    maxSpyDropPercent?: number;
    requireGreenSpy?: boolean;
  }
): Promise<MeanReversionCandidate[]> {
  const candidates: MeanReversionCandidate[] = [];
  
  const dailyData = await getGroupedDaily(date);
  
  if (dailyData.size === 0) {
    return candidates;
  }
  
  if (config.checkSpyFilter !== false) {
    const { safe, spyChange } = await checkMarketCondition(date, config.maxSpyDropPercent || 1.5, config.requireGreenSpy || false);
    if (!safe) {
      const reason = config.requireGreenSpy ? 'SPY is red' : `SPY ${spyChange.toFixed(2)}%`;
      console.log(`  ⚠️ SPY filter triggered: ${reason} - skipping day`);
      return candidates;
    }
  }
  
  const potentialDrops: string[] = [];
  for (const symbol of LARGE_CAP_SYMBOLS) {
    const bar = dailyData.get(symbol);
    if (!bar) continue;
    
    if (bar.o < config.minPrice || bar.o > config.maxPrice) continue;
    
    const intradayDrop = ((bar.o - bar.l) / bar.o) * 100;
    if (intradayDrop >= config.minDropPercent && intradayDrop <= config.maxDropPercent) {
      potentialDrops.push(symbol);
    }
  }
  
  for (const symbol of potentialDrops) {
    try {
      const bars = await getIntradayBars(symbol, date, 5, 'minute');
      
      if (!bars || bars.length < 20) continue;
      
      const marketBars = bars.filter(b => isMarketHours(b.t));
      if (marketBars.length < 10) continue;
      
      const openPrice = marketBars[0].o;
      
      const tradingWindowBars = marketBars.filter(b => isTradingWindow(b.t));
      
      for (const bar of tradingWindowBars) {
        const currentPrice = bar.l;
        const dropPercent = ((openPrice - currentPrice) / openPrice) * 100;
        
        if (dropPercent >= config.minDropPercent && dropPercent <= config.maxDropPercent) {
          const barsUpToNow = marketBars.filter(b => b.t <= bar.t);
          const vwap = calculateVWAP(barsUpToNow);
          const distanceFromVwap = ((vwap - currentPrice) / vwap) * 100;
          
          if (distanceFromVwap > 0.5) {
            const volume = barsUpToNow.reduce((sum, b) => sum + b.v, 0);
            
            let score = 0;
            const reasons: string[] = [];
            
            if (dropPercent >= 3) {
              score += 30;
              reasons.push(`Strong drop -${dropPercent.toFixed(1)}%`);
            } else if (dropPercent >= 2.5) {
              score += 25;
              reasons.push(`Good drop -${dropPercent.toFixed(1)}%`);
            } else {
              score += 20;
              reasons.push(`Drop -${dropPercent.toFixed(1)}%`);
            }
            
            if (distanceFromVwap >= 2) {
              score += 25;
              reasons.push(`${distanceFromVwap.toFixed(1)}% below VWAP`);
            } else if (distanceFromVwap >= 1) {
              score += 15;
              reasons.push(`${distanceFromVwap.toFixed(1)}% below VWAP`);
            }
            
            const minutesSinceOpen = getMinutesSinceOpen(bar.t);
            if (minutesSinceOpen >= 60 && minutesSinceOpen <= 240) {
              score += 20;
              reasons.push('Optimal time window');
            }
            
            candidates.push({
              symbol,
              date,
              openPrice,
              currentPrice,
              dropPercent,
              vwap,
              distanceFromVwap,
              volume,
              avgVolume: 0,
              relativeVolume: 0,
              score,
              reasons
            });
            
            break;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
    } catch (error) {
      continue;
    }
  }
  
  return candidates.sort((a, b) => b.score - a.score);
}

export async function simulateMeanReversionTrade(
  candidate: MeanReversionCandidate,
  config: {
    positionSize: number;
    stopLossPercent: number;
    targetType: 'vwap' | 'open' | 'fixed';
    fixedTargetPercent?: number;
  }
): Promise<MeanReversionTrade | null> {
  const bars = await getIntradayBars(candidate.symbol, candidate.date, 1, 'minute');
  
  if (!bars || bars.length === 0) return null;
  
  const marketBars = bars.filter(b => isMarketHours(b.t));
  if (marketBars.length < 30) return null;
  
  let entryBar: PolygonBar | null = null;
  let entryIndex = -1;
  
  for (let i = 0; i < marketBars.length; i++) {
    const bar = marketBars[i];
    if (!isTradingWindow(bar.t)) continue;
    
    const dropFromOpen = ((candidate.openPrice - bar.l) / candidate.openPrice) * 100;
    
    if (dropFromOpen >= candidate.dropPercent * 0.95) {
      entryBar = bar;
      entryIndex = i;
      break;
    }
  }
  
  if (!entryBar || entryIndex < 0) return null;
  
  const entryPrice = entryBar.c;
  const stopLoss = entryPrice * (1 - config.stopLossPercent / 100);
  
  let target: number;
  if (config.targetType === 'vwap') {
    target = candidate.vwap;
  } else if (config.targetType === 'open') {
    target = candidate.openPrice;
  } else {
    target = entryPrice * (1 + (config.fixedTargetPercent || 1.5) / 100);
  }
  
  const riskPerShare = entryPrice - stopLoss;
  const shares = Math.floor((config.positionSize * 0.02) / riskPerShare);
  
  if (shares < 1) return null;
  
  const actualPositionSize = shares * entryPrice;
  
  let trade: MeanReversionTrade = {
    symbol: candidate.symbol,
    date: candidate.date,
    entryTime: new Date(entryBar.t).toISOString(),
    entryPrice,
    stopLoss,
    target,
    positionSize: actualPositionSize,
    status: 'filled'
  };
  
  for (let i = entryIndex + 1; i < marketBars.length; i++) {
    const bar = marketBars[i];
    
    if (bar.l <= stopLoss) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = stopLoss;
      trade.exitReason = 'stop_loss';
      trade.status = 'closed';
      break;
    }
    
    if (bar.h >= target) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = target;
      trade.exitReason = 'target';
      trade.status = 'closed';
      break;
    }
  }
  
  if (trade.status === 'filled') {
    const lastBar = marketBars[marketBars.length - 1];
    trade.exitTime = new Date(lastBar.t).toISOString();
    trade.exitPrice = lastBar.c;
    trade.exitReason = 'end_of_day';
    trade.status = 'closed';
  }
  
  if (trade.exitPrice && trade.status === 'closed') {
    const pnlPerShare = trade.exitPrice - trade.entryPrice;
    trade.pnl = pnlPerShare * shares;
    trade.pnlPercent = (pnlPerShare / trade.entryPrice) * 100;
  }
  
  return trade;
}

export interface MeanReversionBacktestConfig {
  startDate: string;
  endDate: string;
  positionSize: number;
  maxDailyTrades: number;
  minDropPercent: number;
  maxDropPercent: number;
  stopLossPercent: number;
  targetType: 'vwap' | 'open' | 'fixed';
  fixedTargetPercent?: number;
  minPrice: number;
  maxPrice: number;
  minScore: number;
  useSpyFilter?: boolean;
  maxSpyDropPercent?: number;
  requireGreenSpy?: boolean;
}

export interface MeanReversionBacktestResult {
  config: MeanReversionBacktestConfig;
  trades: MeanReversionTrade[];
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    bestTrade: number;
    worstTrade: number;
  };
  monthlyPerformance: { month: string; trades: number; pnl: number; winRate: number }[];
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export async function backtestMeanReversion(config: MeanReversionBacktestConfig): Promise<MeanReversionBacktestResult> {
  console.log('\n=== MEAN REVERSION BACKTEST ===');
  console.log('Config:', config);
  
  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Testing ${tradingDays.length} trading days`);
  
  const allTrades: MeanReversionTrade[] = [];
  
  for (const day of tradingDays) {
    console.log(`\nProcessing ${day}...`);
    
    const candidates = await findMeanReversionCandidates(day, {
      minDropPercent: config.minDropPercent,
      maxDropPercent: config.maxDropPercent,
      minPrice: config.minPrice,
      maxPrice: config.maxPrice,
      checkSpyFilter: config.useSpyFilter !== false,
      maxSpyDropPercent: config.maxSpyDropPercent || 1.5,
      requireGreenSpy: config.requireGreenSpy || false
    });
    
    const qualifiedCandidates = candidates.filter(c => c.score >= config.minScore);
    
    console.log(`  Found ${candidates.length} candidates, ${qualifiedCandidates.length} qualified`);
    
    let dailyTrades = 0;
    
    for (const candidate of qualifiedCandidates) {
      if (dailyTrades >= config.maxDailyTrades) break;
      
      const trade = await simulateMeanReversionTrade(candidate, {
        positionSize: config.positionSize,
        stopLossPercent: config.stopLossPercent,
        targetType: config.targetType,
        fixedTargetPercent: config.fixedTargetPercent
      });
      
      if (trade && trade.status === 'closed') {
        allTrades.push(trade);
        dailyTrades++;
        
        const emoji = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
        console.log(`  ${emoji} ${trade.symbol}: Entry $${trade.entryPrice.toFixed(2)} -> Exit $${trade.exitPrice?.toFixed(2)} (${trade.exitReason}) = $${trade.pnl?.toFixed(2)}`);
      }
    }
  }
  
  const winners = allTrades.filter(t => t.pnl && t.pnl > 0);
  const losers = allTrades.filter(t => t.pnl && t.pnl <= 0);
  
  const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length) : 0;
  
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  
  for (const trade of allTrades) {
    runningPnL += trade.pnl || 0;
    if (runningPnL > peak) {
      peak = runningPnL;
    }
    const drawdown = peak - runningPnL;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const trade of allTrades) {
    const month = trade.date.substring(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { trades: 0, wins: 0, pnl: 0 });
    }
    const m = monthlyMap.get(month)!;
    m.trades++;
    m.pnl += trade.pnl || 0;
    if (trade.pnl && trade.pnl > 0) m.wins++;
  }
  
  const monthlyPerformance = Array.from(monthlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, stats]) => ({
      month,
      trades: stats.trades,
      pnl: stats.pnl,
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0
    }));
  
  const result: MeanReversionBacktestResult = {
    config,
    trades: allTrades,
    summary: {
      totalTrades: allTrades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      bestTrade: allTrades.length > 0 ? Math.max(...allTrades.map(t => t.pnl || 0)) : 0,
      worstTrade: allTrades.length > 0 ? Math.min(...allTrades.map(t => t.pnl || 0)) : 0
    },
    monthlyPerformance
  };
  
  console.log('\n=== BACKTEST RESULTS ===');
  console.log(`Total Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(2)}`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(2)}`);
  console.log(`Avg Loss: $${result.summary.avgLoss.toFixed(2)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(2)}`);
  console.log(`Best Trade: $${result.summary.bestTrade.toFixed(2)}`);
  console.log(`Worst Trade: $${result.summary.worstTrade.toFixed(2)}`);
  
  console.log('\n=== MONTHLY PERFORMANCE ===');
  for (const m of monthlyPerformance) {
    console.log(`${m.month} | Trades: ${m.trades} | WR: ${m.winRate.toFixed(1)}% | P&L: $${m.pnl.toFixed(2)}`);
  }
  
  return result;
}
