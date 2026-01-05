import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface DaySniperCandidate {
  symbol: string;
  date: string;
  gapPercent: number;
  previousClose: number;
  openPrice: number;
  high20Day: number;
  first15MinHigh: number;
  first15MinLow: number;
  first15MinClose: number;
  volume: number;
  score: number;
  reasons: string[];
}

export interface DaySniperTrade {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'stop_loss' | 'end_of_day' | 'not_filled';
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

function isMarketOpen(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
}

function getMinutesSinceOpen(timestamp: number): number {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 14 * 60 + 30;
  
  return totalMinutes - marketOpenMinutes;
}

export async function analyzeDaySniperSetup(
  symbol: string,
  date: string,
  previousClose: number,
  high20Day: number
): Promise<DaySniperCandidate | null> {
  
  const bars = await getIntradayBars(symbol, date, 1, 'minute');
  
  if (!bars || bars.length === 0) {
    return null;
  }
  
  const marketBars = bars.filter(b => isMarketOpen(b.t));
  
  if (marketBars.length < 15) {
    return null;
  }
  
  const openPrice = marketBars[0].o;
  const gapPercent = ((openPrice - previousClose) / previousClose) * 100;
  
  if (gapPercent < 1) {
    return null;
  }
  
  if (openPrice <= high20Day) {
    return null;
  }
  
  const first15MinBars = marketBars.filter(b => getMinutesSinceOpen(b.t) < 15);
  
  if (first15MinBars.length === 0) {
    return null;
  }
  
  const first15MinHigh = Math.max(...first15MinBars.map(b => b.h));
  const first15MinLow = Math.min(...first15MinBars.map(b => b.l));
  const first15MinClose = first15MinBars[first15MinBars.length - 1].c;
  const volume = first15MinBars.reduce((sum, b) => sum + b.v, 0);
  
  let score = 0;
  const reasons: string[] = [];
  
  if (gapPercent >= 5) {
    score += 30;
    reasons.push(`Strong gap +${gapPercent.toFixed(1)}%`);
  } else if (gapPercent >= 3) {
    score += 20;
    reasons.push(`Good gap +${gapPercent.toFixed(1)}%`);
  } else {
    score += 10;
    reasons.push(`Gap +${gapPercent.toFixed(1)}%`);
  }
  
  const gapAbove20Day = ((openPrice - high20Day) / high20Day) * 100;
  if (gapAbove20Day >= 3) {
    score += 25;
    reasons.push(`Gapped ${gapAbove20Day.toFixed(1)}% above 20-day high`);
  } else {
    score += 15;
    reasons.push(`Above 20-day high`);
  }
  
  if (first15MinClose > first15MinBars[0].o) {
    score += 20;
    reasons.push('First 15-min candle is green (bullish)');
  }
  
  if (first15MinClose > (first15MinHigh + first15MinLow) / 2) {
    score += 15;
    reasons.push('Closed in upper half of range');
  }
  
  if (volume > 500000) {
    score += 10;
    reasons.push(`High volume ${(volume / 1000000).toFixed(1)}M`);
  }
  
  return {
    symbol,
    date,
    gapPercent,
    previousClose,
    openPrice,
    high20Day,
    first15MinHigh,
    first15MinLow,
    first15MinClose,
    volume,
    score,
    reasons
  };
}

export async function simulateDaySniperTrade(
  candidate: DaySniperCandidate,
  positionSize: number = 10000
): Promise<DaySniperTrade | null> {
  
  const bars = await getIntradayBars(candidate.symbol, candidate.date, 1, 'minute');
  
  if (!bars || bars.length === 0) {
    return null;
  }
  
  const marketBars = bars.filter(b => isMarketOpen(b.t));
  
  if (marketBars.length < 20) {
    return null;
  }
  
  const entryPrice = candidate.first15MinClose;
  const stopLoss = candidate.first15MinLow;
  
  if (entryPrice <= stopLoss) {
    return null;
  }
  
  const riskPerShare = entryPrice - stopLoss;
  const maxRiskDollars = positionSize * 0.02;
  const shares = Math.floor(maxRiskDollars / riskPerShare);
  
  if (shares < 1) {
    return null;
  }
  
  const actualPositionSize = shares * entryPrice;
  
  const barsAfter15Min = marketBars.filter(b => getMinutesSinceOpen(b.t) >= 15);
  
  if (barsAfter15Min.length === 0) {
    return null;
  }
  
  let filled = false;
  let fillBar: PolygonBar | null = null;
  
  for (const bar of barsAfter15Min.slice(0, 15)) {
    if (bar.l <= entryPrice) {
      filled = true;
      fillBar = bar;
      break;
    }
  }
  
  if (!filled || !fillBar) {
    return {
      symbol: candidate.symbol,
      date: candidate.date,
      entryTime: '',
      entryPrice: entryPrice,
      stopLoss,
      exitReason: 'not_filled',
      pnl: 0,
      pnlPercent: 0,
      positionSize: actualPositionSize,
      status: 'closed'
    };
  }
  
  let trade: DaySniperTrade = {
    symbol: candidate.symbol,
    date: candidate.date,
    entryTime: new Date(fillBar.t).toISOString(),
    entryPrice: entryPrice,
    stopLoss,
    positionSize: actualPositionSize,
    status: 'filled'
  };
  
  const fillIndex = barsAfter15Min.indexOf(fillBar);
  const barsAfterFill = barsAfter15Min.slice(fillIndex + 1);
  
  for (const bar of barsAfterFill) {
    if (bar.l <= stopLoss) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = stopLoss;
      trade.exitReason = 'stop_loss';
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

export interface DaySniperBacktestConfig {
  startDate: string;
  endDate: string;
  positionSize: number;
  maxDailyTrades: number;
  minScore: number;
  minGapPercent: number;
  maxGapPercent: number;
  minPrice: number;
  maxPrice: number;
}

export interface DaySniperBacktestResult {
  config: DaySniperBacktestConfig;
  trades: DaySniperTrade[];
  summary: {
    totalTrades: number;
    filledTrades: number;
    notFilledTrades: number;
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

async function getGroupedDaily(date: string): Promise<Map<string, { c: number; h: number }>> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    
    const map = new Map<string, { c: number; h: number }>();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { c: bar.c, h: bar.h });
      }
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

const LARGE_CAP_STOCKS = new Set([
  'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX', 'ADBE', 'CRM',
  'PYPL', 'INTC', 'CSCO', 'CMCSA', 'PEP', 'COST', 'TMUS', 'AVGO', 'TXN', 'QCOM',
  'INTU', 'AMAT', 'AMD', 'SBUX', 'GILD', 'BKNG', 'MDLZ', 'ADP', 'ISRG', 'REGN',
  'VRTX', 'LRCX', 'FISV', 'CSX', 'ORLY', 'BIIB', 'KLAC', 'SNPS', 'CDNS', 'MELI',
  'ASML', 'TEAM', 'ADSK', 'WDAY', 'ZM', 'ZS', 'JNJ', 'JPM', 'V', 'PG', 'HD', 'MA',
  'BAC', 'WMT', 'DIS', 'KO', 'PFE', 'MRK', 'UNH', 'CVX', 'XOM', 'VZ', 'T', 'MMM',
  'CAT', 'BA', 'IBM', 'GE', 'GM', 'F', 'C', 'WFC', 'ABBV', 'TMO', 'ACN', 'NKE',
  'LLY', 'DHR', 'MDT', 'ABT', 'BMY', 'AMGN', 'PM', 'NEE', 'LOW', 'UNP', 'HON',
  'SPGI', 'LIN', 'RTX', 'GS', 'BLK', 'AXP', 'MS', 'NOW', 'AMT', 'PLD', 'SYK',
  'TJX', 'ZTS', 'BDX', 'SO', 'DUK', 'SHW', 'CMG', 'MU', 'DE', 'ICE', 'NOC', 'EMR',
  'GD', 'TGT', 'ITW', 'ECL', 'NSC', 'MCO', 'FCX', 'SPG', 'EOG', 'SLB', 'OXY'
]);

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

async function get20DayHigh(symbol: string, beforeDate: string): Promise<number | null> {
  try {
    const endDate = new Date(beforeDate);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);
    
    const bars = await getDailyBars(
      symbol,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    
    if (bars.length < 10) {
      return null;
    }
    
    const last20 = bars.slice(-20);
    return Math.max(...last20.map(b => b.h));
  } catch (error) {
    return null;
  }
}

export async function backtestDaySniper(config: DaySniperBacktestConfig): Promise<DaySniperBacktestResult> {
  console.log('\n=== DAY SNIPER BACKTEST (Kratter Strategy) ===');
  console.log('Config:', config);
  
  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Testing ${tradingDays.length} trading days`);
  
  const allTrades: DaySniperTrade[] = [];
  let previousDayData: Map<string, { c: number; h: number }> = new Map();
  
  const high20DayCache = new Map<string, number>();
  
  for (let i = 1; i < tradingDays.length; i++) {
    const today = tradingDays[i];
    const yesterday = tradingDays[i - 1];
    
    console.log(`\nProcessing ${today}...`);
    
    if (previousDayData.size === 0) {
      previousDayData = await getGroupedDaily(yesterday);
    }
    
    const todayData = await getGroupedDaily(today);
    
    if (todayData.size === 0) {
      console.log(`  No data for ${today}, skipping`);
      previousDayData = todayData;
      continue;
    }
    
    const candidates: { symbol: string; gapPercent: number; price: number; prevClose: number }[] = [];
    
    for (const [symbol, bar] of todayData) {
      if (!LARGE_CAP_STOCKS.has(symbol)) {
        continue;
      }
      
      const prevBar = previousDayData.get(symbol);
      if (!prevBar) continue;
      
      const gapPercent = ((bar.c - prevBar.c) / prevBar.c) * 100;
      
      if (gapPercent >= config.minGapPercent && 
          gapPercent <= config.maxGapPercent &&
          bar.c >= config.minPrice &&
          bar.c <= config.maxPrice) {
        candidates.push({ symbol, gapPercent, price: bar.c, prevClose: prevBar.c });
      }
    }
    
    candidates.sort((a, b) => b.gapPercent - a.gapPercent);
    const topCandidates = candidates.slice(0, 10);
    
    console.log(`  Found ${candidates.length} gap candidates, analyzing top ${topCandidates.length}`);
    
    let dailyTrades = 0;
    
    for (const cand of topCandidates) {
      if (dailyTrades >= config.maxDailyTrades) break;
      
      try {
        let high20Day = high20DayCache.get(cand.symbol);
        if (high20Day === undefined) {
          high20Day = await get20DayHigh(cand.symbol, today) || 0;
          high20DayCache.set(cand.symbol, high20Day);
        }
        
        if (high20Day <= 0) {
          continue;
        }
        
        const setup = await analyzeDaySniperSetup(cand.symbol, today, cand.prevClose, high20Day);
        
        if (!setup || setup.score < config.minScore) {
          continue;
        }
        
        if (setup.openPrice <= high20Day) {
          console.log(`  ⏭️ ${cand.symbol}: Skipped - did not gap above 20-day high`);
          continue;
        }
        
        const trade = await simulateDaySniperTrade(setup, config.positionSize);
        
        if (trade) {
          allTrades.push(trade);
          
          if (trade.exitReason !== 'not_filled') {
            dailyTrades++;
            const emoji = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
            console.log(`  ${emoji} ${trade.symbol}: Entry $${trade.entryPrice.toFixed(2)} -> Exit $${trade.exitPrice?.toFixed(2)} (${trade.exitReason}) = $${trade.pnl?.toFixed(2)}`);
          } else {
            console.log(`  ⏭️ ${trade.symbol}: Not filled (price didn't pull back to entry)`);
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.warn(`  Error processing ${cand.symbol}:`, error);
      }
    }
    
    previousDayData = todayData;
    high20DayCache.clear();
  }
  
  const filledTrades = allTrades.filter(t => t.exitReason !== 'not_filled');
  const notFilledTrades = allTrades.filter(t => t.exitReason === 'not_filled');
  const winners = filledTrades.filter(t => t.pnl && t.pnl > 0);
  const losers = filledTrades.filter(t => t.pnl && t.pnl <= 0);
  
  const totalPnL = filledTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length) : 0;
  
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  
  for (const trade of filledTrades) {
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
  for (const trade of filledTrades) {
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
  
  const result: DaySniperBacktestResult = {
    config,
    trades: allTrades,
    summary: {
      totalTrades: allTrades.length,
      filledTrades: filledTrades.length,
      notFilledTrades: notFilledTrades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate: filledTrades.length > 0 ? (winners.length / filledTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      bestTrade: filledTrades.length > 0 ? Math.max(...filledTrades.map(t => t.pnl || 0)) : 0,
      worstTrade: filledTrades.length > 0 ? Math.min(...filledTrades.map(t => t.pnl || 0)) : 0
    },
    monthlyPerformance
  };
  
  console.log('\n=== BACKTEST RESULTS ===');
  console.log(`Total Setups: ${result.summary.totalTrades}`);
  console.log(`Filled Trades: ${result.summary.filledTrades}`);
  console.log(`Not Filled: ${result.summary.notFilledTrades}`);
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
