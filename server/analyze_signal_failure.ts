import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function analyzeSignalFailure() {
  try {
    await connectDatabase();
    console.log('🔍 === ANALYZING WHY SIGNALS CONSISTENTLY FAIL ===\n');

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // 60 days

    console.log('📅 ANALYSIS PERIOD:');
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log('');

    // Fetch all trades with signal data
    const trades = await Trade.find({
      signalTime: {
        $gte: startDate,
        $lte: endDate
      },
      signalData: { $exists: true },
      exitPrice: { $exists: true }, // Only closed trades
      pnlAmount: { $exists: true }
    }).sort({ signalTime: 1 });

    console.log(`📊 Found ${trades.length} completed trades with signal data\n`);

    if (trades.length === 0) {
      console.log('❌ No completed trades found - cannot analyze');
      return;
    }

    // Group by pattern and analyze
    const patternStats = new Map();
    const scoreRangeStats = new Map();
    const directionStats = { long: { wins: 0, losses: 0, totalPnL: 0 }, short: { wins: 0, losses: 0, totalPnL: 0 } };

    trades.forEach(trade => {
      const signal = trade.signalData;
      if (!signal) return;

      const pattern = signal.pattern?.name || 'Unknown';
      const score = signal.score || 0;
      const direction = trade.direction;
      const pnl = trade.pnlAmount || 0;
      const isWin = pnl > 0;

      // Pattern analysis
      if (!patternStats.has(pattern)) {
        patternStats.set(pattern, {
          count: 0,
          wins: 0,
          totalPnL: 0,
          avgScore: 0,
          scores: []
        });
      }
      const pStats = patternStats.get(pattern);
      pStats.count++;
      pStats.scores.push(score);
      pStats.avgScore = pStats.scores.reduce((sum, s) => sum + s, 0) / pStats.scores.length;
      pStats.totalPnL += pnl;
      if (isWin) pStats.wins++;

      // Score range analysis
      const scoreRange = Math.floor(score / 10) * 10; // 0-9, 10-19, etc.
      const rangeKey = `${scoreRange}-${scoreRange + 9}`;
      if (!scoreRangeStats.has(rangeKey)) {
        scoreRangeStats.set(rangeKey, { count: 0, wins: 0, totalPnL: 0 });
      }
      const sStats = scoreRangeStats.get(rangeKey);
      sStats.count++;
      sStats.totalPnL += pnl;
      if (isWin) sStats.wins++;

      // Direction analysis
      directionStats[direction].count = (directionStats[direction].count || 0) + 1;
      directionStats[direction].totalPnL += pnl;
      if (isWin) directionStats[direction].wins++;
      else directionStats[direction].losses++;
    });

    console.log('🔴 === PATTERN FAILURE ANALYSIS ===\n');
    console.log('Patterns ranked by win rate (worst first):');
    
    const sortedPatterns = Array.from(patternStats.entries())
      .filter(([_, stats]) => stats.count >= 3) // Only patterns with meaningful sample size
      .sort(([_,a], [__,b]) => (a.wins/a.count) - (b.wins/b.count));

    sortedPatterns.forEach(([pattern, stats]) => {
      const winRate = ((stats.wins / stats.count) * 100).toFixed(1);
      const avgPnL = (stats.totalPnL / stats.count).toFixed(2);
      console.log(`${pattern.padEnd(25)} | ${stats.count.toString().padStart(3)} trades | ${winRate.padStart(5)}% wins | £${avgPnL.padStart(7)} avg | Score: ${stats.avgScore.toFixed(0)}`);
    });

    console.log('\n📉 === SCORE RANGE ANALYSIS ===\n');
    console.log('Higher scores should perform better, but do they?');
    
    const sortedScores = Array.from(scoreRangeStats.entries())
      .filter(([_, stats]) => stats.count >= 3)
      .sort(([a,_], [b,__]) => parseInt(a.split('-')[0]) - parseInt(b.split('-')[0]));

    sortedScores.forEach(([range, stats]) => {
      const winRate = ((stats.wins / stats.count) * 100).toFixed(1);
      const avgPnL = (stats.totalPnL / stats.count).toFixed(2);
      console.log(`Score ${range.padEnd(8)} | ${stats.count.toString().padStart(3)} trades | ${winRate.padStart(5)}% wins | £${avgPnL.padStart(7)} avg`);
    });

    console.log('\n📊 === DIRECTION BIAS ANALYSIS ===\n');
    ['long', 'short'].forEach(dir => {
      const stats = directionStats[dir];
      const total = stats.wins + stats.losses;
      if (total > 0) {
        const winRate = ((stats.wins / total) * 100).toFixed(1);
        const avgPnL = (stats.totalPnL / total).toFixed(2);
        console.log(`${dir.toUpperCase().padEnd(6)} | ${total.toString().padStart(3)} trades | ${winRate.padStart(5)}% wins | £${avgPnL.padStart(7)} avg`);
      }
    });

    // Critical insights
    console.log('\n🚨 === CRITICAL INSIGHTS ===\n');

    // Check if higher scores actually perform worse
    const highScoreTrades = trades.filter(t => t.signalData?.score >= 80);
    const lowScoreTrades = trades.filter(t => t.signalData?.score >= 60 && t.signalData?.score < 80);

    if (highScoreTrades.length > 0 && lowScoreTrades.length > 0) {
      const highScoreWinRate = (highScoreTrades.filter(t => t.pnlAmount > 0).length / highScoreTrades.length * 100);
      const lowScoreWinRate = (lowScoreTrades.filter(t => t.pnlAmount > 0).length / lowScoreTrades.length * 100);
      
      console.log(`High Score (80+): ${highScoreWinRate.toFixed(1)}% win rate (${highScoreTrades.length} trades)`);
      console.log(`Low Score (60-79): ${lowScoreWinRate.toFixed(1)}% win rate (${lowScoreTrades.length} trades)`);
      
      if (highScoreWinRate < lowScoreWinRate) {
        console.log('🔥 INVERSE RELATIONSHIP: Higher scores perform WORSE!');
        console.log('   This suggests our scoring system is fundamentally backwards');
      }
    }

    // Check for systematic timing issues
    const avgEntryDelay = trades
      .filter(t => t.signalTime && t.orderPlacedTime)
      .map(t => (new Date(t.orderPlacedTime).getTime() - new Date(t.signalTime).getTime()) / (1000 * 60))
      .reduce((sum, delay) => sum + delay, 0) / trades.length;

    if (avgEntryDelay > 30) {
      console.log(`⏰ TIMING ISSUE: Average ${avgEntryDelay.toFixed(1)} minute delay from signal to order`);
      console.log('   We may be entering after optimal timing');
    }

    // Overall market direction bias
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => t.pnlAmount > 0).length;
    const overallWinRate = (winningTrades / totalTrades * 100);

    console.log(`\n📈 OVERALL PERFORMANCE:`);
    console.log(`Win Rate: ${overallWinRate.toFixed(1)}% (${winningTrades}/${totalTrades})`);
    console.log(`Total P&L: £${totalPnL.toFixed(2)}`);
    console.log(`Average Trade: £${(totalPnL / totalTrades).toFixed(2)}`);

    if (overallWinRate < 15) {
      console.log('\n🔥 SYSTEMATIC FAILURE DETECTED:');
      console.log('   Win rate far below random (50%)');
      console.log('   Strategy may be fundamentally contrarian to market');
      console.log('\n💡 IMMEDIATE ACTIONS NEEDED:');
      console.log('   1. Test INVERSE strategy (fade signals)');
      console.log('   2. Examine pattern detection accuracy');
      console.log('   3. Check if we\'re entering at exact wrong moments');
      console.log('   4. Validate signal timing vs market movements');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Signal failure analysis failed:', error);
    process.exit(1);
  }
}

analyzeSignalFailure();