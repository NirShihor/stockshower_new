import { backtestGapAndGo, TradeExitConfig } from '../momentum/gapAndGoStrategy.js';

async function runTest() {
  const config = {
    startDate: '2024-10-01',
    endDate: '2024-10-31',
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

  console.log('Testing ORIGINAL Gap and Go strategy (2:1 target, no trailing, no partial)...\n');

  const result = await backtestGapAndGo(config);

  console.log('\n========================================');
  console.log('ORIGINAL RESULTS (Oct 2024)');
  console.log('========================================');
  console.log(`Trades: ${result.summary.totalTrades}`);
  console.log(`Win Rate: ${result.summary.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${result.summary.profitFactor.toFixed(2)}`);
  console.log(`Total P&L: $${result.summary.totalPnL.toFixed(0)}`);
  console.log(`Avg Win: $${result.summary.avgWin.toFixed(0)}`);
  console.log(`Avg Loss: $${result.summary.avgLoss.toFixed(0)}`);
  console.log(`Max Drawdown: $${result.summary.maxDrawdown.toFixed(0)}`);
}

runTest().catch(console.error);
