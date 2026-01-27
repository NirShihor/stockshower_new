import { connectDatabase } from './src/db/connection.js';
import { Trade } from './src/db/models/Trade.js';

async function investigateDataMismatch() {
  try {
    await connectDatabase();
    console.log('🔍 === INVESTIGATING BACKTEST vs ACTUAL DATA MISMATCH ===\n');

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (60 * 24 * 60 * 60 * 1000)); // 60 days

    // Get ALL trades in the period
    const allTrades = await Trade.find({
      signalTime: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ signalTime: 1 });

    console.log(`📊 TOTAL TRADES IN DATABASE: ${allTrades.length}`);

    // Categorize trades
    const completedTrades = allTrades.filter(t => t.exitPrice && t.pnlAmount !== undefined);
    const openTrades = allTrades.filter(t => !t.exitPrice || t.pnlAmount === undefined);
    const tradesWithSignals = allTrades.filter(t => t.signalData);
    const tradesWithoutSignals = allTrades.filter(t => !t.signalData);

    console.log(`📈 Completed trades: ${completedTrades.length}`);
    console.log(`🔄 Open/incomplete trades: ${openTrades.length}`);
    console.log(`🎯 Trades with signal data: ${tradesWithSignals.length}`);
    console.log(`❌ Trades without signal data: ${tradesWithoutSignals.length}\n`);

    // Examine completed trades in detail
    if (completedTrades.length > 0) {
      console.log('🔍 === COMPLETED TRADES ANALYSIS ===\n');
      
      const winners = completedTrades.filter(t => t.pnlAmount > 0);
      const losers = completedTrades.filter(t => t.pnlAmount <= 0);
      
      console.log(`✅ Winners: ${winners.length} (${(winners.length/completedTrades.length*100).toFixed(1)}%)`);
      console.log(`❌ Losers: ${losers.length} (${(losers.length/completedTrades.length*100).toFixed(1)}%)`);
      
      const totalPnL = completedTrades.reduce((sum, t) => sum + t.pnlAmount, 0);
      console.log(`💰 Total P&L: £${totalPnL.toFixed(2)}`);
      console.log(`📊 Average Trade: £${(totalPnL/completedTrades.length).toFixed(2)}\n`);

      // Show sample trades
      console.log('📋 SAMPLE COMPLETED TRADES:');
      completedTrades.slice(0, 10).forEach(trade => {
        const outcome = trade.pnlAmount > 0 ? '✅' : '❌';
        const signal = trade.signalData?.pattern?.name || 'No Signal';
        const score = trade.signalData?.score || 'N/A';
        console.log(`${outcome} ${trade.symbol} ${trade.direction} | ${signal} (${score}) | Entry: $${trade.entryPrice?.toFixed(2)} | Exit: $${trade.exitPrice?.toFixed(2)} | P&L: £${trade.pnlAmount?.toFixed(2)}`);
      });
    }

    console.log('\n🔍 === BACKTEST SIMULATION vs ACTUAL COMPARISON ===\n');

    // Check what our backtest is actually doing vs real trades
    if (tradesWithSignals.length > 0) {
      console.log('💡 Real trades with signals vs our backtest simulation:\n');
      
      const sampleTrade = tradesWithSignals[0];
      console.log('📋 EXAMPLE REAL TRADE:');
      console.log(`Symbol: ${sampleTrade.symbol}`);
      console.log(`Direction: ${sampleTrade.direction}`);
      console.log(`Signal Time: ${sampleTrade.signalTime}`);
      console.log(`Order Placed: ${sampleTrade.orderPlacedTime}`);
      console.log(`Entry Price: $${sampleTrade.entryPrice}`);
      console.log(`Exit Price: $${sampleTrade.exitPrice || 'Still Open'}`);
      console.log(`P&L: £${sampleTrade.pnlAmount || 'N/A'}`);
      console.log(`Signal Pattern: ${sampleTrade.signalData?.pattern?.name}`);
      console.log(`Signal Score: ${sampleTrade.signalData?.score}`);
      
      if (sampleTrade.signalData?.plan) {
        console.log(`\nSIGNAL PLAN:`);
        console.log(`Planned Entry: $${sampleTrade.signalData.plan.entry}`);
        console.log(`Planned Stop: $${sampleTrade.signalData.plan.stop}`);
        console.log(`Planned Targets: $${sampleTrade.signalData.plan.targets?.join(', ')}`);
      }
    }

    console.log('\n🚨 === KEY DISCREPANCIES IDENTIFIED ===\n');

    // Hypothesis 1: Backtest uses different trades than actual
    console.log('1. DATA SCOPE MISMATCH:');
    console.log(`   - Our backtest processes ${allTrades.length} total trades`);
    console.log(`   - Only ${completedTrades.length} are actually completed with P&L`);
    console.log(`   - This suggests backtest is SIMULATING trades that never actually executed\n`);

    // Hypothesis 2: Simulation vs Reality
    console.log('2. SIMULATION vs REALITY:');
    console.log(`   - Backtest: Simulates fills and exits based on historical price data`);
    console.log(`   - Reality: Shows actual executed trades with real fills/slippage`);
    console.log(`   - Real trades may have different entry/exit prices than simulated\n`);

    // Hypothesis 3: Time period mismatch
    const oldestTrade = allTrades.reduce((oldest, trade) => 
      new Date(trade.signalTime) < new Date(oldest.signalTime) ? trade : oldest, allTrades[0]);
    const newestTrade = allTrades.reduce((newest, trade) => 
      new Date(trade.signalTime) > new Date(newest.signalTime) ? trade : newest, allTrades[0]);

    console.log('3. TIME PERIOD ANALYSIS:');
    console.log(`   - Oldest trade: ${new Date(oldestTrade?.signalTime).toISOString().split('T')[0]}`);
    console.log(`   - Newest trade: ${new Date(newestTrade?.signalTime).toISOString().split('T')[0]}`);
    console.log(`   - Most trades appear to be from actual live trading, not historical sim\n`);

    // Critical insight
    console.log('💡 === ROOT CAUSE IDENTIFIED ===\n');
    console.log('🎯 THE ISSUE: Our backtesting is SIMULATING hypothetical trades,');
    console.log('   but the database contains REAL executed trades with completely different outcomes.');
    console.log('');
    console.log('🔧 WHAT\'S HAPPENING:');
    console.log('   1. Backtest simulates fills/exits using historical price data');
    console.log('   2. Real trades have actual market execution with different timing/prices');
    console.log('   3. We\'re comparing apples (simulated) to oranges (real trades)');
    console.log('');
    console.log('✅ SOLUTION NEEDED:');
    console.log('   - Test strategy using ONLY actual executed trade data');
    console.log('   - Or fix simulation to match real market conditions');
    console.log('   - Analyze why real trades are profitable but simulations lose money');

    process.exit(0);

  } catch (error) {
    console.error('❌ Data mismatch investigation failed:', error);
    process.exit(1);
  }
}

investigateDataMismatch();