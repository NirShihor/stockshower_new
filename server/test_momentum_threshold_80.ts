import { connectDatabase } from './src/db/connection.js';
import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';

async function testMomentumThreshold80() {
  try {
    await connectDatabase();
    console.log('🚀 === TESTING OPTIMAL THRESHOLD 80 ===\n');

    // Test shorter period first to validate approach
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // 60 days

    console.log('📅 TEST PERIOD:');
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log(`Duration: 60 days`);
    console.log('');

    console.log('🔄 OPTIMAL THRESHOLD TEST (80):');
    console.log('🎯 Score threshold: OPTIMAL 80');
    console.log('   - Balance between quality and quantity');
    console.log('   - Middle ground between 75 and 85');
    console.log('   - Seeking profitability sweet spot');
    console.log('');
    console.log('✅ All momentum strategy improvements:');
    console.log('   - Breakout entry timing (momentum vs reversal)');
    console.log('   - 6% minimum stop distances for volatility');
    console.log('   - Trend alignment filtering');
    console.log('   - Continuation pattern focus only');
    console.log('');

    const backtest = new DatabaseBacktestEngine({
      startDate: startDate,
      endDate: endDate,
      scoreThreshold: 80, // OPTIMAL: Sweet spot between quality and quantity
      maxConcurrentPositions: 5,
      positionSizeGBP: 100,
      initialBalance: 10000,
      enableAutoExecution: false,
      autoExecutionThreshold: 80,
      enableTrapFades: false,
      slippageModel: 'fixed',
      commissionPerTrade: 1.0,
      useProfitableFiltering: true
    });

    console.log('⚡ RUNNING OPTIMAL THRESHOLD TEST...');
    console.log('');

    const startTime = Date.now();
    const results = await backtest.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Test completed in ${duration} seconds\n`);

    // Analyze results
    if (!results.trades || results.trades.length === 0) {
      console.log('❌ No trades executed - threshold too restrictive');
      console.log('   Score 80 filtered out all signals');
      console.log('   Consider lowering to 70-75 range');
      process.exit(1);
    }

    const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = results.trades.filter(t => t.pnl && t.pnl < 0);
    const totalTrades = results.trades.length;
    const winRate = (winningTrades.length / totalTrades) * 100;
    const actualTotalPnL = results.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    console.log('📊 === OPTIMAL THRESHOLD 80 RESULTS ===\n');
    console.log('🎯 PERFORMANCE METRICS:');
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (${winningTrades.length} wins, ${losingTrades.length} losses)`);
    console.log(`Total P&L: £${actualTotalPnL.toFixed(2)}`);
    console.log(`Average Trade: £${(actualTotalPnL / totalTrades).toFixed(2)}`);
    console.log(`ROI: ${((actualTotalPnL / 10000) * 100).toFixed(1)}%`);
    console.log('');

    // Compare to ALL previous results
    console.log('📈 COMPLETE THRESHOLD PROGRESSION:');
    console.log(`Reversal (Score 60):  2.6% win rate, -£82.19 (39 trades)`);
    console.log(`Momentum (Score 60): 11.1% win rate, -£296.92 (45 trades)`);
    console.log(`Momentum (Score 75): 11.1% win rate, -£200.31 (36 trades)`);
    console.log(`Momentum (Score 85):  7.7% win rate, -£159.55 (26 trades)`);
    console.log(`Current  (Score 80): ${winRate.toFixed(1)}% win rate, £${actualTotalPnL.toFixed(2)} (${totalTrades} trades)`);
    console.log('');

    // Trend analysis
    const tradeVsTotalPnL = [
      { threshold: 60, trades: 45, pnl: -296.92 },
      { threshold: 75, trades: 36, pnl: -200.31 },
      { threshold: 80, trades: totalTrades, pnl: actualTotalPnL },
      { threshold: 85, trades: 26, pnl: -159.55 }
    ];

    console.log('📊 TREND ANALYSIS:');
    console.log('As threshold increases:');
    console.log('- Trade count decreases (filtering effect)');
    console.log('- Losses generally decrease (quality effect)');
    console.log('- Win rate varies (pattern dependent)');
    console.log('');

    // Profitability check
    if (actualTotalPnL > 0) {
      console.log('🎉 PROFITABILITY ACHIEVED!');
      console.log(`💰 Positive P&L: £${actualTotalPnL.toFixed(2)}`);
      if (winRate >= 15) {
        console.log('🏆 EXCELLENT: High win rate + profitability');
        console.log('   Ready for extended 6-month validation');
      } else {
        console.log('📈 GOOD: Profitable despite modest win rate');
        console.log('   Shows strong risk/reward management');
      }
    } else if (actualTotalPnL > -100) {
      console.log('💡 NEAR PROFITABILITY');
      console.log(`📉 Small losses: £${actualTotalPnL.toFixed(2)}`);
      console.log('   Very close to breakeven point');
    } else {
      console.log('📉 CONTINUED LOSSES');
      console.log(`💸 Total loss: £${actualTotalPnL.toFixed(2)}`);
    }

    // Show sample trades
    console.log(`\n🔍 SAMPLE TRADES (First 15 of ${totalTrades}):`);
    results.trades.slice(0, 15).forEach((trade, i) => {
      const outcome = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
      const pattern = trade.signal?.pattern?.name || 'Unknown';
      console.log(`${outcome} ${trade.symbol} ${trade.direction} ${pattern} | Entry: $${trade.entryPrice?.toFixed(2)} | P&L: £${trade.pnl?.toFixed(2)}`);
    });

    console.log('');

    // Final recommendation based on threshold 80 results
    if (actualTotalPnL > 0) {
      console.log('🎯 THRESHOLD 80 SUCCESS!');
      console.log('   This is the optimal threshold for profitability');
      console.log('   Recommend extended validation and live testing');
    } else if (actualTotalPnL > -50) {
      console.log('🔧 THRESHOLD 80 SHOWS PROMISE');
      console.log('   Very close to profitability');
      console.log('   Consider minor refinements:');
      console.log('   - Add volume confirmation');
      console.log('   - Test smaller position sizes');
      console.log('   - Filter by market conditions');
    } else {
      console.log('🔄 NEED FURTHER OPTIMIZATION');
      console.log('   Threshold alone may not be sufficient');
      console.log('   Next steps:');
      console.log('   - Add volume-based filtering');
      console.log('   - Implement market regime detection');
      console.log('   - Test alternative position sizing');
      console.log('   - Consider time-of-day filters');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Threshold 80 test failed:', error);
    process.exit(1);
  }
}

testMomentumThreshold80();