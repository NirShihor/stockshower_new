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
const completionTimers = new Map<string, NodeJS.Timeout>();

function get5MinPeriodStart(timestamp: Date): Date {
  const periodStart = new Date(timestamp);
  const minutes = periodStart.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  
  periodStart.setMinutes(roundedMinutes);
  periodStart.setSeconds(0);
  periodStart.setMilliseconds(0);
  
  return periodStart;
}

function scheduleCompletion(periodKey: string, periodStart: number, onComplete: (aggregatedCandle: Candle) => void): void {
  // Clear any existing timer for this period
  const existingTimer = completionTimers.get(periodKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
    console.log(`[AGGREGATOR] Cleared existing timer for ${periodKey}`);
  }
  
  // Calculate when this period should complete (5 minutes after start + small buffer)
  const periodEnd = periodStart + (5 * 60 * 1000); // 5 minutes in ms
  const now = Date.now();
  const delay = Math.max(0, periodEnd - now + 100); // 100ms buffer
  
  const periodStartTime = new Date(periodStart).toISOString();
  const periodEndTime = new Date(periodEnd).toISOString();
  const currentTime = new Date(now).toISOString();
  
  console.log(`[AGGREGATOR] Scheduling completion for ${periodKey}`);
  console.log(`[AGGREGATOR]   Period: ${periodStartTime} -> ${periodEndTime}`);
  console.log(`[AGGREGATOR]   Current time: ${currentTime}`);
  console.log(`[AGGREGATOR]   Delay: ${delay}ms (${Math.round(delay/1000)}s)`);
  
  if (delay <= 0) {
    console.log(`[AGGREGATOR] Period already ended, completing immediately`);
    const aggregate = aggregatesBySymbol.get(periodKey);
    if (aggregate) {
      completePeriod(periodKey, aggregate, onComplete);
    }
    return;
  }
  
  const timer = setTimeout(() => {
    console.log(`[AGGREGATOR] Timer fired for ${periodKey}`);
    const aggregate = aggregatesBySymbol.get(periodKey);
    if (aggregate) {
      console.log(`[AGGREGATOR] Found aggregate, completing period`);
      completePeriod(periodKey, aggregate, onComplete);
    } else {
      console.log(`[AGGREGATOR] No aggregate found for ${periodKey}`);
    }
    completionTimers.delete(periodKey);
  }, delay);
  
  completionTimers.set(periodKey, timer);
}

function completePeriod(periodKey: string, aggregate: CandleAggregate, onComplete: (aggregatedCandle: Candle) => void): void {
  console.log(`[AGGREGATOR] Completing period for ${aggregate.symbol}: ${aggregate.start}`);
  
  const periodEnd = new Date(aggregate.periodStart + 5 * 60 * 1000);
  
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
  
  console.log(`🕯️ Completed 5m candle for ${aggregate.symbol}: ${aggregate.start} -> ${periodEnd.toISOString()}`);
  onComplete(completed);
  
  // Clean up
  aggregatesBySymbol.delete(periodKey);
  completionTimers.delete(periodKey);
}

function completeExpiredPeriods(symbol: string, onComplete: (aggregatedCandle: Candle) => void): void {
  const now = Date.now();
  const keysToComplete: string[] = [];
  
  for (const [key, aggregate] of aggregatesBySymbol.entries()) {
    if (aggregate.symbol === symbol) {
      const periodEnd = aggregate.periodStart + (5 * 60 * 1000); // 5 minutes after start
      
      if (now >= periodEnd) {
        console.log(`[AGGREGATOR] Found expired period for ${symbol}: ${aggregate.start} (expired ${Math.round((now - periodEnd) / 1000)}s ago)`);
        keysToComplete.push(key);
      }
    }
  }
  
  // Complete all expired periods
  keysToComplete.forEach(key => {
    const aggregate = aggregatesBySymbol.get(key);
    if (aggregate) {
      completePeriod(key, aggregate, onComplete);
    }
  });
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
  
  // First, complete any expired periods for this symbol
  completeExpiredPeriods(symbol, onComplete);
  
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
    
    // Schedule automatic completion for this period
    scheduleCompletion(periodKey, periodStart.getTime(), onComplete);
    
    // Check if we need to complete any previous periods
    checkForCompletedPeriods(symbol, periodStart.getTime(), onComplete);
    
    // Force check all overdue periods
    forceCompleteOverduePeriods(onComplete);
  } else {
    console.log(`[AGGREGATOR] Updating existing 5m period for ${symbol}: ${periodStart.toISOString()}`);
    
    // Check if this existing period needs a timer (in case it was created before the timer logic)
    if (!completionTimers.has(periodKey)) {
      console.log(`[AGGREGATOR] Adding missing timer for existing period: ${periodKey}`);
      scheduleCompletion(periodKey, periodStart.getTime(), onComplete);
    }
    
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
  
  // Force check all periods, not just for this symbol
  const now = Date.now();
  for (const [key, aggregate] of aggregatesBySymbol.entries()) {
    const periodEndMs = aggregate.periodStart + (5 * 60 * 1000);
    
    // Check if period should be complete (either by time or by new period starting)
    if (aggregate.periodStart < currentPeriodTime || now > periodEndMs + 5000) {
      console.log(`[AGGREGATOR] Found completed period for ${aggregate.symbol}: ${aggregate.start} (overdue by ${Math.round((now - periodEndMs)/1000)}s)`);
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

function forceCompleteOverduePeriods(onComplete: (aggregatedCandle: Candle) => void): void {
  const now = Date.now();
  const overdueThreshold = 10000; // 10 seconds past period end
  const keysToRemove: string[] = [];
  
  for (const [key, aggregate] of aggregatesBySymbol.entries()) {
    const periodEnd = aggregate.periodStart + (5 * 60 * 1000);
    if (now > periodEnd + overdueThreshold) {
      console.log(`[AGGREGATOR] Force completing overdue period: ${aggregate.symbol} ${aggregate.start} (${Math.round((now - periodEnd)/1000)}s overdue)`);
      
      const completed: Candle = {
        symbol: aggregate.symbol,
        timeframe: '5m',
        open: aggregate.open,
        high: aggregate.high,
        low: aggregate.low,
        close: aggregate.close,
        volume: aggregate.volume,
        start: aggregate.start,
        end: new Date(periodEnd).toISOString()
      };
      
      console.log(`🕯️ Force completed 5m candle for ${aggregate.symbol}: ${aggregate.start}`);
      onComplete(completed);
      keysToRemove.push(key);
      
      // Clear any timer for this period
      completionTimers.delete(key);
    }
  }
  
  // Clean up completed periods
  keysToRemove.forEach(key => aggregatesBySymbol.delete(key));
}

export function clearAggregator(symbol?: string): void {
  if (symbol) {
    // Clear all periods and timers for this symbol
    const keysToRemove = Array.from(aggregatesBySymbol.keys()).filter(key => key.startsWith(`${symbol}-`));
    keysToRemove.forEach(key => {
      aggregatesBySymbol.delete(key);
      const timer = completionTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        completionTimers.delete(key);
      }
    });
  } else {
    // Clear all
    aggregatesBySymbol.clear();
    completionTimers.forEach(timer => clearTimeout(timer));
    completionTimers.clear();
  }
}