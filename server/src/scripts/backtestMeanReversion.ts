import { backtestMeanReversion, MeanReversionBacktestConfig } from '../momentum/meanReversionStrategy.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('📉 Mean Reversion Strategy Backtest\n');
  console.log('Strategy Rules:');
  console.log('  1. Scan large caps for 2-3% intraday drops');
  console.log('  2. Enter when price is below VWAP');
  console.log('  3. Target: Reversion to VWAP or opening price');
  console.log('  4. Stop loss: 1.5% below entry');
  console.log('  5. Trading window: 10:30 AM - 3:00 PM EST\n');
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
  const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
  const minDropArg = args.find(a => a.startsWith('--min-drop='))?.split('=')[1];
  const targetArg = args.find(a => a.startsWith('--target='))?.split('=')[1] as 'vwap' | 'open' | 'fixed' | undefined;
  const stopLossArg = args.find(a => a.startsWith('--stop-loss='))?.split('=')[1];
  const noSpyFilter = args.includes('--no-spy-filter');
  const spyThresholdArg = args.find(a => a.startsWith('--spy-threshold='))?.split('=')[1];
  const greenSpyOnly = args.includes('--green-spy-only');
  
  const endDate = toArg || new Date().toISOString().split('T')[0];
  const startDate = fromArg || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  
  const config: MeanReversionBacktestConfig = {
    startDate,
    endDate,
    positionSize: 10000,
    maxDailyTrades: 5,
    minDropPercent: minDropArg ? parseFloat(minDropArg) : 2,
    maxDropPercent: 8,
    stopLossPercent: stopLossArg ? parseFloat(stopLossArg) : 1.5,
    targetType: targetArg || 'vwap',
    fixedTargetPercent: 1.5,
    minPrice: 20,
    maxPrice: 500,
    minScore: 40,
    useSpyFilter: !noSpyFilter,
    maxSpyDropPercent: spyThresholdArg ? parseFloat(spyThresholdArg) : 1.5,
    requireGreenSpy: greenSpyOnly
  };
  
  console.log(`Period: ${config.startDate} to ${config.endDate}`);
  console.log(`Min Drop: ${config.minDropPercent}%`);
  console.log(`Target: ${config.targetType}`);
  console.log(`Stop Loss: ${config.stopLossPercent}%`);
  console.log(`SPY Filter: ${config.useSpyFilter ? (config.requireGreenSpy ? 'ON (green SPY only)' : `ON (skip if SPY < -${config.maxSpyDropPercent}%)`) : 'OFF'}\n`);
  
  const result = await backtestMeanReversion(config);
  
  const outputPath = path.resolve(__dirname, '../../mean_reversion_backtest_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
