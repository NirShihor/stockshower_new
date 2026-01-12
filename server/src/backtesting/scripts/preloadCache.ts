import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { preloadCache, getCacheStats } from '../cache/dataCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const LARGE_CAP_SYMBOLS = [
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'TSLA', 'BRK.B', 'UNH', 'JNJ',
  'JPM', 'V', 'PG', 'XOM', 'HD', 'CVX', 'MA', 'ABBV', 'MRK', 'LLY',
  'PEP', 'KO', 'PFE', 'COST', 'TMO', 'AVGO', 'MCD', 'WMT', 'CSCO', 'ACN',
  'ABT', 'DHR', 'BAC', 'CRM', 'ADBE', 'CMCSA', 'NKE', 'DIS', 'VZ', 'INTC',
  'NFLX', 'PM', 'TXN', 'WFC', 'AMD', 'NEE', 'RTX', 'UPS', 'HON', 'QCOM'
];

function printUsage() {
  console.log(`
Preload Data Cache - Download Polygon data for fast backtesting

Usage: npx tsx src/backtesting/scripts/preloadCache.ts [options]

Options:
  --from=<date>       Start date YYYY-MM-DD (default: 2024-01-01)
  --to=<date>         End date YYYY-MM-DD (default: 2024-12-31)
  --symbols=<list>    Comma-separated symbols (default: 50 large caps)
  --stats             Show cache stats only, don't download
  --help              Show this help

Examples:
  # Preload all 2024 data
  npx tsx src/backtesting/scripts/preloadCache.ts --from=2024-01-01 --to=2024-12-31

  # Preload specific symbols
  npx tsx src/backtesting/scripts/preloadCache.ts --symbols=AAPL,MSFT,GOOGL --from=2024-01-01 --to=2024-06-30

  # Check cache stats
  npx tsx src/backtesting/scripts/preloadCache.ts --stats
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  if (args.includes('--stats')) {
    const stats = getCacheStats();
    console.log('\n📊 Cache Statistics:');
    console.log(`   Intraday files: ${stats.intradayFiles}`);
    console.log(`   Daily files: ${stats.dailyFiles}`);
    console.log(`   Total size: ${(stats.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
    process.exit(0);
  }
  
  if (!process.env.POLYGON_API_KEY) {
    console.error('POLYGON_API_KEY not set');
    process.exit(1);
  }
  
  const getArg = (name: string): string | undefined => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
  };
  
  const fromDate = getArg('from') || '2024-01-01';
  const toDate = getArg('to') || '2024-12-31';
  const symbolsArg = getArg('symbols');
  const symbols = symbolsArg ? symbolsArg.split(',') : LARGE_CAP_SYMBOLS;
  
  console.log('📥 Preloading Data Cache\n');
  console.log(`   Period: ${fromDate} to ${toDate}`);
  console.log(`   Symbols: ${symbols.length}`);
  
  const startTime = Date.now();
  let lastUpdate = Date.now();
  
  const result = await preloadCache(symbols, fromDate, toDate, (current, total, symbol, date) => {
    const now = Date.now();
    if (now - lastUpdate > 1000) {
      const pct = ((current / total) * 100).toFixed(1);
      const elapsed = ((now - startTime) / 1000).toFixed(0);
      const rate = current / ((now - startTime) / 1000);
      const remaining = ((total - current) / rate).toFixed(0);
      process.stdout.write(`\r   [${pct}%] ${symbol} ${date} - ${elapsed}s elapsed, ~${remaining}s remaining    `);
      lastUpdate = now;
    }
  });
  
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log(`\n\n✅ Cache preload complete in ${elapsed} minutes`);
  console.log(`   Success: ${result.success}`);
  console.log(`   Failed: ${result.failed}`);
  
  const stats = getCacheStats();
  console.log(`\n📊 Cache size: ${(stats.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
  
  process.exit(0);
}

main().catch(error => {
  console.error('Preload failed:', error);
  process.exit(1);
});
