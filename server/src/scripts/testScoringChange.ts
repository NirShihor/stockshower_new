import mongoose from 'mongoose';
import { Trade } from '../db/models/Trade.js';
import dotenv from 'dotenv';

dotenv.config();

interface ScoreComparison {
  symbol: string;
  pattern: string;
  direction: string;
  trend: string;
  isTrendAligned: boolean;
  oldScore: number;
  newScore: number;
  scoreDiff: number;
  actualPnl: number | null;
  wasWin: boolean;
}

function calculateNewScore(trade: any): { oldScore: number; newScore: number } {
  const signalData = trade.signalData;
  if (!signalData) return { oldScore: trade.patternScore || 0, newScore: trade.patternScore || 0 };

  const pattern = signalData.pattern;
  const context = signalData.context;
  if (!pattern || !context) return { oldScore: trade.patternScore || 0, newScore: trade.patternScore || 0 };

  const direction = pattern.direction;
  const trend = context.trend;

  const isTrendAligned = (direction === 'bullish' && trend === 'up') ||
                         (direction === 'bearish' && trend === 'down');
  
  const isCounterTrend = (direction === 'bullish' && trend === 'down') ||
                         (direction === 'bearish' && trend === 'up');

  let oldScore = trade.patternScore || 0;
  let newScore = oldScore;

  if (isTrendAligned) {
    const oldBonus = trend === 'sideways' ? 8 : 15;
    newScore = newScore - oldBonus - 10;
  }
  
  if (isCounterTrend) {
    newScore = newScore + 15;
  }

  newScore = Math.min(100, Math.max(0, newScore));

  return { oldScore, newScore };
}

async function testScoringChange(): Promise<void> {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockshower');
  console.log('Connected to MongoDB\n');

  const trades = await Trade.find({
    signalData: { $exists: true },
    status: { $in: ['filled', 'closed'] },
    pnlPercentage: { $exists: true, $ne: null }
  }).sort({ signalTime: -1 });

  console.log(`Analyzing ${trades.length} completed trades\n`);
  console.log('='.repeat(140));

  const results: ScoreComparison[] = [];
  
  const summary = {
    trendAligned: { count: 0, wins: 0, losses: 0, oldAvgScore: 0, newAvgScore: 0 },
    counterTrend: { count: 0, wins: 0, losses: 0, oldAvgScore: 0, newAvgScore: 0 },
    neutral: { count: 0, wins: 0, losses: 0, oldAvgScore: 0, newAvgScore: 0 }
  };

  const thresholdAnalysis = {
    old70: { trades: 0, wins: 0, pnl: 0 },
    new70: { trades: 0, wins: 0, pnl: 0 },
    old55: { trades: 0, wins: 0, pnl: 0 },
    new55: { trades: 0, wins: 0, pnl: 0 }
  };

  for (const trade of trades) {
    const signalData = trade.signalData;
    if (!signalData?.pattern || !signalData?.context) continue;

    const { oldScore, newScore } = calculateNewScore(trade);
    const direction = signalData.pattern.direction;
    const trend = signalData.context.trend;
    
    const isTrendAligned = (direction === 'bullish' && trend === 'up') ||
                           (direction === 'bearish' && trend === 'down');
    const isCounterTrend = (direction === 'bullish' && trend === 'down') ||
                           (direction === 'bearish' && trend === 'up');

    const pnl = trade.pnlPercentage || 0;
    const wasWin = pnl > 0;

    const result: ScoreComparison = {
      symbol: trade.symbol,
      pattern: trade.patternName,
      direction,
      trend,
      isTrendAligned,
      oldScore,
      newScore,
      scoreDiff: newScore - oldScore,
      actualPnl: pnl,
      wasWin
    };
    results.push(result);

    if (isTrendAligned) {
      summary.trendAligned.count++;
      summary.trendAligned.oldAvgScore += oldScore;
      summary.trendAligned.newAvgScore += newScore;
      if (wasWin) summary.trendAligned.wins++;
      else summary.trendAligned.losses++;
    } else if (isCounterTrend) {
      summary.counterTrend.count++;
      summary.counterTrend.oldAvgScore += oldScore;
      summary.counterTrend.newAvgScore += newScore;
      if (wasWin) summary.counterTrend.wins++;
      else summary.counterTrend.losses++;
    } else {
      summary.neutral.count++;
      summary.neutral.oldAvgScore += oldScore;
      summary.neutral.newAvgScore += newScore;
      if (wasWin) summary.neutral.wins++;
      else summary.neutral.losses++;
    }

    if (oldScore >= 70) {
      thresholdAnalysis.old70.trades++;
      thresholdAnalysis.old70.pnl += pnl;
      if (wasWin) thresholdAnalysis.old70.wins++;
    }
    if (newScore >= 70) {
      thresholdAnalysis.new70.trades++;
      thresholdAnalysis.new70.pnl += pnl;
      if (wasWin) thresholdAnalysis.new70.wins++;
    }
    if (oldScore >= 55) {
      thresholdAnalysis.old55.trades++;
      thresholdAnalysis.old55.pnl += pnl;
      if (wasWin) thresholdAnalysis.old55.wins++;
    }
    if (newScore >= 55) {
      thresholdAnalysis.new55.trades++;
      thresholdAnalysis.new55.pnl += pnl;
      if (wasWin) thresholdAnalysis.new55.wins++;
    }

    const winIcon = wasWin ? '✅' : '❌';
    const alignIcon = isTrendAligned ? '📈ALIGNED' : isCounterTrend ? '📉COUNTER' : '➡️NEUTRAL';
    const diffStr = result.scoreDiff >= 0 ? `+${result.scoreDiff}` : `${result.scoreDiff}`;
    
    console.log(`${winIcon} ${trade.symbol.padEnd(6)} | ${trade.patternName.padEnd(28)} | ${alignIcon.padEnd(10)} | Old: ${oldScore.toString().padStart(2)} → New: ${newScore.toString().padStart(2)} (${diffStr.padStart(3)}) | P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`);
  }

  if (summary.trendAligned.count > 0) {
    summary.trendAligned.oldAvgScore /= summary.trendAligned.count;
    summary.trendAligned.newAvgScore /= summary.trendAligned.count;
  }
  if (summary.counterTrend.count > 0) {
    summary.counterTrend.oldAvgScore /= summary.counterTrend.count;
    summary.counterTrend.newAvgScore /= summary.counterTrend.count;
  }
  if (summary.neutral.count > 0) {
    summary.neutral.oldAvgScore /= summary.neutral.count;
    summary.neutral.newAvgScore /= summary.neutral.count;
  }

  console.log('\n' + '='.repeat(140));
  console.log('SCORE CHANGE IMPACT BY TREND ALIGNMENT');
  console.log('='.repeat(140));
  
  console.log('\n📈 TREND-ALIGNED (historically 6.7% win rate):');
  console.log(`   Count: ${summary.trendAligned.count} | Wins: ${summary.trendAligned.wins} | Losses: ${summary.trendAligned.losses}`);
  console.log(`   Win Rate: ${((summary.trendAligned.wins / summary.trendAligned.count) * 100).toFixed(1)}%`);
  console.log(`   Old Avg Score: ${summary.trendAligned.oldAvgScore.toFixed(1)} → New Avg Score: ${summary.trendAligned.newAvgScore.toFixed(1)}`);
  console.log(`   Score Change: ${(summary.trendAligned.newAvgScore - summary.trendAligned.oldAvgScore).toFixed(1)} points`);

  console.log('\n📉 COUNTER-TREND (historically 35.7% win rate):');
  console.log(`   Count: ${summary.counterTrend.count} | Wins: ${summary.counterTrend.wins} | Losses: ${summary.counterTrend.losses}`);
  console.log(`   Win Rate: ${((summary.counterTrend.wins / summary.counterTrend.count) * 100).toFixed(1)}%`);
  console.log(`   Old Avg Score: ${summary.counterTrend.oldAvgScore.toFixed(1)} → New Avg Score: ${summary.counterTrend.newAvgScore.toFixed(1)}`);
  console.log(`   Score Change: ${(summary.counterTrend.newAvgScore - summary.counterTrend.oldAvgScore).toFixed(1)} points`);

  console.log('\n➡️ NEUTRAL (sideways):');
  console.log(`   Count: ${summary.neutral.count} | Wins: ${summary.neutral.wins} | Losses: ${summary.neutral.losses}`);
  if (summary.neutral.count > 0) {
    console.log(`   Win Rate: ${((summary.neutral.wins / summary.neutral.count) * 100).toFixed(1)}%`);
    console.log(`   Old Avg Score: ${summary.neutral.oldAvgScore.toFixed(1)} → New Avg Score: ${summary.neutral.newAvgScore.toFixed(1)}`);
  }

  console.log('\n' + '='.repeat(140));
  console.log('THRESHOLD ANALYSIS - Which trades would qualify?');
  console.log('='.repeat(140));

  console.log('\n🎯 SCORE >= 70 THRESHOLD:');
  console.log(`   OLD scoring: ${thresholdAnalysis.old70.trades} trades | Win Rate: ${((thresholdAnalysis.old70.wins / thresholdAnalysis.old70.trades) * 100).toFixed(1)}% | Total P&L: ${thresholdAnalysis.old70.pnl >= 0 ? '+' : ''}${thresholdAnalysis.old70.pnl.toFixed(2)}%`);
  console.log(`   NEW scoring: ${thresholdAnalysis.new70.trades} trades | Win Rate: ${((thresholdAnalysis.new70.wins / thresholdAnalysis.new70.trades) * 100).toFixed(1)}% | Total P&L: ${thresholdAnalysis.new70.pnl >= 0 ? '+' : ''}${thresholdAnalysis.new70.pnl.toFixed(2)}%`);

  console.log('\n🎯 SCORE >= 55 THRESHOLD:');
  console.log(`   OLD scoring: ${thresholdAnalysis.old55.trades} trades | Win Rate: ${((thresholdAnalysis.old55.wins / thresholdAnalysis.old55.trades) * 100).toFixed(1)}% | Total P&L: ${thresholdAnalysis.old55.pnl >= 0 ? '+' : ''}${thresholdAnalysis.old55.pnl.toFixed(2)}%`);
  console.log(`   NEW scoring: ${thresholdAnalysis.new55.trades} trades | Win Rate: ${((thresholdAnalysis.new55.wins / thresholdAnalysis.new55.trades) * 100).toFixed(1)}% | Total P&L: ${thresholdAnalysis.new55.pnl >= 0 ? '+' : ''}${thresholdAnalysis.new55.pnl.toFixed(2)}%`);

  console.log('\n' + '='.repeat(140));
  console.log('KEY INSIGHT');
  console.log('='.repeat(140));
  console.log('The new scoring should:');
  console.log('  - LOWER scores for trend-aligned trades (which have 6.7% win rate)');
  console.log('  - RAISE scores for counter-trend trades (which have 35.7% win rate)');
  console.log('  - Result in more counter-trend trades qualifying at 70+ threshold');
  console.log('  - Result in fewer trend-aligned trades qualifying');

  await mongoose.disconnect();
  console.log('\nDone.');
}

testScoringChange().catch(console.error);
