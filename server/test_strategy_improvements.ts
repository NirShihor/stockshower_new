import { connectDatabase } from './src/db/connection.js';
import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';

async function testImprovements() {
  try {
    await connectDatabase();
    console.log('🧪 === TESTING STRATEGY IMPROVEMENTS ===\n');

    // Test backtest with limited timeframe for quick validation
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days

    const backtest = new DatabaseBacktestEngine({
      startDate: startDate,
      endDate: endDate,
      scoreThreshold: 60,
      maxConcurrentPositions: 3,
      positionSizeGBP: 100, // Fixed: was positionSizeUSD
      initialBalance: 10000,
      enableAutoExecution: false,
      autoExecutionThreshold: 60,
      enableTrapFades: false,
      slippageModel: 'fixed',
      commissionPerTrade: 0.5,
      useProfitableFiltering: true
    });
    
    console.log('📊 CHANGES MADE:');
    console.log('✅ Increased stop loss: 2.5% → 3.5% minimum');
    console.log('✅ Relaxed pattern thresholds: minBodyPct 0.15 → 0.08');
    console.log('✅ Removed counter-trend penalties for reversal patterns');
    console.log('✅ Reduced trap detection penalties: 15-20 → 5-8 points');
    console.log('✅ Fixed entry timing: breakout → pattern levels');
    console.log('');

    console.log('🚀 Running 30-day validation backtest...');
    console.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    console.log('');

    const results = await backtest.run();

    console.log('📋 === VALIDATION RESULTS ===');
    console.log(`Total signals: ${results.signals?.length || 0}`);
    console.log(`Executed trades: ${results.trades?.length || 0}`);
    
    if (results.trades && results.trades.length > 0) {
      console.log('\n🔍 TRADE DETAILS:');
      results.trades.forEach((trade, i) => {
        console.log(`Trade ${i+1}: ${trade.symbol} ${trade.direction} | Entry: $${trade.entryPrice?.toFixed(2)} | Exit: $${trade.exitPrice?.toFixed(2)} | P&L: $${trade.pnl?.toFixed(2)} | Status: ${trade.outcome}`);
      });
      
      const winningTrades = results.trades.filter(t => t.pnl > 0);
      const losingTrades = results.trades.filter(t => t.pnl < 0);
      const breakEvenTrades = results.trades.filter(t => t.pnl === 0);
      
      const winRate = (winningTrades.length / results.trades.length) * 100;
      
      console.log(`\n📊 SUMMARY:`);
      console.log(`Win rate: ${winRate.toFixed(1)}% (${winningTrades.length} wins, ${losingTrades.length} losses, ${breakEvenTrades.length} breakeven)`);
      console.log(`Total P&L: $${results.totalPnL?.toFixed(2) || '0.00'}`);
      console.log(`Average trade: $${(results.totalPnL / results.trades.length).toFixed(2)}`);
      
      if (winRate > 20) {
        console.log('🎉 IMPROVEMENT: Win rate above 20% - much better than 0%!');
      } else if (winRate > 0) {
        console.log('✅ PROGRESS: Win rate above 0% - improvements working!');
      } else {
        console.log('❌ STILL ISSUES: Win rate still 0% - checking individual trades above');
      }
    } else {
      console.log('⚠️  No trades executed - pattern detection may still be too strict');
    }

    console.log('');
    console.log('📖 NEXT STEPS:');
    console.log('If win rate improved: Run extended backtest on 6+ months');
    console.log('If still poor: Further relax pattern thresholds');
    console.log('If no trades: Check pattern detection is working');

    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testImprovements();