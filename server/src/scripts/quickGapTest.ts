import { backtestGapAndGo, BacktestConfig } from '../momentum/gapAndGoStrategy.js';

async function runQuickTest() {
  const baseConfig: BacktestConfig = {
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

  const tests = [
    { name: 'Delayed Entry (baseline)', config: {} },
    { name: 'Immediate Entry', config: { delayedEntry: false } },
    { name: 'Higher Gap 10%', config: { minGapPercent: 10 } },
  ];

  console.log('=== QUICK GAP AND GO COMPARISON ===\n');

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    const config = { ...baseConfig, ...test.config };
    const result = await backtestGapAndGo(config);
    console.log(`WR: ${result.summary.winRate.toFixed(1)}% | PF: ${result.summary.profitFactor.toFixed(2)} | P&L: $${result.summary.totalPnL.toFixed(0)} | Trades: ${result.summary.totalTrades}`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

runQuickTest().catch(console.error);
