import { runSwingBacktest, SWING_SYMBOLS } from '../engine/swingBacktestEngine.js';
import fs from 'fs';

async function main() {
  const args = process.argv.slice(2);
  
  let startDate = '2023-01-01';
  let endDate = '2025-12-31';
  let useAI = false;
  
  for (const arg of args) {
    if (arg.startsWith('--from=')) startDate = arg.split('=')[1];
    if (arg.startsWith('--to=')) endDate = arg.split('=')[1];
    if (arg === '--use-ai') useAI = true;
  }
  
  console.log(`\nRunning Swing Trading Backtest`);
  console.log(`From: ${startDate} To: ${endDate}`);
  console.log(`AI Mode: ${useAI ? 'ON (will be slower and cost API credits)' : 'OFF (rule-based)'}`);
  console.log('');
  
  const result = await runSwingBacktest({
    startDate,
    endDate,
    symbols: SWING_SYMBOLS,
    maxHoldDays: 5,
    positionSize: 10000,
    maxConcurrentTrades: 10,
    maxDailyTrades: 5,
    useAI,
    stopLossPercent: 3,
    targetPercent: 6
  });
  
  const outputPath = './swing_backtest_results.json';
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
}

main().catch(console.error);
