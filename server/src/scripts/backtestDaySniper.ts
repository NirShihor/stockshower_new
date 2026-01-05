import { backtestDaySniper, DaySniperBacktestConfig } from '../momentum/daySniperStrategy.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('🎯 Day Sniper Strategy Backtest (Kratter - Day Trading Made Easy)\n');
  console.log('Strategy Rules:');
  console.log('  1. Find stock gapping up above 20-day high');
  console.log('  2. Wait 15 minutes after market open');
  console.log('  3. Enter at limit order = close of first 15-min candle');
  console.log('  4. Stop loss = low of first 15-min candle');
  console.log('  5. Hold until end of day (sell 1-2 min before close)');
  console.log('  6. Cancel order if not filled within 15 minutes\n');
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
  const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
  const minGapArg = args.find(a => a.startsWith('--min-gap='))?.split('=')[1];
  
  const endDate = toArg || new Date().toISOString().split('T')[0];
  const startDate = fromArg || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  
  const config: DaySniperBacktestConfig = {
    startDate,
    endDate,
    positionSize: 10000,
    maxDailyTrades: 2,
    minScore: 40,
    minGapPercent: minGapArg ? parseFloat(minGapArg) : 2,
    maxGapPercent: 50,
    minPrice: 20,
    maxPrice: 500
  };
  
  console.log(`Period: ${config.startDate} to ${config.endDate}`);
  console.log(`Min Gap: ${config.minGapPercent}%\n`);
  
  const result = await backtestDaySniper(config);
  
  const outputPath = path.resolve(__dirname, '../../day_sniper_backtest_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
