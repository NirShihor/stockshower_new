import { connectDatabase } from './src/db/connection.js';
import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';

async function runExtendedBacktest() {
  try {
    await connectDatabase();
    console.log('🚀 === EXTENDED BACKTESTING VALIDATION ===\n');

    // 6-month extended backtest period
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (6 * 30 * 24 * 60 * 60 * 1000)); // 6 months ago

    console.log('📅 EXTENDED TEST PERIOD:');
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log(`Duration: ~6 months`);
    console.log('');

    console.log('⚙️ STRATEGY CONFIGURATION:');
    console.log('✅ Stop losses: 3.5% minimum (vs 0.52% original)');
    console.log('✅ Pattern thresholds: Relaxed by 40%');
    console.log('✅ Counter-trend penalties: Removed');
    console.log('✅ Trap detection: Reduced penalties');
    console.log('✅ Entry timing: Pattern levels (vs breakouts)');
    console.log('✅ Filters: All patterns allowed, no score caps');
    console.log('✅ Loss limits: Increased to 20 consecutive');
    console.log('');

    const backtest = new DatabaseBacktestEngine({
      startDate: startDate,
      endDate: endDate,
      scoreThreshold: 60,                  // Lower threshold
      maxConcurrentPositions: 5,           // More positions for extended period
      positionSizeGBP: 100,               // £100 per trade
      initialBalance: 10000,               // £10,000 starting
      enableAutoExecution: false,
      autoExecutionThreshold: 60,
      enableTrapFades: false,
      slippageModel: 'fixed',
      commissionPerTrade: 1.0,            // Realistic commission
      useProfitableFiltering: true
    });

    console.log('🔍 RUNNING EXTENDED BACKTEST...');
    console.log('⏱️  This may take a few minutes due to larger dataset...');
    console.log('');

    const startTime = Date.now();
    const results = await backtest.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Backtest completed in ${duration} seconds\n`);

    // Enhanced results analysis
    console.log('📊 === COMPREHENSIVE RESULTS ANALYSIS ===\n');

    if (!results.trades || results.trades.length === 0) {
      console.log('❌ No trades executed in 6-month period');
      console.log('   This suggests filters are still too restrictive');
      process.exit(1);
    }

    // Basic stats
    const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = results.trades.filter(t => t.pnl && t.pnl < 0);
    const breakEvenTrades = results.trades.filter(t => t.pnl === 0);

    const totalTrades = results.trades.length;
    const winRate = (winningTrades.length / totalTrades) * 100;
    
    // Calculate actual total P&L (fixing the bug)
    const actualTotalPnL = results.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const avgTrade = actualTotalPnL / totalTrades;

    console.log('🎯 PERFORMANCE METRICS:');
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (${winningTrades.length} wins, ${losingTrades.length} losses, ${breakEvenTrades.length} breakeven)`);
    console.log(`Total P&L: £${actualTotalPnL.toFixed(2)}`);
    console.log(`Average Trade: £${avgTrade.toFixed(2)}`);
    console.log(`ROI: ${((actualTotalPnL / 10000) * 100).toFixed(1)}%`);
    console.log('');

    // Advanced metrics
    if (winningTrades.length > 0 && losingTrades.length > 0) {
      const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl!, 0) / winningTrades.length;
      const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0) / losingTrades.length);
      const profitFactor = (avgWin * winningTrades.length) / (avgLoss * losingTrades.length);
      const largestWin = Math.max(...winningTrades.map(t => t.pnl!));
      const largestLoss = Math.min(...losingTrades.map(t => t.pnl!));
      
      console.log('📈 RISK/REWARD ANALYSIS:');
      console.log(`Average Win: £${avgWin.toFixed(2)}`);
      console.log(`Average Loss: £${avgLoss.toFixed(2)}`);
      console.log(`Win/Loss Ratio: ${(avgWin/avgLoss).toFixed(2)}:1`);
      console.log(`Profit Factor: ${profitFactor.toFixed(2)}`);
      console.log(`Largest Win: £${largestWin.toFixed(2)}`);
      console.log(`Largest Loss: £${largestLoss.toFixed(2)}`);
      console.log('');
    }

    // Pattern performance analysis
    const patternPerformance = new Map<string, {count: number, wins: number, totalPnL: number}>();
    
    for (const trade of results.trades) {
      const pattern = trade.signal?.pattern?.name || 'Unknown';
      if (!patternPerformance.has(pattern)) {
        patternPerformance.set(pattern, {count: 0, wins: 0, totalPnL: 0});
      }
      const stats = patternPerformance.get(pattern)!;
      stats.count++;
      stats.totalPnL += trade.pnl || 0;
      if (trade.pnl && trade.pnl > 0) stats.wins++;
    }

    console.log('🎨 TOP PERFORMING PATTERNS:');
    const sortedPatterns = Array.from(patternPerformance.entries())
      .filter(([_, stats]) => stats.count >= 3) // At least 3 trades
      .sort((a, b) => (b[1].wins / b[1].count) - (a[1].wins / a[1].count))
      .slice(0, 10);

    sortedPatterns.forEach(([pattern, stats]) => {
      const patternWinRate = (stats.wins / stats.count) * 100;
      const avgPnL = stats.totalPnL / stats.count;
      console.log(`${pattern}: ${patternWinRate.toFixed(1)}% (${stats.wins}/${stats.count}) | Avg: £${avgPnL.toFixed(2)}`);
    });
    console.log('');

    // Monthly breakdown
    const monthlyStats = new Map<string, {trades: number, pnl: number, wins: number}>();
    
    for (const trade of results.trades) {
      if (trade.entryTime) {
        const month = trade.entryTime.toISOString().substring(0, 7); // YYYY-MM
        if (!monthlyStats.has(month)) {
          monthlyStats.set(month, {trades: 0, pnl: 0, wins: 0});
        }
        const stats = monthlyStats.get(month)!;
        stats.trades++;
        stats.pnl += trade.pnl || 0;
        if (trade.pnl && trade.pnl > 0) stats.wins++;
      }
    }

    console.log('📅 MONTHLY PERFORMANCE:');
    const sortedMonths = Array.from(monthlyStats.entries()).sort();
    sortedMonths.forEach(([month, stats]) => {
      const monthWinRate = stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0;
      console.log(`${month}: ${stats.trades} trades | ${monthWinRate.toFixed(1)}% WR | £${stats.pnl.toFixed(2)}`);
    });
    console.log('');

    // Overall assessment
    console.log('🏆 === STRATEGY ASSESSMENT ===\n');

    if (winRate >= 40 && actualTotalPnL > 0) {
      console.log('🎉 EXCELLENT: Strategy performing well!');
      console.log('   ✅ High win rate and positive returns');
      console.log('   ✅ Ready for live trading consideration');
    } else if (winRate >= 30 && actualTotalPnL > -500) {
      console.log('✅ GOOD: Strategy shows promise');
      console.log('   📈 Decent win rate, manageable losses');
      console.log('   🔧 Consider minor optimizations');
    } else if (winRate >= 20) {
      console.log('⚠️  MARGINAL: Strategy needs improvement');
      console.log('   📉 Low win rate or significant losses');
      console.log('   🛠️  Requires further strategy refinement');
    } else {
      console.log('❌ POOR: Strategy not viable');
      console.log('   💥 Very low win rate or major losses');
      console.log('   🔄 Back to strategy development needed');
    }

    console.log('');
    console.log('📝 NEXT STEPS:');
    if (winRate >= 30) {
      console.log('1. Consider paper trading for 2-4 weeks');
      console.log('2. Monitor pattern performance consistency');
      console.log('3. Gradually increase position sizes');
      console.log('4. Implement dynamic stop loss adjustments');
    } else {
      console.log('1. Further relax pattern recognition thresholds');
      console.log('2. Analyze losing patterns and exclude poor performers');
      console.log('3. Test different entry/exit timing approaches');
      console.log('4. Consider market regime filtering');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Extended backtest failed:', error);
    process.exit(1);
  }
}

runExtendedBacktest();