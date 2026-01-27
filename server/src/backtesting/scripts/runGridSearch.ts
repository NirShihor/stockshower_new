import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { runFlexibleBacktest, LARGE_CAP_SYMBOLS } from '../engine/flexibleBacktestEngine.js';
import {
  FlexibleBacktestConfig,
  FlexibleBacktestResult,
  EntryStrategy,
  StopLossStrategy,
  TargetStrategy
} from '../types/flexibleBacktestTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface GridSearchResult {
  config: FlexibleBacktestConfig;
  summary: FlexibleBacktestResult['summary'];
}

function printUsage() {
  console.log(`
Grid Search - Parameter Optimization

Usage: npx tsx src/backtesting/scripts/runGridSearch.ts [options]

Required:
  --from=<date>             Start date YYYY-MM-DD
  --to=<date>               End date YYYY-MM-DD

Parameter Ranges (comma-separated values):
  --entry-range=<values>    Entry thresholds to test (default: 1.5,2,2.5,3)
  --stop-range=<values>     Stop loss values to test (default: 0.5,1,1.5,2)
  --target-range=<values>   Target values to test (default: 1,1.5,2,2.5,3)

Fixed Parameters:
  --entry=<strategy>        Entry strategy (default: drop_from_open)
  --stop=<strategy>         Stop strategy (default: fixed_percent)
  --target=<strategy>       Target strategy (default: fixed_rr)
  --direction=<dir>         Trade direction (default: long)
  --size=<n>                Position size (default: 10000)
  --max-trades=<n>          Max daily trades (default: 5)

Output:
  --sort=<metric>           Sort by: pnl, winRate, profitFactor (default: pnl)
  --top=<n>                 Show top N results (default: 10)
  --output=<file>           Output file (default: grid_search_results.json)

Examples:
  # Test stop loss and target combinations
  npx tsx src/backtesting/scripts/runGridSearch.ts --from=2024-01-01 --to=2024-12-31 --stop-range=0.5,1,1.5 --target-range=1.5,2,2.5

  # Test entry thresholds for mean reversion
  npx tsx src/backtesting/scripts/runGridSearch.ts --from=2024-01-01 --to=2024-06-30 --entry-range=1.5,2,2.5,3,3.5 --target=vwap
`);
}

function parseRange(value: string | undefined, defaultValue: number[]): number[] {
  if (!value) return defaultValue;
  return value.split(',').map(v => parseFloat(v.trim()));
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  
  const fromDate = getArg('from');
  const toDate = getArg('to');
  
  if (!fromDate || !toDate) {
    console.error('Error: --from and --to dates are required');
    printUsage();
    process.exit(1);
  }
  
  const entryRange = parseRange(getArg('entry-range'), [1.5, 2, 2.5, 3]);
  const stopRange = parseRange(getArg('stop-range'), [0.5, 1, 1.5, 2]);
  const targetRange = parseRange(getArg('target-range'), [1, 1.5, 2, 2.5, 3]);
  
  const entryStrategy = (getArg('entry') || 'drop_from_open') as EntryStrategy;
  const stopStrategy = (getArg('stop') || 'fixed_percent') as StopLossStrategy;
  const targetStrategy = (getArg('target') || 'fixed_rr') as TargetStrategy;
  const direction = (getArg('direction') || 'long') as 'long' | 'short' | 'both';
  const positionSize = parseFloat(getArg('size') || '10000');
  const maxDailyTrades = parseInt(getArg('max-trades') || '5');
  
  const sortBy = (getArg('sort') || 'pnl') as 'pnl' | 'winRate' | 'profitFactor';
  const topN = parseInt(getArg('top') || '10');
  const outputFile = getArg('output') || 'grid_search_results.json';
  
  const totalCombinations = entryRange.length * stopRange.length * targetRange.length;
  
  console.log('🔍 Grid Search - Parameter Optimization\n');
  console.log('Configuration:');
  console.log(`  Period: ${fromDate} to ${toDate}`);
  console.log(`  Entry Strategy: ${entryStrategy}`);
  console.log(`  Entry Thresholds: [${entryRange.join(', ')}]`);
  console.log(`  Stop Strategy: ${stopStrategy}`);
  console.log(`  Stop Values: [${stopRange.join(', ')}]`);
  console.log(`  Target Strategy: ${targetStrategy}`);
  console.log(`  Target Values: [${targetRange.join(', ')}]`);
  console.log(`  Direction: ${direction}`);
  console.log(`  Total Combinations: ${totalCombinations}`);
  console.log(`  Sort By: ${sortBy}\n`);
  
  const results: GridSearchResult[] = [];
  let completed = 0;
  const startTime = Date.now();
  
  for (const entryThreshold of entryRange) {
    for (const stopValue of stopRange) {
      for (const targetValue of targetRange) {
        completed++;
        console.log(`\n[${ completed}/${totalCombinations}] Testing: entry=${entryThreshold}%, stop=${stopValue}%, target=${targetValue}`);
        
        const config: FlexibleBacktestConfig = {
          startDate: fromDate,
          endDate: toDate,
          entryStrategy,
          entryThreshold,
          entryTiming: 'immediate',
          stopLossStrategy: stopStrategy,
          stopLossValue: stopValue,
          targetStrategy,
          targetValue,
          positionSize,
          maxDailyTrades,
          direction,
          minPrice: 20,
          maxPrice: 500,
          tradingWindowStart: 30,
          tradingWindowEnd: 330,
          useSpyFilter: false,
          symbols: LARGE_CAP_SYMBOLS,
          commissionPerTrade: 1,
          slippageBps: 2
        };
        
        try {
          const result = await runFlexibleBacktest(config);
          results.push({
            config,
            summary: result.summary
          });
        } catch (error) {
          console.error(`  Error: ${error}`);
        }
      }
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  results.sort((a, b) => {
    switch (sortBy) {
      case 'pnl':
        return b.summary.totalPnL - a.summary.totalPnL;
      case 'winRate':
        return b.summary.winRate - a.summary.winRate;
      case 'profitFactor':
        return b.summary.profitFactor - a.summary.profitFactor;
      default:
        return b.summary.totalPnL - a.summary.totalPnL;
    }
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`GRID SEARCH COMPLETE - ${results.length} combinations tested in ${elapsed.toFixed(0)}s`);
  console.log('='.repeat(80));
  
  console.log(`\n🏆 TOP ${Math.min(topN, results.length)} RESULTS (sorted by ${sortBy}):\n`);
  console.log('Rank | Entry% | Stop% | Target | Trades | Win% | P&L | PF | MaxDD');
  console.log('-'.repeat(80));
  
  const topResults = results.slice(0, topN);
  topResults.forEach((r, i) => {
    const { config, summary } = r;
    console.log(
      `${String(i + 1).padStart(4)} | ` +
      `${config.entryThreshold.toFixed(1).padStart(5)}% | ` +
      `${config.stopLossValue.toFixed(1).padStart(4)}% | ` +
      `${config.targetValue.toFixed(1).padStart(5)} | ` +
      `${String(summary.totalTrades).padStart(6)} | ` +
      `${summary.winRate.toFixed(0).padStart(3)}% | ` +
      `$${summary.totalPnL.toFixed(0).padStart(6)} | ` +
      `${summary.profitFactor.toFixed(2).padStart(4)} | ` +
      `$${summary.maxDrawdown.toFixed(0)}`
    );
  });
  
  if (results.length > 0) {
    const best = results[0];
    console.log('\n📌 BEST CONFIGURATION:');
    console.log(`  Entry: ${best.config.entryStrategy} @ ${best.config.entryThreshold}%`);
    console.log(`  Stop: ${best.config.stopLossStrategy} @ ${best.config.stopLossValue}%`);
    console.log(`  Target: ${best.config.targetStrategy} @ ${best.config.targetValue}`);
    console.log(`  Results: ${best.summary.totalTrades} trades, ${best.summary.winRate.toFixed(1)}% WR, $${best.summary.totalPnL.toFixed(2)} P&L`);
  }
  
  const profitable = results.filter(r => r.summary.totalPnL > 0);
  const avgWinRate = results.reduce((sum, r) => sum + r.summary.winRate, 0) / results.length;
  const avgPnL = results.reduce((sum, r) => sum + r.summary.totalPnL, 0) / results.length;
  
  console.log('\n📊 SUMMARY STATISTICS:');
  console.log(`  Profitable Configs: ${profitable.length}/${results.length} (${((profitable.length / results.length) * 100).toFixed(0)}%)`);
  console.log(`  Average Win Rate: ${avgWinRate.toFixed(1)}%`);
  console.log(`  Average P&L: $${avgPnL.toFixed(2)}`);
  
  const output = {
    searchParams: {
      fromDate,
      toDate,
      entryStrategy,
      entryRange,
      stopStrategy,
      stopRange,
      targetStrategy,
      targetRange,
      direction,
      positionSize,
      maxDailyTrades
    },
    stats: {
      totalCombinations,
      profitableCombinations: profitable.length,
      avgWinRate,
      avgPnL,
      searchTimeSeconds: elapsed
    },
    results: results.map((r, i) => ({
      rank: i + 1,
      entryThreshold: r.config.entryThreshold,
      stopValue: r.config.stopLossValue,
      targetValue: r.config.targetValue,
      ...r.summary
    }))
  };
  
  const outputPath = path.resolve(__dirname, '../../../', outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Full results saved to ${outputPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Grid search failed:', error);
  process.exit(1);
});
