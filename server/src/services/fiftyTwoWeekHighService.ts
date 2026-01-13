import { fetchHistoricalBars } from '../handlers/polygonAPI.js';

export interface FiftyTwoWeekHighResult {
  symbol: string;
  date: string;
  currentPrice: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  percentFromHigh: number;
  percentFromLow: number;
  isAtHigh: boolean;
  isNearHigh: boolean;
  daysAgoHigh: number;
  priceRange: number;
}

export async function getFiftyTwoWeekHighData(
  symbol: string,
  date: string
): Promise<FiftyTwoWeekHighResult | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[52WK] No Polygon API key');
    return null;
  }
  
  const end = new Date(date);
  const start = new Date(date);
  start.setFullYear(start.getFullYear() - 1);
  
  try {
    const candles = await fetchHistoricalBars(
      apiKey,
      symbol,
      start.toISOString().split('T')[0],
      end.toISOString().split('T')[0],
      'day',
      1,
      300
    );
    
    if (candles.length < 200) {
      console.log(`[52WK] Insufficient data for ${symbol}: ${candles.length} candles`);
      return null;
    }
    
    const currentCandle = candles[candles.length - 1];
    const currentPrice = currentCandle.close;
    
    let fiftyTwoWeekHigh = 0;
    let fiftyTwoWeekLow = Infinity;
    let highIndex = 0;
    
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].high > fiftyTwoWeekHigh) {
        fiftyTwoWeekHigh = candles[i].high;
        highIndex = i;
      }
      if (candles[i].low < fiftyTwoWeekLow) {
        fiftyTwoWeekLow = candles[i].low;
      }
    }
    
    const percentFromHigh = ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100;
    const percentFromLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;
    const daysAgoHigh = candles.length - 1 - highIndex;
    const priceRange = ((fiftyTwoWeekHigh - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;
    
    const isAtHigh = percentFromHigh >= -1;
    const isNearHigh = percentFromHigh >= -15;
    
    return {
      symbol,
      date,
      currentPrice: Math.round(currentPrice * 100) / 100,
      fiftyTwoWeekHigh: Math.round(fiftyTwoWeekHigh * 100) / 100,
      fiftyTwoWeekLow: Math.round(fiftyTwoWeekLow * 100) / 100,
      percentFromHigh: Math.round(percentFromHigh * 100) / 100,
      percentFromLow: Math.round(percentFromLow * 100) / 100,
      isAtHigh,
      isNearHigh,
      daysAgoHigh,
      priceRange: Math.round(priceRange * 100) / 100
    };
  } catch (error) {
    console.error(`[52WK] Error fetching ${symbol}:`, error);
    return null;
  }
}

export async function getStocksNear52WeekHigh(
  symbols: string[],
  date: string,
  maxPercentFromHigh: number = 15
): Promise<FiftyTwoWeekHighResult[]> {
  const results: FiftyTwoWeekHighResult[] = [];
  
  for (const symbol of symbols) {
    const data = await getFiftyTwoWeekHighData(symbol, date);
    if (data && data.percentFromHigh >= -maxPercentFromHigh) {
      results.push(data);
    }
  }
  
  results.sort((a, b) => b.percentFromHigh - a.percentFromHigh);
  
  return results;
}
