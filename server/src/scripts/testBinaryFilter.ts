import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { getMarketContext, MarketContext } from '../services/marketContextService.js';
import { getSectorAnalysis, SectorAnalysis, getStockSector, getSectorStrength } from '../services/sectorAnalysisService.js';

dotenv.config();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';
const POLYGON_BASE_URL = 'https://api.polygon.io';

interface DailyBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: number;
}

interface SwingTrade {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  entryReason: string;
  stopLoss: number;
  target: number;
  exitDate?: string;
  exitPrice?: number;
  exitReason?: 'target' | 'stop_loss' | 'trailing_stop' | 'time_stop';
  holdingDays?: number;
  pnl?: number;
  pnlPercent?: number;
  filters: {
    marketRiskOn: boolean;
    sectorLeading: boolean;
    stockInUptrend: boolean;
  };
}

interface BacktestResult {
  trades: SwingTrade[];
  skippedTrades: SwingTrade[];
  summary: {
    totalCandidates: number;
    passed: number;
    failed: number;
    totalTrades: number;
    winners: number;
    losers: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    avgHoldingDays: number;
    maxDrawdown: number;
    skippedPnL: number;
    skippedWinRate: number;
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

async function getDailyBars(symbol: string, from: string, to: string): Promise<DailyBar[]> {
  try {
    const data = await makePolygonRequest(
      `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}`,
      { adjusted: 'true', sort: 'asc', limit: '5000' }
    );
    return data.results || [];
  } catch {
    return [];
  }
}

function calculateSMA(bars: DailyBar[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) {
      sma.push(0);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += bars[i - j].c;
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

function findSwingLow(bars: DailyBar[], index: number, lookback: number = 10): number {
  let low = Infinity;
  for (let i = Math.max(0, index - lookback); i <= index; i++) {
    if (bars[i].l < low) {
      low = bars[i].l;
    }
  }
  return low;
}

interface SetupCandidate {
  symbol: string;
  date: string;
  price: number;
  sma20: number;
  sma50: number;
  swingLow: number;
  reason: string;
}

function findSetups(
  symbol: string,
  bars: DailyBar[],
  sma20: number[],
  sma50: number[]
): SetupCandidate[] {
  const setups: SetupCandidate[] = [];

  for (let i = 50; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = bars[i - 1];
    const date = new Date(bar.t).toISOString().split('T')[0];

    if (sma20[i] <= 0 || sma50[i] <= 0) continue;

    const inUptrend = sma20[i] > sma50[i] && bar.c > sma50[i];
    if (!inUptrend) continue;

    const pulledBackToMA = bar.l <= sma20[i] * 1.02 && bar.l >= sma20[i] * 0.95;
    const bouncing = bar.c > bar.o && bar.c > prevBar.c;

    if (pulledBackToMA && bouncing) {
      setups.push({
        symbol,
        date,
        price: bar.c,
        sma20: sma20[i],
        sma50: sma50[i],
        swingLow: findSwingLow(bars, i, 10),
        reason: `Pullback to 20 SMA in uptrend, bounce confirmed`
      });
    }
  }

  return setups;
}

async function simulateTrade(
  symbol: string,
  setup: SetupCandidate,
  bars: DailyBar[],
  config: {
    rewardRatio: number;
    maxHoldingDays: number;
    useTrailingStop: boolean;
    trailingStopPercent: number;
    maxStopPercent: number;
  }
): Promise<SwingTrade | null> {
  const signalIndex = bars.findIndex(b =>
    new Date(b.t).toISOString().split('T')[0] === setup.date
  );

  if (signalIndex < 0 || signalIndex >= bars.length - 2) return null;

  const entryIndex = signalIndex + 1;
  const entryBar = bars[entryIndex];
  const entryPrice = entryBar.o;

  let stopDistance = entryPrice - setup.swingLow;
  if (stopDistance <= 0 || stopDistance / entryPrice > 0.15) {
    return null;
  }

  const maxStopDistance = entryPrice * (config.maxStopPercent / 100);
  if (stopDistance > maxStopDistance) {
    stopDistance = maxStopDistance;
  }

  const stopLoss = entryPrice - stopDistance;
  const target = entryPrice + (stopDistance * config.rewardRatio);

  const trade: SwingTrade = {
    symbol,
    entryDate: new Date(entryBar.t).toISOString().split('T')[0],
    entryPrice,
    entryReason: setup.reason,
    stopLoss,
    target,
    filters: {
      marketRiskOn: false,
      sectorLeading: false,
      stockInUptrend: false
    }
  };

  let currentStop = stopLoss;
  let highSinceEntry = entryPrice;
  let trailingActive = false;

  for (let i = entryIndex + 1; i < bars.length && i <= entryIndex + config.maxHoldingDays; i++) {
    const bar = bars[i];
    const date = new Date(bar.t).toISOString().split('T')[0];

    if (bar.h > highSinceEntry) {
      highSinceEntry = bar.h;
    }

    if (config.useTrailingStop && highSinceEntry >= entryPrice * 1.05) {
      trailingActive = true;
      const trailStop = highSinceEntry * (1 - config.trailingStopPercent / 100);
      if (trailStop > currentStop) {
        currentStop = trailStop;
      }
    }

    if (bar.l <= currentStop) {
      trade.exitDate = date;
      trade.exitPrice = currentStop;
      trade.exitReason = trailingActive ? 'trailing_stop' : 'stop_loss';
      trade.holdingDays = i - entryIndex;
      break;
    }

    if (bar.h >= target) {
      trade.exitDate = date;
      trade.exitPrice = target;
      trade.exitReason = 'target';
      trade.holdingDays = i - entryIndex;
      break;
    }

    if (i === entryIndex + config.maxHoldingDays) {
      trade.exitDate = date;
      trade.exitPrice = bar.c;
      trade.exitReason = 'time_stop';
      trade.holdingDays = config.maxHoldingDays;
    }
  }

  if (!trade.exitPrice) {
    const lastBar = bars[Math.min(entryIndex + config.maxHoldingDays, bars.length - 1)];
    trade.exitDate = new Date(lastBar.t).toISOString().split('T')[0];
    trade.exitPrice = lastBar.c;
    trade.exitReason = 'time_stop';
    trade.holdingDays = Math.min(config.maxHoldingDays, bars.length - entryIndex - 1);
  }

  trade.pnl = trade.exitPrice - trade.entryPrice;
  trade.pnlPercent = (trade.pnl / trade.entryPrice) * 100;

  return trade;
}

const SWING_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'NFLX', 'CRM',
  'ADBE', 'PYPL', 'INTC', 'CSCO', 'QCOM', 'AVGO', 'TXN', 'MU', 'AMAT', 'LRCX',
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP', 'COF',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY',
  'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD',
  'HD', 'LOW', 'TGT', 'WMT', 'COST',
  'DIS', 'NFLX', 'CMCSA',
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'CAT', 'DE', 'MMM', 'HON', 'GE'
];

function getDateNDaysAgo(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

async function runBinaryFilterBacktest(config: {
  startDate: string;
  endDate: string;
  symbols: string[];
  positionSize: number;
  rewardRatio: number;
  maxHoldingDays: number;
  useTrailingStop: boolean;
  trailingStopPercent: number;
  maxStopPercent: number;
}): Promise<BacktestResult> {
  console.log('\n=== BINARY FILTER SWING TRADING BACKTEST ===');
  console.log('Strategy: Pullback to 20 SMA + 3 Binary Filters (Market/Sector/Trend)');
  console.log('Config:', JSON.stringify(config, null, 2));

  const allTrades: SwingTrade[] = [];
  const skippedTrades: SwingTrade[] = [];
  let totalCandidates = 0;
  let passed = 0;
  let failed = 0;

  const marketContextCache = new Map<string, MarketContext | null>();
  const sectorContextCache = new Map<string, SectorAnalysis | null>();

  for (const symbol of config.symbols) {
    console.log(`\n=== Analyzing ${symbol} ===`);

    const dataStartDate = getDateNDaysAgo(config.startDate, 100);
    const bars = await getDailyBars(symbol, dataStartDate, config.endDate);

    if (bars.length < 60) {
      console.log(`  Skipping - insufficient data (${bars.length} bars)`);
      continue;
    }

    const sma20 = calculateSMA(bars, 20);
    const sma50 = calculateSMA(bars, 50);

    const allSetups = findSetups(symbol, bars, sma20, sma50);
    const setups = allSetups.filter(s => s.date >= config.startDate && s.date <= config.endDate);

    console.log(`  Found ${setups.length} setups in date range`);

    for (const setup of setups) {
      totalCandidates++;

      let marketContext = marketContextCache.get(setup.date);
      if (marketContext === undefined) {
        try {
          marketContext = await getMarketContext(setup.date);
          marketContextCache.set(setup.date, marketContext);
        } catch {
          marketContext = null;
          marketContextCache.set(setup.date, null);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      let sectorContext = sectorContextCache.get(setup.date);
      if (sectorContext === undefined) {
        try {
          const spyChange = marketContext?.spy?.changePercent || 0;
          sectorContext = await getSectorAnalysis(setup.date, spyChange);
          sectorContextCache.set(setup.date, sectorContext);
        } catch {
          sectorContext = null;
          sectorContextCache.set(setup.date, null);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const marketRiskOn = marketContext?.regime === 'risk-on';
      
      let sectorLeading = false;
      if (sectorContext) {
        const sectorStrength = getSectorStrength(sectorContext, symbol);
        if (sectorStrength) {
          sectorLeading = sectorStrength.rank <= 3;
        }
      }

      const stockInUptrend = setup.sma20 > setup.sma50 && setup.price > setup.sma20;

      const allFiltersPass = marketRiskOn && sectorLeading && stockInUptrend;

      console.log(`  📊 ${symbol} on ${setup.date}:`);
      console.log(`     Market Risk-On: ${marketRiskOn ? '✅' : '❌'}`);
      console.log(`     Sector Leading: ${sectorLeading ? '✅' : '❌'}`);
      console.log(`     Stock Uptrend:  ${stockInUptrend ? '✅' : '❌'}`);
      console.log(`     Result: ${allFiltersPass ? 'TAKE' : 'SKIP'}`);

      const trade = await simulateTrade(symbol, setup, bars, {
        rewardRatio: config.rewardRatio,
        maxHoldingDays: config.maxHoldingDays,
        useTrailingStop: config.useTrailingStop,
        trailingStopPercent: config.trailingStopPercent,
        maxStopPercent: config.maxStopPercent
      });

      if (trade) {
        trade.filters = { marketRiskOn, sectorLeading, stockInUptrend };

        if (allFiltersPass) {
          passed++;
          allTrades.push(trade);
          const emoji = trade.pnl! > 0 ? '✅' : '❌';
          console.log(`     ${emoji} TOOK: $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice!.toFixed(2)} (${trade.exitReason}, ${trade.holdingDays}d) = ${trade.pnlPercent!.toFixed(1)}%`);
        } else {
          failed++;
          skippedTrades.push(trade);
          const emoji = trade.pnl! > 0 ? '💚' : '💔';
          console.log(`     ${emoji} SKIPPED: Would have been ${trade.pnlPercent!.toFixed(1)}%`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  const winners = allTrades.filter(t => t.pnl! > 0);
  const losers = allTrades.filter(t => t.pnl! <= 0);

  const positionValue = config.positionSize;
  const dollarPnLs = allTrades.map(t => (t.pnlPercent! / 100) * positionValue);
  const totalPnL = dollarPnLs.reduce((sum, pnl) => sum + pnl, 0);

  const winnerDollarPnLs = winners.map(t => (t.pnlPercent! / 100) * positionValue);
  const loserDollarPnLs = losers.map(t => (t.pnlPercent! / 100) * positionValue);

  const avgWin = winnerDollarPnLs.length > 0
    ? winnerDollarPnLs.reduce((s, p) => s + p, 0) / winnerDollarPnLs.length
    : 0;
  const avgLoss = loserDollarPnLs.length > 0
    ? Math.abs(loserDollarPnLs.reduce((s, p) => s + p, 0) / loserDollarPnLs.length)
    : 0;

  const grossProfit = winnerDollarPnLs.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(loserDollarPnLs.reduce((s, p) => s + p, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgHoldingDays = allTrades.length > 0
    ? allTrades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / allTrades.length
    : 0;

  let peak = 0;
  let maxDrawdown = 0;
  let runningPnL = 0;
  for (const pnl of dollarPnLs) {
    runningPnL += pnl;
    if (runningPnL > peak) peak = runningPnL;
    const dd = peak - runningPnL;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const skippedWinners = skippedTrades.filter(t => t.pnl! > 0);
  const skippedDollarPnLs = skippedTrades.map(t => (t.pnlPercent! / 100) * positionValue);
  const skippedPnL = skippedDollarPnLs.reduce((sum, pnl) => sum + pnl, 0);
  const skippedWinRate = skippedTrades.length > 0 ? (skippedWinners.length / skippedTrades.length) * 100 : 0;

  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (let i = 0; i < allTrades.length; i++) {
    const trade = allTrades[i];
    const month = trade.entryDate.substring(0, 7);
    if (!monthlyMap.has(month)) {
      monthlyMap.set(month, { trades: 0, wins: 0, pnl: 0 });
    }
    const m = monthlyMap.get(month)!;
    m.trades++;
    m.pnl += dollarPnLs[i];
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
    skippedTrades,
    summary: {
      totalCandidates,
      passed,
      failed,
      totalTrades: allTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      avgHoldingDays,
      maxDrawdown,
      skippedPnL,
      skippedWinRate
    },
    monthlyPerformance
  };

  console.log('\n========================================');
  console.log('BINARY FILTER SWING TRADING RESULTS');
  console.log('========================================');

  console.log(`\nFILTERING:`);
  console.log(`  Total Candidates: ${totalCandidates}`);
  console.log(`  Passed All 3 Filters: ${passed} (${totalCandidates > 0 ? (passed / totalCandidates * 100).toFixed(1) : 0}%)`);
  console.log(`  Failed Filters: ${failed} (${totalCandidates > 0 ? (failed / totalCandidates * 100).toFixed(1) : 0}%)`);

  console.log(`\nTAKEN TRADES:`);
  console.log(`  Trades: ${result.summary.totalTrades}`);
  console.log(`  Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`  Total P&L: $${result.summary.totalPnL.toFixed(0)}`);
  console.log(`  Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`  Avg Win: $${result.summary.avgWin.toFixed(0)}`);
  console.log(`  Avg Loss: $${result.summary.avgLoss.toFixed(0)}`);
  console.log(`  Avg Holding Days: ${result.summary.avgHoldingDays.toFixed(1)}`);
  console.log(`  Max Drawdown: $${result.summary.maxDrawdown.toFixed(0)}`);

  console.log(`\nSKIPPED TRADES:`);
  console.log(`  Count: ${skippedTrades.length}`);
  console.log(`  Win Rate: ${skippedWinRate.toFixed(1)}%`);
  console.log(`  Total P&L: $${skippedPnL.toFixed(0)}`);
  console.log(`  ${skippedPnL < 0 ? '✅ Good skips - avoided losses!' : '⚠️ Missed profits'}`);

  console.log('\n--- Monthly Performance ---');
  for (const m of monthlyPerformance) {
    console.log(`${m.month} | Trades: ${m.trades} | WR: ${m.winRate.toFixed(0)}% | P&L: $${m.pnl.toFixed(0)}`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2023-01-01';
  const endDate = args[1] || '2023-12-31';

  console.log(`\n📊 BINARY FILTER SWING TRADING BACKTEST`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`Filters: Market Risk-On + Sector Top 3 + Stock Uptrend`);
  console.log(`No AI scoring - pure binary pass/fail.\n`);

  const result = await runBinaryFilterBacktest({
    startDate,
    endDate,
    symbols: SWING_WATCHLIST.slice(0, 20),
    positionSize: 10000,
    rewardRatio: 2.5,
    maxHoldingDays: 20,
    useTrailingStop: true,
    trailingStopPercent: 5,
    maxStopPercent: 5
  });

  fs.writeFileSync('./binary_filter_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to binary_filter_results.json');
}

main().catch(console.error);
