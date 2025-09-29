import fetch from 'node-fetch';
import { Candle, PolygonHistoricalBar } from '../candlestick/types/index.js';

const REST_BASE = 'https://api.polygon.io';

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
  
  try {
    const response = await fetch(url);
    const data = await response.json() as { results?: PolygonHistoricalBar[], status: string };
    
    if (!response.ok) {
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
    
    return candles;
  } catch (error) {
    console.error('Error fetching historical bars:', error);
    throw error;
  }
}