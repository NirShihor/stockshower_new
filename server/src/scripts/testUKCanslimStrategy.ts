import dotenv from 'dotenv';
dotenv.config();

import {
  scanForCanslimCandidates,
  CanslimSignal,
  CanslimConfig,
  CANSLIM_DEFAULT_CONFIG,
  clearCanslimCache
} from '../services/canslimService.js';
import { UK_UNIVERSE } from '../services/relativeStrengthService.js';
import { fetchUKHistoricalBars, setCacheOnlyMode, getCachedSymbols } from '../handlers/ukDataAPI.js';
import { getStockSector } from '../services/sectorAnalysisService.js';

// Enable cache-only mode for backtesting (no API calls)
setCacheOnlyMode(true);

// Get symbols that have cached data
const cachedSymbols = new Set(getCachedSymbols());
const BACKTEST_UNIVERSE = UK_UNIVERSE.filter(s => cachedSymbols.has(s));
console.log(`UK Backtest Universe: ${BACKTEST_UNIVERSE.length} symbols (${UK_UNIVERSE.length - BACKTEST_UNIVERSE.length} excluded - no cache)`);

interface TradeResult {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  exitReason: 'stop_loss' | 'target' | 'trailing_stop' | 'max_hold' | 'circuit_breaker';
  pnlPercent: number;
  pnlDollars: number;
  holdingDays: number;
  score: number;
  stopPercent: number;
  rsRating: number;
  sector: string;
  volumeRatio: number;
}

interface BacktestConfig extends CanslimConfig {
  positionSize: number;
  maxHoldingDays: number;
  useTrailingStop: boolean;
  trailingStopPercent: number;
  useCircuitBreaker: boolean;
  circuitBreakerStops: number;
  circuitBreakerDays: number;
  circuitBreakerPauseDays: number;
  useAdaptiveStops: boolean;
  tightStopPercent: number;
  consecutiveLossesForTightStop: number;
  slippagePercent: number;
}

const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  ...CANSLIM_DEFAULT_CONFIG,
  targetMultiple: 3,
  positionSize: 5000,  // £5000 per position
  maxHoldingDays: 30,
  useTrailingStop: false,
  trailingStopPercent: 7,
  useCircuitBreaker: true,
  circuitBreakerStops: 3,
  circuitBreakerDays: 7,
  circuitBreakerPauseDays: 14,
  useAdaptiveStops: true,
  tightStopPercent: 4,
  consecutiveLossesForTightStop: 2,
  slippagePercent: 0.1
};

function getTradingDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

async function simulateTrade(
  signal: CanslimSignal,
  config: BacktestConfig,
  currentStopPercent: number
): Promise<TradeResult | null> {
  const entryDate = new Date(signal.date);
  entryDate.setDate(entryDate.getDate() + 1);

  const endDate = new Date(entryDate);
  endDate.setDate(endDate.getDate() + config.maxHoldingDays + 5);

  try {
    const candles = await fetchUKHistoricalBars(
      signal.symbol,
      entryDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      'day',
      config.maxHoldingDays + 5
    );

    if (candles.length === 0) return null;

    const rawEntryPrice = candles[0].open;
    const entryPrice = rawEntryPrice * (1 + config.slippagePercent / 100);
    const stopLoss = entryPrice * (1 - currentStopPercent / 100);
    const target = entryPrice * (1 + currentStopPercent * config.targetMultiple / 100);

    let highestPrice = entryPrice;
    let trailingStop = stopLoss;

    for (let i = 0; i < candles.length && i < config.maxHoldingDays; i++) {
      const candle = candles[i];

      // Check stop loss
      if (candle.low <= stopLoss) {
        const exitPrice = stopLoss;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        return {
          symbol: signal.symbol,
          entryDate: candles[0].start.split('T')[0],
          entryPrice,
          exitDate: candle.start.split('T')[0],
          exitPrice,
          exitReason: 'stop_loss',
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          pnlDollars: Math.round((pnlPercent / 100) * config.positionSize * 100) / 100,
          holdingDays: i + 1,
          score: signal.score,
          stopPercent: currentStopPercent,
          rsRating: signal.relativeStrength?.rsRating || 0,
          sector: signal.sectorStrength?.sector || 'unknown',
          volumeRatio: signal.volumeBreakout?.volumeRatio || 0
        };
      }

      // Check target
      if (candle.high >= target) {
        const exitPrice = target;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        return {
          symbol: signal.symbol,
          entryDate: candles[0].start.split('T')[0],
          entryPrice,
          exitDate: candle.start.split('T')[0],
          exitPrice,
          exitReason: 'target',
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          pnlDollars: Math.round((pnlPercent / 100) * config.positionSize * 100) / 100,
          holdingDays: i + 1,
          score: signal.score,
          stopPercent: currentStopPercent,
          rsRating: signal.relativeStrength?.rsRating || 0,
          sector: signal.sectorStrength?.sector || 'unknown',
          volumeRatio: signal.volumeBreakout?.volumeRatio || 0
        };
      }

      // Update trailing stop
      if (config.useTrailingStop && candle.high > highestPrice) {
        highestPrice = candle.high;
        const newTrailingStop = highestPrice * (1 - config.trailingStopPercent / 100);
        if (newTrailingStop > trailingStop) {
          trailingStop = newTrailingStop;
        }
      }

      // Check trailing stop
      if (config.useTrailingStop && trailingStop > stopLoss && candle.low <= trailingStop) {
        const exitPrice = trailingStop;
        const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        return {
          symbol: signal.symbol,
          entryDate: candles[0].start.split('T')[0],
          entryPrice,
          exitDate: candle.start.split('T')[0],
          exitPrice,
          exitReason: 'trailing_stop',
          pnlPercent: Math.round(pnlPercent * 100) / 100,
          pnlDollars: Math.round((pnlPercent / 100) * config.positionSize * 100) / 100,
          holdingDays: i + 1,
          score: signal.score,
          stopPercent: currentStopPercent,
          rsRating: signal.relativeStrength?.rsRating || 0,
          sector: signal.sectorStrength?.sector || 'unknown',
          volumeRatio: signal.volumeBreakout?.volumeRatio || 0
        };
      }
    }

    // Max hold reached
    const lastCandle = candles[Math.min(candles.length - 1, config.maxHoldingDays - 1)];
    const exitPrice = lastCandle.close;
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;

    return {
      symbol: signal.symbol,
      entryDate: candles[0].start.split('T')[0],
      entryPrice,
      exitDate: lastCandle.start.split('T')[0],
      exitPrice,
      exitReason: 'max_hold',
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      pnlDollars: Math.round((pnlPercent / 100) * config.positionSize * 100) / 100,
      holdingDays: Math.min(candles.length, config.maxHoldingDays),
      score: signal.score,
      stopPercent: currentStopPercent,
      rsRating: signal.relativeStrength?.rsRating || 0,
      sector: signal.sectorStrength?.sector || 'unknown',
      volumeRatio: signal.volumeBreakout?.volumeRatio || 0
    };
  } catch (error) {
    console.error(`[BACKTEST] Error simulating trade for ${signal.symbol}:`, error);
    return null;
  }
}

async function runBacktest(
  startDate: string,
  endDate: string,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG
): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`UK CAN SLIM BACKTEST (Using Production Services)`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Settings:`);
  console.log(`  RS Minimum: ${config.minRsRating}`);
  console.log(`  Max % from High: ${config.maxPercentFromHigh}%`);
  console.log(`  Stop Loss: ${config.stopLossPercent}% (tight: ${config.tightStopPercent}%)`);
  console.log(`  Target: ${config.stopLossPercent * config.targetMultiple}% (${config.targetMultiple}:1 R:R)`);
  console.log(`  Position Size: £${config.positionSize}`);
  console.log(`  Max Holding: ${config.maxHoldingDays} days`);
  console.log(`  Circuit Breaker: ${config.circuitBreakerStops} stops in ${config.circuitBreakerDays} days`);
  console.log(`  UK Universe: ${BACKTEST_UNIVERSE.length} stocks (cached)`);
  console.log(`${'='.repeat(70)}\n`);

  const tradingDays = getTradingDays(startDate, endDate);
  console.log(`Trading days to scan: ${tradingDays.length}`);

  const allResults: TradeResult[] = [];
  const activePositions: Map<string, string> = new Map();

  let recentStopLosses: string[] = [];
  let consecutiveLosses = 0;
  let circuitBreakerUntil: string | null = null;
  let circuitBreakerCount = 0;
  let skippedDueToCircuitBreaker = 0;
  let skippedDueToMarketRegime = 0;
  let tradesWithTightStop = 0;

  for (const date of tradingDays) {
    // Circuit breaker check
    if (config.useCircuitBreaker && circuitBreakerUntil && date < circuitBreakerUntil) {
      skippedDueToCircuitBreaker++;
      continue;
    }

    if (circuitBreakerUntil && date >= circuitBreakerUntil) {
      console.log(`\n[${date}] Circuit breaker lifted, resuming trading`);
      circuitBreakerUntil = null;
      consecutiveLosses = 0;
    }

    console.log(`\n[${date}] Scanning UK market...`);

    // Use production scanForCanslimCandidates with market='UK'
    // ignoreMarketRegime=false means it will skip days when market is not risk-on
    const candidates = await scanForCanslimCandidates(date, BACKTEST_UNIVERSE, config, false, 'UK');

    if (candidates.length === 0) {
      console.log(`  No candidates found (market may be risk-off or no qualifying stocks)`);
      skippedDueToMarketRegime++;
      continue;
    }

    console.log(`  Found ${candidates.length} candidates`);

    // Determine stop percent
    let currentStopPercent = config.stopLossPercent;
    if (config.useAdaptiveStops && consecutiveLosses >= config.consecutiveLossesForTightStop) {
      currentStopPercent = config.tightStopPercent;
      console.log(`  [ADAPTIVE] Using tight stop: ${currentStopPercent}% (${consecutiveLosses} consecutive losses)`);
    }

    // Take top 3 candidates
    for (const signal of candidates.slice(0, 3)) {
      if (activePositions.has(signal.symbol)) {
        console.log(`  ${signal.symbol}: Already in position, skipping`);
        continue;
      }

      const sector = signal.sectorStrength?.sector || 'unknown';
      const volInfo = signal.volumeBreakout?.pass ? `Vol ${signal.volumeBreakout.volumeRatio}x` : 'No vol breakout';
      console.log(`  ${signal.symbol}: Score ${signal.score}/${signal.maxScore}, RS ${signal.relativeStrength?.rsRating || 'N/A'}, ${sector}, ${volInfo}`);

      const result = await simulateTrade(signal, config, currentStopPercent);
      if (result) {
        allResults.push(result);
        const icon = result.pnlPercent >= 0 ? '+' : '';
        console.log(`    -> ${result.exitReason}: ${icon}${result.pnlPercent}% (${result.holdingDays} days, ${result.stopPercent}% stop)`);

        if (result.stopPercent === config.tightStopPercent) {
          tradesWithTightStop++;
        }

        // Update circuit breaker tracking
        if (result.exitReason === 'stop_loss') {
          recentStopLosses.push(result.exitDate);
          consecutiveLosses++;

          recentStopLosses = recentStopLosses.filter(d =>
            daysBetween(d, date) <= config.circuitBreakerDays
          );

          if (config.useCircuitBreaker && recentStopLosses.length >= config.circuitBreakerStops) {
            const pauseUntil = new Date(date);
            pauseUntil.setDate(pauseUntil.getDate() + config.circuitBreakerPauseDays);
            circuitBreakerUntil = pauseUntil.toISOString().split('T')[0];
            circuitBreakerCount++;
            console.log(`  [CIRCUIT BREAKER] ${recentStopLosses.length} stops in ${config.circuitBreakerDays} days - pausing until ${circuitBreakerUntil}`);
            recentStopLosses = [];
          }
        } else if (result.pnlPercent > 0) {
          consecutiveLosses = 0;
        }

        // Track active position
        const exitDate = new Date(result.exitDate);
        const entryDateObj = new Date(result.entryDate);
        while (entryDateObj <= exitDate) {
          activePositions.set(signal.symbol + entryDateObj.toISOString().split('T')[0], signal.symbol);
          entryDateObj.setDate(entryDateObj.getDate() + 1);
        }
      }
    }
  }

  // Print results
  printResults(allResults, config, circuitBreakerCount, skippedDueToCircuitBreaker,
    skippedDueToMarketRegime, tradesWithTightStop);
}

function printResults(
  allResults: TradeResult[],
  config: BacktestConfig,
  circuitBreakerCount: number,
  skippedDueToCircuitBreaker: number,
  skippedDueToMarketRegime: number,
  tradesWithTightStop: number
): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`UK CAN SLIM BACKTEST RESULTS (Production Services)`);
  console.log(`${'='.repeat(70)}\n`);

  if (allResults.length === 0) {
    console.log('No trades executed.');
    console.log(`Days with no candidates (market regime or no qualifying stocks): ${skippedDueToMarketRegime}`);
    return;
  }

  const winners = allResults.filter(r => r.pnlPercent > 0);
  const losers = allResults.filter(r => r.pnlPercent <= 0);
  const totalPnl = allResults.reduce((sum, r) => sum + r.pnlDollars, 0);
  const grossProfit = winners.reduce((sum, r) => sum + r.pnlDollars, 0);
  const grossLoss = Math.abs(losers.reduce((sum, r) => sum + r.pnlDollars, 0));

  console.log(`Total Trades: ${allResults.length}`);
  console.log(`Winners: ${winners.length} (${((winners.length / allResults.length) * 100).toFixed(1)}%)`);
  console.log(`Losers: ${losers.length}`);
  console.log(`\nTotal P&L: £${totalPnl.toFixed(2)}`);
  console.log(`Gross Profit: £${grossProfit.toFixed(2)}`);
  console.log(`Gross Loss: £${grossLoss.toFixed(2)}`);
  console.log(`Profit Factor: ${grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A'}`);

  const avgWin = winners.length > 0 ? winners.reduce((sum, r) => sum + r.pnlPercent, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? losers.reduce((sum, r) => sum + r.pnlPercent, 0) / losers.length : 0;
  console.log(`\nAvg Win: ${avgWin.toFixed(2)}%`);
  console.log(`Avg Loss: ${avgLoss.toFixed(2)}%`);
  console.log(`Avg Holding Days: ${(allResults.reduce((sum, r) => sum + r.holdingDays, 0) / allResults.length).toFixed(1)}`);

  console.log(`\nRisk Management:`);
  console.log(`  Circuit breakers triggered: ${circuitBreakerCount}`);
  console.log(`  Days skipped (circuit breaker): ${skippedDueToCircuitBreaker}`);
  console.log(`  Days with no candidates: ${skippedDueToMarketRegime}`);
  console.log(`  Trades with tight stop (${config.tightStopPercent}%): ${tradesWithTightStop}`);

  // Volume breakout analysis
  const withVolumeBreakout = allResults.filter(r => r.volumeRatio >= 1.4);
  const withoutVolumeBreakout = allResults.filter(r => r.volumeRatio < 1.4);
  console.log(`\nVolume Breakout Analysis:`);
  if (withVolumeBreakout.length > 0) {
    const vbWinRate = (withVolumeBreakout.filter(r => r.pnlPercent > 0).length / withVolumeBreakout.length * 100).toFixed(1);
    const vbPnl = withVolumeBreakout.reduce((sum, r) => sum + r.pnlDollars, 0);
    console.log(`  With volume breakout (1.4x+): ${withVolumeBreakout.length} trades, ${vbWinRate}% WR, £${vbPnl.toFixed(2)}`);
  }
  if (withoutVolumeBreakout.length > 0) {
    const noVbWinRate = (withoutVolumeBreakout.filter(r => r.pnlPercent > 0).length / withoutVolumeBreakout.length * 100).toFixed(1);
    const noVbPnl = withoutVolumeBreakout.reduce((sum, r) => sum + r.pnlDollars, 0);
    console.log(`  Without volume breakout: ${withoutVolumeBreakout.length} trades, ${noVbWinRate}% WR, £${noVbPnl.toFixed(2)}`);
  }

  console.log(`\nExit Reasons:`);
  const exitReasons = ['stop_loss', 'target', 'trailing_stop', 'max_hold'] as const;
  for (const reason of exitReasons) {
    const trades = allResults.filter(r => r.exitReason === reason);
    if (trades.length > 0) {
      const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
      console.log(`  ${reason}: ${trades.length} trades, £${pnl.toFixed(2)}`);
    }
  }

  console.log(`\nBy RS Rating:`);
  for (let rs = 99; rs >= 80; rs -= 5) {
    const trades = allResults.filter(r => r.rsRating >= rs && r.rsRating < rs + 5);
    if (trades.length > 0) {
      const winRate = (trades.filter(t => t.pnlPercent > 0).length / trades.length * 100).toFixed(1);
      const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
      console.log(`  RS ${rs}-${rs + 4}: ${trades.length} trades, ${winRate}% WR, £${pnl.toFixed(2)}`);
    }
  }

  console.log(`\nBy Sector:`);
  const bySector = new Map<string, TradeResult[]>();
  for (const trade of allResults) {
    if (!bySector.has(trade.sector)) bySector.set(trade.sector, []);
    bySector.get(trade.sector)!.push(trade);
  }
  const sortedSectors = [...bySector.entries()].sort((a, b) => {
    const pnlA = a[1].reduce((sum, r) => sum + r.pnlDollars, 0);
    const pnlB = b[1].reduce((sum, r) => sum + r.pnlDollars, 0);
    return pnlB - pnlA;
  });
  for (const [sector, trades] of sortedSectors) {
    const winRate = (trades.filter(t => t.pnlPercent > 0).length / trades.length * 100).toFixed(1);
    const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
    console.log(`  ${sector}: ${trades.length} trades, ${winRate}% WR, £${pnl.toFixed(2)}`);
  }

  console.log(`\nBy Month:`);
  const byMonth = new Map<string, TradeResult[]>();
  for (const trade of allResults) {
    const month = trade.entryDate.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(trade);
  }
  const sortedMonths = [...byMonth.keys()].sort();
  for (const month of sortedMonths) {
    const trades = byMonth.get(month)!;
    const monthWinners = trades.filter(t => t.pnlPercent > 0);
    const monthPnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
    const winRate = (monthWinners.length / trades.length * 100).toFixed(1);
    console.log(`  ${month}: ${trades.length} trades, ${winRate}% WR, £${monthPnl.toFixed(2)}`);
  }

  console.log(`\nBy Score:`);
  for (let score = 6; score >= 3; score--) {
    const trades = allResults.filter(r => r.score === score);
    if (trades.length > 0) {
      const winRate = (trades.filter(t => t.pnlPercent > 0).length / trades.length * 100).toFixed(1);
      const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
      console.log(`  Score ${score}: ${trades.length} trades, ${winRate}% WR, £${pnl.toFixed(2)}`);
    }
  }

  console.log(`\nTop 5 Winners:`);
  const sortedByPnl = [...allResults].sort((a, b) => b.pnlPercent - a.pnlPercent);
  for (const trade of sortedByPnl.slice(0, 5)) {
    console.log(`  ${trade.symbol}: +${trade.pnlPercent}% (£${trade.pnlDollars}) - ${trade.entryDate}, Vol ${trade.volumeRatio}x`);
  }

  console.log(`\nTop 5 Losers:`);
  for (const trade of sortedByPnl.slice(-5).reverse()) {
    console.log(`  ${trade.symbol}: ${trade.pnlPercent}% (£${trade.pnlDollars}) - ${trade.entryDate}`);
  }

  console.log(`\n${'='.repeat(70)}`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const startDate = args[0] || '2024-01-01';
const endDate = args[1] || '2024-12-31';

runBacktest(startDate, endDate).catch(console.error);
