import { DatabaseBacktestEngine } from './src/backtesting/engine/databaseBacktestEngine.js';
import { connectDatabase } from './src/db/connection.js';

async function testProfitableFiltering() {
  try {
    await connectDatabase();
    console.log('=== TESTING PROFITABLE FILTERING SYSTEM ===\n');
    
    const baseConfig = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-12-31'),
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

    console.log('🔄 1. RUNNING BASELINE (NO FILTERING)...\n');
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

    console.log('🔄 2. RUNNING CONSERVATIVE FILTERING...\n');
    const conservative = new DatabaseBacktestEngine({
      ...baseConfig,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: 'conservative',
        enableDetailedLogging: false
      }
    });
    
    const conservativeResults = await conservative.run();
    console.log('📊 CONSERVATIVE FILTERING RESULTS:');
    console.log(`  Total Trades: ${conservativeResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${conservativeResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${conservativeResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${conservativeResults.summary.profitFactor.toFixed(2)}`);
    console.log(`  Reduction: ${((baselineResults.summary.totalTrades - conservativeResults.summary.totalTrades) / baselineResults.summary.totalTrades * 100).toFixed(1)}% fewer trades\n`);

    console.log('🔄 3. RUNNING HIGH PERFORMANCE FILTERING...\n');
    const highPerformance = new DatabaseBacktestEngine({
      ...baseConfig,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: 'high_performance',
        enableDetailedLogging: false
      }
    });
    
    const hpResults = await highPerformance.run();
    console.log('📊 HIGH PERFORMANCE FILTERING RESULTS:');
    console.log(`  Total Trades: ${hpResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${hpResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${hpResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${hpResults.summary.profitFactor.toFixed(2)}`);
    console.log(`  Reduction: ${((baselineResults.summary.totalTrades - hpResults.summary.totalTrades) / baselineResults.summary.totalTrades * 100).toFixed(1)}% fewer trades\n`);

    console.log('🔄 4. RUNNING AGGRESSIVE FILTERING...\n');
    const aggressive = new DatabaseBacktestEngine({
      ...baseConfig,
      useProfitableFiltering: true,
      profitableFilterConfig: {
        filterMode: 'aggressive',
        enableDetailedLogging: false
      }
    });
    
    const aggressiveResults = await aggressive.run();
    console.log('📊 AGGRESSIVE FILTERING RESULTS:');
    console.log(`  Total Trades: ${aggressiveResults.summary.totalTrades}`);
    console.log(`  Win Rate: ${aggressiveResults.summary.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: £${aggressiveResults.summary.totalPnL.toFixed(2)}`);
    console.log(`  Profit Factor: ${aggressiveResults.summary.profitFactor.toFixed(2)}`);
    console.log(`  Reduction: ${((baselineResults.summary.totalTrades - aggressiveResults.summary.totalTrades) / baselineResults.summary.totalTrades * 100).toFixed(1)}% fewer trades\n`);

    // Summary comparison
    console.log('📈 === FILTERING EFFECTIVENESS SUMMARY ===\n');
    
    const results = [
      { name: 'Baseline (No Filter)', ...baselineResults.summary },
      { name: 'Conservative Filter', ...conservativeResults.summary },
      { name: 'High Performance Filter', ...hpResults.summary },
      { name: 'Aggressive Filter', ...aggressiveResults.summary }
    ];
    
    console.log('| Filter Type | Trades | Win Rate | Total P&L | Profit Factor |');
    console.log('|-------------|--------|----------|-----------|---------------|');
    
    results.forEach(result => {
      console.log(`| ${result.name.padEnd(19)} | ${result.totalTrades.toString().padEnd(6)} | ${result.winRate.toFixed(1).padEnd(8)}% | £${result.totalPnL.toFixed(0).padEnd(8)} | ${result.profitFactor.toFixed(2).padEnd(13)} |`);
    });

    console.log('\n🎯 RECOMMENDATIONS:');
    
    // Find best performing filter
    const profitableFilters = results.filter(r => r.totalPnL > 0 && r.winRate > 50);
    if (profitableFilters.length > 0) {
      const bestFilter = profitableFilters.reduce((best, current) => 
        current.totalPnL > best.totalPnL ? current : best
      );
      
      console.log(`✅ Best Filter: ${bestFilter.name}`);
      console.log(`   - ${bestFilter.totalTrades} trades with ${bestFilter.winRate.toFixed(1)}% win rate`);
      console.log(`   - £${bestFilter.totalPnL.toFixed(2)} total profit`);
      console.log(`   - ${bestFilter.profitFactor.toFixed(2)} profit factor`);
    } else {
      console.log('❌ No filters achieved profitability with these parameters');
      console.log('   Consider adjusting stop loss settings or position sizing');
    }

    // Export results for further analysis
    const detailedComparison = {
      testDate: new Date().toISOString(),
      config: baseConfig,
      results: {
        baseline: baselineResults,
        conservative: conservativeResults,
        highPerformance: hpResults,
        aggressive: aggressiveResults
      },
      summary: results
    };

    const fs = await import('fs');
    fs.writeFileSync('filtering_test_results.json', JSON.stringify(detailedComparison, null, 2));
    console.log('\n💾 Detailed results saved to: filtering_test_results.json');

    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error testing filters:', error);
    process.exit(1);
  }
}

testProfitableFiltering();