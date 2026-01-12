import axios from 'axios';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface Trade {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  initialStop: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'initial_stop' | 'trailing_stop' | 'end_of_day';
  pnl?: number;
  pnlPercent?: number;
  maxGain?: number;
}

interface BacktestResult {
  trades: Trade[];
  summary: {
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    avgMaxGain: number;
  };
  monthlyPerformance: { month: string; trades: number; pnl: number; winRate: number }[];
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

async function getGroupedDaily(date: string): Promise<Map<string, { o: number; c: number; v: number }>> {
  try {
    const data = await makePolygonRequest(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
      adjusted: 'true',
      include_otc: 'false'
    });
    const map = new Map();
    if (data.results) {
      for (const bar of data.results) {
        map.set(bar.T, { o: bar.o, c: bar.c, v: bar.v });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function getIntradayBars(symbol: string, date: string): Promise<any[]> {
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/1/minute/${date}/${date}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    return data.results || [];
  } catch {
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

function isPremarket(timestamp: number): boolean {
  const date = new Date(timestamp);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 9 * 60 && totalMinutes < 14 * 60 + 30;
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

async function simulateTrade(
  symbol: string,
  date: string,
  config: {
    initialStopPercent: number;
    trailingTriggerPercent: number;
    trailingPercent: number;
    maxRiskDollars: number;
  }
): Promise<Trade | null> {
  const bars = await getIntradayBars(symbol, date);
  if (!bars || bars.length === 0) return null;

  const premarketBars = bars.filter((b: any) => isPremarket(b.t));
  const marketBars = bars.filter((b: any) => isMarketOpen(b.t));

  if (marketBars.length < 15) return null;

  const premarketVolume = premarketBars.reduce((sum: number, b: any) => sum + b.v, 0);
  if (premarketVolume < 100000) return null;

  // Enter after 15 minutes of market open (delayed entry)
  const entryBar = marketBars[14];
  const entryPrice = entryBar.c;

  // Skip if price not in range
  if (entryPrice < 2 || entryPrice > 20) return null;

  // Calculate position size based on risk
  const initialStopPrice = entryPrice * (1 - config.initialStopPercent / 100);
  const riskPerShare = entryPrice - initialStopPrice;
  const shares = Math.floor(config.maxRiskDollars / riskPerShare);
  
  if (shares < 1) return null;

  const trade: Trade = {
    symbol,
    date,
    entryTime: new Date(entryBar.t).toISOString(),
    entryPrice,
    initialStop: initialStopPrice
  };

  let currentStop = initialStopPrice;
  let trailingActive = false;
  let highSinceEntry = entryPrice;
  let maxGainPercent = 0;

  // Simulate through rest of day
  for (let i = 15; i < marketBars.length; i++) {
    const bar = marketBars[i];

    // Track highest price
    if (bar.h > highSinceEntry) {
      highSinceEntry = bar.h;
      const gainPercent = ((highSinceEntry - entryPrice) / entryPrice) * 100;
      if (gainPercent > maxGainPercent) maxGainPercent = gainPercent;
    }

    // Check if trailing stop should activate
    const currentGainPercent = ((highSinceEntry - entryPrice) / entryPrice) * 100;
    if (!trailingActive && currentGainPercent >= config.trailingTriggerPercent) {
      trailingActive = true;
    }

    // Update trailing stop
    if (trailingActive) {
      const trailStop = highSinceEntry * (1 - config.trailingPercent / 100);
      if (trailStop > currentStop) {
        currentStop = trailStop;
      }
    }

    // Check if stopped out
    if (bar.l <= currentStop) {
      trade.exitTime = new Date(bar.t).toISOString();
      trade.exitPrice = currentStop;
      trade.exitReason = trailingActive ? 'trailing_stop' : 'initial_stop';
      break;
    }
  }

  // End of day exit
  if (!trade.exitPrice) {
    const lastBar = marketBars[marketBars.length - 1];
    trade.exitTime = new Date(lastBar.t).toISOString();
    trade.exitPrice = lastBar.c;
    trade.exitReason = 'end_of_day';
  }

  // Calculate P&L
  const pnlPerShare = trade.exitPrice - trade.entryPrice;
  trade.pnl = pnlPerShare * shares;
  trade.pnlPercent = (pnlPerShare / trade.entryPrice) * 100;
  trade.maxGain = maxGainPercent;

  return trade;
}

async function runBacktest(config: {
  startDate: string;
  endDate: string;
  minGapPercent: number;
  maxGapPercent: number;
  minPrice: number;
  maxPrice: number;
  maxDailyTrades: number;
  initialStopPercent: number;
  trailingTriggerPercent: number;
  trailingPercent: number;
  maxRiskDollars: number;
}): Promise<BacktestResult> {
  console.log('\n=== DUMB ENTRY, SMART EXIT BACKTEST ===');
  console.log('Philosophy: Entries dont matter, exits do.');
  console.log('Config:', JSON.stringify(config, null, 2));

  const tradingDays = getTradingDays(config.startDate, config.endDate);
  console.log(`\nTesting ${tradingDays.length} trading days\n`);

  const allTrades: Trade[] = [];
  let previousDayData: Map<string, { o: number; c: number; v: number }> = new Map();

  for (let i = 1; i < tradingDays.length; i++) {
    const today = tradingDays[i];
    const yesterday = tradingDays[i - 1];

    if (previousDayData.size === 0) {
      previousDayData = await getGroupedDaily(yesterday);
    }

    const todayData = await getGroupedDaily(today);
    if (todayData.size === 0) {
      console.log(`${today}: No data, skipping`);
      previousDayData = todayData;
      continue;
    }

    // Find gappers - DUMB selection, just gap + price + volume
    const candidates: { symbol: string; gapPercent: number }[] = [];

    for (const [symbol, bar] of todayData) {
      const prevBar = previousDayData.get(symbol);
      if (!prevBar) continue;

      // Skip obvious non-stocks
      if (symbol.includes('.') || symbol.length > 5) continue;

      const gapPercent = ((bar.o - prevBar.c) / prevBar.c) * 100;

      if (gapPercent >= config.minGapPercent &&
          gapPercent <= config.maxGapPercent &&
          bar.o >= config.minPrice &&
          bar.o <= config.maxPrice) {
        candidates.push({ symbol, gapPercent });
      }
    }

    // Sort by gap size (could also be random)
    candidates.sort((a, b) => b.gapPercent - a.gapPercent);

    // Take first N that pass basic filters
    let dailyTrades = 0;
    const testedSymbols = new Set<string>();

    for (const cand of candidates.slice(0, 30)) {
      if (dailyTrades >= config.maxDailyTrades) break;
      if (testedSymbols.has(cand.symbol)) continue;
      testedSymbols.add(cand.symbol);

      try {
        const trade = await simulateTrade(cand.symbol, today, {
          initialStopPercent: config.initialStopPercent,
          trailingTriggerPercent: config.trailingTriggerPercent,
          trailingPercent: config.trailingPercent,
          maxRiskDollars: config.maxRiskDollars
        });

        if (trade) {
          allTrades.push(trade);
          dailyTrades++;

          const emoji = trade.pnl! > 0 ? '✅' : '❌';
          console.log(`${today} ${emoji} ${trade.symbol}: $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice!.toFixed(2)} (${trade.exitReason}) = $${trade.pnl!.toFixed(0)} | MaxGain: ${trade.maxGain!.toFixed(1)}%`);
        }

        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (error) {
        // Skip errors silently
      }
    }

    if (dailyTrades === 0) {
      console.log(`${today}: No valid trades`);
    }

    previousDayData = todayData;
  }

  // Calculate summary
  const winners = allTrades.filter(t => t.pnl! > 0);
  const losers = allTrades.filter(t => t.pnl! <= 0);

  const totalPnL = allTrades.reduce((sum, t) => sum + t.pnl!, 0);
  const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnl!, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? Math.abs(losers.reduce((sum, t) => sum + t.pnl!, 0) / losers.length) : 0;

  const grossProfit = winners.reduce((sum, t) => sum + t.pnl!, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl!, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgMaxGain = allTrades.length > 0 ? allTrades.reduce((sum, t) => sum + (t.maxGain || 0), 0) / allTrades.length : 0;

  // Max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  for (const trade of allTrades) {
    runningPnL += trade.pnl!;
    if (runningPnL > peak) peak = runningPnL;
    const dd = peak - runningPnL;
    if (dd > maxDrawdown) maxDrawdown = dd;
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
    m.pnl += trade.pnl!;
    if (trade.pnl! > 0) m.wins++;
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
    trades: allTrades,
    summary: {
      totalTrades: allTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      avgMaxGain
    },
    monthlyPerformance
  };

  // Print results
  console.log('\n========================================');
  console.log('DUMB ENTRY, SMART EXIT RESULTS');
  console.log('========================================');
  console.log(`Total Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(0)}`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(0)}`);
  console.log(`Avg Loss: $${result.summary.avgLoss.toFixed(0)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(0)}`);
  console.log(`Avg Max Gain (before exit): ${result.summary.avgMaxGain.toFixed(1)}%`);

  // Exit reason breakdown
  const exitReasons: Record<string, { count: number; pnl: number }> = {};
  for (const trade of allTrades) {
    const reason = trade.exitReason || 'unknown';
    if (!exitReasons[reason]) exitReasons[reason] = { count: 0, pnl: 0 };
    exitReasons[reason].count++;
    exitReasons[reason].pnl += trade.pnl!;
  }

  console.log('\n--- Exit Reasons ---');
  for (const [reason, stats] of Object.entries(exitReasons)) {
    const avgPnl = stats.pnl / stats.count;
    console.log(`${reason}: ${stats.count} trades, $${stats.pnl.toFixed(0)} total, $${avgPnl.toFixed(0)} avg`);
  }

  console.log('\n--- Monthly Performance ---');
  for (const m of monthlyPerformance) {
    console.log(`${m.month} | Trades: ${m.trades} | WR: ${m.winRate.toFixed(0)}% | P&L: $${m.pnl.toFixed(0)}`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2025-01-01';
  const endDate = args[1] || '2025-03-31';

  const result = await runBacktest({
    startDate,
    endDate,
    minGapPercent: 5,
    maxGapPercent: 100,
    minPrice: 2,
    maxPrice: 20,
    maxDailyTrades: 3,
    initialStopPercent: 5,        // 5% initial stop
    trailingTriggerPercent: 5,    // Start trailing at +5%
    trailingPercent: 3,           // Trail 3% below high
    maxRiskDollars: 200           // Risk $200 per trade
  });

  fs.writeFileSync('./dumb_entry_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to dumb_entry_results.json');
}

main().catch(console.error);
