import dotenv from 'dotenv';
dotenv.config();

import { metaApiHandler } from '../handlers/metaApiRestHandler.js';

metaApiHandler.reinitialize();

interface GoldCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface GoldTrade {
  entryDate: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  exitDate: string;
  exitPrice: number;
  exitReason: 'stop_loss' | 'target' | 'expired' | 'end_of_data';
  pnlPercent: number;
  pnlDollars: number;
  holdingDays: number;
  consolidationDays: number;
}

interface BacktestConfig {
  stopLossPercent: number;
  targetMultiple: number;
  positionSize: number;
  minConsolidationDays: number;
  maxConsolidationDays: number;
  consolidationRangePercent: number;
  maxHoldingDays: number;
  emaPeriod: number;
  requireBullishTrend: boolean;
}

const DEFAULT_CONFIG: BacktestConfig = {
  stopLossPercent: 3,
  targetMultiple: 2,
  positionSize: 5000,
  minConsolidationDays: 5,
  maxConsolidationDays: 20,
  consolidationRangePercent: 5,
  maxHoldingDays: 30,
  emaPeriod: 20,
  requireBullishTrend: true
};

function calculateEma(closes: number[], period: number): number[] {
  const emas: number[] = [];
  if (closes.length < period) return emas;

  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = 0; i < period; i++) {
    emas.push(0);
  }
  emas[period - 1] = ema;

  for (let i = period; i < closes.length; i++) {
    ema = (closes[i] - ema) * multiplier + ema;
    emas.push(ema);
  }

  return emas;
}

function detectConsolidation(
  candles: GoldCandle[],
  endIndex: number,
  config: BacktestConfig
): { detected: boolean; high: number; low: number; days: number } | null {
  if (endIndex < config.minConsolidationDays) return null;

  const startIndex = Math.max(0, endIndex - config.maxConsolidationDays);

  for (let days = config.minConsolidationDays; days <= endIndex - startIndex; days++) {
    const windowStart = endIndex - days;
    const window = candles.slice(windowStart, endIndex + 1);

    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    const windowHigh = Math.max(...highs);
    const windowLow = Math.min(...lows);
    const rangePercent = ((windowHigh - windowLow) / windowLow) * 100;

    if (rangePercent <= config.consolidationRangePercent) {
      return {
        detected: true,
        high: windowHigh,
        low: windowLow,
        days: days
      };
    }
  }

  return null;
}

async function runBacktest(config: BacktestConfig = DEFAULT_CONFIG): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('GOLD BREAKOUT STRATEGY BACKTEST');
  console.log('='.repeat(60));
  console.log(`Stop Loss: ${config.stopLossPercent}%`);
  console.log(`Target: ${config.stopLossPercent * config.targetMultiple}% (${config.targetMultiple}:1 R:R)`);
  console.log(`Position Size: $${config.positionSize}`);
  console.log(`Consolidation: ${config.minConsolidationDays}-${config.maxConsolidationDays} days, max ${config.consolidationRangePercent}% range`);
  console.log(`Max Holding: ${config.maxHoldingDays} days`);
  console.log(`Require Bullish Trend: ${config.requireBullishTrend ? 'YES' : 'NO'}`);
  console.log('='.repeat(60) + '\n');

  console.log('Fetching historical gold candles...');
  const result = await metaApiHandler.getHistoricalCandles('GOLD', '1d', 500);

  if (!result.success || !result.candles?.length) {
    console.error('Failed to fetch candles:', result.error);
    return;
  }

  const candles: GoldCandle[] = result.candles
    .map((c: any) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }))
    .sort((a: GoldCandle, b: GoldCandle) =>
      new Date(a.time).getTime() - new Date(b.time).getTime()
    );

  console.log(`Loaded ${candles.length} daily candles`);
  console.log(`Period: ${candles[0].time.split('T')[0]} to ${candles[candles.length - 1].time.split('T')[0]}\n`);

  const closes = candles.map(c => c.close);
  const emas = calculateEma(closes, config.emaPeriod);

  const trades: GoldTrade[] = [];
  let activeOrder: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    entryIndex: number;
    consolidationDays: number;
  } | null = null;
  let activeTrade: {
    entryDate: string;
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    entryIndex: number;
    consolidationDays: number;
  } | null = null;

  const startIndex = config.emaPeriod + config.minConsolidationDays;

  for (let i = startIndex; i < candles.length; i++) {
    const candle = candles[i];
    const date = candle.time.split('T')[0];
    const ema = emas[i];
    const isBullish = candle.close > ema;

    if (activeTrade) {
      const holdingDays = i - activeTrade.entryIndex;

      if (candle.low <= activeTrade.stopLoss) {
        const exitPrice = activeTrade.stopLoss;
        const pnlPercent = ((exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
        const pnlDollars = (pnlPercent / 100) * config.positionSize;

        trades.push({
          entryDate: activeTrade.entryDate,
          entryPrice: activeTrade.entryPrice,
          stopLoss: activeTrade.stopLoss,
          takeProfit: activeTrade.takeProfit,
          exitDate: date,
          exitPrice,
          exitReason: 'stop_loss',
          pnlPercent,
          pnlDollars,
          holdingDays,
          consolidationDays: activeTrade.consolidationDays
        });

        console.log(`[${date}] STOP LOSS: Entry $${activeTrade.entryPrice.toFixed(2)} -> Exit $${exitPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
        activeTrade = null;
        continue;
      }

      if (candle.high >= activeTrade.takeProfit) {
        const exitPrice = activeTrade.takeProfit;
        const pnlPercent = ((exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
        const pnlDollars = (pnlPercent / 100) * config.positionSize;

        trades.push({
          entryDate: activeTrade.entryDate,
          entryPrice: activeTrade.entryPrice,
          stopLoss: activeTrade.stopLoss,
          takeProfit: activeTrade.takeProfit,
          exitDate: date,
          exitPrice,
          exitReason: 'target',
          pnlPercent,
          pnlDollars,
          holdingDays,
          consolidationDays: activeTrade.consolidationDays
        });

        console.log(`[${date}] TARGET HIT: Entry $${activeTrade.entryPrice.toFixed(2)} -> Exit $${exitPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
        activeTrade = null;
        continue;
      }

      if (holdingDays >= config.maxHoldingDays) {
        const exitPrice = candle.close;
        const pnlPercent = ((exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
        const pnlDollars = (pnlPercent / 100) * config.positionSize;

        trades.push({
          entryDate: activeTrade.entryDate,
          entryPrice: activeTrade.entryPrice,
          stopLoss: activeTrade.stopLoss,
          takeProfit: activeTrade.takeProfit,
          exitDate: date,
          exitPrice,
          exitReason: 'expired',
          pnlPercent,
          pnlDollars,
          holdingDays,
          consolidationDays: activeTrade.consolidationDays
        });

        console.log(`[${date}] MAX HOLD: Entry $${activeTrade.entryPrice.toFixed(2)} -> Exit $${exitPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
        activeTrade = null;
        continue;
      }

      continue;
    }

    if (activeOrder) {
      if (candle.high >= activeOrder.entryPrice) {
        activeTrade = {
          entryDate: date,
          entryPrice: activeOrder.entryPrice,
          stopLoss: activeOrder.stopLoss,
          takeProfit: activeOrder.takeProfit,
          entryIndex: i,
          consolidationDays: activeOrder.consolidationDays
        };
        console.log(`[${date}] ENTRY TRIGGERED: Buy at $${activeOrder.entryPrice.toFixed(2)}, SL $${activeOrder.stopLoss.toFixed(2)}, TP $${activeOrder.takeProfit.toFixed(2)}`);
        activeOrder = null;
        continue;
      }

      const orderAge = i - activeOrder.entryIndex;
      if (orderAge >= 5) {
        activeOrder = null;
      }
    }

    if (!activeTrade && !activeOrder) {
      if (config.requireBullishTrend && !isBullish) {
        continue;
      }

      const consolidation = detectConsolidation(candles, i, config);
      if (consolidation?.detected) {
        const breakoutLevel = consolidation.high * 1.001;
        const stopLoss = breakoutLevel * (1 - config.stopLossPercent / 100);
        const riskAmount = breakoutLevel - stopLoss;
        const takeProfit = breakoutLevel + (riskAmount * config.targetMultiple);

        activeOrder = {
          entryPrice: breakoutLevel,
          stopLoss,
          takeProfit,
          entryIndex: i,
          consolidationDays: consolidation.days
        };
      }
    }
  }

  if (activeTrade) {
    const lastCandle = candles[candles.length - 1];
    const exitPrice = lastCandle.close;
    const pnlPercent = ((exitPrice - activeTrade.entryPrice) / activeTrade.entryPrice) * 100;
    const pnlDollars = (pnlPercent / 100) * config.positionSize;
    const holdingDays = candles.length - 1 - activeTrade.entryIndex;

    trades.push({
      entryDate: activeTrade.entryDate,
      entryPrice: activeTrade.entryPrice,
      stopLoss: activeTrade.stopLoss,
      takeProfit: activeTrade.takeProfit,
      exitDate: lastCandle.time.split('T')[0],
      exitPrice,
      exitReason: 'end_of_data',
      pnlPercent,
      pnlDollars,
      holdingDays,
      consolidationDays: activeTrade.consolidationDays
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));

  if (trades.length === 0) {
    console.log('No trades executed during the backtest period.');
    return;
  }

  const wins = trades.filter(t => t.pnlPercent > 0);
  const losses = trades.filter(t => t.pnlPercent <= 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlDollars, 0);
  const totalPnlPercent = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
  const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnlPercent, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnlPercent, 0) / losses.length) : 0;
  const profitFactor = losses.length > 0 && avgLoss > 0 ?
    (wins.reduce((sum, t) => sum + t.pnlDollars, 0)) / Math.abs(losses.reduce((sum, t) => sum + t.pnlDollars, 0)) :
    wins.length > 0 ? Infinity : 0;

  console.log(`\nTotal Trades: ${trades.length}`);
  console.log(`Winners: ${wins.length} (${((wins.length / trades.length) * 100).toFixed(1)}%)`);
  console.log(`Losers: ${losses.length} (${((losses.length / trades.length) * 100).toFixed(1)}%)`);
  console.log(`\nTotal P&L: $${totalPnl.toFixed(2)} (${totalPnlPercent.toFixed(2)}%)`);
  console.log(`Average Win: ${avgWin.toFixed(2)}%`);
  console.log(`Average Loss: ${avgLoss.toFixed(2)}%`);
  console.log(`Profit Factor: ${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}`);

  const avgHoldingDays = trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length;
  console.log(`\nAverage Holding: ${avgHoldingDays.toFixed(1)} days`);

  const stopLossExits = trades.filter(t => t.exitReason === 'stop_loss').length;
  const targetExits = trades.filter(t => t.exitReason === 'target').length;
  const expiredExits = trades.filter(t => t.exitReason === 'expired').length;

  console.log(`\nExit Reasons:`);
  console.log(`  Stop Loss: ${stopLossExits}`);
  console.log(`  Target Hit: ${targetExits}`);
  console.log(`  Max Hold/Expired: ${expiredExits}`);

  console.log('\n' + '-'.repeat(60));
  console.log('TRADE LOG');
  console.log('-'.repeat(60));

  trades.forEach((t, idx) => {
    const emoji = t.pnlPercent > 0 ? '✓' : '✗';
    console.log(`${idx + 1}. ${emoji} ${t.entryDate} -> ${t.exitDate}: $${t.entryPrice.toFixed(2)} -> $${t.exitPrice.toFixed(2)} | ${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}% ($${t.pnlDollars.toFixed(2)}) | ${t.exitReason} | ${t.holdingDays}d`);
  });

  const monthlyPnl = new Map<string, number>();
  trades.forEach(t => {
    const month = t.exitDate.substring(0, 7);
    monthlyPnl.set(month, (monthlyPnl.get(month) || 0) + t.pnlDollars);
  });

  if (monthlyPnl.size > 1) {
    console.log('\n' + '-'.repeat(60));
    console.log('MONTHLY BREAKDOWN');
    console.log('-'.repeat(60));

    const sortedMonths = Array.from(monthlyPnl.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    sortedMonths.forEach(([month, pnl]) => {
      const emoji = pnl >= 0 ? '📈' : '📉';
      console.log(`${month}: ${emoji} $${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`);
    });
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

const args = process.argv.slice(2);
const stopLossArg = args.find(a => a.startsWith('--stop='));
const targetArg = args.find(a => a.startsWith('--target='));
const positionArg = args.find(a => a.startsWith('--position='));

const config: BacktestConfig = {
  ...DEFAULT_CONFIG,
  stopLossPercent: stopLossArg ? parseFloat(stopLossArg.split('=')[1]) : DEFAULT_CONFIG.stopLossPercent,
  targetMultiple: targetArg ? parseFloat(targetArg.split('=')[1]) : DEFAULT_CONFIG.targetMultiple,
  positionSize: positionArg ? parseFloat(positionArg.split('=')[1]) : DEFAULT_CONFIG.positionSize,
};

runBacktest(config).catch(console.error);
