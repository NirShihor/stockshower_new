import { BacktestCandle } from '../types/backtestTypes.js';
import { fetchHistoricalBars } from '../../handlers/polygonAPI.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HistoricalDataLoader {
  private cache: Map<string, BacktestCandle[]> = new Map();
  private source: 'polygon' | 'local' = 'polygon';

  constructor(source: 'polygon' | 'local' = 'polygon') {
    this.source = source;
  }

  private cacheKey(symbol: string, startDate: Date, endDate: Date, timeframe: string): string {
    return `${symbol}_${startDate.toISOString()}_${endDate.toISOString()}_${timeframe}`;
  }

  async loadData(
    symbol: string, 
    startDate: Date, 
    endDate: Date,
    timeframe: string = '1',
    source: 'polygon' | 'local' = 'polygon'
  ): Promise<BacktestCandle[]> {
    const cacheKey = this.cacheKey(symbol, startDate, endDate, timeframe) + `_${source}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`Using cached data for ${symbol} (${source})`);
      return this.cache.get(cacheKey)!;
    }

    if (source === 'local') {
      return this.loadDataFromLocal(symbol, startDate, endDate, timeframe);
    }

    console.log(`Loading historical data for ${symbol} from Polygon (${startDate.toISOString()} to ${endDate.toISOString()})`);
    
    try {
      // Use existing Polygon API handler
      const apiKey = process.env.POLYGON_API_KEY;
      if (!apiKey) {
        throw new Error('POLYGON_API_KEY not set in environment variables');
      }
      
      const rawData = await fetchHistoricalBars(
        apiKey,
        symbol,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        'minute',
        parseInt(timeframe),
        50000 // Increase limit to 50k
      );

      // Convert to backtest candle format
      const candles: BacktestCandle[] = rawData.map(candle => ({
        symbol: symbol,
        timestamp: new Date(candle.start),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
        vwap: undefined
      }));

      // Sort by timestamp
      candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Cache the result
      this.cache.set(cacheKey, candles);

      console.log(`Loaded ${candles.length} candles for ${symbol}`);
      return candles;

    } catch (error) {
      console.error(`Failed to load data for ${symbol}:`, error);
      throw new Error(`Failed to load historical data for ${symbol}: ${error}`);
    }
  }

  private async loadDataFromLocal(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: string
  ): Promise<BacktestCandle[]> {
    const exportDir = path.resolve(__dirname, '../../../exports');
    if (!fs.existsSync(exportDir)) {
      throw new Error(`Export directory not found: ${exportDir}`);
    }

    // Look for a file that matches symbol and roughly the date range
    // Combine all files that overlap with the requested range
    const files = fs.readdirSync(exportDir).filter(f => f.startsWith(`${symbol}_`) && f.endsWith('.json'));
    
    if (files.length === 0) {
      throw new Error(`No local data file found for ${symbol} in ${exportDir}`);
    }

    // Define a type for the raw candle data from local files
    type RawLocalCandle = {
      start?: string; // For Polygon-like exports
      timestamp?: string; // For other exports
      open: number;
      high: number;
      low: number;
      close: number;
      volume?: number;
      vwap?: number;
    };

    const allRawCandles: RawLocalCandle[] = [];
    console.log(`📖 Scanning local data for ${symbol}...`);

    for (const file of files) {
      const parts = file.split('_');
      if (parts.length >= 4) {
        const fileStart = new Date(parts[1]).getTime();
        // If this file has any overlap with our requested range
        // Treat fileEnd as the end of THAT day for matching purposes
        const fileEndDate = new Date(parts[3].replace('.json', ''));
        fileEndDate.setHours(23, 59, 59, 999);
        const fileEndTime = fileEndDate.getTime();

        const hasOverlap = Math.max(startDate.getTime(), fileStart) <= Math.min(endDate.getTime(), fileEndTime);

        if (hasOverlap) {
          const filepath = path.join(exportDir, file);
          const rawContent = fs.readFileSync(filepath, 'utf8');
          const rawCandles: RawLocalCandle[] = JSON.parse(rawContent);
          
          // Filter to only include candles within the requested range
          const filtered = rawCandles.filter(c => {
            const time = new Date(c.start || c.timestamp!).getTime();
            return time >= startDate.getTime() && time <= endDate.getTime();
          });
          
          allRawCandles.push(...filtered);
        }
      }
    }

    if (allRawCandles.length === 0) {
      console.warn(`⚠️ No candles found in overlapping files for ${symbol}`);
      return [];
    }

    // Deduplicate and sort
    const uniqueCandlesMap = new Map<number, RawLocalCandle>(); // Use timestamp as key for deduplication
    allRawCandles.forEach(c => {
      const timestamp = new Date(c.start || c.timestamp!).getTime();
      uniqueCandlesMap.set(timestamp, c);
    });
    
    const sortedRawCandles = Array.from(uniqueCandlesMap.values())
      .sort((a, b) => new Date(a.start || a.timestamp!).getTime() - new Date(b.start || b.timestamp!).getTime());

    // Convert to BacktestCandle format
    const candles: BacktestCandle[] = sortedRawCandles
      .map((c: RawLocalCandle) => ({
        symbol: symbol,
        timestamp: new Date(c.start || c.timestamp!),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
        vwap: c.vwap
      }))
      .filter((c: BacktestCandle) => 
        c.timestamp.getTime() >= startDate.getTime() && 
        c.timestamp.getTime() <= endDate.getTime()
      );

    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    console.log(`✅ Loaded ${candles.length} local candles for ${symbol}`);
    return candles;
  }

  async loadMultipleSymbols(
    symbols: string[],
    startDate: Date,
    endDate: Date,
    timeframe: string = '1'
  ): Promise<Map<string, BacktestCandle[]>> {
    const results = new Map<string, BacktestCandle[]>();
    
    // Load data for each symbol
    for (const symbol of symbols) {
      try {
        const candles = await this.loadData(symbol, startDate, endDate, timeframe, this.source || 'polygon');
        results.set(symbol, candles);
      } catch (error) {
        console.error(`Skipping ${symbol} due to error:`, error);
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  // Aggregate 1-minute candles to 5-minute candles
  aggregateCandles(candles: BacktestCandle[], targetMinutes: number = 5): BacktestCandle[] {
    if (candles.length === 0) return [];

    const aggregated: BacktestCandle[] = [];
    let currentBucket: BacktestCandle[] = [];
    let bucketStart: Date | null = null;

    for (const candle of candles) {
      const candleMinute = candle.timestamp.getMinutes();
      const bucketMinute = Math.floor(candleMinute / targetMinutes) * targetMinutes;
      
      const expectedBucketStart = new Date(candle.timestamp);
      expectedBucketStart.setMinutes(bucketMinute, 0, 0);

      // Start new bucket if needed
      if (!bucketStart || expectedBucketStart.getTime() !== bucketStart.getTime()) {
        // Process previous bucket
        if (currentBucket.length > 0) {
          aggregated.push(this.mergeCandles(currentBucket, bucketStart!));
        }
        
        // Start new bucket
        bucketStart = expectedBucketStart;
        currentBucket = [candle];
      } else {
        currentBucket.push(candle);
      }
    }

    // Process final bucket
    if (currentBucket.length > 0 && bucketStart) {
      aggregated.push(this.mergeCandles(currentBucket, bucketStart));
    }

    return aggregated;
  }

  private mergeCandles(candles: BacktestCandle[], timestamp: Date): BacktestCandle {
    const open = candles[0].open;
    const close = candles[candles.length - 1].close;
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const volume = candles.reduce((sum, c) => sum + c.volume, 0);
    
    // Calculate VWAP if available
    let vwap: number | undefined;
    if (candles.every(c => c.vwap !== undefined)) {
      const totalValue = candles.reduce((sum, c) => sum + (c.vwap! * c.volume), 0);
      vwap = volume > 0 ? totalValue / volume : close;
    }

    return {
      symbol: candles[0].symbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      vwap
    };
  }

  // Get candles for a specific time window
  getTimeWindow(
    candles: BacktestCandle[], 
    currentTime: Date, 
    lookbackMinutes: number
  ): BacktestCandle[] {
    const startTime = new Date(currentTime.getTime() - lookbackMinutes * 60 * 1000);
    return candles.filter(c => 
      c.timestamp.getTime() > startTime.getTime() && 
      c.timestamp.getTime() <= currentTime.getTime()
    );
  }
}