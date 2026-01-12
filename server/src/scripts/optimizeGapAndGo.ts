import { backtestGapAndGo, BacktestConfig, BacktestResult } from '../momentum/gapAndGoStrategy.js';
import fs from 'fs';

interface OptimizationResult {
  config: Partial<BacktestConfig>;
  winRate: number;
  totalPnL: number;
  profitFactor: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
}

async function runOptimization() {
  const baseConfig: BacktestConfig = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    positionSize: 10000,
    maxDailyTrades: 3,
    minScore: 50,
    minGapPercent: 5,
    maxGapPercent: 100,
    minPrice: 1,
    maxPrice: 20,
    maxFloat: 50000000,
    largeCapsOnly: false,
    delayedEntry: true
  };

  const variations: Partial<BacktestConfig>[] = [
    // Test 1: Baseline (current settings)
    {},
    
    // Test 2: Higher minimum gap (10%)
    { minGapPercent: 10 },
    
    // Test 3: Even higher gap (15%)
    { minGapPercent: 15 },
    
    // Test 4: Tighter price range ($2-$10)
    { minPrice: 2, maxPrice: 10 },
    
    // Test 5: Higher gap + tighter price
    { minGapPercent: 10, minPrice: 2, maxPrice: 10 },
    
    // Test 6: Immediate entry (no 15min wait)
    { delayedEntry: false },
    
    // Test 7: Higher gap + immediate entry
    { minGapPercent: 10, delayedEntry: false },
    
    // Test 8: Very low float only (<20M)
    { maxFloat: 20000000 },
    
    // Test 9: Higher score threshold
    { minScore: 60 },
    
    // Test 10: Combo - high gap, tight price, low float
    { minGapPercent: 10, minPrice: 2, maxPrice: 10, maxFloat: 20000000 },
  ];

  const results: OptimizationResult[] = [];

  console.log('=== GAP AND GO OPTIMIZATION ===\n');
  console.log(`Testing ${variations.length} parameter variations\n`);

  for (let i = 0; i < variations.length; i++) {
    const variation = variations[i];
    const config = { ...baseConfig, ...variation };
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST ${i + 1}/${variations.length}`);
    console.log(`Changes: ${JSON.stringify(variation) || 'BASELINE'}`);
    console.log('='.repeat(60));

    try {
      const result = await backtestGapAndGo(config);
      
      results.push({
        config: variation,
        winRate: result.summary.winRate,
        totalPnL: result.summary.totalPnL,
        profitFactor: result.summary.profitFactor,
        totalTrades: result.summary.totalTrades,
        avgWin: result.summary.avgWin,
        avgLoss: result.summary.avgLoss
      });

      // Small delay between tests
      await new Promise(r => setTimeout(r, 2000));

    } catch (error) {
      console.error(`Test ${i + 1} failed:`, error);
    }
  }

  // Sort by profit factor
  results.sort((a, b) => b.profitFactor - a.profitFactor);

  console.log('\n\n' + '='.repeat(60));
  console.log('OPTIMIZATION RESULTS - RANKED BY PROFIT FACTOR');
  console.log('='.repeat(60) + '\n');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`#${i + 1}: PF=${r.profitFactor.toFixed(2)} | WR=${r.winRate.toFixed(1)}% | P&L=$${r.totalPnL.toFixed(0)} | Trades=${r.totalTrades}`);
    console.log(`    Config: ${JSON.stringify(r.config) || 'BASELINE'}`);
    console.log(`    Avg Win: $${r.avgWin.toFixed(0)} | Avg Loss: $${r.avgLoss.toFixed(0)}`);
    console.log('');
  }

  // Save results
  fs.writeFileSync('./gap_optimization_results.json', JSON.stringify(results, null, 2));
  console.log('Results saved to gap_optimization_results.json');

  return results;
}

// Parse command line args
const args = process.argv.slice(2);
let startDate = '2024-01-01';
let endDate = '2024-12-31';

for (const arg of args) {
  if (arg.startsWith('--from=')) startDate = arg.split('=')[1];
  if (arg.startsWith('--to=')) endDate = arg.split('=')[1];
}

console.log(`Date range: ${startDate} to ${endDate}\n`);

runOptimization().catch(console.error);
