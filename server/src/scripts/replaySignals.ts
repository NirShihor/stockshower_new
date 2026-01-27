import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TrainingInsights {
  patternRankings: Array<{
    pattern: string;
    winRate: number;
    count: number;
    recommendation: string;
    byTrend?: {
      aligned: { winRate: number; count: number };
      counter: { winRate: number; count: number };
    };
  }>;
  timeOfDayPerformance?: Array<{
    period: string;
    winRate: number;
    count: number;
  }>;
  trendAlignmentPerformance?: {
    aligned: { winRate: number; count: number };
    counter: { winRate: number; count: number };
  };
  symbolPerformance?: Array<{
    symbol: string;
    winRate: number;
    totalTrades: number;
    worstTimeOfDay?: string;
  }>;
  patternsToAvoid?: string[];
}

interface ReplayResult {
  symbol: string;
  patternName: string;
  score: number;
  direction: string;
  trend: string;
  isTrendAligned: boolean;
  timeOfDay: string;
  signalTime: Date;
  actualStatus: string;
  actualPnl?: number;
  wouldHaveDecision: string;
  wouldHaveReason: string;
  potentialAction: 'execute' | 'invert' | 'skip';
}

function getTimeOfDay(date: Date): string {
  const hour = date.getUTCHours();
  if (hour >= 14 && hour < 16) return 'market_open';
  if (hour >= 16 && hour < 18) return 'midday';
  if (hour >= 18 && hour < 20) return 'afternoon';
  if (hour >= 20) return 'close';
  return 'premarket';
}

function isStrongTrend(signalData: any): { isStrong: boolean; direction: 'up' | 'down' | null } {
  const context = signalData.context;
  if (!context) return { isStrong: false, direction: null };
  
  if (context.isWideRange && context.isHighVolume) {
    return { isStrong: true, direction: context.trend === 'sideways' ? null : context.trend };
  }
  
  if (context.isHighVolume && context.volumeFactor > 2.0) {
    return { isStrong: true, direction: context.trend === 'sideways' ? null : context.trend };
  }
  
  return { isStrong: false, direction: null };
}

const sessionOpenPrices: Map<string, number> = new Map();

function getSessionTrendFromTrades(symbol: string, currentPrice: number, signalTime: Date): { isStrongSession: boolean; direction: 'up' | 'down' | null; movePercent: number } {
  const dateKey = `${symbol}-${signalTime.toISOString().split('T')[0]}`;
  
  if (!sessionOpenPrices.has(dateKey)) {
    sessionOpenPrices.set(dateKey, currentPrice);
    return { isStrongSession: false, direction: null, movePercent: 0 };
  }
  
  const openPrice = sessionOpenPrices.get(dateKey)!;
  const movePercent = ((currentPrice - openPrice) / openPrice) * 100;
  const threshold = 0.5;
  
  if (movePercent > threshold) {
    return { isStrongSession: true, direction: 'up', movePercent };
  } else if (movePercent < -threshold) {
    return { isStrongSession: true, direction: 'down', movePercent };
  }
  
  return { isStrongSession: false, direction: null, movePercent };
}

function simulateHardFilters(
  signalData: any,
  insights: TrainingInsights,
  signalTime: Date,
  currentPrice?: number
): { decision: string; reason: string; action: 'execute' | 'invert' | 'skip' } {
  const timeOfDay = getTimeOfDay(signalTime);
  const patternName = signalData.pattern?.name || 'Unknown';
  const trend = signalData.context?.trend || 'unknown';
  const direction = signalData.plan?.direction || 'unknown';
  const symbol = signalData.symbol || '';
  const isTrendAligned = (trend === 'up' && direction === 'long') || 
                         (trend === 'down' && direction === 'short');

  const patternPerf = insights.patternRankings.find(p => p.pattern === patternName);
  
  const strongTrend = isStrongTrend(signalData);
  const sessionTrend = currentPrice ? getSessionTrendFromTrades(symbol, currentPrice, signalTime) : null;

  if (patternPerf?.byTrend && isTrendAligned) {
    const alignedWinRate = patternPerf.byTrend.aligned.winRate;
    const alignedCount = patternPerf.byTrend.aligned.count;
    const counterWinRate = patternPerf.byTrend.counter.winRate;
    const counterCount = patternPerf.byTrend.counter.count;
    
    if (alignedWinRate < 20 && alignedCount >= 3) {
      const invertedDirection = direction === 'long' ? 'short' : 'long';
      
      if (sessionTrend?.isStrongSession && sessionTrend.direction) {
        const wouldFightSession = (sessionTrend.direction === 'down' && invertedDirection === 'long') ||
                                  (sessionTrend.direction === 'up' && invertedDirection === 'short');
        if (wouldFightSession) {
          return {
            decision: 'SKIP (session trend)',
            reason: `Would invert to ${invertedDirection} but session is ${sessionTrend.direction} (${sessionTrend.movePercent.toFixed(2)}% from open). Not fighting session trend.`,
            action: 'skip'
          };
        }
      }
      
      if (strongTrend.isStrong && strongTrend.direction) {
        const wouldFightTrend = (strongTrend.direction === 'down' && invertedDirection === 'long') ||
                                (strongTrend.direction === 'up' && invertedDirection === 'short');
        if (wouldFightTrend) {
          return {
            decision: 'SKIP (strong trend)',
            reason: `Would invert to ${invertedDirection} but strong ${strongTrend.direction} trend detected. Not fighting momentum.`,
            action: 'skip'
          };
        }
      }
      
      return {
        decision: 'AUTO-INVERT',
        reason: `${patternName} trend-aligned has ${alignedWinRate.toFixed(1)}% win rate (${alignedCount} trades), counter-trend has ${counterWinRate.toFixed(1)}% (${counterCount} trades)`,
        action: 'invert'
      };
    }
  }

  if (insights.trendAlignmentPerformance && isTrendAligned) {
    const alignedPerf = insights.trendAlignmentPerformance.aligned;
    const counterPerf = insights.trendAlignmentPerformance.counter;
    if (alignedPerf.winRate < 15 && alignedPerf.count >= 20 && counterPerf.winRate > 40) {
      const invertedDirection = direction === 'long' ? 'short' : 'long';
      
      if (sessionTrend?.isStrongSession && sessionTrend.direction) {
        const wouldFightSession = (sessionTrend.direction === 'down' && invertedDirection === 'long') ||
                                  (sessionTrend.direction === 'up' && invertedDirection === 'short');
        if (wouldFightSession) {
          return {
            decision: 'SKIP (session trend)',
            reason: `Would invert to ${invertedDirection} but session is ${sessionTrend.direction} (${sessionTrend.movePercent.toFixed(2)}% from open). Not fighting session trend.`,
            action: 'skip'
          };
        }
      }
      
      if (strongTrend.isStrong && strongTrend.direction) {
        const wouldFightTrend = (strongTrend.direction === 'down' && invertedDirection === 'long') ||
                                (strongTrend.direction === 'up' && invertedDirection === 'short');
        if (wouldFightTrend) {
          return {
            decision: 'SKIP (strong trend)',
            reason: `Would invert to ${invertedDirection} but strong ${strongTrend.direction} trend detected. Not fighting momentum.`,
            action: 'skip'
          };
        }
      }
      
      return {
        decision: 'AUTO-INVERT (overall)',
        reason: `Overall trend-aligned has ${alignedPerf.winRate.toFixed(1)}% win rate (${alignedPerf.count} trades), counter-trend has ${counterPerf.winRate.toFixed(1)}% (${counterPerf.count} trades)`,
        action: 'invert'
      };
    }
  }

  const timePerf = insights.timeOfDayPerformance?.find(t => t.period === timeOfDay);
  if (timePerf && timePerf.winRate < 15 && timePerf.count >= 10) {
    return {
      decision: 'BLOCK (time)',
      reason: `${timeOfDay} period has only ${timePerf.winRate.toFixed(1)}% win rate (${timePerf.count} trades)`,
      action: 'skip'
    };
  }

  if (insights.patternsToAvoid?.includes(patternName)) {
    return {
      decision: 'BLOCK (pattern)',
      reason: `${patternName} is on avoid list (${patternPerf?.winRate?.toFixed(1) || 0}% win rate)`,
      action: 'skip'
    };
  }

  if (patternPerf?.recommendation === 'avoid' || (patternPerf && patternPerf.winRate < 25 && patternPerf.count >= 3)) {
    if (!isTrendAligned) {
      return {
        decision: 'BLOCK (low win rate)',
        reason: `${patternName} has ${patternPerf.winRate?.toFixed(1) || 0}% win rate (${patternPerf.count} trades, counter-trend)`,
        action: 'skip'
      };
    }
  }

  const symbolPerf = insights.symbolPerformance?.find(s => s.symbol === signalData.symbol);
  if (symbolPerf && symbolPerf.winRate === 0 && symbolPerf.totalTrades >= 3) {
    return {
      decision: 'BLOCK (symbol)',
      reason: `${signalData.symbol} has 0% win rate over ${symbolPerf.totalTrades} trades`,
      action: 'skip'
    };
  }

  if (symbolPerf?.worstTimeOfDay === timeOfDay && symbolPerf.totalTrades >= 3) {
    const timeWinRate = insights.timeOfDayPerformance?.find(t => t.period === timeOfDay)?.winRate;
    if (timeWinRate && timeWinRate < 20) {
      return {
        decision: 'BLOCK (symbol+time)',
        reason: `${signalData.symbol} performs worst during ${timeOfDay}`,
        action: 'skip'
      };
    }
  }

  return {
    decision: 'PASS TO AI',
    reason: 'No hard filter triggered - would be sent to Claude for final decision',
    action: 'execute'
  };
}

async function replaySignals(dateStr?: string): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  console.log('Connected to MongoDB\n');

  const insightsPath = path.join(__dirname, '../../training_insights.json');
  const insights: TrainingInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
  console.log(`Loaded training insights (${insights.patternRankings.length} patterns)\n`);

  let dateFilter: any = {};
  if (dateStr) {
    const startDate = new Date(dateStr);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(dateStr);
    endDate.setUTCHours(23, 59, 59, 999);
    dateFilter = { signalTime: { $gte: startDate, $lte: endDate } };
    console.log(`Filtering signals from ${startDate.toISOString()} to ${endDate.toISOString()}\n`);
  }

  const trades = await Trade.find({
    ...dateFilter,
    signalData: { $exists: true },
    patternScore: { $gte: 70 }
  }).sort({ signalTime: -1 });

  console.log(`Found ${trades.length} trades with score >= 70\n`);
  console.log('='.repeat(120));

  const results: ReplayResult[] = [];
  const summary = {
    total: 0,
    wouldInvert: 0,
    wouldBlock: 0,
    wouldPass: 0,
    actualExecuted: 0,
    actualWins: 0,
    actualLosses: 0,
    actualTotalPnl: 0,
    pnlFromInverted: 0,
    pnlFromSkipped: 0,
    pnlFromPassed: 0,
    skippedByStrongTrend: 0,
    pnlAvoidedByStrongTrend: 0,
    skippedBySessionTrend: 0,
    pnlAvoidedBySessionTrend: 0
  };

  for (const trade of trades) {
    const signalData = trade.signalData;
    if (!signalData) continue;

    const trend = signalData.context?.trend || 'unknown';
    const direction = signalData.plan?.direction || trade.direction;
    const isTrendAligned = (trend === 'up' && direction === 'long') || 
                           (trend === 'down' && direction === 'short');
    const timeOfDay = getTimeOfDay(trade.signalTime);

    const currentPrice = signalData.currentPrice || trade.entryPrice;
    signalData.symbol = trade.symbol;
    const filterResult = simulateHardFilters(signalData, insights, trade.signalTime, currentPrice);

    const result: ReplayResult = {
      symbol: trade.symbol,
      patternName: trade.patternName,
      score: trade.patternScore,
      direction,
      trend,
      isTrendAligned,
      timeOfDay,
      signalTime: trade.signalTime,
      actualStatus: trade.status,
      actualPnl: trade.pnlPercentage,
      wouldHaveDecision: filterResult.decision,
      wouldHaveReason: filterResult.reason,
      potentialAction: filterResult.action
    };

    results.push(result);
    summary.total++;

    const pnl = trade.pnlPercentage || 0;
    
    if (filterResult.action === 'invert') {
      summary.wouldInvert++;
      summary.pnlFromInverted += pnl;
    } else if (filterResult.action === 'skip') {
      summary.wouldBlock++;
      summary.pnlFromSkipped += pnl;
      if (filterResult.decision === 'SKIP (strong trend)') {
        summary.skippedByStrongTrend++;
        summary.pnlAvoidedByStrongTrend += pnl;
      }
      if (filterResult.decision === 'SKIP (session trend)') {
        summary.skippedBySessionTrend++;
        summary.pnlAvoidedBySessionTrend += pnl;
      }
    } else {
      summary.wouldPass++;
      summary.pnlFromPassed += pnl;
    }

    if (['filled', 'closed'].includes(trade.status)) {
      summary.actualExecuted++;
      summary.actualTotalPnl += pnl;
      if (trade.pnlPercentage && trade.pnlPercentage > 0) summary.actualWins++;
      else if (trade.pnlPercentage && trade.pnlPercentage < 0) summary.actualLosses++;
    }

    const statusIcon = filterResult.action === 'invert' ? '🔄' : 
                       filterResult.action === 'skip' ? '❌' : '✅';
    const alignedIcon = isTrendAligned ? '📈' : '📉';
    const pnlStr = trade.pnlPercentage ? `${trade.pnlPercentage > 0 ? '+' : ''}${trade.pnlPercentage.toFixed(2)}%` : 'N/A';

    console.log(`${statusIcon} ${trade.symbol.padEnd(6)} | ${trade.patternName.padEnd(25)} | Score: ${trade.patternScore} | ${direction.padEnd(5)} | Trend: ${trend.padEnd(8)} ${alignedIcon} | Time: ${timeOfDay.padEnd(12)} | Status: ${trade.status.padEnd(10)} | P&L: ${pnlStr.padEnd(8)}`);
    console.log(`   └─ ${filterResult.decision}: ${filterResult.reason}`);
    console.log('-'.repeat(120));
  }

  console.log('\n' + '='.repeat(120));
  console.log('SUMMARY');
  console.log('='.repeat(120));
  console.log(`Total signals analyzed: ${summary.total}`);
  console.log(`Would INVERT: ${summary.wouldInvert} (${((summary.wouldInvert/summary.total)*100).toFixed(1)}%)`);
  console.log(`Would BLOCK:  ${summary.wouldBlock} (${((summary.wouldBlock/summary.total)*100).toFixed(1)}%)`);
  console.log(`Would PASS:   ${summary.wouldPass} (${((summary.wouldPass/summary.total)*100).toFixed(1)}%)`);
  console.log('');
  console.log(`Actually executed: ${summary.actualExecuted}`);
  console.log(`Actual wins: ${summary.actualWins}, losses: ${summary.actualLosses}`);
  
  console.log('\n' + '='.repeat(120));
  console.log('💰 BOTTOM LINE - P&L ANALYSIS');
  console.log('='.repeat(120));
  console.log(`ACTUAL TOTAL P&L:        ${summary.actualTotalPnl >= 0 ? '+' : ''}${summary.actualTotalPnl.toFixed(2)}%`);
  console.log('');
  console.log(`P&L from INVERTED trades: ${summary.pnlFromInverted >= 0 ? '+' : ''}${summary.pnlFromInverted.toFixed(2)}% (${summary.wouldInvert} trades)`);
  console.log(`P&L from SKIPPED trades:  ${summary.pnlFromSkipped >= 0 ? '+' : ''}${summary.pnlFromSkipped.toFixed(2)}% (${summary.wouldBlock} trades) ← would be avoided`);
  console.log(`P&L from PASSED trades:   ${summary.pnlFromPassed >= 0 ? '+' : ''}${summary.pnlFromPassed.toFixed(2)}% (${summary.wouldPass} trades)`);
  console.log('');
  
  if (summary.skippedBySessionTrend > 0 || summary.skippedByStrongTrend > 0) {
    console.log('🎯 TREND FILTER IMPACT:');
    if (summary.skippedBySessionTrend > 0) {
      console.log(`   SESSION TREND filter: ${summary.skippedBySessionTrend} trades skipped, P&L avoided: ${summary.pnlAvoidedBySessionTrend >= 0 ? '+' : ''}${summary.pnlAvoidedBySessionTrend.toFixed(2)}%`);
    }
    if (summary.skippedByStrongTrend > 0) {
      console.log(`   STRONG TREND filter: ${summary.skippedByStrongTrend} trades skipped, P&L avoided: ${summary.pnlAvoidedByStrongTrend >= 0 ? '+' : ''}${summary.pnlAvoidedByStrongTrend.toFixed(2)}%`);
    }
    const totalAvoided = summary.pnlAvoidedBySessionTrend + summary.pnlAvoidedByStrongTrend;
    console.log(`   TOTAL P&L AVOIDED: ${totalAvoided >= 0 ? '+' : ''}${totalAvoided.toFixed(2)}%`);
    console.log('');
  }
  
  const hypotheticalPnl = summary.pnlFromInverted + summary.pnlFromPassed;
  console.log('📊 COMPARISON:');
  console.log(`   Actual P&L (what happened):     ${summary.actualTotalPnl >= 0 ? '+' : ''}${summary.actualTotalPnl.toFixed(2)}%`);
  console.log(`   Hypothetical P&L (with filter): ${hypotheticalPnl >= 0 ? '+' : ''}${hypotheticalPnl.toFixed(2)}%`);
  console.log(`   DIFFERENCE:                     ${(hypotheticalPnl - summary.actualTotalPnl) >= 0 ? '+' : ''}${(hypotheticalPnl - summary.actualTotalPnl).toFixed(2)}%`);
  
  if (summary.wouldInvert > 0) {
    console.log('\n' + '='.repeat(120));
    console.log('INVERSION ANALYSIS');
    console.log('='.repeat(120));
    const invertedTrades = results.filter(r => r.potentialAction === 'invert');
    for (const t of invertedTrades) {
      const invertedDir = t.direction === 'long' ? 'SHORT' : 'LONG';
      console.log(`${t.symbol} ${t.patternName}: Would invert from ${t.direction.toUpperCase()} to ${invertedDir}`);
      console.log(`   Reason: ${t.wouldHaveReason}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

const dateArg = process.argv[2];
replaySignals(dateArg).catch(console.error);
