import dotenv from 'dotenv';
dotenv.config();

import { 
  analyseCanslimSignal, 
  scanForCanslimCandidates, 
  formatCanslimSignalForDisplay,
  CanslimSignal,
  CanslimConfig,
  CANSLIM_DEFAULT_CONFIG,
  clearCanslimCache
} from '../services/canslimService.js';
import { RS_UNIVERSE } from '../services/relativeStrengthService.js';
import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

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
  positionSize: 5000,
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
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  
  const entryDate = new Date(signal.date);
  entryDate.setDate(entryDate.getDate() + 1);
  
  const endDate = new Date(entryDate);
  endDate.setDate(endDate.getDate() + config.maxHoldingDays + 5);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      signal.symbol,
      entryDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0],
      'day',
      1,
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
          stopPercent: currentStopPercent
        };
      }
      
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
          stopPercent: currentStopPercent
        };
      }
      
      if (config.useTrailingStop && candle.high > highestPrice) {
        highestPrice = candle.high;
        const newTrailingStop = highestPrice * (1 - config.trailingStopPercent / 100);
        if (newTrailingStop > trailingStop) {
          trailingStop = newTrailingStop;
        }
      }
      
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
          stopPercent: currentStopPercent
        };
      }
    }
    
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
      stopPercent: currentStopPercent
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
  console.log(`CAN SLIM LITE BACKTEST (O'Neil Rules)`);
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Settings:`);
  console.log(`  Stop Loss: ${config.stopLossPercent}% (tight: ${config.tightStopPercent}%)`);
  console.log(`  Target: ${config.stopLossPercent * config.targetMultiple}% (${config.targetMultiple}:1 R:R)`);
  console.log(`  Circuit Breaker: ${config.circuitBreakerStops} stops in ${config.circuitBreakerDays} days -> pause ${config.circuitBreakerPauseDays} days`);
  console.log(`  Adaptive Stops: After ${config.consecutiveLossesForTightStop} consecutive losses -> ${config.tightStopPercent}% stop`);
  console.log(`${'='.repeat(70)}\n`);
  
  const tradingDays = getTradingDays(startDate, endDate);
  console.log(`Trading days to scan: ${tradingDays.length}`);
  
  const allSignals: CanslimSignal[] = [];
  const allResults: TradeResult[] = [];
  const activePositions: Map<string, string> = new Map();
  
  let recentStopLosses: string[] = [];
  let consecutiveLosses = 0;
  let circuitBreakerUntil: string | null = null;
  let circuitBreakerCount = 0;
  let skippedDueToCircuitBreaker = 0;
  let tradesWithTightStop = 0;
  
  for (const date of tradingDays) {
    if (activePositions.has(date)) continue;
    
    if (config.useCircuitBreaker && circuitBreakerUntil && date < circuitBreakerUntil) {
      skippedDueToCircuitBreaker++;
      continue;
    }
    
    if (circuitBreakerUntil && date >= circuitBreakerUntil) {
      console.log(`\n[${date}] Circuit breaker lifted, resuming trading`);
      circuitBreakerUntil = null;
      consecutiveLosses = 0;
    }
    
    console.log(`\n[${date}] Scanning...`);
    
    const candidates = await scanForCanslimCandidates(date, RS_UNIVERSE, config);
    
    if (candidates.length === 0) {
      console.log(`  No candidates found`);
      continue;
    }
    
    console.log(`  Found ${candidates.length} candidates`);
    
    let currentStopPercent = config.stopLossPercent;
    if (config.useAdaptiveStops && consecutiveLosses >= config.consecutiveLossesForTightStop) {
      currentStopPercent = config.tightStopPercent;
      console.log(`  [ADAPTIVE] Using tight stop: ${currentStopPercent}% (${consecutiveLosses} consecutive losses)`);
    }
    
    for (const signal of candidates.slice(0, 3)) {
      if (activePositions.has(signal.symbol)) {
        console.log(`  ${signal.symbol}: Already in position, skipping`);
        continue;
      }
      
      console.log(`  ${signal.symbol}: Score ${signal.score}/${signal.maxScore}`);
      allSignals.push(signal);
      
      const result = await simulateTrade(signal, config, currentStopPercent);
      if (result) {
        allResults.push(result);
        const icon = result.pnlPercent >= 0 ? '+' : '';
        console.log(`    -> ${result.exitReason}: ${icon}${result.pnlPercent}% (${result.holdingDays} days, ${result.stopPercent}% stop)`);
        
        if (result.stopPercent === config.tightStopPercent) {
          tradesWithTightStop++;
        }
        
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
        
        const exitDate = new Date(result.exitDate);
        const entryDateObj = new Date(result.entryDate);
        while (entryDateObj <= exitDate) {
          activePositions.set(signal.symbol + entryDateObj.toISOString().split('T')[0], signal.symbol);
          entryDateObj.setDate(entryDateObj.getDate() + 1);
        }
      }
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`BACKTEST RESULTS`);
  console.log(`${'='.repeat(70)}\n`);
  
  if (allResults.length === 0) {
    console.log('No trades executed.');
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
  console.log(`\nTotal P&L: $${totalPnl.toFixed(2)}`);
  console.log(`Gross Profit: $${grossProfit.toFixed(2)}`);
  console.log(`Gross Loss: $${grossLoss.toFixed(2)}`);
  console.log(`Profit Factor: ${grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : 'N/A'}`);
  
  const avgWin = winners.length > 0 ? winners.reduce((sum, r) => sum + r.pnlPercent, 0) / winners.length : 0;
  const avgLoss = losers.length > 0 ? losers.reduce((sum, r) => sum + r.pnlPercent, 0) / losers.length : 0;
  console.log(`\nAvg Win: ${avgWin.toFixed(2)}%`);
  console.log(`Avg Loss: ${avgLoss.toFixed(2)}%`);
  console.log(`Avg Holding Days: ${(allResults.reduce((sum, r) => sum + r.holdingDays, 0) / allResults.length).toFixed(1)}`);
  
  console.log(`\nRisk Management:`);
  console.log(`  Circuit breakers triggered: ${circuitBreakerCount}`);
  console.log(`  Days skipped due to circuit breaker: ${skippedDueToCircuitBreaker}`);
  console.log(`  Trades with tight stop (${config.tightStopPercent}%): ${tradesWithTightStop}`);
  
  console.log(`\nExit Reasons:`);
  const exitReasons = ['stop_loss', 'target', 'trailing_stop', 'max_hold'] as const;
  for (const reason of exitReasons) {
    const trades = allResults.filter(r => r.exitReason === reason);
    if (trades.length > 0) {
      const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
      console.log(`  ${reason}: ${trades.length} trades, $${pnl.toFixed(2)}`);
    }
  }
  
  console.log(`\nBy Score:`);
  for (let score = 6; score >= 3; score--) {
    const trades = allResults.filter(r => r.score === score);
    if (trades.length > 0) {
      const winRate = (trades.filter(t => t.pnlPercent > 0).length / trades.length * 100).toFixed(1);
      const pnl = trades.reduce((sum, r) => sum + r.pnlDollars, 0);
      console.log(`  Score ${score}: ${trades.length} trades, ${winRate}% WR, $${pnl.toFixed(2)}`);
    }
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
    console.log(`  ${month}: ${trades.length} trades, ${winRate}% WR, $${monthPnl.toFixed(2)}`);
  }
  
  console.log(`\nTop 5 Winners:`);
  const sortedByPnl = [...allResults].sort((a, b) => b.pnlPercent - a.pnlPercent);
  for (const trade of sortedByPnl.slice(0, 5)) {
    console.log(`  ${trade.symbol}: +${trade.pnlPercent}% ($${trade.pnlDollars}) - ${trade.entryDate}`);
  }
  
  console.log(`\nTop 5 Losers:`);
  for (const trade of sortedByPnl.slice(-5).reverse()) {
    console.log(`  ${trade.symbol}: ${trade.pnlPercent}% ($${trade.pnlDollars}) - ${trade.entryDate}`);
  }
}

const args = process.argv.slice(2);
const startDate = args[0] || '2024-01-01';
const endDate = args[1] || '2024-06-30';

runBacktest(startDate, endDate).catch(console.error);
