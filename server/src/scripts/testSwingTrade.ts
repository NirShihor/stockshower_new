import axios from 'axios';
import * as dotenv from 'dotenv';
import fs from 'fs';

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
}

interface BacktestResult {
  trades: SwingTrade[];
  summary: {
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

function calculateRSI(bars: DailyBar[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      rsi.push(50);
      continue;
    }

    const change = bars[i].c - bars[i - 1].c;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      rsi.push(50);
      continue;
    }

    let avgGain = 0;
    let avgLoss = 0;

    if (i === period) {
      for (let j = 1; j <= period; j++) {
        avgGain += gains[j];
        avgLoss += losses[j];
      }
      avgGain /= period;
      avgLoss /= period;
    } else {
      const prevRsiIndex = rsi.length - 1;
      avgGain = (gains[i] + (period - 1) * gains[i - 1]) / period;
      avgLoss = (losses[i] + (period - 1) * losses[i - 1]) / period;
    }

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

function findSwingLow(bars: DailyBar[], index: number, lookback: number = 5): number {
  let low = Infinity;
  for (let i = Math.max(0, index - lookback); i <= index; i++) {
    if (bars[i].l < low) {
      low = bars[i].l;
    }
  }
  return low;
}

function findSwingHigh(bars: DailyBar[], index: number, lookback: number = 5): number {
  let high = -Infinity;
  for (let i = Math.max(0, index - lookback); i <= index; i++) {
    if (bars[i].h > high) {
      high = bars[i].h;
    }
  }
  return high;
}

interface SwingSetup {
  symbol: string;
  date: string;
  price: number;
  sma20: number;
  sma50: number;
  rsi: number;
  swingLow: number;
  reason: string;
}

function findSwingSetups(
  symbol: string,
  bars: DailyBar[],
  sma20: number[],
  sma50: number[],
  rsi: number[]
): SwingSetup[] {
  const setups: SwingSetup[] = [];

  for (let i = 50; i < bars.length; i++) {
    const bar = bars[i];
    const prevBar = bars[i - 1];
    const date = new Date(bar.t).toISOString().split('T')[0];

    if (sma20[i] <= 0 || sma50[i] <= 0) continue;

    const inUptrend = sma20[i] > sma50[i] && bar.c > sma50[i];
    if (!inUptrend) continue;

    const pulledBackToMA = bar.l <= sma20[i] * 1.02 && bar.l >= sma20[i] * 0.95;

    const rsiOversold = rsi[i] < 40 && rsi[i] > 20;

    const bouncing = bar.c > bar.o && bar.c > prevBar.c;

    if (pulledBackToMA && bouncing) {
      setups.push({
        symbol,
        date,
        price: bar.c,
        sma20: sma20[i],
        sma50: sma50[i],
        rsi: rsi[i],
        swingLow: findSwingLow(bars, i, 10),
        reason: `Pullback to 20 SMA, bounce confirmed${rsiOversold ? ', RSI oversold' : ''}`
      });
    }
  }

  return setups;
}

async function simulateSwingTrade(
  symbol: string,
  setup: SwingSetup,
  bars: DailyBar[],
  config: {
    riskPercent: number;
    rewardRatio: number;
    maxHoldingDays: number;
    useTrailingStop: boolean;
    trailingStopPercent: number;
  }
): Promise<SwingTrade | null> {
  const entryIndex = bars.findIndex(b => 
    new Date(b.t).toISOString().split('T')[0] === setup.date
  );

  if (entryIndex < 0 || entryIndex >= bars.length - 1) return null;

  const entryBar = bars[entryIndex];
  const entryPrice = entryBar.c;

  const stopDistance = entryPrice - setup.swingLow;
  if (stopDistance <= 0 || stopDistance / entryPrice > 0.15) {
    return null;
  }

  const stopLoss = setup.swingLow * 0.99;
  const target = entryPrice + (stopDistance * config.rewardRatio);

  const trade: SwingTrade = {
    symbol,
    entryDate: setup.date,
    entryPrice,
    entryReason: setup.reason,
    stopLoss,
    target
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
  'NOW', 'SNOW', 'DDOG', 'ZS', 'CRWD', 'NET', 'OKTA', 'TEAM', 'SHOP', 'SQ',
  'COIN', 'HOOD', 'SOFI', 'UPST', 'AFRM', 'RBLX', 'U', 'PLTR', 'PATH', 'DOCN',
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'V', 'MA', 'AXP', 'COF',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY', 'HAL', 'DVN', 'EOG', 'PXD', 'MPC',
  'UNH', 'JNJ', 'PFE', 'MRK', 'ABBV', 'LLY', 'BMY', 'AMGN', 'GILD', 'BIIB',
  'HD', 'LOW', 'TGT', 'WMT', 'COST', 'DG', 'DLTR', 'TJX', 'ROST', 'BBY',
  'DIS', 'NFLX', 'CMCSA', 'WBD', 'PARA', 'FOX', 'LYV', 'MTCH', 'ABNB', 'BKNG',
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'CAT', 'DE', 'MMM', 'HON', 'GE'
];

async function runSwingBacktest(config: {
  startDate: string;
  endDate: string;
  symbols: string[];
  positionSize: number;
  riskPercent: number;
  rewardRatio: number;
  maxHoldingDays: number;
  useTrailingStop: boolean;
  trailingStopPercent: number;
  maxConcurrentPositions: number;
}): Promise<BacktestResult> {
  console.log('\n=== SWING TRADING BACKTEST ===');
  console.log('Strategy: Pullback to 20 SMA in uptrend, bounce entry');
  console.log('Config:', JSON.stringify(config, null, 2));

  const allTrades: SwingTrade[] = [];
  const activePositions: Set<string> = new Set();

  for (const symbol of config.symbols) {
    console.log(`\nAnalyzing ${symbol}...`);

    const bars = await getDailyBars(symbol, config.startDate, config.endDate);
    if (bars.length < 60) {
      console.log(`  Skipping - insufficient data (${bars.length} bars)`);
      continue;
    }

    const sma20 = calculateSMA(bars, 20);
    const sma50 = calculateSMA(bars, 50);
    const rsi = calculateRSI(bars, 14);

    const setups = findSwingSetups(symbol, bars, sma20, sma50, rsi);
    console.log(`  Found ${setups.length} potential setups`);

    for (const setup of setups) {
      const trade = await simulateSwingTrade(symbol, setup, bars, {
        riskPercent: config.riskPercent,
        rewardRatio: config.rewardRatio,
        maxHoldingDays: config.maxHoldingDays,
        useTrailingStop: config.useTrailingStop,
        trailingStopPercent: config.trailingStopPercent
      });

      if (trade) {
        allTrades.push(trade);
        const emoji = trade.pnl! > 0 ? '✅' : '❌';
        console.log(`  ${emoji} ${trade.entryDate}: $${trade.entryPrice.toFixed(2)} -> $${trade.exitPrice!.toFixed(2)} (${trade.exitReason}, ${trade.holdingDays}d) = ${trade.pnlPercent!.toFixed(1)}%`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

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
    summary: {
      totalTrades: allTrades.length,
      winners: winners.length,
      losers: losers.length,
      winRate: allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      avgHoldingDays,
      maxDrawdown
    },
    monthlyPerformance
  };

  console.log('\n========================================');
  console.log('SWING TRADING BACKTEST RESULTS');
  console.log('========================================');
  console.log(`Total Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(0)} (on $${positionValue} positions)`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(0)}`);
  console.log(`Avg Loss: $${result.summary.avgLoss.toFixed(0)}`);
  console.log(`Avg Holding Days: ${result.summary.avgHoldingDays.toFixed(1)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(0)}`);

  const exitReasons: Record<string, { count: number; pnl: number }> = {};
  for (let i = 0; i < allTrades.length; i++) {
    const trade = allTrades[i];
    const reason = trade.exitReason || 'unknown';
    if (!exitReasons[reason]) exitReasons[reason] = { count: 0, pnl: 0 };
    exitReasons[reason].count++;
    exitReasons[reason].pnl += dollarPnLs[i];
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
  const startDate = args[0] || '2024-01-01';
  const endDate = args[1] || '2024-12-31';

  const result = await runSwingBacktest({
    startDate,
    endDate,
    symbols: SWING_WATCHLIST,
    positionSize: 10000,
    riskPercent: 2,
    rewardRatio: 2.5,
    maxHoldingDays: 20,
    useTrailingStop: true,
    trailingStopPercent: 5,
    maxConcurrentPositions: 5
  });

  fs.writeFileSync('./swing_trade_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to swing_trade_results.json');
}

main().catch(console.error);
