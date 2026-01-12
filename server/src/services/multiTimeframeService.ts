import { fetchHistoricalBars } from '../handlers/polygonAPI.js';
import { Candle } from '../candlestick/types/index.js';

interface TimeframeTrend {
  timeframe: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  aboveEma: boolean;
  emaValue: number;
}

interface KeyLevel {
  price: number;
  type: 'support' | 'resistance';
  strength: number;
  touches: number;
}

interface PricePosition {
  inDailyRange: 'upper' | 'middle' | 'lower';
  distanceFromHigh: number;
  distanceFromLow: number;
  percentInRange: number;
}

export interface MultiTimeframeAnalysis {
  symbol: string;
  currentPrice: number;
  dailyTrend: TimeframeTrend;
  weeklyTrend: TimeframeTrend;
  intradayTrend: TimeframeTrend;
  alignment: 'aligned_bullish' | 'aligned_bearish' | 'mixed';
  keyLevels: KeyLevel[];
  pricePosition: PricePosition;
  dailyAtr: number;
  avgVolume: number;
  todayVolumeRatio: number;
  recentHistory: string;
}

function calculateEma(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

function calculateAtr(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  
  if (trs.length < period) return trs.reduce((a, b) => a + b, 0) / trs.length;
  
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  
  return atr;
}

function determineTrend(candles: Candle[], emaPeriod: number = 20): TimeframeTrend {
  const closes = candles.map(c => c.close);
  const ema = calculateEma(closes, emaPeriod);
  const current = closes[closes.length - 1];
  const aboveEma = current > ema;
  
  let higherHighs = 0;
  let lowerLows = 0;
  const lookback = Math.min(5, candles.length - 1);
  
  for (let i = candles.length - lookback; i < candles.length - 1; i++) {
    if (candles[i + 1].high > candles[i].high) higherHighs++;
    if (candles[i + 1].low < candles[i].low) lowerLows++;
  }
  
  const momentum = (current - closes[closes.length - Math.min(5, closes.length)]) / closes[closes.length - Math.min(5, closes.length)] * 100;
  
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let strength = 0;
  
  if (aboveEma && higherHighs >= 3) {
    trend = 'bullish';
    strength = Math.min(100, 50 + higherHighs * 10 + (momentum > 0 ? momentum * 5 : 0));
  } else if (!aboveEma && lowerLows >= 3) {
    trend = 'bearish';
    strength = Math.min(100, 50 + lowerLows * 10 + (momentum < 0 ? Math.abs(momentum) * 5 : 0));
  } else if (aboveEma) {
    trend = 'bullish';
    strength = 30 + higherHighs * 10;
  } else if (!aboveEma) {
    trend = 'bearish';
    strength = 30 + lowerLows * 10;
  }
  
  return {
    timeframe: '',
    trend,
    strength: Math.round(strength),
    aboveEma,
    emaValue: Math.round(ema * 100) / 100
  };
}

function findKeyLevels(candles: Candle[]): KeyLevel[] {
  const levels: KeyLevel[] = [];
  const tolerance = 0.005;
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  const pricePoints: { price: number; type: 'high' | 'low' }[] = [];
  
  for (let i = 2; i < candles.length - 2; i++) {
    if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] && 
        highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
      pricePoints.push({ price: highs[i], type: 'high' });
    }
    if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] && 
        lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
      pricePoints.push({ price: lows[i], type: 'low' });
    }
  }
  
  const clusters: { price: number; touches: number; types: ('high' | 'low')[] }[] = [];
  
  for (const point of pricePoints) {
    let foundCluster = false;
    for (const cluster of clusters) {
      if (Math.abs(point.price - cluster.price) / cluster.price < tolerance) {
        cluster.price = (cluster.price * cluster.touches + point.price) / (cluster.touches + 1);
        cluster.touches++;
        cluster.types.push(point.type);
        foundCluster = true;
        break;
      }
    }
    if (!foundCluster) {
      clusters.push({ price: point.price, touches: 1, types: [point.type] });
    }
  }
  
  const currentPrice = candles[candles.length - 1].close;
  
  for (const cluster of clusters) {
    if (cluster.touches >= 2) {
      const type = cluster.price > currentPrice ? 'resistance' : 'support';
      levels.push({
        price: Math.round(cluster.price * 100) / 100,
        type,
        strength: Math.min(100, cluster.touches * 25),
        touches: cluster.touches
      });
    }
  }
  
  levels.sort((a, b) => Math.abs(currentPrice - a.price) - Math.abs(currentPrice - b.price));
  
  return levels.slice(0, 4);
}

function calculatePricePosition(candles: Candle[]): PricePosition {
  const recent = candles.slice(-20);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);
  
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const current = candles[candles.length - 1].close;
  
  const range = rangeHigh - rangeLow;
  const percentInRange = range > 0 ? ((current - rangeLow) / range) * 100 : 50;
  
  let position: 'upper' | 'middle' | 'lower';
  if (percentInRange > 66) position = 'upper';
  else if (percentInRange < 33) position = 'lower';
  else position = 'middle';
  
  return {
    inDailyRange: position,
    distanceFromHigh: Math.round((rangeHigh - current) * 100) / 100,
    distanceFromLow: Math.round((current - rangeLow) * 100) / 100,
    percentInRange: Math.round(percentInRange)
  };
}

function generateRecentHistory(dailyCandles: Candle[]): string {
  const recent = dailyCandles.slice(-5);
  const changes: string[] = [];
  
  for (let i = 1; i < recent.length; i++) {
    const change = ((recent[i].close - recent[i - 1].close) / recent[i - 1].close) * 100;
    changes.push(`${change >= 0 ? '+' : ''}${change.toFixed(1)}%`);
  }
  
  const totalChange = ((recent[recent.length - 1].close - recent[0].close) / recent[0].close) * 100;
  
  return `Last 5 days: ${changes.join(', ')} (${totalChange >= 0 ? '+' : ''}${totalChange.toFixed(1)}% total)`;
}

function aggregateToWeekly(dailyCandles: Candle[]): Candle[] {
  const weeklyCandles: Candle[] = [];
  let currentWeek: Candle | null = null;
  
  for (const candle of dailyCandles) {
    const date = new Date(candle.start);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 1 || !currentWeek) {
      if (currentWeek) weeklyCandles.push(currentWeek);
      currentWeek = { ...candle };
    } else {
      currentWeek.high = Math.max(currentWeek.high, candle.high);
      currentWeek.low = Math.min(currentWeek.low, candle.low);
      currentWeek.close = candle.close;
      currentWeek.volume += candle.volume;
      currentWeek.end = candle.end;
    }
  }
  
  if (currentWeek) weeklyCandles.push(currentWeek);
  
  return weeklyCandles;
}

export async function getMultiTimeframeAnalysis(
  symbol: string,
  date: string,
  intradayCandles?: Candle[]
): Promise<MultiTimeframeAnalysis | null> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error('[MTF-ANALYSIS] No Polygon API key configured');
    return null;
  }
  
  try {
    const endDate = date;
    const startDateObj = new Date(date);
    startDateObj.setDate(startDateObj.getDate() - 90);
    const startDate = startDateObj.toISOString().split('T')[0];
    
    const dailyCandles = await fetchHistoricalBars(
      apiKey,
      symbol,
      startDate,
      endDate,
      'day',
      1,
      90
    );
    
    if (dailyCandles.length < 10) {
      console.log(`[MTF-ANALYSIS] Insufficient daily data for ${symbol}`);
      return null;
    }
    
    const weeklyCandles = aggregateToWeekly(dailyCandles);
    
    const dailyTrend = determineTrend(dailyCandles, 20);
    dailyTrend.timeframe = 'daily';
    
    const weeklyTrend = determineTrend(weeklyCandles, 10);
    weeklyTrend.timeframe = 'weekly';
    
    let intradayTrend: TimeframeTrend;
    if (intradayCandles && intradayCandles.length >= 10) {
      intradayTrend = determineTrend(intradayCandles, 20);
      intradayTrend.timeframe = 'intraday';
    } else {
      intradayTrend = { timeframe: 'intraday', trend: 'neutral', strength: 0, aboveEma: false, emaValue: 0 };
    }
    
    let alignment: 'aligned_bullish' | 'aligned_bearish' | 'mixed';
    if (dailyTrend.trend === 'bullish' && weeklyTrend.trend === 'bullish') {
      alignment = 'aligned_bullish';
    } else if (dailyTrend.trend === 'bearish' && weeklyTrend.trend === 'bearish') {
      alignment = 'aligned_bearish';
    } else {
      alignment = 'mixed';
    }
    
    const keyLevels = findKeyLevels(dailyCandles);
    const pricePosition = calculatePricePosition(dailyCandles);
    const dailyAtr = calculateAtr(dailyCandles, 14);
    
    const volumes = dailyCandles.slice(-20).map(c => c.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const todayVolume = dailyCandles[dailyCandles.length - 1].volume;
    const todayVolumeRatio = avgVolume > 0 ? todayVolume / avgVolume : 1;
    
    const recentHistory = generateRecentHistory(dailyCandles);
    const currentPrice = dailyCandles[dailyCandles.length - 1].close;
    
    return {
      symbol,
      currentPrice,
      dailyTrend,
      weeklyTrend,
      intradayTrend,
      alignment,
      keyLevels,
      pricePosition,
      dailyAtr: Math.round(dailyAtr * 100) / 100,
      avgVolume: Math.round(avgVolume),
      todayVolumeRatio: Math.round(todayVolumeRatio * 100) / 100,
      recentHistory
    };
  } catch (error) {
    console.error(`[MTF-ANALYSIS] Error analyzing ${symbol}:`, error);
    return null;
  }
}

export function formatMultiTimeframeForAI(mtf: MultiTimeframeAnalysis): string {
  let output = `\n${mtf.symbol} - Multi-Timeframe Analysis\n`;
  output += '-'.repeat(40) + '\n';
  
  output += `Current: $${mtf.currentPrice.toFixed(2)} | Daily ATR: $${mtf.dailyAtr.toFixed(2)}\n`;
  output += `Volume: ${mtf.todayVolumeRatio.toFixed(1)}x average\n`;
  output += `${mtf.recentHistory}\n\n`;
  
  output += `TREND ALIGNMENT: ${mtf.alignment.toUpperCase().replace('_', ' ')}\n`;
  output += `  Weekly:   ${mtf.weeklyTrend.trend.toUpperCase()} (${mtf.weeklyTrend.strength}% strength)\n`;
  output += `  Daily:    ${mtf.dailyTrend.trend.toUpperCase()} (${mtf.dailyTrend.strength}% strength) | ${mtf.dailyTrend.aboveEma ? 'Above' : 'Below'} 20 EMA ($${mtf.dailyTrend.emaValue})\n`;
  output += `  Intraday: ${mtf.intradayTrend.trend.toUpperCase()} (${mtf.intradayTrend.strength}% strength)\n\n`;
  
  output += `PRICE POSITION: ${mtf.pricePosition.inDailyRange.toUpperCase()} third of 20-day range (${mtf.pricePosition.percentInRange}%)\n`;
  output += `  Distance from range high: $${mtf.pricePosition.distanceFromHigh.toFixed(2)}\n`;
  output += `  Distance from range low: $${mtf.pricePosition.distanceFromLow.toFixed(2)}\n\n`;
  
  if (mtf.keyLevels.length > 0) {
    output += `KEY LEVELS:\n`;
    for (const level of mtf.keyLevels) {
      output += `  ${level.type.toUpperCase()}: $${level.price.toFixed(2)} (${level.touches} touches, ${level.strength}% strength)\n`;
    }
  }
  
  return output;
}
