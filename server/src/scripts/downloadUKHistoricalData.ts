import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
import { UK_UNIVERSE } from '../services/relativeStrengthService.js';

const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical'] });

interface CachedCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolCache {
  symbol: string;
  exchange: string;
  dataSource: 'yahoo';
  downloadedAt: string;
  startDate: string;
  endDate: string;
  candleCount: number;
  candles: CachedCandle[];
}

const CACHE_DIR = path.join(process.cwd(), 'data', 'uk_historical');
const BATCH_SIZE = 10;  // Symbols per batch
const BATCH_DELAY_MS = 2000;  // 2 seconds between batches
const REQUEST_DELAY_MS = 500;  // 0.5 seconds between individual requests

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Created cache directory: ${CACHE_DIR}`);
  }
}

function getCacheFilePath(symbol: string): string {
  return path.join(CACHE_DIR, `${symbol.toUpperCase()}.json`);
}

function isSymbolCached(symbol: string, startDate: string, endDate: string): boolean {
  const filePath = getCacheFilePath(symbol);
  if (!fs.existsSync(filePath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SymbolCache;
    // Check if cached data covers the requested date range
    return data.startDate <= startDate && data.endDate >= endDate && data.candleCount > 0;
  } catch {
    return false;
  }
}

async function downloadSymbolData(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<{ success: boolean; candleCount: number; error?: string }> {
  // Yahoo Finance uses .L suffix for LSE stocks
  const yahooSymbol = `${symbol.toUpperCase()}.L`;

  try {
    console.log(`  Fetching ${yahooSymbol}...`);

    const result = await yahooFinance.historical(yahooSymbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!result || result.length === 0) {
      return { success: false, candleCount: 0, error: 'No data returned' };
    }

    // Convert to our cache format
    const candles: CachedCandle[] = result.map(bar => ({
      date: bar.date.toISOString().split('T')[0],
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume
    }));

    // Sort by date ascending
    candles.sort((a, b) => a.date.localeCompare(b.date));

    const cacheData: SymbolCache = {
      symbol: symbol.toUpperCase(),
      exchange: 'LSE',
      dataSource: 'yahoo',
      downloadedAt: new Date().toISOString(),
      startDate,
      endDate,
      candleCount: candles.length,
      candles
    };

    // Save to file
    const filePath = getCacheFilePath(symbol);
    fs.writeFileSync(filePath, JSON.stringify(cacheData, null, 2));

    return { success: true, candleCount: candles.length };
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    return { success: false, candleCount: 0, error: errorMsg };
  }
}

async function downloadAllUKData(
  startDate: string,
  endDate: string,
  forceRedownload: boolean = false
): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('UK HISTORICAL DATA DOWNLOAD (Yahoo Finance)');
  console.log('='.repeat(70));
  console.log(`Date range: ${startDate} to ${endDate}`);
  console.log(`Symbols to download: ${UK_UNIVERSE.length}`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  console.log(`Batch size: ${BATCH_SIZE} symbols`);
  console.log(`Batch delay: ${BATCH_DELAY_MS / 1000}s`);
  console.log('='.repeat(70) + '\n');

  ensureCacheDir();

  // Check which symbols need downloading
  const symbolsToDownload: string[] = [];
  const alreadyCached: string[] = [];

  for (const symbol of UK_UNIVERSE) {
    if (!forceRedownload && isSymbolCached(symbol, startDate, endDate)) {
      alreadyCached.push(symbol);
    } else {
      symbolsToDownload.push(symbol);
    }
  }

  console.log(`Already cached: ${alreadyCached.length} symbols`);
  console.log(`To download: ${symbolsToDownload.length} symbols\n`);

  if (symbolsToDownload.length === 0) {
    console.log('All symbols already cached. Use --force to redownload.');
    return;
  }

  // Estimate time
  const totalBatches = Math.ceil(symbolsToDownload.length / BATCH_SIZE);
  const estimatedMinutes = Math.ceil((totalBatches * BATCH_DELAY_MS) / 60000);
  console.log(`Estimated time: ~${estimatedMinutes} minutes\n`);

  // Download in batches
  let successCount = 0;
  let failCount = 0;
  const failures: { symbol: string; error: string }[] = [];

  for (let i = 0; i < symbolsToDownload.length; i += BATCH_SIZE) {
    const batch = symbolsToDownload.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\nBatch ${batchNum}/${totalBatches}:`);

    for (const symbol of batch) {
      const result = await downloadSymbolData(symbol, startDate, endDate);

      if (result.success) {
        console.log(`    ✓ ${symbol}: ${result.candleCount} candles`);
        successCount++;
      } else {
        console.log(`    ✗ ${symbol}: ${result.error}`);
        failCount++;
        failures.push({ symbol, error: result.error || 'Unknown' });
      }

      // Small delay between requests within a batch
      await sleep(REQUEST_DELAY_MS);
    }

    // Delay between batches (except for last batch)
    if (i + BATCH_SIZE < symbolsToDownload.length) {
      console.log(`  Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('DOWNLOAD COMPLETE');
  console.log('='.repeat(70));
  console.log(`Successfully downloaded: ${successCount} symbols`);
  console.log(`Failed: ${failCount} symbols`);
  console.log(`Already cached: ${alreadyCached.length} symbols`);
  console.log(`Total available: ${successCount + alreadyCached.length} / ${UK_UNIVERSE.length}`);

  if (failures.length > 0) {
    console.log('\nFailed symbols:');
    for (const f of failures) {
      console.log(`  ${f.symbol}: ${f.error}`);
    }
  }

  console.log('\n' + '='.repeat(70));
}

function showCacheStats(): void {
  ensureCacheDir();

  console.log('\n' + '='.repeat(70));
  console.log('UK DATA CACHE STATISTICS');
  console.log('='.repeat(70));

  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  console.log(`Cached symbols: ${files.length}`);

  let totalCandles = 0;
  let minDate = '9999-99-99';
  let maxDate = '0000-00-00';

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8')) as SymbolCache;
      totalCandles += data.candleCount;
      if (data.candles.length > 0) {
        const firstDate = data.candles[0].date;
        const lastDate = data.candles[data.candles.length - 1].date;
        if (firstDate < minDate) minDate = firstDate;
        if (lastDate > maxDate) maxDate = lastDate;
      }
    } catch {
      // Skip invalid files
    }
  }

  console.log(`Total candles: ${totalCandles.toLocaleString()}`);
  console.log(`Date range: ${minDate} to ${maxDate}`);
  console.log(`Cache location: ${CACHE_DIR}`);
  console.log('='.repeat(70) + '\n');
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'download';

if (command === 'stats') {
  showCacheStats();
} else if (command === 'download') {
  const startDate = args[1] || '2024-01-01';
  const endDate = args[2] || '2024-12-31';
  const forceRedownload = args.includes('--force');

  downloadAllUKData(startDate, endDate, forceRedownload)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Download failed:', err);
      process.exit(1);
    });
} else {
  console.log('Usage:');
  console.log('  npx tsx src/scripts/downloadUKHistoricalData.ts download [startDate] [endDate] [--force]');
  console.log('  npx tsx src/scripts/downloadUKHistoricalData.ts stats');
  console.log('\nExamples:');
  console.log('  npx tsx src/scripts/downloadUKHistoricalData.ts download 2024-01-01 2024-12-31');
  console.log('  npx tsx src/scripts/downloadUKHistoricalData.ts download 2024-01-01 2024-12-31 --force');
  console.log('  npx tsx src/scripts/downloadUKHistoricalData.ts stats');
}
