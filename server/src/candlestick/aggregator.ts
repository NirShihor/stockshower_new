import { Candle } from './types/index.js';

interface CandleAggregate {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  start: string;
  periodStart: number; // 5-minute period timestamp
}

const aggregatesBySymbol = new Map<string, CandleAggregate>();

function get5MinPeriodStart(timestamp: Date): Date {
  const periodStart = new Date(timestamp);
  const minutes = periodStart.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  
  periodStart.setMinutes(roundedMinutes);
  periodStart.setSeconds(0);
  periodStart.setMilliseconds(0);
  
  return periodStart;
}

export function aggregate1MinTo5Min(
  candle: Candle,
  onComplete: (aggregatedCandle: Candle) => void
): void {
  const { symbol } = candle;
  const candleTime = new Date(candle.start);
  const periodStart = get5MinPeriodStart(candleTime);
  const periodKey = `${symbol}-${periodStart.getTime()}`;
  
  console.log(`[AGGREGATOR] Processing ${symbol} candle at ${candle.start}, period: ${periodStart.toISOString()}`);
  
  const existing = aggregatesBySymbol.get(periodKey);
  
  if (!existing) {
    console.log(`[AGGREGATOR] Starting new 5m period for ${symbol}: ${periodStart.toISOString()}`);
    // Start new 5-minute period
    aggregatesBySymbol.set(periodKey, {
      symbol,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume || 0,
      start: periodStart.toISOString(),
      periodStart: periodStart.getTime()
    });
    
    // Check if we need to complete any previous periods
    checkForCompletedPeriods(symbol, periodStart.getTime(), onComplete);
  } else {
    console.log(`[AGGREGATOR] Updating existing 5m period for ${symbol}: ${periodStart.toISOString()}`);
    // Update existing 5-minute period
    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close; // Latest close
    existing.volume += candle.volume || 0;
  }
}

function checkForCompletedPeriods(
  symbol: string, 
  currentPeriodTime: number, 
  onComplete: (aggregatedCandle: Candle) => void
): void {
  const keysToRemove: string[] = [];
  
  console.log(`[AGGREGATOR] Checking for completed periods for ${symbol}, current period: ${new Date(currentPeriodTime).toISOString()}`);
  
  for (const [key, aggregate] of aggregatesBySymbol.entries()) {
    if (aggregate.symbol === symbol && aggregate.periodStart < currentPeriodTime) {
      console.log(`[AGGREGATOR] Found completed period for ${symbol}: ${aggregate.start}`);
      // This period is complete
      const periodEnd = new Date(aggregate.periodStart + 5 * 60 * 1000); // 5 minutes later
      
      const completed: Candle = {
        symbol: aggregate.symbol,
        timeframe: '5m',
        open: aggregate.open,
        high: aggregate.high,
        low: aggregate.low,
        close: aggregate.close,
        volume: aggregate.volume,
        start: aggregate.start,
        end: periodEnd.toISOString()
      };
      
      console.log(`🕯️ Completed 5m candle for ${symbol}: ${aggregate.start} -> ${periodEnd.toISOString()}`);
      onComplete(completed);
      keysToRemove.push(key);
    }
  }
  
  if (keysToRemove.length === 0) {
    console.log(`[AGGREGATOR] No completed periods found for ${symbol}`);
  }
  
  // Clean up completed periods
  keysToRemove.forEach(key => aggregatesBySymbol.delete(key));
}

export function clearAggregator(symbol?: string): void {
  if (symbol) {
    // Clear all periods for this symbol
    const keysToRemove = Array.from(aggregatesBySymbol.keys()).filter(key => key.startsWith(`${symbol}-`));
    keysToRemove.forEach(key => aggregatesBySymbol.delete(key));
  } else {
    aggregatesBySymbol.clear();
  }
}