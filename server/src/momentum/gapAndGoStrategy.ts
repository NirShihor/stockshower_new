import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

export interface GapAndGoCandidate {
  symbol: string;
  date: string;
  gapPercent: number;
  previousClose: number;
  premarketHigh: number;
  premarketLow: number;
  premarketVolume: number;
  openPrice: number;
  float?: number;
  relativeVolume: number;
  score: number;
  reasons: string[];
}

export interface GapAndGoTrade {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'target1' | 'target2' | 'stop_loss' | 'time_stop' | 'end_of_day';
  pnl?: number;
  pnlPercent?: number;
  riskRewardRatio: string;
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
    console.warn(`Could not get intraday bars for ${symbol} on ${date}`);
    return [];
  }
}

function isPremarket(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // Premarket: 4:00 AM - 9:30 AM EST = 9:00 - 14:30 UTC
  return totalMinutes >= 9 * 60 && totalMinutes < 14 * 60 + 30;
}

function isMarketOpen(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // Market hours: 9:30 AM - 4:00 PM EST = 14:30 - 21:00 UTC
  return totalMinutes >= 14 * 60 + 30 && totalMinutes < 21 * 60;
}

function isFirstThirtyMinutes(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  
  // First 30 mins: 9:30 AM - 10:00 AM EST = 14:30 - 15:00 UTC
  return totalMinutes >= 14 * 60 + 30 && totalMinutes < 15 * 60;
}

export async function analyzeGapAndGoSetup(
  symbol: string,
  date: string,
  previousClose: number,
  float?: number
): Promise<GapAndGoCandidate | null> {
  
  const bars = await getIntradayBars(symbol, date, 1, 'minute');
  
  if (!bars || bars.length === 0) {
    return null;
  }
  
  // Separate premarket and market hours bars
  const premarketBars = bars.filter(b => isPremarket(b.t));
  const marketBars = bars.filter(b => isMarketOpen(b.t));
  
  if (premarketBars.length === 0 || marketBars.length === 0) {
    return null;
  }
  
  // Calculate premarket high/low
  const premarketHigh = Math.max(...premarketBars.map(b => b.h));
  const premarketLow = Math.min(...premarketBars.map(b => b.l));
  const premarketVolume = premarketBars.reduce((sum, b) => sum + b.v, 0);
  
  // Get open price (first market bar)
  const openPrice = marketBars[0].o;
  
  // Calculate gap
  const gapPercent = ((openPrice - previousClose) / previousClose) * 100;
  
  // Only interested in gap ups
  if (gapPercent < 5) {
    return null;
  }
  
  // Calculate relative volume (compare to typical premarket)
  // For simplicity, use premarket volume as indicator of interest
  const relativeVolume = premarketVolume / 100000; // Normalize
  
  // Score the setup
  let score = 0;
  const reasons: string[] = [];
  
  // Gap scoring
  if (gapPercent >= 20) {
    score += 30;
    reasons.push(`Strong gap +${gapPercent.toFixed(1)}%`);
  } else if (gapPercent >= 10) {
    score += 20;
    reasons.push(`Good gap +${gapPercent.toFixed(1)}%`);
  } else {
    score += 10;
    reasons.push(`Gap +${gapPercent.toFixed(1)}%`);
  }
  
  // Float scoring
  if (float) {
    if (float < 10000000) {
      score += 25;
      reasons.push(`Very low float ${(float / 1000000).toFixed(1)}M`);
    } else if (float < 20000000) {
      score += 20;
      reasons.push(`Low float ${(float / 1000000).toFixed(1)}M`);
    } else if (float < 50000000) {
      score += 10;
      reasons.push(`Moderate float ${(float / 1000000).toFixed(1)}M`);
    }
  }
  
  // Premarket volume scoring
  if (premarketVolume > 1000000) {
    score += 25;
    reasons.push(`High premarket volume ${(premarketVolume / 1000000).toFixed(1)}M`);
  } else if (premarketVolume > 500000) {
    score += 15;
    reasons.push(`Good premarket volume ${(premarketVolume / 1000).toFixed(0)}K`);
  } else if (premarketVolume > 100000) {
    score += 5;
    reasons.push(`Premarket volume ${(premarketVolume / 1000).toFixed(0)}K`);
  }
  
  // Price range scoring
  if (openPrice >= 2 && openPrice <= 10) {
    score += 15;
    reasons.push(`Ideal price $${openPrice.toFixed(2)}`);
  } else if (openPrice >= 1 && openPrice < 2) {
    score += 5;
    reasons.push(`Low price $${openPrice.toFixed(2)}`);
  } else if (openPrice > 10 && openPrice <= 20) {
    score += 10;
    reasons.push(`Higher price $${openPrice.toFixed(2)}`);
  }
  
  // Bull flag check: Is premarket high near the high of day potential?
  // If open is near premarket high, that's bullish
  const openVsPremarketHigh = (openPrice - premarketLow) / (premarketHigh - premarketLow);
  if (openVsPremarketHigh > 0.7) {
    score += 10;
    reasons.push('Open near premarket high (bullish)');
  }
  
  return {
    symbol,
    date,
    gapPercent,
    previousClose,
    premarketHigh,
    premarketLow,
    premarketVolume,
    openPrice,
    float,
    relativeVolume,
    score,
    reasons
  };
}

export async function simulateGapAndGoTrade(
  candidate: GapAndGoCandidate,
  positionSize: number = 10000
): Promise<GapAndGoTrade | null> {
  
  const bars = await getIntradayBars(candidate.symbol, candidate.date, 1, 'minute');
  
  if (!bars || bars.length === 0) {
    return null;
  }
  
  const marketBars = bars.filter(b => isMarketOpen(b.t));
  
  if (marketBars.length === 0) {
    return null;
  }
  
  // Entry strategy: MARKET ORDER at open (matches live trading)
  // Live trading uses market orders for immediate entry, not waiting for breakout
  const firstBar = marketBars[0];
  const entryPrice = firstBar.o; // Enter at market open price
  const stopLoss = candidate.premarketLow;
  const risk = entryPrice - stopLoss;
  
  // Skip if risk is negative or too small (price opened below premarket low)
  if (risk <= 0) {
    return null;
  }
  
  // Target: 2:1 risk/reward
  const target1 = entryPrice + (risk * 2);
  const target2 = entryPrice + (risk * 3);
  
  // Calculate position size based on risk
  const riskPerShare = entryPrice - stopLoss;
  const maxRiskDollars = positionSize * 0.02; // 2% risk
  const shares = Math.floor(maxRiskDollars / riskPerShare);
  
  if (shares < 1) {
    return null;
  }
  
  const actualPositionSize = shares * entryPrice;
  
  let trade: GapAndGoTrade = {
    symbol: candidate.symbol,
    date: candidate.date,
    entryTime: new Date(firstBar.t).toISOString(),
    entryPrice: entryPrice,
    stopLoss,
    target1,
    target2,
    riskRewardRatio: '1:2',
    positionSize: actualPositionSize,
    status: 'filled'
  };
  
  // Now simulate exit - start from second bar since we entered on first
  for (let i = 1; i < marketBars.length; i++) {
    const bar = marketBars[i];
    
    // Check stop loss first (worst case)
    if (bar.l <= stopLoss) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = stopLoss;
      trade.exitReason = 'stop_loss';
      trade.status = 'closed';
      break;
    }
    
    // Check target 1
    if (bar.h >= target1 && !trade.exitPrice) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = target1;
      trade.exitReason = 'target1';
      trade.status = 'closed';
      break;
    }
  }
  
  // If still open at end of data, close at last price
  if (trade.status === 'filled') {
    const lastBar = marketBars[marketBars.length - 1];
    trade.exitTime = new Date(lastBar.t).toISOString();
    trade.exitPrice = lastBar.c;
    trade.exitReason = 'end_of_day';
    trade.status = 'closed';
  }
  
  // Calculate P&L
  if (trade.exitPrice && trade.status === 'closed') {
    const pnlPerShare = trade.exitPrice - trade.entryPrice;
    trade.pnl = pnlPerShare * shares;
    trade.pnlPercent = (pnlPerShare / trade.entryPrice) * 100;
  }
  
  return trade;
}

export interface BacktestConfig {
  startDate: string;
  endDate: string;
  positionSize: number;
  maxDailyTrades: number;
  minScore: number;
  minGapPercent: number;
  maxGapPercent: number;
  minPrice: number;
  maxPrice: number;
  maxFloat?: number;
  largeCapsOnly?: boolean;
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

export interface BacktestResult {
  config: BacktestConfig;
  trades: GapAndGoTrade[];
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

async function getGroupedDaily(date: string): Promise<Map<string, { c: number }>> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    
    const map = new Map<string, { c: number }>();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { c: bar.c });
      }
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

async function getTickerDetails(symbol: string): Promise<{ float?: number } | null> {
  try {
    const data = await makePolygonRequest(`/v3/reference/tickers/${symbol}`);
    if (data.results) {
      return {
        float: data.results.weighted_shares_outstanding || data.results.share_class_shares_outstanding
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Skip weekends
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export async function backtestGapAndGo(config: BacktestConfig): Promise<BacktestResult> {
  console.log('\n=== GAP AND GO BACKTEST ===');
  console.log('Config:', config);
  
  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`Testing ${tradingDays.length} trading days`);
  
  const allTrades: GapAndGoTrade[] = [];
  let previousDayData: Map<string, { c: number }> = new Map();
  
  for (let i = 1; i < tradingDays.length; i++) {
    const today = tradingDays[i];
    const yesterday = tradingDays[i - 1];
    
    console.log(`\nProcessing ${today}...`);
    
    // Get previous day's closes
    if (previousDayData.size === 0) {
      previousDayData = await getGroupedDaily(yesterday);
    }
    
    // Get today's grouped daily to find gap candidates
    const todayData = await getGroupedDaily(today);
    
    if (todayData.size === 0) {
      console.log(`  No data for ${today}, skipping`);
      previousDayData = todayData;
      continue;
    }
    
    // Find gap candidates
    const candidates: { symbol: string; gapPercent: number; price: number; prevClose: number }[] = [];
    
    for (const [symbol, bar] of todayData) {
      const prevBar = previousDayData.get(symbol);
      if (!prevBar) continue;
      
      // Large cap filter if enabled
      if (config.largeCapsOnly && !LARGE_CAP_STOCKS.has(symbol)) {
        continue;
      }
      
      const gapPercent = ((bar.c - prevBar.c) / prevBar.c) * 100; // Using close as proxy for open in grouped
      
      if (gapPercent >= config.minGapPercent && 
          gapPercent <= config.maxGapPercent &&
          bar.c >= config.minPrice &&
          bar.c <= config.maxPrice) {
        candidates.push({ symbol, gapPercent, price: bar.c, prevClose: prevBar.c });
      }
    }
    
    // Sort by gap percent and take top candidates
    candidates.sort((a, b) => b.gapPercent - a.gapPercent);
    const topCandidates = candidates.slice(0, 10);
    
    console.log(`  Found ${candidates.length} gap candidates, analyzing top ${topCandidates.length}`);
    
    let dailyTrades = 0;
    
    for (const cand of topCandidates) {
      if (dailyTrades >= config.maxDailyTrades) break;
      
      try {
        // Get float data
        const details = await getTickerDetails(cand.symbol);
        const float = details?.float;
        
        if (config.maxFloat && float && float > config.maxFloat) {
          continue;
        }
        
        // Analyze the setup
        const setup = await analyzeGapAndGoSetup(cand.symbol, today, cand.prevClose, float);
        
        if (!setup || setup.score < config.minScore) {
          continue;
        }
        
        // Simulate the trade
        const trade = await simulateGapAndGoTrade(setup, config.positionSize);
        
        if (trade && trade.status === 'closed') {
          allTrades.push(trade);
          dailyTrades++;
          
          const emoji = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
          console.log(`  ${emoji} ${trade.symbol}: Entry $${trade.entryPrice.toFixed(2)} -> Exit $${trade.exitPrice?.toFixed(2)} (${trade.exitReason}) = $${trade.pnl?.toFixed(2)}`);
        }
        
        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.warn(`  Error processing ${cand.symbol}:`, error);
      }
    }
    
    previousDayData = todayData;
  }
  
  // Calculate summary
  const winners = allTrades.filter(t => t.pnl && t.pnl > 0);
  const losers = allTrades.filter(t => t.pnl && t.pnl <= 0);
  
  const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + (t.pnl || 0), 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0) / losers.length) : 0;
  
  const grossProfit = winners.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  
  // Calculate max drawdown
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
  
  // Monthly breakdown
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
  
  const result: BacktestResult = {
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
