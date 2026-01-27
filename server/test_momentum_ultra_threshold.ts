import { connectDatabase } from './src/db/connection.js';
import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';

async function testMomentumUltraThreshold() {
  try {
    await connectDatabase();
    console.log('🚀 === TESTING ULTRA HIGH THRESHOLD MOMENTUM ===\n');

    // Test shorter period first to validate approach
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // 60 days

    console.log('📅 TEST PERIOD:');
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log(`Duration: 60 days`);
    console.log('');

    console.log('🔄 ULTRA HIGH THRESHOLD TEST:');
    console.log('🎯 Score threshold: ULTRA HIGH 85+');
    console.log('   - Only the absolute highest quality signals');
    console.log('   - Aiming for profitable P&L with fewer trades');
    console.log('');
    console.log('✅ All previous momentum improvements:');
    console.log('   - Breakout entry timing (momentum vs reversal)');
    console.log('   - 6% minimum stop distances for volatility');
    console.log('   - Trend alignment filtering');
    console.log('   - Continuation pattern focus only');
    console.log('');

    const backtest = new DatabaseBacktestEngine({
      startDate: startDate,
      endDate: endDate,
      scoreThreshold: 85, // ULTRA HIGH: Only the best signals
      maxConcurrentPositions: 5,
      positionSizeGBP: 100,
      initialBalance: 10000,
      enableAutoExecution: false,
      autoExecutionThreshold: 85,
      enableTrapFades: false,
      slippageModel: 'fixed',
      commissionPerTrade: 1.0,
      useProfitableFiltering: true
    });

    console.log('⚡ RUNNING ULTRA HIGH THRESHOLD TEST...');
    console.log('');

    const startTime = Date.now();
    const results = await backtest.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Test completed in ${duration} seconds\n`);

    // Analyze results
    if (!results.trades || results.trades.length === 0) {
      console.log('❌ No trades executed - threshold too restrictive');
      console.log('   Ultra high threshold (85+) filtered out all signals');
      console.log('   Consider testing threshold 80 instead');
      process.exit(1);
    }

    const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = results.trades.filter(t => t.pnl && t.pnl < 0);
    const totalTrades = results.trades.length;
    const winRate = (winningTrades.length / totalTrades) * 100;
    const actualTotalPnL = results.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    console.log('📊 === ULTRA HIGH THRESHOLD RESULTS ===\n');
    console.log('🎯 PERFORMANCE METRICS:');
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (${winningTrades.length} wins, ${losingTrades.length} losses)`);
    console.log(`Total P&L: £${actualTotalPnL.toFixed(2)}`);
    console.log(`Average Trade: £${(actualTotalPnL / totalTrades).toFixed(2)}`);
    console.log(`ROI: ${((actualTotalPnL / 10000) * 100).toFixed(1)}%`);
    console.log('');

    // Compare to previous results
    console.log('📈 THRESHOLD PROGRESSION COMPARISON:');
    console.log(`Reversal (Score 60):  2.6% win rate, -£82.19 (39 trades)`);
    console.log(`Momentum (Score 60): 11.1% win rate, -£296.92 (45 trades)`);
    console.log(`Momentum (Score 75): 11.1% win rate, -£200.31 (36 trades)`);
    console.log(`Current  (Score 85): ${winRate.toFixed(1)}% win rate, £${actualTotalPnL.toFixed(2)} (${totalTrades} trades)`);
    console.log('');

    // Quality analysis
    if (totalTrades < 10) {
      console.log('⚠️  VERY FEW TRADES: Ultra high threshold very selective');
    }

    if (actualTotalPnL > 0) {
      console.log('🎉 PROFITABILITY ACHIEVED! Positive total P&L');
      if (winRate >= 20) {
        console.log('💎 EXCEPTIONAL: High win rate + profitability');
      }
    } else if (actualTotalPnL > -100) {
      console.log('💡 NEAR BREAKEVEN: Small losses, close to profitability');
      console.log('   Ultra high threshold showing promise');
    } else {
      console.log('📉 STILL LOSSES: Despite high threshold');
    }

    // Show all trades due to low volume
    console.log(`\n🔍 ALL TRADES (${totalTrades} total):`);
    results.trades.forEach((trade, i) => {
      const outcome = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
      const pattern = trade.signal?.pattern?.name || 'Unknown';
      console.log(`${outcome} ${trade.symbol} ${trade.direction} ${pattern} | Entry: $${trade.entryPrice?.toFixed(2)} | P&L: £${trade.pnl?.toFixed(2)}`);
    });

    console.log('');

    // Decision point based on ultra high threshold
    if (actualTotalPnL > 0 && winRate >= 15) {
      console.log('🎯 ULTRA HIGH THRESHOLD SUCCESS!');
      console.log('   Strategy ready for live testing with score 85+');
      console.log('   Recommend 6-month extended validation');
    } else if (actualTotalPnL > -50 && totalTrades >= 5) {
      console.log('🔧 PROMISING DIRECTION');
      console.log('   Consider testing score threshold 80');
      console.log('   Or add volume confirmation filters');
    } else {
      console.log('🔄 EXPLORE ALTERNATIVE REFINEMENTS');
      console.log('   - Test score threshold 80 (middle ground)');
      console.log('   - Add volume-based filtering');
      console.log('   - Consider market regime filters');
      console.log('   - Test different position sizing');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Ultra high threshold test failed:', error);
    process.exit(1);
  }
}

testMomentumUltraThreshold();