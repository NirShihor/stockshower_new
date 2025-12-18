import { Trade } from '../db/models/Trade.js';
import { DecisionLog } from '../db/models/DecisionLog.js';
import { updateTrainingInsights, clearTrainingInsightsCache } from './aiSignalFilter.js';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

interface PolygonBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

let schedulerInterval: NodeJS.Timeout | null = null;

function getNextRunTime(): Date {
  const now = new Date();
  const ukOffset = getUKOffset(now);
  
  const targetHour = 21;
  const targetMinute = 10;
  
  const nowUTC = now.getTime();
  const todayUK = new Date(nowUTC + ukOffset * 60 * 60 * 1000);
  
  let nextRun = new Date(todayUK);
  nextRun.setHours(targetHour, targetMinute, 0, 0);
  
  const nextRunUTC = new Date(nextRun.getTime() - ukOffset * 60 * 60 * 1000);
  
  if (nextRunUTC.getTime() <= nowUTC) {
    nextRunUTC.setDate(nextRunUTC.getDate() + 1);
  }
  
  return nextRunUTC;
}

function getUKOffset(date: Date): number {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  
  const lastSundayMarch = getLastSunday(date.getFullYear(), 2);
  const lastSundayOctober = getLastSunday(date.getFullYear(), 9);
  
  if (date >= lastSundayMarch && date < lastSundayOctober) {
    return 1;
  }
  return 0;
}

function getLastSunday(year: number, month: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  const dayOfWeek = lastDay.getDay();
  lastDay.setDate(lastDay.getDate() - dayOfWeek);
  lastDay.setHours(1, 0, 0, 0);
  return lastDay;
}

function getTimeOfDayPeriod(date: Date): string {
  const hour = date.getUTCHours();
  if (hour >= 14 && hour < 16) return 'market_open';
  if (hour >= 16 && hour < 18) return 'midday';
  if (hour >= 18 && hour < 20) return 'afternoon';
  if (hour >= 20) return 'close';
  return 'premarket';
}

function extractWarningsFromNotes(notes: string[]): string[] {
  return notes
    .filter(n => n.includes('⚠️') || n.toLowerCase().includes('caution') || n.toLowerCase().includes('warning'))
    .map(n => n.replace('⚠️ ', '').replace('CAUTION: ', ''));
}

async function fetchBarsAfterSignal(
  symbol: string, 
  signalTime: Date,
  hoursAfter: number = 4
): Promise<PolygonBar[]> {
  const ticker = symbol.replace('.O', '').replace('.N', '');
  const startTs = signalTime.getTime();
  const endTs = startTs + (hoursAfter * 60 * 60 * 1000);
  
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${startTs}/${endTs}?apiKey=${POLYGON_API_KEY}&limit=500`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      return data.results;
    }
    return [];
  } catch (error) {
    console.error(`[TRAINING-SCHEDULER] Error fetching bars for ${symbol}:`, error);
    return [];
  }
}

function simulateTradeOutcome(
  bars: PolygonBar[],
  entry: number,
  stop: number,
  target: number,
  direction: 'long' | 'short'
): {
  wouldHitStop: boolean;
  wouldHitTarget: boolean;
  timeToExit?: number;
  hypotheticalPnlPercent: number;
  outcome: 'win' | 'loss' | 'pending';
} {
  let wouldHitStop = false;
  let wouldHitTarget = false;
  let timeToExit: number | undefined;
  let exitPrice = entry;
  
  const firstBarTime = bars[0]?.t || 0;
  
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const minutesFromStart = (bar.t - firstBarTime) / (1000 * 60);
    
    if (direction === 'long') {
      if (bar.l <= stop) {
        wouldHitStop = true;
        exitPrice = stop;
        timeToExit = minutesFromStart;
        break;
      }
      if (bar.h >= target) {
        wouldHitTarget = true;
        exitPrice = target;
        timeToExit = minutesFromStart;
        break;
      }
    } else {
      if (bar.h >= stop) {
        wouldHitStop = true;
        exitPrice = stop;
        timeToExit = minutesFromStart;
        break;
      }
      if (bar.l <= target) {
        wouldHitTarget = true;
        exitPrice = target;
        timeToExit = minutesFromStart;
        break;
      }
    }
  }
  
  if (!wouldHitStop && !wouldHitTarget && bars.length > 0) {
    exitPrice = bars[bars.length - 1].c;
  }
  
  let hypotheticalPnlPercent: number;
  if (direction === 'long') {
    hypotheticalPnlPercent = ((exitPrice - entry) / entry) * 100;
  } else {
    hypotheticalPnlPercent = ((entry - exitPrice) / entry) * 100;
  }
  
  let outcome: 'win' | 'loss' | 'pending' = 'pending';
  if (wouldHitTarget) outcome = 'win';
  else if (wouldHitStop) outcome = 'loss';
  else if (hypotheticalPnlPercent > 0) outcome = 'win';
  else if (hypotheticalPnlPercent < 0) outcome = 'loss';
  
  return {
    wouldHitStop,
    wouldHitTarget,
    timeToExit,
    hypotheticalPnlPercent,
    outcome
  };
}

async function backfillDecisionOutcomes(): Promise<void> {
  console.log('[TRAINING-SCHEDULER] Backfilling decision outcomes...');
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  const decisions = await DecisionLog.find({
    signalTime: { $gte: cutoffDate },
    'hypotheticalOutcome.checkedAt': { $exists: false }
  }).sort({ signalTime: -1 });
  
  console.log(`[TRAINING-SCHEDULER] Found ${decisions.length} decisions to backfill`);
  
  let processed = 0;
  let wins = 0;
  let losses = 0;
  
  for (const decision of decisions) {
    const entry = decision.wasInverted ? decision.invertedEntry! : decision.originalEntry;
    const stop = decision.wasInverted ? decision.invertedStop! : decision.originalStop;
    const target = decision.wasInverted ? decision.invertedTarget! : decision.originalTarget;
    const direction = decision.wasInverted ? decision.invertedDirection! : decision.originalDirection;
    
    if (!entry || !stop || !target) {
      continue;
    }
    
    const bars = await fetchBarsAfterSignal(decision.symbol, decision.signalTime, 4);
    
    if (bars.length === 0) {
      continue;
    }
    
    const outcome = simulateTradeOutcome(bars, entry, stop, target, direction);
    
    decision.hypotheticalOutcome = {
      checkedAt: new Date(),
      wouldHitStop: outcome.wouldHitStop,
      wouldHitTarget: outcome.wouldHitTarget,
      timeToExit: outcome.timeToExit,
      hypotheticalPnlPercent: outcome.hypotheticalPnlPercent,
      outcome: outcome.outcome
    };
    
    await decision.save();
    
    processed++;
    if (outcome.outcome === 'win') wins++;
    else if (outcome.outcome === 'loss') losses++;
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  if (processed > 0) {
    const winRate = ((wins / processed) * 100).toFixed(1);
    console.log(`[TRAINING-SCHEDULER] Backfill complete: ${processed} decisions, ${wins} wins (${winRate}%), ${losses} losses`);
  } else {
    console.log('[TRAINING-SCHEDULER] No new decisions to backfill');
  }
}

interface DecisionPerformance {
  invert: {
    count: number;
    wins: number;
    losses: number;
    winRate: number;
    avgPnlPercent: number;
  };
  skip: {
    count: number;
    hypotheticalWins: number;
    hypotheticalLosses: number;
    hypotheticalWinRate: number;
    avgHypotheticalPnlPercent: number;
  };
  pass: {
    count: number;
    wins: number;
    losses: number;
    winRate: number;
    avgPnlPercent: number;
  };
  inversionAccuracy: number;
  skipAccuracy: number;
}

async function analyzeDecisionPerformance(): Promise<DecisionPerformance | null> {
  try {
    const decisions = await DecisionLog.find({
      'hypotheticalOutcome.outcome': { $exists: true, $ne: 'pending' }
    });
    
    if (decisions.length === 0) {
      console.log('[TRAINING-SCHEDULER] No decision outcomes found for analysis');
      return null;
    }
    
    const stats: DecisionPerformance = {
      invert: { count: 0, wins: 0, losses: 0, winRate: 0, avgPnlPercent: 0 },
      skip: { count: 0, hypotheticalWins: 0, hypotheticalLosses: 0, hypotheticalWinRate: 0, avgHypotheticalPnlPercent: 0 },
      pass: { count: 0, wins: 0, losses: 0, winRate: 0, avgPnlPercent: 0 },
      inversionAccuracy: 0,
      skipAccuracy: 0
    };
    
    let invertTotalPnl = 0;
    let skipTotalPnl = 0;
    let passTotalPnl = 0;
    
    for (const d of decisions) {
      const outcome = d.hypotheticalOutcome?.outcome;
      const pnl = d.hypotheticalOutcome?.hypotheticalPnlPercent || 0;
      
      if (d.decision === 'invert') {
        stats.invert.count++;
        if (outcome === 'win') stats.invert.wins++;
        else if (outcome === 'loss') stats.invert.losses++;
        invertTotalPnl += pnl;
      } else if (d.decision === 'skip') {
        stats.skip.count++;
        if (outcome === 'win') stats.skip.hypotheticalWins++;
        else if (outcome === 'loss') stats.skip.hypotheticalLosses++;
        skipTotalPnl += pnl;
      } else if (d.decision === 'pass') {
        stats.pass.count++;
        if (outcome === 'win') stats.pass.wins++;
        else if (outcome === 'loss') stats.pass.losses++;
        passTotalPnl += pnl;
      }
    }
    
    const invertTotal = stats.invert.wins + stats.invert.losses;
    const skipTotal = stats.skip.hypotheticalWins + stats.skip.hypotheticalLosses;
    const passTotal = stats.pass.wins + stats.pass.losses;
    
    stats.invert.winRate = invertTotal > 0 ? (stats.invert.wins / invertTotal) * 100 : 0;
    stats.invert.avgPnlPercent = invertTotal > 0 ? invertTotalPnl / invertTotal : 0;
    
    stats.skip.hypotheticalWinRate = skipTotal > 0 ? (stats.skip.hypotheticalWins / skipTotal) * 100 : 0;
    stats.skip.avgHypotheticalPnlPercent = skipTotal > 0 ? skipTotalPnl / skipTotal : 0;
    
    stats.pass.winRate = passTotal > 0 ? (stats.pass.wins / passTotal) * 100 : 0;
    stats.pass.avgPnlPercent = passTotal > 0 ? passTotalPnl / passTotal : 0;
    
    stats.inversionAccuracy = stats.invert.winRate;
    stats.skipAccuracy = skipTotal > 0 ? (stats.skip.hypotheticalLosses / skipTotal) * 100 : 0;
    
    console.log(`[TRAINING-SCHEDULER] Decision performance analyzed:`);
    console.log(`[TRAINING-SCHEDULER]    Inverted: ${stats.invert.count} trades, ${stats.invert.winRate.toFixed(1)}% win rate`);
    console.log(`[TRAINING-SCHEDULER]    Skipped: ${stats.skip.count} trades, would have been ${stats.skip.hypotheticalWinRate.toFixed(1)}% win rate`);
    console.log(`[TRAINING-SCHEDULER]    Passed: ${stats.pass.count} trades, ${stats.pass.winRate.toFixed(1)}% win rate`);
    
    return stats;
  } catch (error) {
    console.error('[TRAINING-SCHEDULER] Error analyzing decision performance:', error);
    return null;
  }
}

async function regenerateTrainingInsights(): Promise<void> {
  console.log('[TRAINING-SCHEDULER] Starting daily training insights regeneration...');
  
  await backfillDecisionOutcomes();
  
  try {
    const closedTrades = await Trade.find({ 
      status: { $in: ['closed', 'filled'] },
      exitPrice: { $exists: true, $ne: null },
      actualEntryPrice: { $exists: true, $ne: null }
    }).sort({ closedTime: -1 });
    
    if (closedTrades.length === 0) {
      console.log('[TRAINING-SCHEDULER] No closed trades found, skipping regeneration');
      return;
    }
    
    console.log(`[TRAINING-SCHEDULER] Analyzing ${closedTrades.length} closed trades...`);
    
    const patternStats = new Map<string, any>();
    const symbolStats = new Map<string, any>();
    const symbolPatternStats = new Map<string, Map<string, { wins: number; total: number }>>();
    const timeOfDayStats = new Map<string, { wins: number; total: number; totalPnl: number }>();
    const patternClassStats = new Map<string, { wins: number; total: number; totalPnl: number; patterns: Map<string, { wins: number; total: number }> }>();
    const volumeStats = { high: { wins: 0, total: 0, totalPnl: 0 }, low: { wins: 0, total: 0, totalPnl: 0 } };
    const trendStats = { aligned: { wins: 0, total: 0, totalPnl: 0 }, counter: { wins: 0, total: 0, totalPnl: 0 } };
    const scoreRanges = new Map<string, { wins: number; total: number }>();
    const warningStats = new Map<string, { wins: number; total: number; totalPnl: number }>();
    const holdTimeStats = { winners: [] as number[], losers: [] as number[] };
    const slippageData = { market: [] as number[], stop: [] as number[] };
    
    let totalDirectionCorrect = 0;
    let totalStopPercent = 0;
    let totalTargetPercent = 0;
    let tradesWithStops = 0;
    let tradesWithTargets = 0;
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;
    
    for (const trade of closedTrades) {
      const patternName = trade.patternName;
      const symbol = trade.symbol;
      if (!patternName) continue;
      
      const isWin = (trade.pnlPercentage || 0) > 0;
      const pnl = trade.pnlPercentage || 0;
      const patternClass = trade.patternClass || trade.signalData?.pattern?.class || 'unknown';
      const isHighVolume = trade.signalData?.context?.isHighVolume || trade.marketConditions?.volume > 1.5;
      const trend = trade.marketConditions?.trend || trade.signalData?.context?.trend;
      const patternDirection = trade.signalData?.pattern?.direction;
      const score = trade.patternScore || trade.signalData?.score || 0;
      const signalTime = trade.signalTime || trade.orderPlacedTime;
      const closedTime = trade.closedTime;
      const notes = trade.signalData?.notes || [];
      
      if (signalTime) {
        const d = new Date(signalTime);
        if (!earliestDate || d < earliestDate) earliestDate = d;
        if (!latestDate || d > latestDate) latestDate = d;
      }
      
      if (!patternStats.has(patternName)) {
        patternStats.set(patternName, {
          pattern: patternName,
          patternClass,
          closedTrades: 0,
          wins: 0,
          directionCorrect: 0,
          totalPnl: 0,
          totalHoldMinutes: 0,
          byVolume: { high: { wins: 0, total: 0 }, low: { wins: 0, total: 0 } },
          byTrend: { aligned: { wins: 0, total: 0 }, counter: { wins: 0, total: 0 } }
        });
      }
      
      if (!symbolStats.has(symbol)) {
        symbolStats.set(symbol, {
          symbol,
          totalTrades: 0,
          wins: 0,
          totalPnlPercent: 0,
          totalHoldMinutes: 0,
          byTimeOfDay: new Map()
        });
        symbolPatternStats.set(symbol, new Map());
      }
      
      const stats = patternStats.get(patternName);
      const symStats = symbolStats.get(symbol);
      const symPatterns = symbolPatternStats.get(symbol)!;
      
      if (!symPatterns.has(patternName)) {
        symPatterns.set(patternName, { wins: 0, total: 0 });
      }
      const symPatternStat = symPatterns.get(patternName)!;
      
      stats.closedTrades++;
      symStats.totalTrades++;
      symPatternStat.total++;
      stats.totalPnl += pnl;
      symStats.totalPnlPercent += pnl;
      
      if (isWin) {
        stats.wins++;
        stats.directionCorrect++;
        totalDirectionCorrect++;
        symStats.wins++;
        symPatternStat.wins++;
      }
      
      if (signalTime && closedTime) {
        const holdMinutes = (new Date(closedTime).getTime() - new Date(signalTime).getTime()) / 60000;
        if (holdMinutes > 0 && holdMinutes < 600) {
          stats.totalHoldMinutes += holdMinutes;
          symStats.totalHoldMinutes += holdMinutes;
          if (isWin) holdTimeStats.winners.push(holdMinutes);
          else holdTimeStats.losers.push(holdMinutes);
        }
      }
      
      if (signalTime) {
        const period = getTimeOfDayPeriod(new Date(signalTime));
        if (!timeOfDayStats.has(period)) {
          timeOfDayStats.set(period, { wins: 0, total: 0, totalPnl: 0 });
        }
        const todStats = timeOfDayStats.get(period)!;
        todStats.total++;
        todStats.totalPnl += pnl;
        if (isWin) todStats.wins++;
        
        if (!symStats.byTimeOfDay.has(period)) {
          symStats.byTimeOfDay.set(period, { wins: 0, total: 0 });
        }
        const symTod = symStats.byTimeOfDay.get(period)!;
        symTod.total++;
        if (isWin) symTod.wins++;
      }
      
      if (patternClass && patternClass !== 'unknown') {
        if (!patternClassStats.has(patternClass)) {
          patternClassStats.set(patternClass, { wins: 0, total: 0, totalPnl: 0, patterns: new Map() });
        }
        const pcStats = patternClassStats.get(patternClass)!;
        pcStats.total++;
        pcStats.totalPnl += pnl;
        if (isWin) pcStats.wins++;
        
        if (!pcStats.patterns.has(patternName)) {
          pcStats.patterns.set(patternName, { wins: 0, total: 0 });
        }
        const patInClass = pcStats.patterns.get(patternName)!;
        patInClass.total++;
        if (isWin) patInClass.wins++;
      }
      
      if (isHighVolume) {
        volumeStats.high.total++;
        volumeStats.high.totalPnl += pnl;
        stats.byVolume.high.total++;
        if (isWin) {
          volumeStats.high.wins++;
          stats.byVolume.high.wins++;
        }
      } else {
        volumeStats.low.total++;
        volumeStats.low.totalPnl += pnl;
        stats.byVolume.low.total++;
        if (isWin) {
          volumeStats.low.wins++;
          stats.byVolume.low.wins++;
        }
      }
      
      const isTrendAligned = (trend === 'up' && patternDirection === 'bullish') || 
                             (trend === 'down' && patternDirection === 'bearish');
      if (isTrendAligned) {
        trendStats.aligned.total++;
        trendStats.aligned.totalPnl += pnl;
        stats.byTrend.aligned.total++;
        if (isWin) {
          trendStats.aligned.wins++;
          stats.byTrend.aligned.wins++;
        }
      } else if (trend && patternDirection) {
        trendStats.counter.total++;
        trendStats.counter.totalPnl += pnl;
        stats.byTrend.counter.total++;
        if (isWin) {
          trendStats.counter.wins++;
          stats.byTrend.counter.wins++;
        }
      }
      
      const scoreRange = score >= 85 ? '85-100' : score >= 75 ? '75-84' : score >= 70 ? '70-74' : '0-69';
      if (!scoreRanges.has(scoreRange)) {
        scoreRanges.set(scoreRange, { wins: 0, total: 0 });
      }
      const sr = scoreRanges.get(scoreRange)!;
      sr.total++;
      if (isWin) sr.wins++;
      
      const warnings = extractWarningsFromNotes(notes);
      for (const warning of warnings) {
        const shortWarning = warning.slice(0, 50);
        if (!warningStats.has(shortWarning)) {
          warningStats.set(shortWarning, { wins: 0, total: 0, totalPnl: 0 });
        }
        const ws = warningStats.get(shortWarning)!;
        ws.total++;
        ws.totalPnl += pnl;
        if (isWin) ws.wins++;
      }
      
      if (trade.entryPrice && trade.actualEntryPrice) {
        const slippage = Math.abs(trade.actualEntryPrice - trade.entryPrice) / trade.entryPrice * 100;
        const orderType = trade.orderType?.includes('STOP') ? 'stop' : 'market';
        slippageData[orderType].push(slippage);
      }
      
      if (trade.actualEntryPrice && trade.stopLoss) {
        const stopPercent = Math.abs(trade.actualEntryPrice - trade.stopLoss) / trade.actualEntryPrice * 100;
        totalStopPercent += stopPercent;
        tradesWithStops++;
      }
      
      if (trade.actualEntryPrice && trade.takeProfit) {
        const targetPercent = Math.abs(trade.takeProfit - trade.actualEntryPrice) / trade.actualEntryPrice * 100;
        totalTargetPercent += targetPercent;
        tradesWithTargets++;
      }
    }
    
    const directionAccuracy = closedTrades.length > 0 ? (totalDirectionCorrect / closedTrades.length) * 100 : 0;
    const optimalStopPercent = tradesWithStops > 0 ? totalStopPercent / tradesWithStops : 0.64;
    const optimalTargetPercent = tradesWithTargets > 0 ? totalTargetPercent / tradesWithTargets : 0.47;
    
    const patternRankings: any[] = [];
    for (const [_, stats] of patternStats) {
      if (stats.closedTrades < 2) continue;
      
      const winRate = (stats.wins / stats.closedTrades) * 100;
      const avgPnl = stats.totalPnl / stats.closedTrades;
      let recommendation: 'preferred' | 'acceptable' | 'avoid';
      if (winRate >= 55) recommendation = 'preferred';
      else if (winRate >= 45) recommendation = 'acceptable';
      else recommendation = 'avoid';
      
      patternRankings.push({
        pattern: stats.pattern,
        directionAccuracy: winRate,
        winRate,
        avgPnlPercent: avgPnl,
        count: stats.closedTrades,
        recommendation,
        avgMfe: 0.4,
        avgHoldMinutes: stats.closedTrades > 0 ? stats.totalHoldMinutes / stats.closedTrades : undefined,
        byVolume: stats.byVolume.high.total > 0 || stats.byVolume.low.total > 0 ? {
          high: { winRate: stats.byVolume.high.total > 0 ? (stats.byVolume.high.wins / stats.byVolume.high.total) * 100 : 0, count: stats.byVolume.high.total },
          low: { winRate: stats.byVolume.low.total > 0 ? (stats.byVolume.low.wins / stats.byVolume.low.total) * 100 : 0, count: stats.byVolume.low.total }
        } : undefined,
        byTrend: stats.byTrend.aligned.total > 0 || stats.byTrend.counter.total > 0 ? {
          aligned: { winRate: stats.byTrend.aligned.total > 0 ? (stats.byTrend.aligned.wins / stats.byTrend.aligned.total) * 100 : 0, count: stats.byTrend.aligned.total },
          counter: { winRate: stats.byTrend.counter.total > 0 ? (stats.byTrend.counter.wins / stats.byTrend.counter.total) * 100 : 0, count: stats.byTrend.counter.total }
        } : undefined
      });
    }
    
    patternRankings.sort((a, b) => b.winRate - a.winRate);
    
    const patternsToPrefer = patternRankings.filter(p => p.recommendation === 'preferred').map(p => p.pattern);
    const patternsToAvoid = patternRankings.filter(p => p.recommendation === 'avoid' && p.winRate >= 30).map(p => p.pattern);
    const patternsToInvert = patternRankings.filter(p => p.winRate < 30 && p.count >= 5).map(p => p.pattern);
    
    const timeOfDayPerformance = Array.from(timeOfDayStats.entries())
      .map(([period, stats]) => ({
        period,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        count: stats.total,
        avgPnlPercent: stats.total > 0 ? stats.totalPnl / stats.total : 0
      }))
      .sort((a, b) => b.winRate - a.winRate);
    
    const patternClassPerformance = Array.from(patternClassStats.entries())
      .map(([cls, stats]) => {
        const patternWinRates = Array.from(stats.patterns.entries())
          .map(([p, s]) => ({ pattern: p, winRate: s.total > 0 ? (s.wins / s.total) * 100 : 0, count: s.total }))
          .filter(p => p.count >= 2);
        patternWinRates.sort((a, b) => b.winRate - a.winRate);
        return {
          class: cls as 'single' | 'double' | 'triple',
          winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
          count: stats.total,
          avgPnlPercent: stats.total > 0 ? stats.totalPnl / stats.total : 0,
          bestPatterns: patternWinRates.slice(0, 3).map(p => p.pattern),
          worstPatterns: patternWinRates.slice(-3).reverse().map(p => p.pattern)
        };
      })
      .sort((a, b) => b.winRate - a.winRate);
    
    const volumePerformance = {
      highVolume: {
        winRate: volumeStats.high.total > 0 ? (volumeStats.high.wins / volumeStats.high.total) * 100 : 0,
        count: volumeStats.high.total,
        avgPnlPercent: volumeStats.high.total > 0 ? volumeStats.high.totalPnl / volumeStats.high.total : 0
      },
      lowVolume: {
        winRate: volumeStats.low.total > 0 ? (volumeStats.low.wins / volumeStats.low.total) * 100 : 0,
        count: volumeStats.low.total,
        avgPnlPercent: volumeStats.low.total > 0 ? volumeStats.low.totalPnl / volumeStats.low.total : 0
      }
    };
    
    const trendAlignmentPerformance = {
      aligned: {
        winRate: trendStats.aligned.total > 0 ? (trendStats.aligned.wins / trendStats.aligned.total) * 100 : 0,
        count: trendStats.aligned.total,
        avgPnlPercent: trendStats.aligned.total > 0 ? trendStats.aligned.totalPnl / trendStats.aligned.total : 0
      },
      counter: {
        winRate: trendStats.counter.total > 0 ? (trendStats.counter.wins / trendStats.counter.total) * 100 : 0,
        count: trendStats.counter.total,
        avgPnlPercent: trendStats.counter.total > 0 ? trendStats.counter.totalPnl / trendStats.counter.total : 0
      }
    };
    
    const scoreCorrelation = {
      ranges: [
        { min: 85, max: 100, ...(() => { const s = scoreRanges.get('85-100'); return s ? { winRate: (s.wins / s.total) * 100, count: s.total } : { winRate: 0, count: 0 }; })() },
        { min: 75, max: 84, ...(() => { const s = scoreRanges.get('75-84'); return s ? { winRate: (s.wins / s.total) * 100, count: s.total } : { winRate: 0, count: 0 }; })() },
        { min: 70, max: 74, ...(() => { const s = scoreRanges.get('70-74'); return s ? { winRate: (s.wins / s.total) * 100, count: s.total } : { winRate: 0, count: 0 }; })() }
      ].filter(r => r.count > 0)
    };
    
    const warningCorrelations = Array.from(warningStats.entries())
      .filter(([_, s]) => s.total >= 3)
      .map(([warning, stats]) => ({
        warning,
        occurrences: stats.total,
        winRate: (stats.wins / stats.total) * 100,
        avgPnlPercent: stats.totalPnl / stats.total
      }))
      .sort((a, b) => a.winRate - b.winRate);
    
    const avgHoldMinutes = {
      winners: holdTimeStats.winners.length > 0 ? holdTimeStats.winners.reduce((a, b) => a + b, 0) / holdTimeStats.winners.length : 0,
      losers: holdTimeStats.losers.length > 0 ? holdTimeStats.losers.reduce((a, b) => a + b, 0) / holdTimeStats.losers.length : 0
    };
    
    const slippageStats = {
      avgSlippagePercent: [...slippageData.market, ...slippageData.stop].length > 0 
        ? [...slippageData.market, ...slippageData.stop].reduce((a, b) => a + b, 0) / [...slippageData.market, ...slippageData.stop].length 
        : 0,
      maxSlippagePercent: Math.max(...[...slippageData.market, ...slippageData.stop], 0),
      slippageByOrderType: {
        market: slippageData.market.length > 0 ? slippageData.market.reduce((a, b) => a + b, 0) / slippageData.market.length : 0,
        stop: slippageData.stop.length > 0 ? slippageData.stop.reduce((a, b) => a + b, 0) / slippageData.stop.length : 0
      }
    };
    
    const symbolPerformance: any[] = [];
    for (const [symbol, stats] of symbolStats) {
      if (stats.totalTrades < 2) continue;
      
      const symPatterns = symbolPatternStats.get(symbol)!;
      let bestPattern: string | undefined;
      let worstPattern: string | undefined;
      let bestWinRate = -1;
      let worstWinRate = 101;
      
      for (const [pattern, pStats] of symPatterns) {
        if (pStats.total < 2) continue;
        const winRate = (pStats.wins / pStats.total) * 100;
        if (winRate > bestWinRate) {
          bestWinRate = winRate;
          bestPattern = pattern;
        }
        if (winRate < worstWinRate) {
          worstWinRate = winRate;
          worstPattern = pattern;
        }
      }
      
      let bestTimeOfDay: string | undefined;
      let worstTimeOfDay: string | undefined;
      let bestTodWinRate = -1;
      let worstTodWinRate = 101;
      for (const [period, todStats] of stats.byTimeOfDay) {
        if (todStats.total < 2) continue;
        const wr = (todStats.wins / todStats.total) * 100;
        if (wr > bestTodWinRate) { bestTodWinRate = wr; bestTimeOfDay = period; }
        if (wr < worstTodWinRate) { worstTodWinRate = wr; worstTimeOfDay = period; }
      }
      
      symbolPerformance.push({
        symbol,
        totalTrades: stats.totalTrades,
        wins: stats.wins,
        winRate: (stats.wins / stats.totalTrades) * 100,
        avgPnlPercent: stats.totalPnlPercent / stats.totalTrades,
        avgHoldMinutes: stats.totalTrades > 0 ? stats.totalHoldMinutes / stats.totalTrades : undefined,
        bestPattern: bestWinRate > 50 ? bestPattern : undefined,
        worstPattern: worstWinRate < 40 ? worstPattern : undefined,
        bestTimeOfDay: bestTodWinRate > 50 ? bestTimeOfDay : undefined,
        worstTimeOfDay: worstTodWinRate < 40 ? worstTimeOfDay : undefined
      });
    }
    
    symbolPerformance.sort((a, b) => b.winRate - a.winRate);
    
    const keyInsights: string[] = [];
    if (directionAccuracy < 50) {
      keyInsights.push(`Overall win rate is poor (${directionAccuracy.toFixed(1)}%) - be very selective`);
    } else {
      keyInsights.push(`Overall win rate is positive (${directionAccuracy.toFixed(1)}%)`);
    }
    
    if (volumePerformance.highVolume.count > 5 && volumePerformance.lowVolume.count > 5) {
      const volDiff = volumePerformance.highVolume.winRate - volumePerformance.lowVolume.winRate;
      if (volDiff > 10) keyInsights.push(`High volume trades win ${volDiff.toFixed(0)}% more often - prefer high volume`);
      else if (volDiff < -10) keyInsights.push(`Low volume trades actually perform better by ${(-volDiff).toFixed(0)}%`);
    }
    
    if (trendAlignmentPerformance.aligned.count > 5 && trendAlignmentPerformance.counter.count > 5) {
      const trendDiff = trendAlignmentPerformance.aligned.winRate - trendAlignmentPerformance.counter.winRate;
      if (trendDiff > 10) keyInsights.push(`Trend-aligned trades win ${trendDiff.toFixed(0)}% more - follow the trend`);
      else if (trendDiff < -10) keyInsights.push(`Counter-trend trades surprisingly better by ${(-trendDiff).toFixed(0)}%`);
    }
    
    if (timeOfDayPerformance.length > 0) {
      const best = timeOfDayPerformance[0];
      const worst = timeOfDayPerformance[timeOfDayPerformance.length - 1];
      if (best.winRate - worst.winRate > 15) {
        keyInsights.push(`Best time: ${best.period} (${best.winRate.toFixed(0)}%), Worst: ${worst.period} (${worst.winRate.toFixed(0)}%)`);
      }
    }
    
    if (patternClassPerformance.length > 0) {
      const bestClass = patternClassPerformance[0];
      keyInsights.push(`${bestClass.class.toUpperCase()} candle patterns perform best (${bestClass.winRate.toFixed(0)}% win rate)`);
    }
    
    if (avgHoldMinutes.winners > 0 && avgHoldMinutes.losers > 0) {
      keyInsights.push(`Winners held avg ${avgHoldMinutes.winners.toFixed(0)}min, losers ${avgHoldMinutes.losers.toFixed(0)}min`);
    }
    
    if (warningCorrelations.length > 0 && warningCorrelations[0].winRate < 35) {
      keyInsights.push(`Heed warnings! "${warningCorrelations[0].warning.slice(0, 30)}..." only ${warningCorrelations[0].winRate.toFixed(0)}% win rate`);
    }
    
    keyInsights.push(`Optimal stop: ${optimalStopPercent.toFixed(2)}%, target: ${optimalTargetPercent.toFixed(2)}%`);
    
    if (patternsToPrefer.length > 0) {
      keyInsights.push(`Best patterns: ${patternsToPrefer.slice(0, 3).join(', ')}`);
    }
    if (patternsToInvert.length > 0) {
      keyInsights.push(`Consider inverting: ${patternsToInvert.join(', ')}`);
    }
    
    const decisionPerformance = await analyzeDecisionPerformance();
    if (decisionPerformance) {
      if (decisionPerformance.invert.count > 0) {
        keyInsights.push(`Inverted trades: ${decisionPerformance.invert.winRate.toFixed(0)}% win rate (${decisionPerformance.invert.count} trades)`);
      }
      if (decisionPerformance.skip.count > 0) {
        keyInsights.push(`Skipped trades would have had ${decisionPerformance.skip.hypotheticalWinRate.toFixed(0)}% win rate - ${decisionPerformance.skip.hypotheticalWinRate < 30 ? 'good to skip!' : 'reconsider skipping'}`);
      }
    }
    
    const insights = {
      directionAccuracy,
      averageMfe: 0.43,
      averageMae: 0.58,
      optimalStopPercent,
      optimalTargetPercent,
      patternRankings,
      keyInsights,
      patternsToPrefer,
      patternsToAvoid,
      patternsToInvert,
      symbolPerformance,
      timeOfDayPerformance,
      patternClassPerformance,
      volumePerformance,
      trendAlignmentPerformance,
      slippageStats,
      warningCorrelations,
      scoreCorrelation,
      avgHoldMinutes,
      decisionPerformance,
      generatedAt: new Date().toISOString(),
      totalTradesAnalyzed: closedTrades.length,
      dataDateRange: earliestDate && latestDate ? {
        from: earliestDate.toISOString().split('T')[0],
        to: latestDate.toISOString().split('T')[0]
      } : undefined
    };
    
    clearTrainingInsightsCache();
    updateTrainingInsights(insights as any);
    
    console.log(`[TRAINING-SCHEDULER] ✅ Training insights updated successfully`);
    console.log(`[TRAINING-SCHEDULER]    Trades analyzed: ${closedTrades.length}`);
    console.log(`[TRAINING-SCHEDULER]    Win rate: ${directionAccuracy.toFixed(1)}%`);
    console.log(`[TRAINING-SCHEDULER]    Patterns to prefer: ${patternsToPrefer.length}`);
    console.log(`[TRAINING-SCHEDULER]    Patterns to avoid: ${patternsToAvoid.length}`);
    console.log(`[TRAINING-SCHEDULER]    Time periods analyzed: ${timeOfDayPerformance.length}`);
    console.log(`[TRAINING-SCHEDULER]    Warning correlations found: ${warningCorrelations.length}`);
    if (decisionPerformance) {
      console.log(`[TRAINING-SCHEDULER]    Decision logs analyzed: ${decisionPerformance.invert.count + decisionPerformance.skip.count + decisionPerformance.pass.count}`);
    }
    
  } catch (error) {
    console.error('[TRAINING-SCHEDULER] Error regenerating training insights:', error);
  }
}

function scheduleNextRun(): void {
  const nextRun = getNextRunTime();
  const msUntilNextRun = nextRun.getTime() - Date.now();
  
  const hours = Math.floor(msUntilNextRun / (1000 * 60 * 60));
  const minutes = Math.floor((msUntilNextRun % (1000 * 60 * 60)) / (1000 * 60));
  
  console.log(`[TRAINING-SCHEDULER] Next run scheduled for ${nextRun.toISOString()} (in ${hours}h ${minutes}m)`);
  
  if (schedulerInterval) {
    clearTimeout(schedulerInterval);
  }
  
  schedulerInterval = setTimeout(async () => {
    await regenerateTrainingInsights();
    scheduleNextRun();
  }, msUntilNextRun);
}

export function startTrainingScheduler(): void {
  console.log('[TRAINING-SCHEDULER] Starting daily training insights scheduler (21:10 UK time)...');
  scheduleNextRun();
}

export function stopTrainingScheduler(): void {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval);
    schedulerInterval = null;
    console.log('[TRAINING-SCHEDULER] Scheduler stopped');
  }
}

export async function runTrainingNow(): Promise<void> {
  await regenerateTrainingInsights();
}
