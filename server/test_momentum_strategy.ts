import { connectDatabase } from './src/db/connection.js';
import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';

async function testMomentumStrategy() {
  try {
    await connectDatabase();
    console.log('🚀 === TESTING MOMENTUM STRATEGY OVERHAUL ===\n');

    // Test shorter period first to validate approach
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // 60 days

    console.log('📅 TEST PERIOD:');
    console.log(`Start: ${startDate.toISOString().split('T')[0]}`);
    console.log(`End: ${endDate.toISOString().split('T')[0]}`);
    console.log(`Duration: 60 days`);
    console.log('');

    console.log('🔄 STRATEGY OVERHAUL CHANGES:');
    console.log('✅ Entry approach: FLIPPED to momentum breakouts');
    console.log('   - Bullish: Enter ABOVE pattern high (not at low)');
    console.log('   - Bearish: Enter BELOW pattern low (not at high)');
    console.log('');
    console.log('✅ Stop losses: WIDENED to 6% minimum (vs 3.5%)');
    console.log('   - More room for volatility in momentum trades');
    console.log('');
    console.log('✅ Trend filtering: ENABLED (trend alignment required)');
    console.log('   - Only bullish patterns in uptrends');
    console.log('   - Only bearish patterns in downtrends');
    console.log('');
    console.log('✅ Pattern focus: CONTINUATION patterns only');
    console.log('   - Strong patterns: Engulfing, Three Soldiers/Crows, Marubozu');
    console.log('   - Excluded weak: Tweezer, Hammer, Shooting Star');
    console.log('');
    console.log('🎯 Score threshold: RAISED to 75 (from 60)');
    console.log('   - Testing higher quality signals only');
    console.log('');

    const backtest = new DatabaseBacktestEngine({
      startDate: startDate,
      endDate: endDate,
      scoreThreshold: 75, // RAISED: Testing higher threshold for quality
      maxConcurrentPositions: 5,
      positionSizeGBP: 100,
      initialBalance: 10000,
      enableAutoExecution: false,
      autoExecutionThreshold: 75,
      enableTrapFades: false,
      slippageModel: 'fixed',
      commissionPerTrade: 1.0,
      useProfitableFiltering: true
    });

    console.log('⚡ RUNNING MOMENTUM STRATEGY TEST...');
    console.log('');

    const startTime = Date.now();
    const results = await backtest.run();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`✅ Test completed in ${duration} seconds\n`);

    // Analyze results
    if (!results.trades || results.trades.length === 0) {
      console.log('❌ No trades executed - filters may be too restrictive');
      console.log('   Momentum + trend filtering may have limited opportunities');
      process.exit(1);
    }

    const winningTrades = results.trades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = results.trades.filter(t => t.pnl && t.pnl < 0);
    const totalTrades = results.trades.length;
    const winRate = (winningTrades.length / totalTrades) * 100;
    const actualTotalPnL = results.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    console.log('📊 === MOMENTUM STRATEGY RESULTS ===\n');
    console.log('🎯 PERFORMANCE METRICS:');
    console.log(`Total Trades: ${totalTrades}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (${winningTrades.length} wins, ${losingTrades.length} losses)`);
    console.log(`Total P&L: £${actualTotalPnL.toFixed(2)}`);
    console.log(`Average Trade: £${(actualTotalPnL / totalTrades).toFixed(2)}`);
    console.log(`ROI: ${((actualTotalPnL / 10000) * 100).toFixed(1)}%`);
    console.log('');

    // Compare to previous results
    console.log('📈 COMPARISON TO PREVIOUS STRATEGIES:');
    console.log(`Reversal (Score 60): 2.6% win rate, -£82.19 (39 trades)`);
    console.log(`Momentum (Score 60): 11.1% win rate, -£296.92 (45 trades)`);  
    console.log(`Current (Score 75): ${winRate.toFixed(1)}% win rate, £${actualTotalPnL.toFixed(2)} (${totalTrades} trades)`);
    console.log('');

    if (winRate > 15) {
      console.log('🎉 MASSIVE IMPROVEMENT! Win rate above 15%');
      if (actualTotalPnL > 0) {
        console.log('💰 PROFITABLE! Positive total P&L achieved');
      }
    } else if (winRate > 5) {
      console.log('✅ IMPROVEMENT: Win rate better than 2.6% baseline');
      if (actualTotalPnL > -50) {
        console.log('💡 PROGRESS: Losses much reduced');
      }
    } else {
      console.log('❌ STILL STRUGGLING: Win rate below 5%');
    }

    // Show sample trades
    console.log('\n🔍 SAMPLE TRADES (First 10):');
    results.trades.slice(0, 10).forEach((trade, i) => {
      const outcome = trade.pnl && trade.pnl > 0 ? '✅' : '❌';
      console.log(`${outcome} ${trade.symbol} ${trade.direction} | Entry: $${trade.entryPrice?.toFixed(2)} | P&L: £${trade.pnl?.toFixed(2)}`);
    });

    console.log('');

    // Decision point
    if (winRate >= 20 && actualTotalPnL > 0) {
      console.log('🎯 STRATEGY READY FOR EXTENDED TESTING');
      console.log('   Recommend running full 6-month backtest');
    } else if (winRate >= 10) {
      console.log('🔧 STRATEGY SHOWS PROMISE');
      console.log('   Consider further refinements:');
      console.log('   - Test with higher score thresholds (70-80)');
      console.log('   - Add volume confirmation');
      console.log('   - Test different position sizing');
    } else {
      console.log('🔄 STRATEGY NEEDS MORE WORK');
      console.log('   Consider:');
      console.log('   - Testing pure trend-following (no patterns)');
      console.log('   - Adding momentum indicators (RSI, MACD)');
      console.log('   - Market regime filtering (volatility, time)');
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Momentum strategy test failed:', error);
    process.exit(1);
  }
}

testMomentumStrategy();