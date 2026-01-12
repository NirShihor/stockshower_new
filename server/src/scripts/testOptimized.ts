import { backtestGapAndGo } from '../momentum/gapAndGoStrategy.js';
import fs from 'fs';

async function runTest() {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2025-07-01';
  const endDate = args[1] || '2025-12-31';

  const config = {
    startDate,
    endDate,
    positionSize: 10000,
    maxDailyTrades: 5,
    minScore: 50,
    minGapPercent: 5,
    maxGapPercent: 100,
    minPrice: 1,
    maxPrice: 20,
    maxFloat: 50000000,
    largeCapsOnly: false,
    delayedEntry: true
  };

  console.log('Testing OPTIMIZED Gap and Go strategy...');
  console.log(`Period: ${startDate} to ${endDate}`);
  console.log('Features: 1.5:1 target, trailing stop, partial exit at 11:30am\n');

  const result = await backtestGapAndGo(config);

  console.log('\n========================================');
  console.log(`OPTIMIZED RESULTS (${startDate} to ${endDate})`);
  console.log('========================================');
  console.log(`Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(0)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(0)}`);
  console.log(`Avg Loss: $${result.summary.avgLoss.toFixed(0)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(0)}`);
  console.log(`Best Trade: $${result.summary.bestTrade.toFixed(0)}`);
  console.log(`Worst Trade: $${result.summary.worstTrade.toFixed(0)}`);

  const exitReasons: Record<string, { count: number; pnl: number }> = {};
  for (const trade of result.trades) {
    const reason = trade.exitReason || 'unknown';
    if (!exitReasons[reason]) {
      exitReasons[reason] = { count: 0, pnl: 0 };
    }
    exitReasons[reason].count++;
    exitReasons[reason].pnl += trade.pnl || 0;
  }

  console.log('\n--- Exit Reasons ---');
  for (const [reason, stats] of Object.entries(exitReasons)) {
    console.log(`${reason}: ${stats.count} trades, $${stats.pnl.toFixed(0)} P&L`);
  }

  fs.writeFileSync('./gap_optimized_results.json', JSON.stringify(result, null, 2));
  console.log('\nResults saved to gap_optimized_results.json');
}

runTest().catch(console.error);
