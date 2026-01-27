import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';
import { connectDatabase } from './src/db/connection.js';

async function quickFilterTest() {
  try {
    await connectDatabase();
    console.log('🧪 Testing Profitable Filtering (2023-2025)\n');

    const baseConfig = {
      startDate: new Date('2023-01-01'),
      endDate: new Date('2025-11-26'),
      initialBalance: 10000,
      positionSizeGBP: 500,
      maxConcurrentPositions: 10,
      enableAutoExecution: false,
      autoExecutionThreshold: 60,
      enableTrapFades: false,
      slippageModel: 'fixed' as const,
      slippageBps: 5,
      commissionPerTrade: 1
    };

    // Test Baseline (No Filtering)
    console.log('🔄 1. Testing Baseline (No Filtering)...');
    const baseline = new DatabaseBacktestEngine({
      ...baseConfig,
      scoreThreshold: 50,
      useProfitableFiltering: false
    });
    
    const baselineResults = await baseline.run();
    console.log('📊 BASELINE RESULTS:');
    console.log(`  Total Trades: ${baselineResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${baselineResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${baselineResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${baselineResults.summary.profitFactor.toFixed(2)}\n`);

    // Test High Performance Filter
    console.log('🔄 2. Testing High Performance Filter...');
    const hpFilter = new DatabaseBacktestEngine({
      ...baseConfig,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: 'high_performance' as const,
        enableDetailedLogging: false
      }
    });

    const hpResults = await hpFilter.run();
    console.log('📊 HIGH PERFORMANCE FILTER RESULTS:');
    console.log(`  Total Trades: ${hpResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${hpResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${hpResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${hpResults.summary.profitFactor.toFixed(2)}`);
    
    if (baselineResults.summary.totalTrades > 0) {
      const reduction = ((baselineResults.summary.totalTrades - hpResults.summary.totalTrades) / baselineResults.summary.totalTrades * 100);
      console.log(`  Reduction: ${reduction.toFixed(1)}% fewer trades\n`);
    }

    // Test Aggressive Filter
    console.log('🔄 3. Testing Aggressive Filter...');
    const aggressive = new DatabaseBacktestEngine({
      ...baseConfig,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: 'aggressive' as const,
        enableDetailedLogging: false
      }
    });

    const aggressiveResults = await aggressive.run();
    console.log('📊 AGGRESSIVE FILTER RESULTS:');
    console.log(`  Total Trades: ${aggressiveResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${aggressiveResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${aggressiveResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${aggressiveResults.summary.profitFactor.toFixed(2)}\n`);

    // Summary
    console.log('📈 === SUMMARY ===');
    console.log('| Filter Type | Trades | Win Rate | Total P&L | Profit Factor |');
    console.log('|-------------|--------|----------|-----------|---------------|');
    
    const results = [
      { name: 'Baseline', ...baselineResults.summary },
      { name: 'High Performance', ...hpResults.summary },
      { name: 'Aggressive', ...aggressiveResults.summary }
    ];
    
    results.forEach(r => {
      console.log(`| ${r.name.padEnd(11)} | ${r.totalTrades.toString().padEnd(6)} | ${r.winRate.toFixed(1).padEnd(8)}% | £${r.totalPnL.toFixed(0).padEnd(8)} | ${r.profitFactor.toFixed(2).padEnd(13)} |`);
    });

    // Find best filter
    const profitable = results.filter(r => r.totalPnL > 0 && r.winRate > 50);
    if (profitable.length > 0) {
      const best = profitable.reduce((best, current) => current.totalPnL > best.totalPnL ? current : best);
      console.log(`\n✅ Best Filter: ${best.name} with £${best.totalPnL.toFixed(2)} profit and ${best.winRate.toFixed(1)}% win rate`);
    } else {
      console.log('\n❌ No filters achieved profitability - system needs refinement');
    }

    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error testing filters:', error);
    process.exit(1);
  }
}

quickFilterTest();