import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

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
  initialStopPercent: number;
  target: number;
  positionSize: number;
  riskAmount: number;
  exitDate?: string;
  exitPrice?: number;
  exitReason?: 'target' | 'stop_loss' | 'trailing_stop' | 'breakeven_stop' | 'time_stop';
  holdingDays?: number;
  pnl?: number;
  pnlPercent?: number;
  rMultiple?: number;
}

interface BacktestResult {
  trades: SwingTrade[];
  summary: {
    totalTrades: number;
    winners: number;
    losers: number;
    breakeven: number;
    winRate: number;
    totalPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    avgRMultiple: number;
    avgHoldingDays: number;
    maxDrawdown: number;
    maxDrawdownPercent: number;
    expectancy: number;
    expectancyPerTrade: number;
  };
  monthlyPerformance: { month: string; trades: number; pnl: number; winRate: number }[];
  equityCurve: { date: string; equity: number }[];
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

function calculateATR(bars: DailyBar[], period: number = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].h - bars[i].l);
      atr.push(tr[0]);
      continue;
    }

    const high = bars[i].h;
    const low = bars[i].l;
    const prevClose = bars[i - 1].c;

    const trueRange = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    tr.push(trueRange);

    if (i < period) {
      atr.push(tr.reduce((a, b) => a + b, 0) / tr.length);
    } else {
      atr.push((atr[i - 1] * (period - 1) + trueRange) / period);
    }
  }

  return atr;
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

interface SetupCandidate {
  symbol: string;
  date: string;
  price: number;
  sma20: number;
  sma50: number;
  atr: number;
  swingLow: number;
  reason: string;
}

function findSetups(
  symbol: string,
  bars: DailyBar[],
  sma20: number[],
  sma50: number[],
  atr: number[]
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
        atr: atr[i],
        swingLow: findSwingLow(bars, i, 5),
        reason: `Pullback to 20 SMA in uptrend`
      });
    }
  }

  return setups;
}

function simulateTrade(
  symbol: string,
  setup: SetupCandidate,
  bars: DailyBar[],
  config: {
    accountSize: number;
    riskPercent: number;
    maxStopPercent: number;
    minStopPercent: number;
    rewardRatio: number;
    maxHoldingDays: number;
    trailAfterR: number;
    trailPercent: number;
    moveToBreakevenAtR: number;
  }
): SwingTrade | null {
  const signalIndex = bars.findIndex(b =>
    new Date(b.t).toISOString().split('T')[0] === setup.date
  );

  if (signalIndex < 0 || signalIndex >= bars.length - 2) return null;

  const entryIndex = signalIndex + 1;
  const entryBar = bars[entryIndex];
  const entryPrice = entryBar.o;

  let stopDistance = entryPrice - setup.swingLow;
  const atrStop = setup.atr * 1.5;
  
  if (stopDistance < atrStop) {
    stopDistance = atrStop;
  }

  const maxStop = entryPrice * (config.maxStopPercent / 100);
  const minStop = entryPrice * (config.minStopPercent / 100);

  if (stopDistance > maxStop) stopDistance = maxStop;
  if (stopDistance < minStop) return null;

  const stopLoss = entryPrice - stopDistance;
  const initialStopPercent = (stopDistance / entryPrice) * 100;

  const riskAmount = config.accountSize * (config.riskPercent / 100);
  const shares = Math.floor(riskAmount / stopDistance);
  if (shares <= 0) return null;

  const positionSize = shares * entryPrice;
  const target = entryPrice + (stopDistance * config.rewardRatio);

  const trade: SwingTrade = {
    symbol,
    entryDate: new Date(entryBar.t).toISOString().split('T')[0],
    entryPrice,
    entryReason: setup.reason,
    stopLoss,
    initialStopPercent,
    target,
    positionSize,
    riskAmount
  };

  let currentStop = stopLoss;
  let highSinceEntry = entryPrice;
  let breakevenReached = false;
  let trailingActive = false;

  for (let i = entryIndex + 1; i < bars.length && i <= entryIndex + config.maxHoldingDays; i++) {
    const bar = bars[i];
    const date = new Date(bar.t).toISOString().split('T')[0];

    if (bar.h > highSinceEntry) {
      highSinceEntry = bar.h;
    }

    const currentR = (highSinceEntry - entryPrice) / stopDistance;

    if (!breakevenReached && currentR >= config.moveToBreakevenAtR) {
      breakevenReached = true;
      const newStop = entryPrice + (stopDistance * 0.1);
      if (newStop > currentStop) {
        currentStop = newStop;
      }
    }

    if (currentR >= config.trailAfterR) {
      trailingActive = true;
      const trailStop = highSinceEntry * (1 - config.trailPercent / 100);
      if (trailStop > currentStop) {
        currentStop = trailStop;
      }
    }

    if (bar.l <= currentStop) {
      trade.exitDate = date;
      trade.exitPrice = currentStop;
      if (trailingActive) {
        trade.exitReason = 'trailing_stop';
      } else if (breakevenReached) {
        trade.exitReason = 'breakeven_stop';
      } else {
        trade.exitReason = 'stop_loss';
      }
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

  const shares2 = trade.positionSize / trade.entryPrice;
  trade.pnl = (trade.exitPrice - trade.entryPrice) * shares2;
  trade.pnlPercent = ((trade.exitPrice - trade.entryPrice) / trade.entryPrice) * 100;
  trade.rMultiple = (trade.exitPrice - trade.entryPrice) / stopDistance;

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

async function runAsymmetricRiskBacktest(config: {
  startDate: string;
  endDate: string;
  symbols: string[];
  accountSize: number;
  riskPercent: number;
  maxStopPercent: number;
  minStopPercent: number;
  rewardRatio: number;
  maxHoldingDays: number;
  trailAfterR: number;
  trailPercent: number;
  moveToBreakevenAtR: number;
  cooldownDays: number;
}): Promise<BacktestResult> {
  console.log('\n=== ASYMMETRIC RISK SWING TRADING BACKTEST ===');
  console.log('Strategy: Take all setups, fixed % risk per trade, let winners run');
  console.log('Config:', JSON.stringify(config, null, 2));

  const allTrades: SwingTrade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  let currentEquity = config.accountSize;

  for (const symbol of config.symbols) {
    console.log(`\nAnalyzing ${symbol}...`);

    const dataStartDate = getDateNDaysAgo(config.startDate, 100);
    const bars = await getDailyBars(symbol, dataStartDate, config.endDate);

    if (bars.length < 60) {
      console.log(`  Skipping - insufficient data`);
      continue;
    }

    const sma20 = calculateSMA(bars, 20);
    const sma50 = calculateSMA(bars, 50);
    const atr = calculateATR(bars, 14);

    const allSetups = findSetups(symbol, bars, sma20, sma50, atr);
    const setups = allSetups.filter(s => s.date >= config.startDate && s.date <= config.endDate);

    console.log(`  Found ${setups.length} setups`);

    let lastTradeExitDate: string | null = null;

    for (const setup of setups) {
      if (lastTradeExitDate) {
        const daysSinceExit = Math.floor(
          (new Date(setup.date).getTime() - new Date(lastTradeExitDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceExit < config.cooldownDays) {
          continue;
        }
      }

      const trade = simulateTrade(symbol, setup, bars, {
        accountSize: currentEquity,
        riskPercent: config.riskPercent,
        maxStopPercent: config.maxStopPercent,
        minStopPercent: config.minStopPercent,
        rewardRatio: config.rewardRatio,
        maxHoldingDays: config.maxHoldingDays,
        trailAfterR: config.trailAfterR,
        trailPercent: config.trailPercent,
        moveToBreakevenAtR: config.moveToBreakevenAtR
      });

      if (trade) {
        allTrades.push(trade);
        currentEquity += trade.pnl!;
        lastTradeExitDate = trade.exitDate!;
        
        const emoji = trade.pnl! > 0 ? '✅' : trade.pnl! < -10 ? '❌' : '⚪';
        console.log(`  ${emoji} ${symbol} ${trade.entryDate}: ${trade.exitReason} | R: ${trade.rMultiple!.toFixed(2)} | $${trade.pnl!.toFixed(0)}`);
        
        equityCurve.push({ date: trade.exitDate!, equity: currentEquity });
      }
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  allTrades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  const winners = allTrades.filter(t => t.pnl! > 0);
  const losers = allTrades.filter(t => t.pnl! < 0);
  const breakeven = allTrades.filter(t => t.pnl! === 0);

  const totalPnL = allTrades.reduce((sum, t) => sum + t.pnl!, 0);

  const avgWin = winners.length > 0
    ? winners.reduce((s, t) => s + t.pnl!, 0) / winners.length
    : 0;
  const avgLoss = losers.length > 0
    ? Math.abs(losers.reduce((s, t) => s + t.pnl!, 0) / losers.length)
    : 0;

  const grossProfit = winners.reduce((s, t) => s + t.pnl!, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl!, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const avgRMultiple = allTrades.length > 0
    ? allTrades.reduce((sum, t) => sum + t.rMultiple!, 0) / allTrades.length
    : 0;

  const avgHoldingDays = allTrades.length > 0
    ? allTrades.reduce((sum, t) => sum + (t.holdingDays || 0), 0) / allTrades.length
    : 0;

  let peak = config.accountSize;
  let maxDrawdown = 0;
  let runningEquity = config.accountSize;
  for (const trade of allTrades) {
    runningEquity += trade.pnl!;
    if (runningEquity > peak) peak = runningEquity;
    const dd = peak - runningEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const maxDrawdownPercent = (maxDrawdown / peak) * 100;

  const winRate = allTrades.length > 0 ? (winners.length / allTrades.length) * 100 : 0;
  const expectancy = avgRMultiple;
  const expectancyPerTrade = allTrades.length > 0 ? totalPnL / allTrades.length : 0;

  const monthlyMap = new Map<string, { trades: number; wins: number; pnl: number }>();
  for (const trade of allTrades) {
    const month = trade.entryDate.substring(0, 7);
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
      breakeven: breakeven.length,
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      avgRMultiple,
      avgHoldingDays,
      maxDrawdown,
      maxDrawdownPercent,
      expectancy,
      expectancyPerTrade
    },
    monthlyPerformance,
    equityCurve
  };

  console.log('\n========================================');
  console.log('ASYMMETRIC RISK TRADING RESULTS');
  console.log('========================================');

  console.log(`\nACCOUNT:`);
  console.log(`  Starting: $${config.accountSize.toLocaleString()}`);
  console.log(`  Ending: $${currentEquity.toLocaleString()}`);
  console.log(`  Total P&L: $${totalPnL.toLocaleString()}`);
  console.log(`  Return: ${((totalPnL / config.accountSize) * 100).toFixed(1)}%`);

  console.log(`\nTRADES:`);
  console.log(`  Total: ${result.summary.totalTrades}`);
  console.log(`  Winners: ${winners.length} (${winRate.toFixed(1)}%)`);
  console.log(`  Losers: ${losers.length}`);
  console.log(`  Breakeven: ${breakeven.length}`);

  console.log(`\nRISK METRICS:`);
  console.log(`  Avg Win: $${avgWin.toFixed(0)}`);
  console.log(`  Avg Loss: $${avgLoss.toFixed(0)}`);
  console.log(`  Profit Factor: ${profitFactor.toFixed(2)}`);
  console.log(`  Avg R-Multiple: ${avgRMultiple.toFixed(2)}`);
  console.log(`  Expectancy/Trade: $${expectancyPerTrade.toFixed(0)}`);
  console.log(`  Max Drawdown: $${maxDrawdown.toFixed(0)} (${maxDrawdownPercent.toFixed(1)}%)`);
  console.log(`  Avg Holding Days: ${avgHoldingDays.toFixed(1)}`);

  console.log(`\nEXIT BREAKDOWN:`);
  const exitReasons = new Map<string, number>();
  for (const t of allTrades) {
    const reason = t.exitReason || 'unknown';
    exitReasons.set(reason, (exitReasons.get(reason) || 0) + 1);
  }
  for (const [reason, count] of exitReasons) {
    const pct = ((count / allTrades.length) * 100).toFixed(0);
    console.log(`  ${reason}: ${count} (${pct}%)`);
  }

  console.log('\n--- Monthly Performance ---');
  for (const m of monthlyPerformance) {
    const emoji = m.pnl >= 0 ? '📈' : '📉';
    console.log(`${m.month} | ${emoji} Trades: ${m.trades} | WR: ${m.winRate.toFixed(0)}% | P&L: $${m.pnl.toFixed(0)}`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2023-01-01';
  const endDate = args[1] || '2023-12-31';

  console.log(`\n💰 ASYMMETRIC RISK SWING TRADING BACKTEST`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`Strategy: Take ALL setups, fixed 1% risk, cut losers fast, let winners run`);
  console.log(`Edge comes from R:R, not prediction accuracy.\n`);

  const result = await runAsymmetricRiskBacktest({
    startDate,
    endDate,
    symbols: SWING_WATCHLIST.slice(0, 30),
    accountSize: 10000,
    riskPercent: 1,
    maxStopPercent: 3,
    minStopPercent: 1,
    rewardRatio: 3,
    maxHoldingDays: 15,
    trailAfterR: 1.5,
    trailPercent: 3,
    moveToBreakevenAtR: 1,
    cooldownDays: 5
  });

  fs.writeFileSync('./asymmetric_risk_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to asymmetric_risk_results.json');
}

main().catch(console.error);
