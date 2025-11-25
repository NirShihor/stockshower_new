import { BacktestCandle } from '../types/backtestTypes.js';
import { fetchHistoricalBars } from '../../handlers/polygonAPI.js';

export class HistoricalDataLoader {
  private cache: Map<string, BacktestCandle[]> = new Map();
  private cacheKey(symbol: string, startDate: Date, endDate: Date, timeframe: string): string {
    return `${symbol}_${startDate.toISOString()}_${endDate.toISOString()}_${timeframe}`;
  }

  async loadData(
    symbol: string, 
    startDate: Date, 
    endDate: Date,
    timeframe: string = '1'
  ): Promise<BacktestCandle[]> {
    const cacheKey = this.cacheKey(symbol, startDate, endDate, timeframe);
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log(`Using cached data for ${symbol}`);
      return this.cache.get(cacheKey)!;
    }

    console.log(`Loading historical data for ${symbol} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
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
        parseInt(timeframe)
      );

      // Convert to backtest candle format
      const candles: BacktestCandle[] = rawData.map(candle => ({
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
        const candles = await this.loadData(symbol, startDate, endDate, timeframe);
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