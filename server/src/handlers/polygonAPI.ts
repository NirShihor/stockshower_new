import fetch from 'node-fetch';
import { Candle, PolygonHistoricalBar } from '../candlestick/types/index.js';

const REST_BASE = 'https://api.polygon.io';

let requestCounter = 0;
let requestLog: Array<{timestamp: Date, symbol: string, from: string, to: string}> = [];

export async function fetchHistoricalBars(
  apiKey: string,
  symbol: string,
  from: string,
  to: string,
  timespan: 'minute' | 'hour' | 'day' = 'minute',
  multiplier: number = 1,
  limit: number = 5000
): Promise<Candle[]> {
  const url = `${REST_BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&limit=${limit}&sort=asc&apiKey=${apiKey}`;
  
  // Log the request
  requestCounter++;
  const logEntry = {timestamp: new Date(), symbol, from, to};
  requestLog.push(logEntry);
  
  // Keep only last 100 entries
  if (requestLog.length > 100) {
    requestLog = requestLog.slice(-100);
  }
  
  console.log(`[Polygon API] Request #${requestCounter}: ${symbol} from ${from} to ${to}`);
  console.log(`[Polygon API] Total requests today: ${requestCounter}`);
  
  // Log requests per hour for the last 24 hours
  const now = new Date();
  const last24Hours = requestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 24 * 60 * 60 * 1000);
  const lastHour = requestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 60 * 60 * 1000);
  
  console.log(`[Polygon API] Requests in last hour: ${lastHour.length}`);
  console.log(`[Polygon API] Requests in last 24 hours: ${last24Hours.length}`);
  
  try {
    const response = await fetch(url);
    const data = await response.json() as { results?: PolygonHistoricalBar[], status: string, error?: string };
    
    if (!response.ok) {
      console.error(`[Polygon API] Error response: ${response.status} - ${data.status} - ${data.error || 'No error message'}`);
      throw new Error(`Polygon API error: ${response.status} - ${data.status}`);
    }
    
    const candles: Candle[] = (data.results || []).map(bar => ({
      symbol: symbol.toUpperCase(),
      timeframe: `${multiplier}${timespan.charAt(0)}`,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      start: new Date(bar.t).toISOString(),
      end: new Date(bar.t + (multiplier * (timespan === 'minute' ? 60000 : timespan === 'hour' ? 3600000 : 86400000))).toISOString()
    }));
    
    console.log(`[Polygon API] Successfully fetched ${candles.length} candles for ${symbol}`);
    
    return candles;
  } catch (error) {
    console.error('Error fetching historical bars:', error);
    throw error;
  }
}

// Export function to get request stats
export function getPolygonRequestStats() {
  const now = new Date();
  const last24Hours = requestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 24 * 60 * 60 * 1000);
  const lastHour = requestLog.filter(r => (now.getTime() - r.timestamp.getTime()) < 60 * 60 * 1000);
  
  return {
    totalRequests: requestCounter,
    lastHour: lastHour.length,
    last24Hours: last24Hours.length,
    recentRequests: requestLog.slice(-10)
  };
}