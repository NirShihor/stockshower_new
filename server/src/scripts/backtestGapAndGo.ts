import { backtestGapAndGo, BacktestConfig } from '../momentum/gapAndGoStrategy.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  console.log('🚀 Gap and Go Strategy Backtest\n');
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set in environment');
    process.exit(1);
  }
  
  // Parse command line args
  const args = process.argv.slice(2);
  const fromArg = args.find(a => a.startsWith('--from='))?.split('=')[1];
  const toArg = args.find(a => a.startsWith('--to='))?.split('=')[1];
  const minGapArg = args.find(a => a.startsWith('--min-gap='))?.split('=')[1];
  const largeCapsOnly = args.includes('--large-caps');
  
  // Default to last month if not specified
  const endDate = toArg || new Date().toISOString().split('T')[0];
  const startDate = fromArg || (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  })();
  
  const config: BacktestConfig = {
    startDate,
    endDate,
    positionSize: 10000,
    maxDailyTrades: 5,       // Max 5 trades per day
    minScore: 50,            // Minimum setup score
    minGapPercent: minGapArg ? parseFloat(minGapArg) : (largeCapsOnly ? 1.5 : 5),  // Lower gap threshold for large caps (they gap less)
    maxGapPercent: 100,      // No max gap
    minPrice: largeCapsOnly ? 20 : 1,      // Higher min price for large caps
    maxPrice: largeCapsOnly ? 500 : 20,    // Higher max price for large caps
    maxFloat: largeCapsOnly ? undefined : 50000000, // No float filter for large caps
    largeCapsOnly
  };
  
  if (largeCapsOnly) {
    console.log('🏢 LARGE CAPS ONLY MODE (FxPro compatible stocks)\n');
  }
  
  console.log(`Period: ${config.startDate} to ${config.endDate}\n`);
  
  const result = await backtestGapAndGo(config);
  
  // Save results
  const outputPath = path.resolve(__dirname, '../../gap_and_go_backtest_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Backtest failed:', error);
  process.exit(1);
});
